import { getTranscript } from "@/lib/stt/providers";
import { SttInputMode } from "@/types/session";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    utterance?: string;
    inputMode?: SttInputMode;
    language?: string;
    streamingSimulated?: boolean;
    microphoneCapture?: {
      transcript?: string;
      confidence?: number;
      status?: "recognized" | "fallback";
      reason?: string;
      failureType?: "permission_denied" | "recording_failure" | "empty_transcript" | "low_confidence";
      timestamps?: Array<{ startMs: number; endMs: number; text: string }>;
    };
  };

  const result = await getTranscript({
    utterance: typeof body.utterance === "string" ? body.utterance : "",
    inputMode: body.inputMode === "microphone" ? "microphone" : "text",
    language: typeof body.language === "string" ? body.language : "en-US",
    microphoneCapture: body.microphoneCapture,
    streamingSimulated: Boolean(body.streamingSimulated)
  });

  return Response.json(result);
}
