import { getTranscript } from "@/audio/sttAdapter";
import { getSpeechSynthesis, playSynthesizedAudio } from "@/audio/ttsAdapter";
import { getGeneratedResponse } from "@/llm-adapters/responseAdapter";
import { deriveConversationState } from "@/orchestration/conversationState";
import { runDeterministicHandoffPolicy, runDeterministicRoutingPolicy, runDeterministicUnderstandingPolicy } from "@/orchestration/deterministicPolicy";
import { buildResponseContext } from "@/orchestration/responseContext";
import { runToolExecution } from "@/tools/toolRunner";
import { ToolExecutionMode } from "@/tools/toolTypes";
import { SessionState, TtsSettingsView } from "@/types/session";
import { TesterDebugState, TesterInputSource } from "@/types/tester";

const DEFAULT_TTS_SETTINGS: TtsSettingsView = {
  voiceStyle: "calm-neutral",
  speed: 1,
  streamingEnabled: true
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

export interface RunTesterTurnInput {
  utterance: string;
  inputSource: TesterInputSource;
  sttCapture?: SessionState["sttCapture"];
  previousSession?: SessionState;
  workflowMode: "auto" | "workflow" | "no_workflow";
  toolMode: ToolExecutionMode;
  forceFallback: boolean;
  voiceModeEnabled: boolean;
  onStage?: (stage: "thinking" | "tool" | "speaking") => void;
}

export interface RunTesterTurnOutput {
  session: SessionState;
  responseText: string;
  transcriptText: string;
  createdAt: string;
  fallbackInfo?: string;
  errorInfo?: string;
  metadata: TesterDebugState;
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
  const sttMs = Date.now() - sttStart;
  const transcriptText = (stt.transcript || input.utterance || "").trim();
  state = { ...state, stt, transcript: transcriptText, utterance: transcriptText };

  if (!transcriptText) {
    const message = "I didn’t catch that. Please try again by speaking clearly or typing your request.";
    return {
      session: { ...state, responseText: message, latency: { sttMs, totalMs: sttMs } },
      responseText: message,
      transcriptText,
      createdAt,
      fallbackInfo: stt.reason,
      errorInfo: stt.failureType,
      metadata: {
        providerMode: providerMode(state),
        latency: { sttMs, totalMs: sttMs },
        routingDecision: "clarify"
      }
    };
  }

  const understandingStart = Date.now();
  input.onStage?.("thinking");
  const evaluated = runDeterministicUnderstandingPolicy(transcriptText, { workflowMode: input.workflowMode }, input.previousSession?.policy?.counters);
  const understandingMs = Date.now() - understandingStart;

  state = {
    ...state,
    understanding: evaluated.understanding,
    understandingDiagnostics: evaluated.understandingDiagnostics,
    policy: evaluated.policy
  };

  const baseRouting = runDeterministicRoutingPolicy({ understanding: state.understanding, policy: state.policy });
  const priorPending = input.previousSession?.conversation?.pendingWorkflow;
  const continuePending = priorPending && !hasStrongIntentShift(transcriptText);

  const conversation = deriveConversationState({
    previous: input.previousSession?.conversation,
    utterance: transcriptText,
    createdAt,
    workflowName: continuePending ? priorPending.workflowName : baseRouting.workflowName,
    intent: state.understanding?.intent,
    dialogueState: "responding"
  });

  let routing: NonNullable<SessionState["routing"]> = { ...baseRouting, dialogueState: "responding" };

  if (conversation.pendingWorkflow && continuePending) {
    if (conversation.pendingWorkflow.attempts >= 3 && conversation.pendingWorkflow.missingSlots.length > 0) {
      routing = {
        decision: "handoff",
        workflowName: conversation.pendingWorkflow.workflowName,
        selectedRule: "pending_slot_attempts_exceeded",
        whyChosen: "Unable to collect required slot values after repeated turns.",
        handoffReason: "slot_filling_attempts_exceeded",
        dialogueState: "handoff"
      };
    } else if (conversation.pendingWorkflow.missingSlots.length > 0) {
      routing = {
        decision: "clarify",
        workflowName: conversation.pendingWorkflow.workflowName,
        selectedRule: "slot_fill_required_before_workflow",
        whyChosen: `Pending workflow requires missing slots: ${conversation.pendingWorkflow.missingSlots.join(", ")}`,
        clarificationPrompt: conversation.pendingWorkflow.clarificationPrompt,
        clarificationReason: "missing_required_slot",
        dialogueState: "awaiting_missing_info"
      };
    } else {
      routing = {
        decision: "workflow",
        workflowName: conversation.pendingWorkflow.workflowName,
        selectedRule: "pending_workflow_continuation",
        whyChosen: "Previously pending workflow now has required slots and can continue.",
        dialogueState: "ready_to_execute"
      };
    }
  }

  state = { ...state, conversation, routing };

  const toolStart = Date.now();
  if (routing.decision === "workflow") {
    input.onStage?.("tool");
    state = { ...state, routing: { ...routing, dialogueState: "executing_tool" } };
    const { toolResult, record } = await runToolExecution(state, {
      forceFallback: input.forceFallback,
      modeOverride: input.toolMode
    });

    const pendingStatus = state.conversation?.pendingWorkflow
      ? {
          ...state.conversation.pendingWorkflow,
          status: "completed" as const,
          missingSlots: []
        }
      : undefined;

    state = {
      ...state,
      toolExecution: {
        ...record,
        requestPayload: (record.requestPayload as Record<string, unknown>) ?? {},
        responsePayload: record.responsePayload as Record<string, unknown> | undefined
      },
      toolResult,
      routing: state.routing ? { ...state.routing, dialogueState: "responding" } : state.routing,
      conversation: state.conversation
        ? {
            ...state.conversation,
            pendingWorkflow: pendingStatus,
            lastToolResult: toolResult.result,
            currentStatus: "processing"
          }
        : state.conversation
    };
  }
  const toolMs = Date.now() - toolStart;

  state = {
    ...state,
    handoff: runDeterministicHandoffPolicy(state)
  };

  const responseStart = Date.now();
  input.onStage?.("speaking");
  const responseGeneration = await getGeneratedResponse(buildResponseContext(state));
  const responseMs = Date.now() - responseStart;

  const responseText = state.handoff?.triggered
    ? `I’m transferring you to a human specialist now. Reason: ${(state.handoff?.reason ?? "policy_trigger").replaceAll("_", " ")}.`
    : state.routing?.decision === "clarify" && state.routing.clarificationPrompt
      ? state.routing.clarificationPrompt
      : responseGeneration.finalResponseText;

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
      sttMs,
      understandingMs,
      toolMs,
      responseMs
    }
  };

  let fallbackInfo: string | undefined;
  let errorInfo: string | undefined;

  if (input.voiceModeEnabled && responseText) {
    const ttsStart = Date.now();
    const tts = await getSpeechSynthesis(responseText, DEFAULT_TTS_SETTINGS);
    const playback = await playSynthesizedAudio(tts);
    const ttsMs = Date.now() - ttsStart;
    state = {
      ...state,
      tts: playback.ok ? { ...tts, status: "played" } : { ...tts, status: "fallback", reason: playback.reason ?? tts.reason },
      latency: {
        ...state.latency,
        ttsMs
      }
    };
    if (!playback.ok) {
      fallbackInfo = playback.reason ?? tts.reason;
      errorInfo = "tts_fallback";
    }
  }

  state = {
    ...state,
    latency: {
      ...state.latency,
      totalMs: Date.now() - startTime
    }
  };

  if (state.toolResult?.status === "failure") {
    fallbackInfo = state.toolResult.error;
    errorInfo = "tool_failure";
  }
  if (stt.fallbackOccurred) {
    fallbackInfo = stt.reason;
  }

  if (fallbackInfo || errorInfo) {
    state = {
      ...state,
      conversation: state.conversation
        ? {
            ...state.conversation,
            fallbackState: {
              triggered: true,
              reason: fallbackInfo,
              errorType: errorInfo
            }
          }
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
      pendingWorkflow: state.conversation?.pendingWorkflow?.workflowName,
      pendingWorkflowStatus: state.conversation?.pendingWorkflow?.status,
      missingSlots: state.conversation?.pendingWorkflow?.missingSlots,
      collectedSlots: state.conversation?.collectedSlots,
      dialogueState: state.routing?.dialogueState,
      latency: state.latency ?? {}
    }
  };
}
