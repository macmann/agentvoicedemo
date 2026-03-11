import { PendingQuestionState, SessionState } from "@/types/session";

export type TesterSpeakerRole = "user" | "assistant" | "system";
export type TesterInputSource = "text" | "microphone";
export type TurnStatus = "idle" | "listening" | "thinking" | "tool" | "speaking" | "error";
export type PlaybackStatus = "idle" | "playing" | "stopped" | "unavailable";
export type VoicePhase = "idle" | "listening" | "processing" | "checking_tool" | "speaking_filler" | "speaking_final" | "error";

export interface TesterLatencyMetrics {
  sttFinalizationMs?: number;
  understandingMs?: number;
  routingPolicyMs?: number;
  toolExecutionMs?: number;
  responseGenerationMs?: number;
  ttsFirstAudioMs?: number;
  ttsCompletionMs?: number;
  totalTurnMs?: number;
  ttfaMs?: number;
  fillerTtsFirstAudioMs?: number;
  fillerSpeechOverlapMs?: number;
  sttMs?: number;
  toolMs?: number;
  responseMs?: number;
  ttsMs?: number;
  totalMs?: number;
}

export interface TesterDebugState {
  intent?: string;
  entities?: Record<string, string>;
  workflowSelected?: string;
  toolCalled?: string;
  toolOutput?: unknown;
  routingDecision?: string;
  dialogueState?: string;
  handoffTriggered?: boolean;
  handoffReason?: string;
  handoffSummary?: string;
  providerMode: "mock" | "live" | "mixed";
  toolExecutionMode?: "mock" | "api";
  pendingWorkflow?: string;
  pendingWorkflowStatus?: string;
  pendingQuestion?: PendingQuestionState;
  expectedSlot?: string;
  slotResolutionResult?: {
    matched: boolean;
    confidence: "high" | "medium" | "low";
    normalizedValue?: string;
    rawValue?: string;
    reason: "matched" | "ambiguous" | "no_match";
  };
  normalizedSlotValue?: string;
  turnHandlingMode?: "answer_to_pending_question" | "fresh_intent_turn";
  missingSlots?: string[];
  collectedSlots?: Record<string, string>;
  ttsProviderMode?: "mock_browser" | "openai";
  fillerUsed?: boolean;
  fillerText?: string;
  voicePhase?: VoicePhase;
  latency: TesterLatencyMetrics;
}

export interface TesterTurnRecord {
  id: string;
  createdAt: string;
  inputSource: TesterInputSource;
  transcriptText: string;
  finalResponseText: string;
  metadata: TesterDebugState;
  playbackStatus: PlaybackStatus;
  fallbackInfo?: string;
  errorInfo?: string;
  session: SessionState;
}

export interface TesterMessage {
  id: string;
  role: TesterSpeakerRole;
  text: string;
  createdAt: string;
  turnId?: string;
  status?: TurnStatus;
}

export interface TesterConversationState {
  sessionId: string;
  turns: TesterTurnRecord[];
  messages: TesterMessage[];
  status: TurnStatus;
}

export interface TesterSttState {
  interimTranscript: string;
  finalTranscript: string;
  isListening: boolean;
  isSpeechDetected: boolean;
  silenceMs: number;
  autoSubmitted: boolean;
  recordingStartedAt?: number;
  lastSpeechAt?: number;
  providerMode: "webspeech_streaming" | "unsupported";
}
