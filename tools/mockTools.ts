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

export function mockFetchServiceStatus(request: ToolRequestByName["fetch_service_status"]) {
  const services = [
    { serviceName: "Core Internet", region: "Downtown", status: "PARTIAL_OUTAGE" as const, updatedAt: new Date().toISOString() },
    { serviceName: "Mobile", region: "Citywide", status: "OPERATIONAL" as const, updatedAt: new Date().toISOString() }
  ];

  return success("fetch_service_status", request, { services: request.active === false ? [] : services });
}

export function mockFetchNotifications(request: ToolRequestByName["fetch_notifications"]) {
  const notifications = [
    {
      title: "Core Internet Degradation in Downtown Region",
      body: "We are investigating elevated latency for Core Internet in Downtown.",
      serviceName: "Core Internet",
      region: "Downtown",
      active: true,
      estimatedRecoveryText: "about 2 hours",
      createdAt: new Date().toISOString()
    }
  ];

  return success("fetch_notifications", request, { notifications: request.active === false ? [] : notifications });
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
  const lookup = (request.serviceNameOrRegion ?? "").toLowerCase();
  const matched = lookup.includes("core") || lookup.includes("downtown");

  if (matched) {
    return success("check_outage_status", request, {
      matchedServiceName: "Core Internet",
      matchedRegion: "Downtown",
      overallStatus: "PARTIAL_OUTAGE",
      serviceStatus: "PARTIAL_OUTAGE",
      announcementTitle: "Core Internet Degradation in Downtown Region",
      announcementBody: "We are investigating elevated latency for Core Internet in Downtown.",
      estimatedRecoveryText: "about 2 hours",
      source: {
        serviceStatusUsed: true,
        notificationsUsed: true
      }
    });
  }

  return success("check_outage_status", request, {
    overallStatus: "UNKNOWN",
    source: {
      serviceStatusUsed: true,
      notificationsUsed: true
    },
    clarificationNeeded: true
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
