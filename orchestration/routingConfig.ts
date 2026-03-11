export type UnderstoodIntent =
  | "service_status"
  | "announcements"
  | "talk_to_human"
  | "unsupported_support"
  | "unclear"
  | "unknown";

export type RoutingDecision = "workflow" | "no_workflow" | "handoff" | "clarify";

export interface RouteConfigEntry {
  intent: UnderstoodIntent;
  decision: RoutingDecision;
  workflowName?: "fetch_service_status" | "check_outage_status" | "fetch_notifications";
  reason: string;
}

export const INTENT_ROUTING_TABLE: RouteConfigEntry[] = [
  { intent: "service_status", decision: "workflow", workflowName: "fetch_service_status", reason: "Service status request should query live status feed." },
  { intent: "announcements", decision: "workflow", workflowName: "fetch_notifications", reason: "Announcements request should query notification feed." },
  { intent: "talk_to_human", decision: "handoff", reason: "User explicitly requested a human agent." },
  { intent: "unsupported_support", decision: "no_workflow", reason: "Support request is outside the demo scope and should be politely redirected." }
];

export const ROUTING_CONFIG: Record<UnderstoodIntent, RouteConfigEntry> = {
  service_status: INTENT_ROUTING_TABLE[0],
  announcements: INTENT_ROUTING_TABLE[1],
  talk_to_human: INTENT_ROUTING_TABLE[2],
  unsupported_support: INTENT_ROUTING_TABLE[3],
  unclear: { intent: "unclear", decision: "no_workflow", reason: "Intent was not confidently mapped; keep conversational and ask user to pick one of the demo-supported tasks." },
  unknown: { intent: "unclear", decision: "no_workflow", reason: "Intent was not confidently mapped; keep conversational and ask user to pick one of the demo-supported tasks." }
};
