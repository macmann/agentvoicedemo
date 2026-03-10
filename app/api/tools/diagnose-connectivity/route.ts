import { callSupportPortal } from "@/lib/supportPortal/client";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = (await req.json()) as { request?: { account_id?: string; symptom?: string } };

  try {
    const payload = await callSupportPortal<{ diagnosis: "router_unstable" | "line_signal_issue" | "no_fault_detected"; recommendation: string }>({
      endpoint: "/v1/connectivity/diagnose",
      method: "POST",
      payload: {
        account_id: body.request?.account_id,
        symptom: body.request?.symptom
      }
    });

    return NextResponse.json({ status: "success", result: payload });
  } catch (error) {
    return NextResponse.json({ status: "failure", error: error instanceof Error ? error.message : "Connectivity API failed" }, { status: 502 });
  }
}
