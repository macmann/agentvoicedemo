import { ToolExecutionMode, ToolName } from "@/tools/toolTypes";

export interface ToolConfig {
  toolName: ToolName;
  mode: ToolExecutionMode;
  timeoutMs: number;
  endpoint?: string;
  fallbackBehavior: string;
}

export type ToolConfigMap = Record<ToolName, ToolConfig>;

export const DEFAULT_TOOL_CONFIGS: ToolConfigMap = {
  diagnose_connectivity: {
    toolName: "diagnose_connectivity",
    mode: "mock",
    timeoutMs: 1500,
    endpoint: "/api/tools/diagnose-connectivity",
    fallbackBehavior: "Create support ticket and suggest human handoff if diagnostics fail."
  },
  check_outage_status: {
    toolName: "check_outage_status",
    mode: "mock",
    timeoutMs: 2200,
    endpoint: "/api/tools/outage-check",
    fallbackBehavior: "If outage matching is ambiguous, ask for service/region clarification before handoff."
  },
  fetch_service_status: {
    toolName: "fetch_service_status",
    mode: "mock",
    timeoutMs: 1800,
    endpoint: "/api/tools/fetch-service-status",
    fallbackBehavior: "Return unknown service state and continue with safe response."
  },
  fetch_notifications: {
    toolName: "fetch_notifications",
    mode: "mock",
    timeoutMs: 1800,
    endpoint: "/api/tools/fetch-notifications",
    fallbackBehavior: "Return no active notifications and offer support ticket creation."
  },
  reschedule_technician: {
    toolName: "reschedule_technician",
    mode: "mock",
    timeoutMs: 1500,
    endpoint: "/api/tools/reschedule-technician",
    fallbackBehavior: "If slot unavailable, create support ticket and handoff."
  },
  create_support_ticket: {
    toolName: "create_support_ticket",
    mode: "mock",
    timeoutMs: 1000,
    endpoint: "/api/tools/create-support-ticket",
    fallbackBehavior: "If ticket creation fails, escalate directly to human support."
  }
};
