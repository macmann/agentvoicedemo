export type UnderstoodIntent =
  | "report_internet_issue"
  | "report_router_issue"
  | "outage_check"
  | "reschedule_visit"
  | "talk_to_human"
  | "empathy_only"
  | "unclear"
  | "unknown";

export type RoutingDecision = "workflow" | "no_workflow" | "handoff" | "clarify";

export interface RouteConfigEntry {
  intent: UnderstoodIntent;
  decision: RoutingDecision;
  workflowName?: "diagnose_connectivity" | "check_outage_status" | "reschedule_technician";
  reason: string;
}

export const INTENT_ROUTING_TABLE: RouteConfigEntry[] = [
  { intent: "report_internet_issue", decision: "workflow", workflowName: "diagnose_connectivity", reason: "Internet issue requires connectivity diagnostics." },
  { intent: "report_router_issue", decision: "workflow", workflowName: "diagnose_connectivity", reason: "Router symptom maps to connectivity diagnostics." },
  { intent: "outage_check", decision: "workflow", workflowName: "check_outage_status", reason: "Outage request must run outage lookup." },
  { intent: "reschedule_visit", decision: "workflow", workflowName: "reschedule_technician", reason: "Appointment reschedule requires technician scheduling workflow." },
  { intent: "talk_to_human", decision: "handoff", reason: "User explicitly requested a human agent." },
  { intent: "empathy_only", decision: "no_workflow", reason: "User expressed emotion without operational request." }
];

export const ROUTING_CONFIG: Record<UnderstoodIntent, RouteConfigEntry> = {
  report_internet_issue: INTENT_ROUTING_TABLE[0],
  report_router_issue: INTENT_ROUTING_TABLE[1],
  outage_check: INTENT_ROUTING_TABLE[2],
  reschedule_visit: INTENT_ROUTING_TABLE[3],
  talk_to_human: INTENT_ROUTING_TABLE[4],
  empathy_only: INTENT_ROUTING_TABLE[5],
  unclear: { intent: "unclear", decision: "clarify", reason: "Intent could not be confidently mapped to a known workflow." },
  unknown: { intent: "unclear", decision: "clarify", reason: "Intent could not be confidently mapped to a known workflow." }
};
