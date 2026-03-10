import { SessionState } from "@/types/session";

export interface PolicyOptions {
  workflowMode: "auto" | "workflow" | "no_workflow";
}

type Scenario = "human" | "reschedule" | "outage_check" | "internet_down" | "router_red" | "frustrated" | "general";

function inferScenario(utterance: string): Scenario {
  const text = utterance.toLowerCase();
  if (text.includes("speak to a human") || text.includes("human")) return "human";
  if (text.includes("sick") || text.includes("reschedule") || text.includes("technician")) return "reschedule";
  if (text.includes("outage")) return "outage_check";
  if (text.includes("internet is down") || text.includes("internet")) return "internet_down";
  if (text.includes("router") && text.includes("blinking red")) return "router_red";
  if (text.includes("frustrating")) return "frustrated";
  return "general";
}

export function runDeterministicUnderstandingPolicy(utterance: string, options: PolicyOptions): NonNullable<SessionState["understanding"]> {
  const normalizedUtterance = utterance.toLowerCase();
  const scenario = inferScenario(normalizedUtterance);
  const wantsHuman = scenario === "human";
  const frustrated = scenario === "frustrated";
  const workflowRequired =
    options.workflowMode === "workflow" ||
    (options.workflowMode === "auto" && (normalizedUtterance.includes("outage") || normalizedUtterance.includes("reschedule")));
  const lowConfidence = scenario === "router_red";

  const entities: Record<string, string> = { issueType: "general_support" };
  if (scenario === "reschedule") {
    entities.issueType = "appointment";
    entities.action = "reschedule";
    entities.reason = "sick";
  } else if (scenario === "outage_check" || scenario === "internet_down" || scenario === "router_red") {
    entities.issueType = "connectivity";
    entities.symptom = scenario === "router_red" ? "router_blinking_red" : "internet_down";
  }

  return {
    intent: wantsHuman ? "human_handoff_request" : workflowRequired ? "service_task" : lowConfidence ? "connectivity_issue" : "general_support",
    intentConfidence: wantsHuman ? 0.97 : lowConfidence ? 0.62 : 0.86,
    entities,
    sentiment: frustrated ? "negative" : "neutral",
    empathyNeeded: frustrated,
    workflowRequired,
    recommendedWorkflow: workflowRequired ? "network_or_appointment_workflow" : undefined,
    handoffRecommended: wantsHuman || frustrated,
    reason: wantsHuman ? "Explicit user request" : frustrated ? "Emotional escalation" : lowConfidence ? "Low confidence parse" : undefined
  };
}

export function runDeterministicRoutingPolicy(understanding: SessionState["understanding"]): NonNullable<SessionState["routing"]> {
  const decision = understanding?.handoffRecommended
    ? "handoff"
    : (understanding?.intentConfidence ?? 0) < 0.7
      ? "clarify"
      : understanding?.workflowRequired
        ? "workflow"
        : "no_workflow";

  return {
    decision,
    workflowName: decision === "workflow" ? "network_or_appointment_workflow" : undefined
  };
}

export function runDeterministicHandoffPolicy(state: SessionState): NonNullable<SessionState["handoff"]> {
  const triggered = state.routing?.decision === "handoff" || state.toolResult?.status === "failure";
  const reason =
    state.routing?.decision === "handoff"
      ? state.understanding?.reason
      : state.toolResult?.status === "failure"
        ? state.toolResult.error
        : undefined;

  return {
    triggered,
    reason,
    summary: `Intent=${state.understanding?.intent}; Decision=${state.routing?.decision}; Tool=${state.toolResult?.toolName}`
  };
}
