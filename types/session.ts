export type FlowNodeId =
  | "stt"
  | "understanding"
  | "decision"
  | "toolExecution"
  | "responseGeneration"
  | "tts"
  | "handoff";

export type NodeVisualState = "idle" | "active" | "success" | "fallback" | "failure" | "handoff";

export type SttInputMode = "text" | "microphone";

export type SttResultMode = "text" | "microphone" | "mock";

export interface SttResultContract {
  transcript: string;
  confidence: number;
  provider: string;
  mode: SttResultMode;
  timestamps?: Array<{ startMs: number; endMs: number; text: string }>;
  language: string;
  streaming: boolean;
  status: "recognized" | "fallback";
  fallbackOccurred: boolean;
  failureType?: "low_confidence" | "empty_transcript" | "permission_denied" | "recording_failure";
  fallbackBehavior: string;
  reason?: string;
}

export interface SttDiagnostics extends SttResultContract {
  model: string;
  inputMode: SttInputMode;
  rawInput: string;
}

export interface PolicyCounters {
  sttFailures: number;
  toolFailures: number;
  lowConfidence: number;
}

export interface PolicyThresholdView {
  minIntentConfidence: number;
  lowConfidenceEscalationCount: number;
  toolFailureEscalationCount: number;
  sttFailureEscalationCount: number;
}

export interface StructuredUnderstandingResult {
  intent: string;
  intentConfidence: number;
  entities: Record<string, string>;
  sentiment?: string;
  empathyNeeded: boolean;
  workflowRequired: boolean;
  recommendedWorkflow?: string;
  handoffRecommended: boolean;
  reason?: string;
}

export interface UnderstandingDiagnostics {
  provider: "openai" | "mock";
  model: string;
  promptType: "structured_intent_v1";
  rawOutput: string;
  validationStatus: "valid" | "sanitized" | "fallback";
  fallbackBehavior: string;
}

export interface ResponseGenerationContext {
  originalUtterance: string;
  sentiment?: string;
  empathyNeeded: boolean;
  workflowPath: "workflow" | "no_workflow" | "handoff" | "clarify";
  workflowResult: string;
  handoffState: string;
  clarificationState: string;
  pendingWorkflowState?: string;
  policyInstructions: string;
}

export interface PendingWorkflowState {
  workflowName: "diagnose_connectivity" | "check_outage_status" | "reschedule_technician" | "create_support_ticket";
  status: "awaiting_input" | "ready" | "running" | "completed" | "cancelled";
  requiredSlots: string[];
  missingSlots: string[];
  collectedSlots: Record<string, string>;
  clarificationPrompt?: string;
  originalIntent?: string;
  attempts: number;
}

export interface ConversationTurn {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: string;
  transcript?: string;
  intent?: string;
  entities?: Record<string, string>;
  routingDecision?: string;
  workflowName?: string;
  toolName?: string;
  toolResult?: unknown;
  latencyMs?: number;
  status?: "final" | "thinking" | "listening" | "tool_running" | "fallback";
}

export interface ConversationState {
  conversationId: string;
  turns: ConversationTurn[];
  currentStatus: "idle" | "listening" | "processing" | "awaiting_user_input" | "speaking" | "handoff";
  activeIntent?: string;
  pendingWorkflow?: PendingWorkflowState;
  pendingSlots: string[];
  collectedSlots: Record<string, string>;
  lastAssistantQuestion?: string;
  lastToolResult?: unknown;
  lastHandoffState?: {
    triggered: boolean;
    reason?: string;
    summary?: string;
  };
  fallbackState?: {
    triggered: boolean;
    reason?: string;
    errorType?: string;
  };
}

export interface ResponseGenerationDiagnostics {
  provider: "openai" | "mock";
  model: string;
  toneSettings: string[];
  maxResponseLength: number;
  structuredContext: ResponseGenerationContext;
  finalResponseText: string;
  guardrailNote: string;
  fallbackBehavior: string;
}

export interface TtsSettingsView {
  voiceStyle: string;
  speed: number;
  streamingEnabled: boolean;
}

export interface TtsDiagnostics {
  provider: "mock_browser" | "openai";
  model: string;
  status: "played" | "ready" | "fallback";
  firstAudioLatencyMs: number;
  settings: TtsSettingsView;
  responseText: string;
  reason?: string;
  audioUrl?: string;
}

export interface ToolExecutionView {
  selectedTool: "diagnose_connectivity" | "check_outage_status" | "fetch_service_status" | "fetch_notifications" | "reschedule_technician" | "create_support_ticket";
  requestPayload: Record<string, unknown>;
  responsePayload?: Record<string, unknown>;
  executionStatus: "success" | "failure";
  executionTimeMs: number;
  executionMode: "mock" | "api";
  endpoint?: string;
  fallbackBehavior?: string;
  errorMessage?: string;
}

export interface SessionState {
  utterance: string;
  sttInputMode?: SttInputMode;
  sttCapture?: {
    transcript: string;
    confidence: number;
    status: "recognized" | "fallback";
    reason?: string;
    failureType?: "permission_denied" | "recording_failure" | "empty_transcript" | "low_confidence";
    timestamps?: Array<{ startMs: number; endMs: number; text: string }>;
  };
  sttStreamingSimulated?: boolean;
  stt?: SttDiagnostics;
  transcript?: string;
  conversation?: ConversationState;
  understanding?: StructuredUnderstandingResult;
  understandingProviderResult?: {
    understanding: StructuredUnderstandingResult;
    diagnostics: UnderstandingDiagnostics;
  };
  understandingDiagnostics?: UnderstandingDiagnostics;
  routing?: {
    decision: "workflow" | "no_workflow" | "handoff" | "clarify";
    workflowName?: string;
    selectedRule?: string;
    whyChosen?: string;
    clarificationPrompt?: string;
    clarificationReason?: string;
    handoffReason?: string;
    dialogueState?: "awaiting_missing_info" | "ready_to_execute" | "executing_tool" | "responding" | "handoff";
  };
  toolExecution?: ToolExecutionView;
  toolResult?: {
    provider?: "mock_local" | "api";
    toolName: string;
    status: "success" | "failure";
    result?: unknown;
    error?: string;
  };
  responseText?: string;
  responseGeneration?: ResponseGenerationDiagnostics;
  tts?: TtsDiagnostics;
  handoff?: {
    triggered: boolean;
    reason?: string;
    summary?: string;
  };
  policy?: {
    counters: PolicyCounters;
    thresholds: PolicyThresholdView;
    selectedRule?: string;
    whyChosen?: string;
    confidenceThreshold?: number;
    handoffRule?: string;
    routingConfig?: {
      intent: string;
      decision: "workflow" | "no_workflow" | "handoff" | "clarify";
      workflowName?: string;
      reason: string;
    };
  };
  latency?: {
    sttMs?: number;
    understandingMs?: number;
    toolMs?: number;
    responseMs?: number;
    ttsMs?: number;
    totalMs?: number;
  };
}

export interface DemoLogEvent {
  id: string;
  stage: string;
  message: string;
  timestamp: string;
}

export interface NodeDetails {
  id: FlowNodeId;
  label: string;
  purpose: string;
  input: string;
  output: string;
  parameters: string[];
  latencyEstimate: string;
  fallbackBehavior: string;
}
