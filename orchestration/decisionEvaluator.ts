import { ROUTING_CONFIG, RoutingDecision } from "@/orchestration/routingConfig";
import { SessionState } from "@/types/session";

export function evaluateDeterministicDecision(state: Pick<SessionState, "understanding" | "policy">): {
  decision: RoutingDecision;
  workflowName?: string;
  selectedRule: string;
  reason: string;
  clarificationPrompt?: string;
  clarificationReason?: string;
  handoffReason?: string;
} {
  const intent = (state.understanding?.intent ?? "unknown") as keyof typeof ROUTING_CONFIG;
  const route = ROUTING_CONFIG[intent] ?? ROUTING_CONFIG.unknown;
  const counters = state.policy?.counters;
  const thresholds = state.policy?.thresholds;
  const lowConfidence = (state.understanding?.intentConfidence ?? 0) < (thresholds?.minIntentConfidence ?? 0.72);

  if (state.understanding?.handoffRecommended) {
    return {
      decision: "handoff",
      selectedRule: "explicit_human_request_always_handoff",
      reason: "User requested human assistance.",
      handoffReason: "explicit_human_request"
    };
  }

  if ((counters?.sttFailures ?? 0) >= (thresholds?.sttFailureEscalationCount ?? 2)) {
    return {
      decision: "handoff",
      selectedRule: "repeated_stt_failure_escalate",
      reason: "Repeated STT failures exceeded threshold.",
      handoffReason: "stt_failures_threshold"
    };
  }

  if ((counters?.toolFailures ?? 0) >= (thresholds?.toolFailureEscalationCount ?? 2)) {
    return {
      decision: "handoff",
      selectedRule: "repeated_tool_failure_escalate",
      reason: "Repeated tool failures exceeded threshold.",
      handoffReason: "tool_failures_threshold"
    };
  }

  if (lowConfidence) {
    if ((counters?.lowConfidence ?? 0) >= (thresholds?.lowConfidenceEscalationCount ?? 2)) {
      return {
        decision: "handoff",
        selectedRule: "repeated_low_confidence_escalate",
        reason: "Low confidence repeated and exceeded escalation threshold.",
        handoffReason: "low_confidence_threshold"
      };
    }

    return {
      decision: "clarify",
      selectedRule: "low_confidence_clarify_first",
      reason: "Intent confidence below deterministic threshold.",
      clarificationReason: "low_intent_confidence",
      clarificationPrompt: "Before I run diagnostics, are all devices offline or only one device?"
    };
  }

  return {
    decision: route.decision,
    workflowName: route.workflowName,
    selectedRule: "static_intent_routing",
    reason: route.reason
  };
}
