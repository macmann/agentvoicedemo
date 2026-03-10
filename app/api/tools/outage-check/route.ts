import { callSupportPortal } from "@/lib/supportPortal/client";
import { NextResponse } from "next/server";

function includesText(value: string | undefined, query: string) {
  return (value ?? "").toLowerCase().includes(query.toLowerCase());
}

export async function POST(req: Request) {
  const body = (await req.json()) as { request?: { serviceNameOrRegion?: string; active?: boolean } };
  const query = body.request?.serviceNameOrRegion?.trim();

  try {
    const [serviceStatus, notifications] = await Promise.all([
      callSupportPortal<{ services?: Array<{ name?: string; region?: string; status?: string; updatedAt?: string }> }>({
        endpoint: "/api/service-status",
        method: "GET",
        query: { active: body.request?.active ?? true }
      }),
      callSupportPortal<{ notifications?: Array<{ title?: string; body?: string; serviceName?: string; region?: string; estimatedRecoveryText?: string; active?: boolean }> }>({
        endpoint: "/api/notifications",
        method: "GET",
        query: { active: body.request?.active ?? true }
      })
    ]);

    const matchedService = (serviceStatus.services ?? []).find((item) => {
      if (!query) return false;
      return includesText(item.name, query) || includesText(item.region, query);
    });

    const matchedNotification = (notifications.notifications ?? []).find((item) => {
      if (!query) return false;
      return includesText(item.title, query) || includesText(item.body, query) || includesText(item.serviceName, query) || includesText(item.region, query);
    });

    if (!matchedService && !matchedNotification) {
      return NextResponse.json({
        status: "success",
        result: {
          overallStatus: "UNKNOWN",
          clarificationNeeded: true,
          source: { serviceStatusUsed: true, notificationsUsed: true }
        }
      });
    }

    const overallStatus = (matchedService?.status ?? (matchedNotification ? "PARTIAL_OUTAGE" : "UNKNOWN")) as "OPERATIONAL" | "PARTIAL_OUTAGE" | "MAJOR_OUTAGE" | "UNKNOWN";

    return NextResponse.json({
      status: "success",
      result: {
        matchedServiceName: matchedService?.name ?? matchedNotification?.serviceName,
        matchedRegion: matchedService?.region ?? matchedNotification?.region,
        overallStatus,
        serviceStatus: matchedService?.status,
        announcementTitle: matchedNotification?.title,
        announcementBody: matchedNotification?.body,
        estimatedRecoveryText: matchedNotification?.estimatedRecoveryText,
        source: {
          serviceStatusUsed: true,
          notificationsUsed: true
        }
      }
    });
  } catch (error) {
    return NextResponse.json({ status: "failure", error: error instanceof Error ? error.message : "Outage API failed" }, { status: 502 });
  }
}
