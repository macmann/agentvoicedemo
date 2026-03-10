import { getSttResult } from "@/lib/stt/providers";
import { SttInputMode } from "@/types/session";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    utterance?: string;
    inputMode?: SttInputMode;
    microphoneCapture?: {
      transcript?: string;
      confidence?: number;
      status?: "recognized" | "fallback";
      reason?: string;
    };
  };

  const result = await getSttResult({
    utterance: typeof body.utterance === "string" ? body.utterance : "",
    inputMode: body.inputMode === "microphone" ? "microphone" : "text",
    microphoneCapture: body.microphoneCapture
  });

  return Response.json(result);
}
