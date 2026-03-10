import { evaluateDeterministicDecision } from "@/orchestration/decisionEvaluator";
import { runPolicyEngine } from "@/orchestration/policyEngine";
import type { PolicyOptions } from "@/orchestration/policyEngine";
import { PolicyCounters, SessionState } from "@/types/session";

export type { PolicyOptions };

export function runDeterministicUnderstandingPolicy(
  utterance: string,
  options: PolicyOptions,
  previousCounters?: PolicyCounters,
  providerResult?: SessionState["understandingProviderResult"]
): {
  understanding: NonNullable<SessionState["understanding"]>;
  understandingDiagnostics?: SessionState["understandingDiagnostics"];
  policy: NonNullable<SessionState["policy"]>;
  sttFailureHint: boolean;
} {
  return runPolicyEngine(utterance, options, previousCounters, providerResult);
}

export function runDeterministicRoutingPolicy(state: Pick<SessionState, "understanding" | "policy">): NonNullable<SessionState["routing"]> {
  const decision = evaluateDeterministicDecision(state);

  return {
    decision: decision.decision,
    workflowName: decision.workflowName,
    selectedRule: decision.selectedRule,
    whyChosen: decision.reason,
    clarificationPrompt: decision.clarificationPrompt,
    clarificationReason: decision.clarificationReason,
    handoffReason: decision.handoffReason
  };
}

export function runDeterministicHandoffPolicy(state: SessionState): NonNullable<SessionState["handoff"]> {
  const triggered = state.routing?.decision === "handoff" || state.toolResult?.status === "failure";
  const reason = state.routing?.handoffReason ?? (state.toolResult?.status === "failure" ? state.toolResult.error : undefined);

  return {
    triggered,
    reason,
    summary: `Intent=${state.understanding?.intent}; Decision=${state.routing?.decision}; Rule=${state.routing?.selectedRule}; Tool=${state.toolResult?.toolName}`
  };
}
