import { callSupportPortal } from "@/lib/supportPortal/client";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = (await req.json()) as { request?: { active?: boolean; from?: string; to?: string } };

  try {
    const payload = await callSupportPortal<{ notifications?: Array<{ title?: string; body?: string; serviceName?: string; region?: string; active?: boolean; createdAt?: string; estimatedRecoveryText?: string }> }>({
      endpoint: "/api/notifications",
      method: "GET",
      query: {
        active: body.request?.active ?? true,
        from: body.request?.from,
        to: body.request?.to
      }
    });

    return NextResponse.json({ status: "success", result: { notifications: payload.notifications ?? [] } });
  } catch (error) {
    return NextResponse.json({ status: "failure", error: error instanceof Error ? error.message : "Notifications API failed" }, { status: 502 });
  }
}
