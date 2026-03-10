import { callSupportPortal } from "@/lib/supportPortal/client";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = (await req.json()) as { request?: { active?: boolean } };

  try {
    const payload = await callSupportPortal<{ services?: Array<{ name?: string; region?: string; status?: string; updatedAt?: string }> }>({
      endpoint: "/api/service-status",
      method: "GET",
      query: { active: body.request?.active ?? true }
    });

    const services = (payload.services ?? []).map((service) => ({
      serviceName: service.name ?? "Unknown Service",
      region: service.region,
      status: (service.status ?? "OPERATIONAL") as "OPERATIONAL" | "PARTIAL_OUTAGE" | "MAJOR_OUTAGE",
      updatedAt: service.updatedAt
    }));

    return NextResponse.json({ status: "success", result: { services } });
  } catch (error) {
    return NextResponse.json({ status: "failure", error: error instanceof Error ? error.message : "Service status API failed" }, { status: 502 });
  }
}
