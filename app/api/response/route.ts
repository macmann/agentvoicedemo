import { getGeneratedResponse } from "@/lib/response/providers";
import { ResponseGenerationContext } from "@/types/session";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { context?: ResponseGenerationContext };
  if (!body.context) {
    return NextResponse.json({ error: "Missing context" }, { status: 400 });
  }

  const generated = await getGeneratedResponse(body.context);
  return NextResponse.json(generated);
}
