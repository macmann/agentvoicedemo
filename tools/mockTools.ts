import { SessionState } from "@/types/session";

export function executeMockTool(state: SessionState, forceFallback: boolean) {
  const workflow = state.routing?.workflowName;

  if (forceFallback) {
    return {
      toolName: "OutageLookupAPI",
      status: "failure" as const,
      error: "Tool timeout while contacting regional outage endpoint"
    };
  }

  if (workflow === "diagnose_connectivity") {
    if (state.understanding?.intent === "report_router_issue") {
      return {
        toolName: "DeviceDiagnostics",
        status: "success" as const,
        result: { diagnosticCode: "LOS_RED", recommendation: "power_cycle_then_check_cable", outageDetected: false }
      };
    }

    return {
      toolName: "OutageLookupAPI",
      status: "success" as const,
      result: { outageDetected: true, eta: "2 hours", area: "ZIP 90210", symptom: "internet_down" }
    };
  }

  if (workflow === "check_outage_status") {
    return {
      toolName: "OutageLookupAPI",
      status: "success" as const,
      result: { outageDetected: true, eta: "2 hours", area: "ZIP 90210", incidentId: "INC-44721" }
    };
  }

  if (workflow === "reschedule_technician") {
    return {
      toolName: "AppointmentManager",
      status: "success" as const,
      result: { updated: true, newWindow: "Tomorrow 10:00-12:00" }
    };
  }

  return {
    toolName: "CustomerProfile",
    status: "success" as const,
    result: { accountVerified: true }
  };
}
