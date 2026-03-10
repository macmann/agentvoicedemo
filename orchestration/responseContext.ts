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
      ? `Pending workflow ${pending.workflowName}; missing slots: ${pending.missingSlots.join(", ") || "none"}; collected: ${JSON.stringify(pending.collectedSlots)}`
      : "No pending workflow.",
    policyInstructions:
      "Keep one main message, remain calm/helpful/empathetic, stay grounded to provided context only, and do not invent unsupported facts."
  };
}
