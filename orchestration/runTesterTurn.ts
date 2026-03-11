import { getTranscript } from "@/audio/sttAdapter";
import { getSpeechSynthesis, playSynthesizedAudio } from "@/audio/ttsAdapter";
import { getGeneratedResponse } from "@/llm-adapters/responseAdapter";
import { deriveConversationState, resolvePendingQuestionAnswer, SlotResolutionResult } from "@/orchestration/conversationState";
import { runDeterministicHandoffPolicy, runDeterministicRoutingPolicy, runDeterministicUnderstandingPolicy } from "@/orchestration/deterministicPolicy";
import { buildResponseContext } from "@/orchestration/responseContext";
import { runToolExecution } from "@/tools/toolRunner";
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
  return lowered.includes("human") || lowered.includes("cancel") || lowered.includes("never mind") || lowered.includes("stop");
}

function buildClarificationRetryPrompt(pendingQuestion: PendingQuestionState): string {
  if (pendingQuestion.expectedSlot === "serviceNameOrDevice") return "Just to confirm, is the issue on all devices or only one device?";
  if (pendingQuestion.expectedSlot === "serviceNameOrRegion") return "Could you confirm the exact service or region, like Core Internet or your postcode?";
  if (pendingQuestion.expectedSlot === "date") return "Could you share a clear date or time window, for example tomorrow afternoon?";
  return pendingQuestion.prompt;
}

function buildSlotFillAcknowledgement(slot: string, normalizedValue: string): string {
  if (slot === "serviceNameOrDevice") {
    if (normalizedValue === "all_devices") return "Got it — all devices are affected. Let me check the service status now.";
    if (normalizedValue === "single_device") return "Got it — this looks limited to one device. I’ll run a focused connectivity check now.";
  }
  if (slot === "serviceNameOrRegion") return `Got it — I’ll check outage status for ${normalizedValue}.`;
  if (slot === "date") return `Perfect — I’ll proceed with ${normalizedValue} for the appointment window.`;
  return "Thanks, that helps. I’ll continue now.";
}

function chooseFillerPhrase(utterance: string): string {
  const index = Math.abs(utterance.trim().length) % FILLER_RESPONSES.length;
  return FILLER_RESPONSES[index];
}

function inferPendingQuestionFromRouting(routing: NonNullable<SessionState["routing"]>): PendingQuestionState | undefined {
  if (routing.decision !== "clarify" || !routing.clarificationPrompt) return undefined;
  const prompt = routing.clarificationPrompt.toLowerCase();
  if (!prompt.includes("all devices offline") && !prompt.includes("only one device")) return undefined;

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

  if (state.toolResult.toolName === "check_outage_status") {
    const result = (state.toolResult.result ?? {}) as { matchedServiceName?: string; matchedRegion?: string; overallStatus?: string; estimatedRecoveryText?: string; clarificationNeeded?: boolean };
    if (result.clarificationNeeded) return "I couldn’t confidently identify the service or region. Could you tell me the exact service name?";
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
  toolMode: ToolExecutionMode;
  forceFallback: boolean;
  voiceModeEnabled: boolean;
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
  const awaitingPendingAnswer = Boolean(pendingQuestionContext && input.previousSession?.conversation?.currentStatus === "awaiting_user_input" && !hasStrongIntentShift(transcriptText));
  const slotResolutionResult: SlotResolutionResult | undefined = awaitingPendingAnswer ? resolvePendingQuestionAnswer(transcriptText, pendingQuestionContext) : undefined;
  const answeredPendingQuestion = Boolean(slotResolutionResult?.matched && slotResolutionResult.confidence !== "low");

  input.onStage?.("processing");
  const understandingStart = Date.now();
  const evaluated = runDeterministicUnderstandingPolicy(transcriptText, { workflowMode: input.workflowMode }, input.previousSession?.policy?.counters);
  const understandingMs = Date.now() - understandingStart;

  state = { ...state, understanding: evaluated.understanding, understandingDiagnostics: evaluated.understandingDiagnostics, policy: evaluated.policy };

  const routingStart = Date.now();
  const baseRouting = runDeterministicRoutingPolicy({ understanding: state.understanding, policy: state.policy });
  const routingPolicyMs = Date.now() - routingStart;

  const priorPending = input.previousSession?.conversation?.pendingWorkflow;
  const continuePending = Boolean(priorPending && !hasStrongIntentShift(transcriptText));
  const inferredPendingFromRouting = inferPendingQuestionFromRouting(baseRouting);

  let pendingQuestion: PendingQuestionState | undefined = pendingQuestionContext;
  if (answeredPendingQuestion && pendingQuestionContext) pendingQuestion = undefined;
  else if (awaitingPendingAnswer && pendingQuestionContext && !answeredPendingQuestion) pendingQuestion = { ...pendingQuestionContext, retryCount: pendingQuestionContext.retryCount + 1, prompt: buildClarificationRetryPrompt(pendingQuestionContext) };
  else if (!pendingQuestion && inferredPendingFromRouting) pendingQuestion = inferredPendingFromRouting;

  const nextWorkflowName = continuePending ? priorPending?.workflowName : baseRouting.decision === "workflow" ? baseRouting.workflowName : inferredPendingFromRouting?.workflowName ?? null;
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
  let resolutionMode: "answer_to_pending_question" | "fresh_intent_turn" = "fresh_intent_turn";

  if (conversation.pendingWorkflow && (continuePending || conversation.pendingWorkflow.missingSlots.length > 0)) {
    if (answeredPendingQuestion && pendingQuestionContext) {
      routing = { decision: "workflow", workflowName: conversation.pendingWorkflow.workflowName, selectedRule: "resolved_pending_question", whyChosen: `Resolved pending slot ${pendingQuestionContext.expectedSlot} with ${slotResolutionResult?.normalizedValue ?? transcriptText}`, dialogueState: "ready_to_execute" };
      resolutionMode = "answer_to_pending_question";
    } else if (pendingQuestion && pendingQuestion.retryCount >= 2) {
      routing = { decision: "handoff", workflowName: conversation.pendingWorkflow.workflowName, selectedRule: "pending_question_attempts_exceeded", whyChosen: "Unable to collect required slot values after repeated clarification attempts.", handoffReason: "slot_filling_attempts_exceeded", dialogueState: "handoff" };
    } else if (conversation.pendingWorkflow.attempts >= 3 && conversation.pendingWorkflow.missingSlots.length > 0) {
      routing = { decision: "handoff", workflowName: conversation.pendingWorkflow.workflowName, selectedRule: "pending_slot_attempts_exceeded", whyChosen: "Unable to collect required slot values after repeated turns.", handoffReason: "slot_filling_attempts_exceeded", dialogueState: "handoff" };
    } else if (conversation.pendingWorkflow.missingSlots.length > 0) {
      const activePrompt = pendingQuestion?.prompt ?? conversation.pendingWorkflow.clarificationPrompt;
      routing = { decision: "clarify", workflowName: conversation.pendingWorkflow.workflowName, selectedRule: awaitingPendingAnswer ? "pending_question_retry" : "slot_fill_required_before_workflow", whyChosen: `Pending workflow requires missing slots: ${conversation.pendingWorkflow.missingSlots.join(", ")}`, clarificationPrompt: activePrompt, clarificationReason: awaitingPendingAnswer ? "pending_answer_not_resolved" : "missing_required_slot", dialogueState: "awaiting_missing_info" };
    } else {
      routing = { decision: "workflow", workflowName: conversation.pendingWorkflow.workflowName, selectedRule: "pending_workflow_continuation", whyChosen: "Previously pending workflow now has required slots and can continue.", dialogueState: "ready_to_execute" };
    }
  }

  state = { ...state, conversation, routing };

  const shouldUseFiller = Boolean(input.voiceModeEnabled && FILLER_CONFIG.enabled && routing.decision === "workflow" && (!FILLER_CONFIG.onlyForWorkflow || routing.decision === "workflow"));
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
    const { toolResult, record } = await runToolExecution(state, { forceFallback: input.forceFallback, modeOverride: input.toolMode });
    const pendingStatus = state.conversation?.pendingWorkflow ? { ...state.conversation.pendingWorkflow, status: "completed" as const, missingSlots: [] } : undefined;

    state = {
      ...state,
      toolExecution: { ...record, requestPayload: (record.requestPayload as Record<string, unknown>) ?? {}, responsePayload: record.responsePayload as Record<string, unknown> | undefined },
      toolResult,
      routing: state.routing ? { ...state.routing, dialogueState: "responding" } : state.routing,
      conversation: state.conversation ? { ...state.conversation, pendingWorkflow: pendingStatus, pendingQuestion: undefined, lastToolResult: toolResult.result, currentStatus: "processing" } : state.conversation
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

  const responseStart = Date.now();
  input.onStage?.("speaking_final");
  const responseGeneration = await getGeneratedResponse(buildResponseContext(state));
  const responseGenerationMs = Date.now() - responseStart;

  const groundedToolResponse = buildGroundedToolResponse(state);
  const responseText = state.handoff?.triggered
    ? `I’m transferring you to a human specialist now. Reason: ${(state.handoff?.reason ?? "policy_trigger").replaceAll("_", " ")}.`
    : answeredPendingQuestion && pendingQuestionContext?.expectedSlot && slotResolutionResult?.normalizedValue
      ? `${buildSlotFillAcknowledgement(pendingQuestionContext.expectedSlot, slotResolutionResult.normalizedValue)} ${groundedToolResponse ?? responseGeneration.finalResponseText}`
      : state.routing?.decision === "clarify" && state.routing.clarificationPrompt
        ? state.understanding?.empathyNeeded
          ? `I understand this is frustrating. ${state.routing.clarificationPrompt}`
          : state.routing.clarificationPrompt
        : groundedToolResponse ?? responseGeneration.finalResponseText;

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
      entities: state.understanding?.entities,
      workflowSelected: state.routing?.workflowName,
      toolCalled: state.toolExecution?.selectedTool,
      toolOutput: state.toolResult?.result,
      routingDecision: state.routing?.decision,
      handoffTriggered: state.handoff?.triggered,
      handoffReason: state.handoff?.reason,
      handoffSummary: state.handoff?.summary,
      providerMode: providerMode(state),
      toolExecutionMode: state.toolExecution?.executionMode,
      pendingWorkflow: state.conversation?.pendingWorkflow?.workflowName,
      pendingWorkflowStatus: state.conversation?.pendingWorkflow?.status,
      pendingQuestion: state.conversation?.pendingQuestion,
      expectedSlot: pendingQuestionContext?.expectedSlot,
      missingSlots: state.conversation?.pendingWorkflow?.missingSlots,
      collectedSlots: state.conversation?.collectedSlots,
      turnHandlingMode: resolutionMode,
      slotResolutionResult,
      normalizedSlotValue: slotResolutionResult?.normalizedValue,
      dialogueState: state.routing?.dialogueState,
      ttsProviderMode: state.tts?.provider,
      fillerUsed: Boolean(fillerResponseText),
      fillerText: fillerResponseText,
      voicePhase: input.voiceModeEnabled ? "speaking_final" : "idle",
      latency: state.latency ?? {}
    }
  };
}
