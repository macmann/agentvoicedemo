import { runAgenticTurn } from "@/orchestration/runAgenticTurn";
import { InlineTroubleshootingKbFile } from "@/orchestration/troubleshootingKb";
import { SessionState } from "@/types/session";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    utterance?: string;
    inputSource?: "text" | "microphone";
    previousSession?: SessionState;
    runtimeToolConfig?: Record<string, unknown>;
    voiceModeEnabled?: boolean;
    ttsVoiceStyle?: string;
    troubleshootingKbMode?: "off" | "on";
    troubleshootingKbSource?: string;
    uploadedTroubleshootingKbs?: InlineTroubleshootingKbFile[];
  };

  const output = await runAgenticTurn({
    utterance: body.utterance ?? "",
    inputSource: body.inputSource ?? "text",
    previousSession: body.previousSession,
    runtimeToolConfig: body.runtimeToolConfig,
    voiceModeEnabled: Boolean(body.voiceModeEnabled),
    ttsVoiceStyle: body.ttsVoiceStyle,
    troubleshootingKbMode: body.troubleshootingKbMode,
    troubleshootingKbSource: body.troubleshootingKbSource,
    uploadedTroubleshootingKbs: body.uploadedTroubleshootingKbs
  });

  return Response.json(output);
}
