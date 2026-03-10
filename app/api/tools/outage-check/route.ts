import { callSupportPortal } from "@/lib/supportPortal/client";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = (await req.json()) as { request?: { postcode?: string } };
  const postcode = body.request?.postcode?.trim();
  if (!postcode) {
    return NextResponse.json({ status: "failure", error: "postcode is required" }, { status: 400 });
  }

  try {
    const payload = await callSupportPortal<{ outage_detected: boolean; estimated_recovery?: string; incident_id?: string }>({
      endpoint: "/v1/outages/check",
      payload: { postcode }
    });

    return NextResponse.json({ status: "success", result: payload });
  } catch (error) {
    return NextResponse.json({ status: "failure", error: error instanceof Error ? error.message : "Outage API failed" }, { status: 502 });
  }
}
