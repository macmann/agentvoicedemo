import { ToolRequestByName, ToolResponseByName, ToolSuccessResult } from "@/tools/toolTypes";

function success<TName extends keyof ToolRequestByName>(
  toolName: TName,
  request: ToolRequestByName[TName],
  result: ToolResponseByName[TName]
): ToolSuccessResult<TName> {
  return {
    tool_name: toolName,
    status: "success",
    request,
    result,
    mode: "mock"
  };
}

export function mockDiagnoseConnectivity(request: ToolRequestByName["diagnose_connectivity"]) {
  const symptom = (request.symptom ?? "").toLowerCase();

  if (symptom.includes("red") || symptom.includes("router")) {
    return success("diagnose_connectivity", request, {
      diagnosis: "router_unstable",
      recommendation: "Restart the router and wait 2 minutes"
    });
  }

  return success("diagnose_connectivity", request, {
    diagnosis: "line_signal_issue",
    recommendation: "Check the cable connection and power-cycle the modem"
  });
}

export function mockCheckOutageStatus(request: ToolRequestByName["check_outage_status"]) {
  const normalized = request.postcode.replace(/\s+/g, "").toUpperCase();
  const outagePostcodes = new Set(["90210", "10001", "SW1A1AA"]);

  if (outagePostcodes.has(normalized)) {
    return success("check_outage_status", request, {
      outage_detected: true,
      estimated_recovery: "2 hours",
      incident_id: "INC-44721"
    });
  }

  return success("check_outage_status", request, {
    outage_detected: false
  });
}

export function mockRescheduleTechnician(request: ToolRequestByName["reschedule_technician"]) {
  const unavailable = ["today", "2026-01-01"];
  if (unavailable.includes(request.date.trim().toLowerCase())) {
    return {
      tool_name: "reschedule_technician" as const,
      status: "failure" as const,
      error: "Requested date unavailable",
      request,
      mode: "mock" as const
    };
  }

  return success("reschedule_technician", request, {
    confirmed_slot: "Tomorrow 2–4 PM"
  });
}

export function mockCreateSupportTicket(request: ToolRequestByName["create_support_ticket"]) {
  const numeric = Math.floor(10000 + Math.random() * 89999);
  return success("create_support_ticket", request, {
    ticket_id: `SUP-${numeric}`,
    priority: "normal"
  });
}
