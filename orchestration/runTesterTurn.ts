import { getTranscript } from "@/audio/sttAdapter";
import { getSpeechSynthesis, playSynthesizedAudio } from "@/audio/ttsAdapter";
import { getGeneratedResponse } from "@/llm-adapters/responseAdapter";
import { deriveConversationState, resolvePendingQuestionAnswer, SlotResolutionResult } from "@/orchestration/conversationState";
import { buildClarificationPrompt, isSlotNoiseTurnAct, responseForStrategy } from "@/orchestration/conversationPolicy";
import { runDeterministicHandoffPolicy, runDeterministicRoutingPolicy, runDeterministicUnderstandingPolicy } from "@/orchestration/deterministicPolicy";
import { buildResponseContext } from "@/orchestration/responseContext";
import { runToolExecution } from "@/tools/toolRunner";
import { RuntimeToolConfig } from "@/tools/runtimeToolConfig";
import { ToolExecutionMode } from "@/tools/toolTypes";
import { PendingQuestionState, SessionState, TtsSettingsView } from "@/types/session";
import { TesterDebugState, TesterInputSource, VoicePhase } from "@/types/tester";

const DEFAULT_TTS_SETTINGS: TtsSettingsView = {
  voiceStyle: "calm-neutral",
  speed: 1,
  streamingEnabled: true
};

const FILLER_RESPONSES = [
  "Let me check that for you now.",
  "I'm checking the current service status.",
  "One moment while I look that up."
] as const;

const FILLER_CONFIG = {
  enabled: true,
  onlyForWorkflow: true
};

function nowIso() {
  return new Date().toISOString();
}

function providerMode(state: SessionState): "mock" | "live" | "mixed" {
  const providers = [state.stt?.provider, state.understandingDiagnostics?.provider, state.toolResult?.provider, state.responseGeneration?.provider, state.tts?.provider]
    .filter(Boolean)
    .join(" ");

  const hasLive = providers.includes("openai") || providers.includes("api");
  const hasMock = providers.includes("mock");
  if (hasLive && hasMock) return "mixed";
  if (hasLive) return "live";
  return "mock";
}

function hasStrongIntentShift(text: string): boolean {
  const lowered = text.toLowerCase();
  return lowered.includes("human") || lowered.includes("cancel") || lowered.includes("never mind") || lowered.includes("stop") || lowered.includes("check outage") || lowered.includes("want to check");
}


function previousStatusWasOperational(previousSession?: SessionState): { operational: boolean; summary?: string; region?: string } {
  const previousTool = previousSession?.toolExecution;
  const previousResult = previousSession?.toolResult?.result as { matchedRegion?: string; matchedServiceName?: string; overallStatus?: string } | undefined;
  if (!previousTool || previousTool.selectedTool !== "check_outage_status") {
    return { operational: false };
  }

  const normalized = (previousResult?.overallStatus ?? "").toUpperCase();
  const operational = normalized === "OPERATIONAL";
  const region = previousResult?.matchedRegion ?? previousResult?.matchedServiceName;
  const summary = region ? `${region} ${operational ? "operational" : normalized.toLowerCase()}` : operational ? "operational" : undefined;
  return { operational, summary, region };
}

function detectPostStatusIsolatedIssue(utterance: string): { isolatedIssueDetected: boolean; escalationRecommended: boolean; explicitHumanRequest: boolean } {
  const text = utterance.toLowerCase();
  const isolatedSignals = [
    "my home",
    "at home",
    "still has a problem",
    "still isn't working",
    "still not working",
    "my internet still",
    "my connection",
    "only my home",
    "only my house",
    "need help with my connection"
  ];
  const nextStepSignals = ["what do i do now", "what do i have to do now", "what now", "next step", "what should i do"];
  const humanSignals = ["talk to a person", "talk to a human", "want a human", "raise a ticket", "open a ticket", "can someone help me directly"];

  const isolatedIssueDetected = isolatedSignals.some((signal) => text.includes(signal));
  const asksNextStep = nextStepSignals.some((signal) => text.includes(signal));
  const explicitHumanRequest = humanSignals.some((signal) => text.includes(signal));

  return {
    isolatedIssueDetected: isolatedIssueDetected || asksNextStep || explicitHumanRequest,
    escalationRecommended: isolatedIssueDetected || asksNextStep || explicitHumanRequest,
    explicitHumanRequest
  };
}


function parseFollowupSlots(utterance: string): { serviceNameOrRegion?: string; serviceCategory?: string; dateScope?: string } {
  const lowered = utterance.toLowerCase().trim().replace(/[?.!,]+$/g, "");
  const result: { serviceNameOrRegion?: string; serviceCategory?: string; dateScope?: string } = {};

  const regionMatch = lowered.match(/(?:my home is in|service in|in|for|no,? i mean|no,?)\s+([a-z][a-z\s-]{1,30})$/i);
  const bareRegion = /^(?:no,?\s+|yeah,?\s+)?([a-z][a-z\s-]{1,30})$/i.exec(lowered);
  const candidate = regionMatch?.[1] ?? bareRegion?.[1];
  if (candidate && candidate.split(/\s+/).length <= 3) {
    result.serviceNameOrRegion = candidate
      .trim()
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  if (lowered.includes("ftth")) result.serviceCategory = "FTTH";
  if (lowered.includes("cable")) result.serviceCategory = "CABLE";
  if (lowered.includes("this week")) result.dateScope = "this_week";
  if (lowered.includes("today")) result.dateScope = "today";
  if (lowered.includes("tomorrow")) result.dateScope = "tomorrow";

  return result;
}

function isIntentResetOrSwitch(text: string): boolean {
  const lowered = text.toLowerCase();
  return lowered.includes("reset") || lowered.includes("start over") || lowered.includes("new request") || lowered.includes("announcement") || lowered.includes("status or announcements");
}

function detectSupportContinuation(input: {
  utterance: string;
  turnAct?: string;
  activeSupportIntent?: "service_status" | "announcements";
  pendingQuestion?: PendingQuestionState;
}): { continuationDetected: boolean; requestType?: "support_task_continuation" | "support_task_correction"; correctedSlots: Record<string, string> } {
  const { utterance, turnAct, activeSupportIntent, pendingQuestion } = input;
  if (!activeSupportIntent || isIntentResetOrSwitch(utterance) || hasStrongIntentShift(utterance)) {
    return { continuationDetected: false, correctedSlots: {} };
  }

  const parsed = parseFollowupSlots(utterance);
  const hasSlotLikeSignal = Boolean(parsed.serviceNameOrRegion || parsed.serviceCategory || parsed.dateScope || pendingQuestion);
  const isCorrection = turnAct === "correction" || /^no,?\b/i.test(utterance.toLowerCase()) || utterance.toLowerCase().includes("i mean");
  const isSlotAnswer = turnAct === "slot_answer" || utterance.trim().split(/\s+/).length <= 4;

  if (activeSupportIntent === "service_status" && hasSlotLikeSignal && (isCorrection || isSlotAnswer || turnAct === "unclear")) {
    const correctedSlots: Record<string, string> = {};
    if (parsed.serviceNameOrRegion) correctedSlots.serviceNameOrRegion = parsed.serviceNameOrRegion;
    if (parsed.serviceCategory) correctedSlots.serviceCategory = parsed.serviceCategory;
    return { continuationDetected: true, requestType: isCorrection ? "support_task_correction" : "support_task_continuation", correctedSlots };
  }

  if (activeSupportIntent === "announcements" && (parsed.dateScope || pendingQuestion || isSlotAnswer)) {
    const correctedSlots: Record<string, string> = {};
    if (parsed.dateScope) correctedSlots.dateScope = parsed.dateScope;
    return { continuationDetected: true, requestType: isCorrection ? "support_task_correction" : "support_task_continuation", correctedSlots };
  }

  return { continuationDetected: false, correctedSlots: {} };
}

function buildClarificationRetryPrompt(pendingQuestion: PendingQuestionState): string {
  return buildClarificationPrompt(pendingQuestion.expectedSlot, pendingQuestion.retryCount + 1);
}

function buildSlotFillAcknowledgement(slot: string, normalizedValue: string): string {
  if (slot === "serviceNameOrDevice") {
    if (normalizedValue === "all_devices") return "Got it — all devices are affected. Let me check the service status now.";
    if (normalizedValue === "single_device") return "Got it — this looks limited to one device. I’ll run a focused connectivity check now.";
  }
  if (slot === "serviceNameOrRegion") return `Got it — I’ll check outage status for ${normalizedValue}.`;
  if (slot === "serviceCategory") return `Got it — I’ll check ${normalizedValue} for the outage status now.`;
  if (slot === "date") return `Perfect — I’ll proceed with ${normalizedValue} for the appointment window.`;
  return "Thanks, that helps. I’ll continue now.";
}

function getToolClarification(result: unknown): {
  toolClarificationNeeded: boolean;
  clarificationReason?: string;
  expectedSlotFromTool?: string;
  candidateCategories?: string[];
  pendingQuestionPrompt?: string;
  lastUnresolvedToolContext?: Record<string, unknown>;
} | undefined {
  const parsed = (result ?? {}) as {
    clarificationNeeded?: boolean;
    clarificationPrompt?: string;
    parsedRegion?: string;
    parsedCategory?: string;
    debug?: {
      clarificationReason?: string | null;
      candidateMatchesFound?: {
        region?: Array<{ category?: string }>;
      };
      selectedMatch?: unknown;
    };
  };

  if (!parsed.clarificationNeeded) return undefined;

  const candidateCategories = [
    ...new Set((parsed.debug?.candidateMatchesFound?.region ?? []).map((item) => (item.category ?? "").toUpperCase()).filter(Boolean))
  ];

  const expectedSlotFromTool = candidateCategories.length > 1 ? "category" : "serviceNameOrRegion";

  return {
    toolClarificationNeeded: true,
    clarificationReason: parsed.debug?.clarificationReason ?? "tool_requires_clarification",
    expectedSlotFromTool,
    candidateCategories,
    pendingQuestionPrompt: parsed.clarificationPrompt,
    lastUnresolvedToolContext: {
      parsedRegion: parsed.parsedRegion,
      parsedCategory: parsed.parsedCategory,
      candidateCategories,
      selectedMatch: parsed.debug?.selectedMatch ?? null
    }
  };
}

function chooseFillerPhrase(utterance: string): string {
  const index = Math.abs(utterance.trim().length) % FILLER_RESPONSES.length;
  return FILLER_RESPONSES[index];
}

function inferPendingQuestionFromRouting(routing: NonNullable<SessionState["routing"]>): PendingQuestionState | undefined {
  if (routing.decision !== "clarify" || !routing.clarificationPrompt) return undefined;
  const prompt = routing.clarificationPrompt.toLowerCase();
  if (!prompt.includes("all devices") && !prompt.includes("just one") && !prompt.includes("only on one")) return undefined;

  return {
    questionType: routing.clarificationReason ?? "device_scope_clarification",
    expectedSlot: "serviceNameOrDevice",
    workflowName: "diagnose_connectivity",
    prompt: routing.clarificationPrompt,
    retryCount: 0
  };
}

function buildGroundedToolResponse(state: SessionState): string | undefined {
  if (state.toolResult?.status !== "success") return undefined;

  if (state.toolResult.toolName === "fetch_service_status") {
    const services = ((state.toolResult.result as { services?: Array<{ serviceName?: string; region?: string; status?: string }> })?.services ?? []);
    const query = state.utterance.toLowerCase();
    const matched = services.find((service) => {
      const name = (service.serviceName ?? "").toLowerCase();
      const region = (service.region ?? "").toLowerCase();
      return (name && query.includes(name)) || (region && query.includes(region));
    });

    if (matched) {
      const status = (matched.status ?? "UNKNOWN").replaceAll("_", " ").toLowerCase();
      const target = [matched.serviceName, matched.region].filter(Boolean).join(" in ");
      return `${target} is currently ${status}.`;
    }

    if (!services.length) return "I checked the current service status feed and there are no active outages right now.";
    const outage = services.find((service) => service.status && service.status !== "OPERATIONAL");
    if (!outage) return "I checked the current service status feed. Services appear operational right now.";
    const status = (outage.status ?? "UNKNOWN").replaceAll("_", " ").toLowerCase();
    const target = [outage.serviceName, outage.region].filter(Boolean).join(" in ");
    return `I checked the current service status. ${target} is showing ${status}.`;
  }

  if (state.toolResult.toolName === "check_outage_status") {
    const result = (state.toolResult.result ?? {}) as { matchedServiceName?: string; matchedRegion?: string; overallStatus?: string; estimatedRecoveryText?: string; clarificationNeeded?: boolean; clarificationPrompt?: string };
    if (result.clarificationNeeded) return result.clarificationPrompt ?? "I need one more detail before I can check outages.";
    const service = result.matchedServiceName ?? result.matchedRegion ?? "that service";
    const status = (result.overallStatus ?? "UNKNOWN").replaceAll("_", " ").toLowerCase();
    const recovery = result.estimatedRecoveryText ? ` We expect recovery in ${result.estimatedRecoveryText}.` : "";
    return `Yes, ${service} is currently experiencing a ${status}.${recovery} Is there anything else I can help you with?`;
  }

  if (state.toolResult.toolName === "fetch_notifications") {
    const notifications = ((state.toolResult.result as { notifications?: Array<{ title?: string; body?: string }> })?.notifications ?? []);
    if (!notifications.length) return "I checked announcements and there are no active notices right now.";
    const first = notifications[0];
    return `I found an active announcement: ${first.title ?? "Service update"}. ${first.body ?? ""}`.trim();
  }

  return undefined;
}

export interface RunTesterTurnInput {
  utterance: string;
  inputSource: TesterInputSource;
  sttCapture?: SessionState["sttCapture"];
  previousSession?: SessionState;
  workflowMode: "auto" | "workflow" | "no_workflow";
  toolMode?: ToolExecutionMode;
  runtimeToolConfig?: RuntimeToolConfig;
  forceFallback: boolean;
  voiceModeEnabled: boolean;
  fillerEnabled?: boolean;
  onStage?: (stage: VoicePhase) => void;
}

export interface RunTesterTurnOutput {
  session: SessionState;
  responseText: string;
  transcriptText: string;
  createdAt: string;
  fallbackInfo?: string;
  errorInfo?: string;
  metadata: TesterDebugState;
  fillerResponseText?: string;
}

export async function runTesterTurn(input: RunTesterTurnInput): Promise<RunTesterTurnOutput> {
  const createdAt = nowIso();
  const startTime = Date.now();
  let state: SessionState = {
    utterance: input.utterance,
    sttInputMode: input.inputSource,
    sttCapture: input.sttCapture,
    sttStreamingSimulated: true,
    policy: input.previousSession?.policy,
    conversation: input.previousSession?.conversation
  };

  const sttStart = Date.now();
  const stt = await getTranscript(state);
  const sttFinalizationMs = Date.now() - sttStart;
  const transcriptText = (stt.transcript || input.utterance || "").trim();
  state = { ...state, stt, transcript: transcriptText, utterance: transcriptText };

  if (!transcriptText) {
    const message = "I didn’t catch that. Please try again by speaking clearly or typing your request.";
    return {
      session: { ...state, responseText: message, latency: { sttFinalizationMs, totalTurnMs: sttFinalizationMs, sttMs: sttFinalizationMs, totalMs: sttFinalizationMs } },
      responseText: message,
      transcriptText,
      createdAt,
      fallbackInfo: stt.reason,
      errorInfo: stt.failureType,
      metadata: { providerMode: providerMode(state), toolExecutionMode: state.toolExecution?.executionMode, latency: { sttFinalizationMs, totalTurnMs: sttFinalizationMs, sttMs: sttFinalizationMs, totalMs: sttFinalizationMs }, routingDecision: "clarify", voicePhase: "processing" }
    };
  }

  const pendingQuestionContext = input.previousSession?.conversation?.pendingQuestion;

  input.onStage?.("processing");
  const understandingStart = Date.now();
  const evaluated = runDeterministicUnderstandingPolicy(transcriptText, { workflowMode: input.workflowMode, pendingQuestion: pendingQuestionContext, pendingWorkflowName: input.previousSession?.conversation?.pendingWorkflow?.workflowName }, input.previousSession?.policy?.counters);
  const understandingMs = Date.now() - understandingStart;

  const turnAct = evaluated.understanding.turnAct;
  const previousActiveSupportIntent = input.previousSession?.conversation?.activeSupportIntent;
  const continuation = detectSupportContinuation({
    utterance: transcriptText,
    turnAct,
    activeSupportIntent: previousActiveSupportIntent,
    pendingQuestion: pendingQuestionContext
  });

  const adjustedUnderstanding = continuation.continuationDetected && previousActiveSupportIntent
    ? {
        ...evaluated.understanding,
        intent: previousActiveSupportIntent,
        intentConfidence: Math.max(0.93, evaluated.understanding.intentConfidence),
        responseStrategy: "continue_workflow" as const,
        responseMode: "task_oriented" as const,
        requestType: continuation.requestType,
        entities: {
          ...evaluated.understanding.entities,
          ...continuation.correctedSlots
        }
      }
    : evaluated.understanding;

  const previousStatus = previousStatusWasOperational(input.previousSession);
  const postStatusSignals = detectPostStatusIsolatedIssue(transcriptText);
  const isolatedIssueAfterOperationalStatus = Boolean(
    previousActiveSupportIntent === "service_status" &&
      previousStatus.operational &&
      postStatusSignals.isolatedIssueDetected
  );

  const understanding = isolatedIssueAfterOperationalStatus
    ? {
        ...adjustedUnderstanding,
        intent: postStatusSignals.explicitHumanRequest ? ("talk_to_human" as const) : ("service_status" as const),
        handoffRecommended: postStatusSignals.explicitHumanRequest,
        responseStrategy: postStatusSignals.explicitHumanRequest ? ("handoff" as const) : ("isolated_issue_escalation" as const),
        responseMode: "task_oriented" as const,
        requestType: "support_task_continuation" as const,
        reason: "Operational service status already returned; user still reports isolated home issue and needs escalation."
      }
    : adjustedUnderstanding;

  const awaitingPendingAnswer = Boolean(pendingQuestionContext && input.previousSession?.conversation?.currentStatus === "awaiting_user_input" && !hasStrongIntentShift(transcriptText) && !isSlotNoiseTurnAct(turnAct));
  const slotResolutionResult: SlotResolutionResult | undefined = awaitingPendingAnswer ? resolvePendingQuestionAnswer(transcriptText, pendingQuestionContext) : undefined;
  const answeredPendingQuestion = Boolean(slotResolutionResult?.matched && slotResolutionResult.confidence !== "low");

  state = { ...state, understanding, understandingDiagnostics: evaluated.understandingDiagnostics, policy: evaluated.policy };

  const routingStart = Date.now();
  const baseRouting = runDeterministicRoutingPolicy({ understanding: state.understanding, policy: state.policy });
  const routingPolicyMs = Date.now() - routingStart;

  const priorPending = input.previousSession?.conversation?.pendingWorkflow;
  const continuePending = Boolean(priorPending && !hasStrongIntentShift(transcriptText) && !understanding.replacePendingWorkflow);
  const inferredPendingFromRouting = inferPendingQuestionFromRouting(baseRouting);

  let pendingQuestion: PendingQuestionState | undefined = pendingQuestionContext;
  if (understanding.resetPendingQuestion) pendingQuestion = undefined;
  else if (answeredPendingQuestion && pendingQuestionContext) pendingQuestion = undefined;
  else if (awaitingPendingAnswer && pendingQuestionContext && !answeredPendingQuestion) {
    const retryCount = pendingQuestionContext.retryCount + 1;
    const isCategoryQuestion = pendingQuestionContext.expectedSlot === "serviceCategory";
    const repeatedRegion = isCategoryQuestion && slotResolutionResult?.reason === "ambiguous";
    pendingQuestion = {
      ...pendingQuestionContext,
      retryCount,
      prompt: repeatedRegion
        ? "I already identified the region. I just need to know whether you mean FTTH or Cable."
        : buildClarificationRetryPrompt({ ...pendingQuestionContext, retryCount })
    };
  }
  else if (!pendingQuestion && inferredPendingFromRouting) pendingQuestion = inferredPendingFromRouting;

  const nextWorkflowName = understanding.replacePendingWorkflow
    ? baseRouting.workflowName ?? null
    : continuePending
      ? priorPending?.workflowName
      : baseRouting.decision === "workflow"
        ? baseRouting.workflowName
        : inferredPendingFromRouting?.workflowName ?? null;
  const conversation = deriveConversationState({
    previous: input.previousSession?.conversation,
    utterance: transcriptText,
    createdAt,
    workflowName: nextWorkflowName,
    intent: state.understanding?.intent,
    dialogueState: "responding",
    routingDecision: baseRouting.decision,
    pendingQuestion,
    answeredPendingQuestion,
    slotResolutionResult
  });

  let routing: NonNullable<SessionState["routing"]> = { ...baseRouting, dialogueState: "responding" };
  let resolutionMode: "answer_to_pending_question" | "fresh_intent_turn" | "support_task_continuation" | "support_task_correction" = continuation.requestType ?? "fresh_intent_turn";

  if (conversation.pendingWorkflow && (continuePending || conversation.pendingWorkflow.missingSlots.length > 0)) {
    if (answeredPendingQuestion && pendingQuestionContext) {
      routing = { decision: "workflow", workflowName: conversation.pendingWorkflow.workflowName, selectedRule: "resolved_pending_question", whyChosen: `Resolved pending slot ${pendingQuestionContext.expectedSlot} with ${slotResolutionResult?.normalizedValue ?? transcriptText}`, dialogueState: "ready_to_execute" };
      resolutionMode = "answer_to_pending_question";
    } else if (pendingQuestion && pendingQuestion.retryCount >= 2) {
      routing = { decision: "handoff", workflowName: conversation.pendingWorkflow.workflowName, selectedRule: "pending_question_attempts_exceeded", whyChosen: "Unable to collect required slot values after repeated clarification attempts.", handoffReason: "slot_filling_attempts_exceeded", dialogueState: "handoff" };
    } else if (conversation.pendingWorkflow.attempts >= 3 && conversation.pendingWorkflow.missingSlots.length > 0) {
      routing = { decision: "handoff", workflowName: conversation.pendingWorkflow.workflowName, selectedRule: "pending_slot_attempts_exceeded", whyChosen: "Unable to collect required slot values after repeated turns.", handoffReason: "slot_filling_attempts_exceeded", dialogueState: "handoff" };
    } else if (conversation.pendingWorkflow.missingSlots.length > 0) {
      const activePrompt = pendingQuestion?.prompt ?? buildClarificationPrompt(conversation.pendingWorkflow.missingSlots[0], pendingQuestion?.retryCount ?? 0);
      routing = { decision: "clarify", workflowName: conversation.pendingWorkflow.workflowName, selectedRule: awaitingPendingAnswer ? "pending_question_retry" : "slot_fill_required_before_workflow", whyChosen: `Pending workflow requires missing slots: ${conversation.pendingWorkflow.missingSlots.join(", ")}`, clarificationPrompt: activePrompt, clarificationReason: awaitingPendingAnswer ? "pending_answer_not_resolved" : "missing_required_slot", dialogueState: "awaiting_missing_info" };
    } else {
      routing = { decision: "workflow", workflowName: conversation.pendingWorkflow.workflowName, selectedRule: "pending_workflow_continuation", whyChosen: "Previously pending workflow now has required slots and can continue.", dialogueState: "ready_to_execute" };
    }
  }

  state = { ...state, conversation, routing };

  const shouldUseFiller = Boolean(input.voiceModeEnabled && (input.fillerEnabled ?? FILLER_CONFIG.enabled) && routing.decision === "workflow" && (!FILLER_CONFIG.onlyForWorkflow || routing.decision === "workflow"));
  const fillerResponseText = shouldUseFiller ? chooseFillerPhrase(transcriptText) : undefined;
  let fillerTtsFirstAudioMs: number | undefined;

  if (fillerResponseText) {
    input.onStage?.("speaking_filler");
    const fillerTts = await getSpeechSynthesis(fillerResponseText, { ...DEFAULT_TTS_SETTINGS, speed: 1.1 });
    const fillerPlayback = await playSynthesizedAudio(fillerTts);
    fillerTtsFirstAudioMs = fillerPlayback.firstAudioMs ?? fillerTts.firstAudioLatencyMs;
  }

  const toolStart = Date.now();
  if (routing.decision === "workflow") {
    input.onStage?.("checking_tool");
    state = { ...state, routing: { ...routing, dialogueState: "executing_tool" } };
    const { toolResult, record } = await runToolExecution(state, { forceFallback: input.forceFallback, modeOverride: input.toolMode, runtimeConfig: input.runtimeToolConfig });
    const toolClarification = toolResult.toolName === "check_outage_status" && toolResult.status === "success" ? getToolClarification(toolResult.result) : undefined;
    const isToolClarificationFlow = Boolean(toolClarification?.toolClarificationNeeded);
    const pendingStatus = state.conversation?.pendingWorkflow
      ? {
          ...state.conversation.pendingWorkflow,
          status: isToolClarificationFlow ? ("awaiting_input" as const) : ("completed" as const),
          missingSlots: isToolClarificationFlow ? ["serviceCategory"] : []
        }
      : undefined;

    const nextPendingQuestion = isToolClarificationFlow && state.conversation?.pendingWorkflow
      ? {
          questionType: "service_category",
          expectedSlot: "serviceCategory",
          workflowName: "check_outage_status" as const,
          prompt: toolClarification?.pendingQuestionPrompt ?? buildClarificationPrompt("serviceCategory", state.conversation.pendingQuestion?.retryCount ?? 0),
          askedAtTurnId: state.conversation.turns[state.conversation.turns.length - 1]?.id,
          retryCount: state.conversation.pendingQuestion?.expectedSlot === "serviceCategory" ? state.conversation.pendingQuestion.retryCount : 0
        }
      : undefined;

    const toolPrompt = toolClarification?.pendingQuestionPrompt ?? buildClarificationPrompt("serviceCategory", 0);

    state = {
      ...state,
      toolExecution: {
        ...record,
        requestPayload: (record.requestPayload as Record<string, unknown>) ?? {},
        rawResponsePayload: record.rawResponsePayload as Record<string, unknown> | undefined,
        normalizedResult: record.normalizedResult as Record<string, unknown> | undefined
      },
      toolResult,
      routing: state.routing
        ? isToolClarificationFlow
          ? { ...state.routing, decision: "clarify", selectedRule: "tool_requires_service_category", whyChosen: "Tool matched region but requires category disambiguation.", clarificationPrompt: toolPrompt, clarificationReason: "tool_clarification_required", dialogueState: "awaiting_missing_info" }
          : { ...state.routing, dialogueState: "responding" }
        : state.routing,
      conversation: state.conversation
        ? {
            ...state.conversation,
            pendingWorkflow: pendingStatus,
            pendingQuestion: nextPendingQuestion,
            currentStatus: isToolClarificationFlow ? "awaiting_user_input" : "processing",
            lastToolResult: toolResult.result,
            toolClarification: isToolClarificationFlow
              ? {
                  toolName: toolResult.toolName,
                  clarificationNeeded: true,
                  clarificationReason: toolClarification?.clarificationReason,
                  expectedSlotFromTool: toolClarification?.expectedSlotFromTool,
                  candidateCategories: toolClarification?.candidateCategories,
                  prompt: toolPrompt,
                  lastUnresolvedToolContext: toolClarification?.lastUnresolvedToolContext
                }
              : undefined
          }
        : state.conversation
    };
  }
  const toolExecutionMs = Date.now() - toolStart;

  if (state.routing?.decision === "clarify" && state.routing.clarificationPrompt) {
    const inferredPending = inferPendingQuestionFromRouting(state.routing);
    const expectedSlot = state.conversation?.pendingWorkflow?.missingSlots[0] ?? inferredPending?.expectedSlot;
    const workflowName = state.conversation?.pendingWorkflow?.workflowName ?? inferredPending?.workflowName;
    if (expectedSlot && workflowName && state.conversation) {
      state = {
        ...state,
        conversation: {
          ...state.conversation,
          pendingQuestion: {
            questionType: state.routing.clarificationReason ?? "slot_clarification",
            expectedSlot,
            workflowName,
            prompt: state.routing.clarificationPrompt,
            askedAtTurnId: state.conversation.turns[state.conversation.turns.length - 1]?.id,
            retryCount: state.conversation.pendingQuestion?.expectedSlot === expectedSlot ? state.conversation.pendingQuestion.retryCount : 0
          }
        }
      };
    }
  }

  state = { ...state, handoff: runDeterministicHandoffPolicy(state) };

  const preservedSupportContext = isolatedIssueAfterOperationalStatus
    ? {
        regionChecked: previousStatus.region ?? input.previousSession?.conversation?.collectedSlots?.serviceNameOrRegion,
        previousStatusResult: previousStatus.summary ?? "operational",
        isolatedIssueDetected: true,
        escalationRecommended: postStatusSignals.escalationRecommended,
        explicitHumanRequest: postStatusSignals.explicitHumanRequest,
        userFollowup: transcriptText
      }
    : undefined;

  if (isolatedIssueAfterOperationalStatus && state.handoff?.triggered) {
    const contextSummary = `Region checked=${preservedSupportContext?.regionChecked ?? "unknown"}; Status=${preservedSupportContext?.previousStatusResult}; User still reports isolated home issue; Requested next-step support=${postStatusSignals.escalationRecommended}.`;
    state = {
      ...state,
      handoff: {
        ...state.handoff,
        reason: postStatusSignals.explicitHumanRequest ? "explicit_human_request_after_operational_status" : "isolated_issue_after_operational_status",
        summary: contextSummary
      }
    };
  }

  const responseStart = Date.now();
  input.onStage?.("speaking_final");
  const responseGeneration = await getGeneratedResponse(buildResponseContext(state));
  const responseGenerationMs = Date.now() - responseStart;

  const groundedToolResponse = buildGroundedToolResponse(state);
  const strategyText = state.understanding
    ? responseForStrategy({
        strategy: state.understanding.responseStrategy,
        utterance: transcriptText,
        clarificationPrompt: state.routing?.clarificationPrompt,
        pendingQuestion: state.conversation?.pendingQuestion,
        empathyNeeded: state.understanding.empathyNeeded
      })
    : undefined;

  const responseText = state.handoff?.triggered
    ? isolatedIssueAfterOperationalStatus
      ? `I checked ${previousStatus.region ?? "your area"} and service is operational at a broader level. Since your home issue is still ongoing, I’m connecting you to a human support agent now.`
      : `I’m transferring you to a human specialist now. Reason: ${(state.handoff?.reason ?? "policy_trigger").replaceAll("_", " ")}.`
    : strategyText && state.understanding?.responseMode === "conversational_only"
      ? strategyText
      : answeredPendingQuestion && pendingQuestionContext?.expectedSlot && slotResolutionResult?.normalizedValue
        ? `${buildSlotFillAcknowledgement(pendingQuestionContext.expectedSlot, slotResolutionResult.normalizedValue)} ${groundedToolResponse ?? responseGeneration.finalResponseText}`
        : state.routing?.decision === "clarify" && state.routing.clarificationPrompt
          ? strategyText ?? state.routing.clarificationPrompt
          : groundedToolResponse ?? strategyText ?? responseGeneration.finalResponseText;

  const assistantTurn = {
    id: `turn-${crypto.randomUUID()}`,
    role: "assistant" as const,
    text: responseText,
    createdAt,
    intent: state.understanding?.intent,
    entities: state.understanding?.entities,
    routingDecision: state.routing?.decision,
    workflowName: state.routing?.workflowName,
    toolName: state.toolExecution?.selectedTool,
    toolResult: state.toolResult?.result,
    latencyMs: Date.now() - startTime,
    status: (state.routing?.decision === "clarify" ? "thinking" : "final") as "thinking" | "final"
  };

  let fallbackInfo: string | undefined;
  let errorInfo: string | undefined;
  let ttsFirstAudioMs: number | undefined;
  let ttsCompletionMs: number | undefined;

  if (input.voiceModeEnabled && responseText) {
    const ttsStart = Date.now();
    const tts = await getSpeechSynthesis(responseText, DEFAULT_TTS_SETTINGS);
    const playback = await playSynthesizedAudio(tts);
    ttsCompletionMs = Date.now() - ttsStart;
    ttsFirstAudioMs = playback.firstAudioMs ?? tts.firstAudioLatencyMs;
    state = { ...state, tts: playback.ok ? { ...tts, status: "played" } : { ...tts, status: "fallback", reason: playback.reason ?? tts.reason } };
    if (!playback.ok) {
      fallbackInfo = playback.reason ?? tts.reason;
      errorInfo = "tts_fallback";
    }
  }

  const totalTurnMs = Date.now() - startTime;
  const ttfaMs = fillerResponseText ? fillerTtsFirstAudioMs : ttsFirstAudioMs;

  state = {
    ...state,
    responseGeneration,
    responseText,
    conversation: state.conversation
      ? {
          ...state.conversation,
          currentStatus: state.handoff?.triggered ? "handoff" : state.routing?.decision === "clarify" ? "awaiting_user_input" : "speaking",
          lastAssistantQuestion: state.routing?.decision === "clarify" ? responseText : state.conversation.lastAssistantQuestion,
          lastHandoffState: state.handoff,
          turns: [...state.conversation.turns, assistantTurn].slice(-30)
        }
      : state.conversation,
    latency: {
      sttFinalizationMs,
      understandingMs,
      routingPolicyMs,
      toolExecutionMs,
      responseGenerationMs,
      ttsFirstAudioMs,
      ttsCompletionMs,
      totalTurnMs,
      ttfaMs,
      fillerTtsFirstAudioMs,
      fillerSpeechOverlapMs: fillerResponseText ? Math.max(0, toolExecutionMs - (fillerTtsFirstAudioMs ?? 0)) : 0,
      sttMs: sttFinalizationMs,
      toolMs: toolExecutionMs,
      responseMs: responseGenerationMs,
      ttsMs: ttsCompletionMs,
      totalMs: totalTurnMs
    }
  };

  if (state.toolResult?.status === "failure") {
    fallbackInfo = state.toolResult.error;
    errorInfo = "tool_failure";
  }
  if (stt.fallbackOccurred) fallbackInfo = stt.reason;

  if (fallbackInfo || errorInfo) {
    state = {
      ...state,
      conversation: state.conversation
        ? { ...state.conversation, fallbackState: { triggered: true, reason: fallbackInfo, errorType: errorInfo } }
        : state.conversation
    };
  }

  return {
    session: state,
    responseText,
    transcriptText,
    createdAt,
    fallbackInfo,
    errorInfo,
    fillerResponseText,
    metadata: {
      intent: state.understanding?.intent,
      supportIntent: state.conversation?.activeSupportIntent ?? (state.understanding?.intent === "service_status" ? "service_status" : state.understanding?.intent === "announcements" ? "announcements" : "none"),
      supportRequestType: state.understanding?.requestType ?? "conversational_or_meta",
      activeSupportIntent: state.conversation?.activeSupportIntent,
      continuationDetected: continuation.continuationDetected,
      correctedSlots: continuation.correctedSlots,
      previousToolContext: input.previousSession?.toolExecution
        ? {
            toolName: input.previousSession.toolExecution.selectedTool,
            requestPayload: input.previousSession.toolExecution.requestPayload,
            normalizedResult: input.previousSession.toolExecution.normalizedResult
          }
        : undefined,
      supportIntentTransition:
        input.previousSession?.conversation?.activeSupportIntent && state.conversation?.activeSupportIntent === input.previousSession.conversation.activeSupportIntent
          ? "preserved"
          : state.conversation?.activeSupportIntent
            ? "reset_to_new_support_intent"
            : "reset",
      outOfScopeDemoRequest: state.understanding?.intent === "unsupported_support",
      entities: state.understanding?.entities,
      workflowSelected: state.routing?.workflowName,
      toolCalled: state.toolExecution?.selectedTool,
      toolOutput: state.toolResult?.result,
      routingDecision: state.routing?.decision,
      handoffTriggered: state.handoff?.triggered,
      handoffReason: state.handoff?.reason,
      handoffSummary: state.handoff?.summary,
      previousStatusResult: previousStatus.summary,
      isolatedIssueDetected: isolatedIssueAfterOperationalStatus,
      escalationRecommended: isolatedIssueAfterOperationalStatus ? postStatusSignals.escalationRecommended : undefined,
      preservedSupportContext,
      providerMode: providerMode(state),
      toolExecutionMode: state.toolExecution?.executionMode,
      toolEndpoint: state.toolExecution?.endpoint,
      toolRequestPayload: state.toolExecution?.requestPayload,
      rawToolResponse: state.toolExecution?.rawResponsePayload,
      normalizedToolResult: state.toolExecution?.normalizedResult,
      fallbackActivated: state.toolExecution?.fallbackActivated,
      pendingWorkflow: state.conversation?.pendingWorkflow?.workflowName,
      pendingWorkflowStatus: state.conversation?.pendingWorkflow?.status,
      pendingQuestion: state.conversation?.pendingQuestion,
      toolClarificationNeeded: state.conversation?.toolClarification?.clarificationNeeded,
      clarificationReason: state.conversation?.toolClarification?.clarificationReason,
      expectedSlotFromTool: state.conversation?.toolClarification?.expectedSlotFromTool,
      candidateCategories: state.conversation?.toolClarification?.candidateCategories,
      pendingQuestionPrompt: state.conversation?.pendingQuestion?.prompt,
      lastUnresolvedToolContext: state.conversation?.toolClarification?.lastUnresolvedToolContext,
      expectedSlot: pendingQuestionContext?.expectedSlot,
      missingSlots: state.conversation?.pendingWorkflow?.missingSlots,
      requiredSlots: state.conversation?.pendingWorkflow?.requiredSlots,
      collectedSlots: state.conversation?.collectedSlots,
      regionExtracted: state.conversation?.collectedSlots?.serviceNameOrRegion,
      toolExecutionBlockedDueToMissingSlot: state.routing?.decision === "clarify" && (state.conversation?.pendingWorkflow?.missingSlots?.length ?? 0) > 0,
      turnHandlingMode: resolutionMode,
      slotResolutionResult,
      normalizedSlotValue: slotResolutionResult?.normalizedValue,
      dialogueState: state.routing?.dialogueState,
      turnAct: state.understanding?.turnAct,
      responseStrategy: state.understanding?.responseStrategy,
      responseMode: state.understanding?.responseMode,
      refersToPendingQuestion: state.understanding?.refersToPendingQuestion,
      resetPendingQuestion: state.understanding?.resetPendingQuestion,
      replacePendingWorkflow: state.understanding?.replacePendingWorkflow,
      pendingWorkflowTransition: state.understanding?.replacePendingWorkflow ? "replaced" : state.understanding?.resetPendingQuestion ? "reset" : continuePending ? "continued" : "continued",
      ttsProviderMode: state.tts?.provider,
      fillerUsed: Boolean(fillerResponseText),
      fillerText: fillerResponseText,
      voicePhase: input.voiceModeEnabled ? "speaking_final" : "idle",
      latency: state.latency ?? {}
    }
  };
}
