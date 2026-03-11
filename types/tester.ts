import { PendingQuestionState, SessionState } from "@/types/session";

export type TesterSpeakerRole = "user" | "assistant" | "system";
export type TesterInputSource = "text" | "microphone";
export type TurnStatus = "idle" | "listening" | "thinking" | "tool" | "speaking" | "error";
export type PlaybackStatus = "idle" | "playing" | "stopped" | "unavailable";
export type VoicePhase = "idle" | "listening" | "processing" | "checking_tool" | "speaking_filler" | "speaking_final" | "error";

export interface TesterLatencyMetrics {
  sttFinalizationMs?: number;
  understandingMs?: number;
  preToolUnderstandingMs?: number;
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
  intentUnderstandingMode?: "deterministic" | "llm_assisted";
  intentModeLabel?: "Deterministic" | "LLM-assisted";
  postToolResponseModeUsed?: "deterministic" | "llm_generated";
  postToolResponseModeLabel?: "Deterministic" | "LLM-generated";
  supportIntent?: "service_status" | "announcements" | "none";
  supportRequestType?: "support_task" | "answer_to_pending_question" | "support_task_continuation" | "support_task_correction" | "conversational_or_meta";
  outOfScopeDemoRequest?: boolean;
  activeSupportIntent?: "service_status" | "announcements";
  continuationDetected?: boolean;
  correctedSlots?: Record<string, string>;
  previousToolContext?: { toolName: string; requestPayload?: unknown; normalizedResult?: unknown };
  supportIntentTransition?: "preserved" | "reset" | "reset_to_new_support_intent";
  entities?: Record<string, string>;
  workflowSelected?: string;
  toolCalled?: string;
  toolOutput?: unknown;
  routingDecision?: string;
  dialogueState?: string;
  turnAct?: string;
  responseStrategy?: string;
  responseMode?: "conversational_only" | "task_oriented";
  refersToPendingQuestion?: boolean;
  resetPendingQuestion?: boolean;
  replacePendingWorkflow?: boolean;
  pendingWorkflowTransition?: "continued" | "reset" | "replaced";
  handoffTriggered?: boolean;
  handoffReason?: string;
  handoffSummary?: string;
  previousStatusResult?: string;
  isolatedIssueDetected?: boolean;
  escalationRecommended?: boolean;
  preservedSupportContext?: {
    regionChecked?: string;
    previousStatusResult: string;
    isolatedIssueDetected: boolean;
    escalationRecommended: boolean;
    explicitHumanRequest: boolean;
    userFollowup: string;
  };
  preToolProvider?: "openai" | "mock";
  postToolProvider?: "openai" | "mock";
  postToolModel?: string;
  postToolLlmUsed?: boolean;
  responseGenerationLatencyMs?: number;
  responseGenerationSource?: "deterministic_template" | "llm_generated";
  groundedToolResultUsed?: boolean;
  preToolModel?: string;
  preToolUnderstandingUsed?: boolean;
  preToolUsageStatus?: "used" | "disabled_by_mode" | "unavailable_or_failed" | "fallback_to_deterministic";
  preToolUsageReason?: string;
  preToolProviderSelectionReason?: string;
  preToolIntentConfidence?: number;
  preToolRescueMappingApplied?: boolean;
  preToolLatencyMs?: number;
  preToolInferredSupportIntent?: "service_status" | "announcements" | "none";
  preToolTurnAct?: string;
  preToolClarificationNeeded?: boolean;
  preToolClarificationQuestion?: string;
  preToolEntities?: Record<string, string>;
  preToolContinuationDetected?: boolean;
  preToolCorrectionDetected?: boolean;
  preToolHandoffRecommended?: boolean;
  preToolReason?: string;
  providerMode: "mock" | "live" | "mixed";
  toolExecutionMode?: "mock" | "api";
  toolEndpoint?: string;
  toolRequestPayload?: unknown;
  rawToolResponse?: unknown;
  normalizedToolResult?: unknown;
  fallbackActivated?: boolean;
  pendingWorkflow?: string;
  pendingWorkflowStatus?: string;
  pendingQuestion?: PendingQuestionState;
  toolClarificationNeeded?: boolean;
  clarificationReason?: string;
  expectedSlotFromTool?: string;
  candidateCategories?: string[];
  pendingQuestionPrompt?: string;
  lastUnresolvedToolContext?: Record<string, unknown>;
  expectedSlot?: string;
  slotResolutionResult?: {
    matched: boolean;
    confidence: "high" | "medium" | "low";
    normalizedValue?: string;
    rawValue?: string;
    reason: "matched" | "ambiguous" | "no_match";
  };
  normalizedSlotValue?: string;
  turnHandlingMode?: "answer_to_pending_question" | "fresh_intent_turn" | "support_task_continuation" | "support_task_correction";
  missingSlots?: string[];
  requiredSlots?: string[];
  collectedSlots?: Record<string, string>;
  regionExtracted?: string;
  toolExecutionBlockedDueToMissingSlot?: boolean;
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
