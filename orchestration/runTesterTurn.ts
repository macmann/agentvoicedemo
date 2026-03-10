import { getTranscript } from "@/audio/sttAdapter";
import { getSpeechSynthesis, playSynthesizedAudio } from "@/audio/ttsAdapter";
import { getGeneratedResponse } from "@/llm-adapters/responseAdapter";
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
  const startTime = Date.now();
  let state: SessionState = {
    utterance: input.utterance,
    sttInputMode: input.inputSource,
    sttCapture: input.sttCapture,
    sttStreamingSimulated: true,
    policy: input.previousSession?.policy
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
      createdAt: nowIso(),
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

  const routing = runDeterministicRoutingPolicy({ understanding: state.understanding, policy: state.policy });
  state = { ...state, routing };

  const toolStart = Date.now();
  if (routing.decision === "workflow") {
    input.onStage?.("tool");
    const { toolResult, record } = await runToolExecution(state, {
      forceFallback: input.forceFallback,
      modeOverride: input.toolMode
    });
    state = {
      ...state,
      toolExecution: {
        ...record,
        requestPayload: (record.requestPayload as Record<string, unknown>) ?? {},
        responsePayload: record.responsePayload as Record<string, unknown> | undefined
      },
      toolResult
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

  const handoffReason = state.handoff?.reason ?? state.routing?.handoffReason;
  const handoffText = handoffReason
    ? `I’m transferring you to a human specialist now. Reason: ${handoffReason.replaceAll("_", " ")}.`
    : "I’m transferring you to a human specialist now with your conversation summary.";
  const responseText = state.handoff?.triggered ? handoffText : responseGeneration.finalResponseText;

  state = {
    ...state,
    responseGeneration,
    responseText,
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

  return {
    session: state,
    responseText,
    transcriptText,
    createdAt: nowIso(),
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
      latency: state.latency ?? {}
    }
  };
}
