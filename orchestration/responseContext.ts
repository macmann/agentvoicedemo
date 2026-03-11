import { ResponseGenerationContext, SessionState } from "@/types/session";

export function buildResponseContext(state: SessionState): ResponseGenerationContext {
  const workflowResult = state.toolResult
    ? state.toolResult.status === "failure"
      ? `Tool ${state.toolResult.toolName} failed: ${String(state.toolResult.error ?? "unknown error")}`
      : `Tool ${state.toolResult.toolName} succeeded: ${JSON.stringify(state.toolResult.result ?? {})}`
    : "No workflow action executed.";

  const pending = state.conversation?.pendingWorkflow;

  return {
    originalUtterance: state.utterance,
    sentiment: state.understanding?.sentiment,
    empathyNeeded: Boolean(state.understanding?.empathyNeeded),
    turnAct: state.understanding?.turnAct,
    responseStrategy: state.understanding?.responseStrategy,
    responseMode: state.understanding?.responseMode ?? "task_oriented",
    hasPendingQuestion: Boolean(state.conversation?.pendingQuestion),
    workflowPath: state.routing?.decision ?? "no_workflow",
    workflowResult,
    handoffState: state.handoff?.triggered
      ? `Handoff required: ${state.handoff.reason ?? state.routing?.handoffReason ?? "policy-triggered"}`
      : "No handoff required.",
    clarificationState:
      state.routing?.decision === "clarify"
        ? state.routing?.clarificationPrompt ?? "Clarification required."
        : "No clarification required.",
    pendingWorkflowState: pending
      ? `Pending workflow ${pending.workflowName} (${pending.status}); missing slots: ${pending.missingSlots.join(", ") || "none"}; collected: ${JSON.stringify(pending.collectedSlots)}`
      : "No pending workflow.",
    policyInstructions:
      "Use responseMode and responseStrategy. For conversational_only responses be brief, natural, and ask at most one next-step question. For task_oriented responses stay precise and grounded to provided context only."
  };
}
