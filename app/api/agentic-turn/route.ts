import { runAgenticTurn } from "@/orchestration/runAgenticTurn";
import { SessionState } from "@/types/session";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    utterance?: string;
    inputSource?: "text" | "microphone";
    previousSession?: SessionState;
    runtimeToolConfig?: Record<string, unknown>;
    voiceModeEnabled?: boolean;
    ttsVoiceStyle?: string;
  };

  const output = await runAgenticTurn({
    utterance: body.utterance ?? "",
    inputSource: body.inputSource ?? "text",
    previousSession: body.previousSession,
    runtimeToolConfig: body.runtimeToolConfig,
    voiceModeEnabled: Boolean(body.voiceModeEnabled),
    ttsVoiceStyle: body.ttsVoiceStyle
  });

  return Response.json(output);
}
