export type FlowNodeId =
  | "stt"
  | "understanding"
  | "decision"
  | "toolExecution"
  | "responseGeneration"
  | "tts"
  | "handoff";

export type NodeVisualState = "idle" | "active" | "success" | "fallback" | "failure" | "handoff";

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


export interface ToolExecutionView {
  selectedTool: "diagnose_connectivity" | "check_outage_status" | "reschedule_technician" | "create_support_ticket";
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
  transcript?: string;
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
