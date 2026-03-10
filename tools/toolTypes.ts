import { SessionState } from "@/types/session";

export type ToolExecutionMode = "mock" | "api";

export type ToolName =
  | "diagnose_connectivity"
  | "check_outage_status"
  | "fetch_service_status"
  | "fetch_notifications"
  | "reschedule_technician"
  | "create_support_ticket";

export interface DiagnoseConnectivityRequest {
  account_id?: string;
  symptom?: string;
  serviceName?: string;
  device?: string;
}

export interface DiagnoseConnectivityResponse {
  diagnosis: "router_unstable" | "line_signal_issue" | "no_fault_detected";
  recommendation: string;
}

export interface FetchServiceStatusRequest {
  active?: boolean;
}

export interface ServiceStatusItem {
  serviceName: string;
  region?: string;
  status: "OPERATIONAL" | "PARTIAL_OUTAGE" | "MAJOR_OUTAGE";
  updatedAt?: string;
}

export interface FetchServiceStatusResponse {
  services: ServiceStatusItem[];
}

export interface FetchNotificationsRequest {
  active?: boolean;
  from?: string;
  to?: string;
}

export interface NotificationItem {
  title: string;
  body: string;
  serviceName?: string;
  region?: string;
  active?: boolean;
  createdAt?: string;
  estimatedRecoveryText?: string;
}

export interface FetchNotificationsResponse {
  notifications: NotificationItem[];
}

export interface CheckOutageStatusRequest {
  serviceNameOrRegion?: string;
  active?: boolean;
}

export interface CheckOutageStatusResponse {
  matchedServiceName?: string;
  matchedRegion?: string;
  overallStatus: "OPERATIONAL" | "PARTIAL_OUTAGE" | "MAJOR_OUTAGE" | "UNKNOWN";
  serviceStatus?: "OPERATIONAL" | "PARTIAL_OUTAGE" | "MAJOR_OUTAGE";
  announcementTitle?: string;
  announcementBody?: string;
  estimatedRecoveryText?: string;
  source: {
    serviceStatusUsed: boolean;
    notificationsUsed: boolean;
  };
  clarificationNeeded?: boolean;
}

export interface RescheduleTechnicianRequest {
  date: string;
}

export interface RescheduleTechnicianResponse {
  confirmed_slot: string;
}

export interface CreateSupportTicketRequest {
  summary: string;
}

export interface CreateSupportTicketResponse {
  ticket_id: string;
  priority: "low" | "normal" | "high";
}

export type ToolRequestByName = {
  diagnose_connectivity: DiagnoseConnectivityRequest;
  check_outage_status: CheckOutageStatusRequest;
  fetch_service_status: FetchServiceStatusRequest;
  fetch_notifications: FetchNotificationsRequest;
  reschedule_technician: RescheduleTechnicianRequest;
  create_support_ticket: CreateSupportTicketRequest;
};

export type ToolResponseByName = {
  diagnose_connectivity: DiagnoseConnectivityResponse;
  check_outage_status: CheckOutageStatusResponse;
  fetch_service_status: FetchServiceStatusResponse;
  fetch_notifications: FetchNotificationsResponse;
  reschedule_technician: RescheduleTechnicianResponse;
  create_support_ticket: CreateSupportTicketResponse;
};

export interface ToolFailureResult {
  tool_name: ToolName;
  status: "failure";
  error: string;
  request: ToolRequestByName[ToolName];
  mode: ToolExecutionMode;
  endpoint?: string;
  fallback_behavior?: string;
}

export interface ToolSuccessResult<TName extends ToolName = ToolName> {
  tool_name: TName;
  status: "success";
  result: ToolResponseByName[TName];
  request: ToolRequestByName[TName];
  mode: ToolExecutionMode;
  endpoint?: string;
  fallback_behavior?: string;
}

export type ToolExecutionResult = ToolFailureResult | ToolSuccessResult;

export interface ToolContext {
  state: SessionState;
  forceFallback: boolean;
}

export interface ToolExecutionRecord {
  selectedTool: ToolName;
  requestPayload: unknown;
  responsePayload?: unknown;
  executionStatus: "success" | "failure";
  executionTimeMs: number;
  executionMode: ToolExecutionMode;
  endpoint?: string;
  fallbackBehavior?: string;
  errorMessage?: string;
}
