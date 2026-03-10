import { SessionState } from "@/types/session";

export type TesterSpeakerRole = "user" | "assistant" | "system";
export type TesterInputSource = "text" | "microphone";
export type TurnStatus = "idle" | "listening" | "thinking" | "tool" | "speaking" | "error";
export type PlaybackStatus = "idle" | "playing" | "stopped" | "unavailable";

export interface TesterDebugState {
  intent?: string;
  entities?: Record<string, string>;
  workflowSelected?: string;
  toolCalled?: string;
  toolOutput?: unknown;
  routingDecision?: string;
  handoffTriggered?: boolean;
  handoffReason?: string;
  handoffSummary?: string;
  providerMode: "mock" | "live" | "mixed";
  latency: {
    sttMs?: number;
    understandingMs?: number;
    toolMs?: number;
    responseMs?: number;
    ttsMs?: number;
    totalMs?: number;
  };
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
