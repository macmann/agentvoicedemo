import { synthesizeWithOpenAI } from "@/lib/tts/providers";
import { TtsSettingsView } from "@/types/session";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { text?: string; settings?: TtsSettingsView };
  if (!body.text || !body.settings) {
    return NextResponse.json({ error: "Missing text/settings" }, { status: 400 });
  }

  const result = await synthesizeWithOpenAI(body.text, body.settings);
  return NextResponse.json(result);
}
