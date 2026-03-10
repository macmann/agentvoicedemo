import { SessionState } from "@/types/session";

export function executeMockTool(state: SessionState, forceFallback: boolean) {
  const utterance = state.utterance.toLowerCase();

  if (forceFallback) {
    return {
      toolName: "OutageLookupAPI",
      status: "failure" as const,
      error: "Tool timeout while contacting regional outage endpoint"
    };
  }

  if (utterance.includes("outage") || utterance.includes("internet") || utterance.includes("router")) {
    return {
      toolName: "OutageLookupAPI",
      status: "success" as const,
      result: { outageDetected: true, eta: "2 hours", area: "ZIP 90210" }
    };
  }

  if (utterance.includes("reschedule") || utterance.includes("technician")) {
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
