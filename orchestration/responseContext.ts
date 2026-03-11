import { ResponseGenerationContext, SessionState } from "@/types/session";

interface BuildResponseContextInput {
  state: SessionState;
  postToolResponseMode: "deterministic" | "llm_generated";
  groundedToolResultUsed: boolean;
  previousSession?: SessionState;
  followupCorrectionTurn: boolean;
}

export function buildResponseContext(input: BuildResponseContextInput): ResponseGenerationContext {
  const { state, postToolResponseMode, groundedToolResultUsed, previousSession, followupCorrectionTurn } = input;
  const workflowResult = state.toolResult
    ? state.toolResult.status === "failure"
      ? `Tool ${state.toolResult.toolName} failed: ${String(state.toolResult.error ?? "unknown error")}`
      : `Tool ${state.toolResult.toolName} succeeded: ${JSON.stringify(state.toolResult.result ?? {})}`
    : "No workflow action executed.";

  const pending = state.conversation?.pendingWorkflow;
  const supportIntent = state.conversation?.activeSupportIntent ?? (state.understanding?.intent === "service_status" ? "service_status" : state.understanding?.intent === "announcements" ? "announcements" : "none");
  const normalizedToolResult = (state.toolExecution?.normalizedResult ?? state.toolResult?.result ?? undefined) as Record<string, unknown> | undefined;
  const selectedRegionOrService =
    (state.conversation?.collectedSlots?.serviceNameOrRegion as string | undefined) ??
    (normalizedToolResult?.matchedRegion as string | undefined) ??
    (normalizedToolResult?.matchedServiceName as string | undefined);
  const matchedRegion = (normalizedToolResult?.matchedRegion as string | undefined) ?? selectedRegionOrService;
  const matchedCategory =
    (state.conversation?.collectedSlots?.serviceCategory as string | undefined) ??
    (normalizedToolResult?.matchedCategory as string | undefined);
  const overallStatus = (normalizedToolResult?.overallStatus as string | undefined) ?? (normalizedToolResult?.status as string | undefined);
  const serviceStatus = (normalizedToolResult?.serviceStatus as string | undefined) ?? overallStatus;
  const clarificationNeeded =
    Boolean(state.routing?.decision === "clarify" || state.conversation?.toolClarification?.clarificationNeeded || normalizedToolResult?.clarificationNeeded === true);
  const clarificationPrompt =
    (normalizedToolResult?.clarificationPrompt as string | undefined) ??
    state.routing?.clarificationPrompt ??
    state.conversation?.toolClarification?.prompt;

  return {
    supportIntent,
    postToolResponseMode,
    originalUtterance: state.utterance,
    sentiment: state.understanding?.sentiment,
    empathyNeeded: Boolean(state.understanding?.empathyNeeded),
    turnAct: state.understanding?.turnAct,
    responseStrategy: state.understanding?.responseStrategy,
    responseMode: state.understanding?.responseMode ?? "task_oriented",
    hasPendingQuestion: Boolean(state.conversation?.pendingQuestion),
    workflowPath: state.routing?.decision ?? "no_workflow",
    workflowResult,
    toolName: state.toolResult?.toolName,
    normalizedToolResult,
    selectedRegionOrService,
    matchedRegion,
    matchedCategory,
    overallStatus,
    serviceStatus,
    clarificationNeeded,
    clarificationPrompt,
    selectedCategory: matchedCategory,
    announcementSummary: state.toolResult?.toolName === "fetch_notifications" ? `${((normalizedToolResult?.notifications as Array<unknown> | undefined) ?? []).length} active` : undefined,
    clarificationStillNeeded: clarificationNeeded,
    followupCorrectionTurn,
    groundedToolResultUsed,
    previousToolContext: previousSession?.toolExecution
      ? { toolName: previousSession.toolExecution.selectedTool, normalizedResult: previousSession.toolExecution.normalizedResult }
      : undefined,
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
