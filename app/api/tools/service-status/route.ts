import { callSupportPortal } from "@/lib/supportPortal/client";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const payload = await callSupportPortal<{ status: "ok" | "degraded" | "down"; region?: string }>({
      endpoint: "/v1/status",
      payload: {}
    });

    return NextResponse.json({ status: "success", result: payload });
  } catch (error) {
    return NextResponse.json({ status: "failure", error: error instanceof Error ? error.message : "Status API failed" }, { status: 502 });
  }
}
