import { SttDiagnostics, SttInputMode } from "@/types/session";

interface SttRequest {
  utterance: string;
  inputMode: SttInputMode;
  microphoneCapture?: {
    transcript?: string;
    confidence?: number;
    status?: "recognized" | "fallback";
    reason?: string;
  };
}

function clampConfidence(value: number) {
  return Math.min(1, Math.max(0, value));
}

export async function getSttResult(request: SttRequest): Promise<SttDiagnostics> {
  const utterance = request.utterance.trim();

  if (request.inputMode === "text") {
    return {
      provider: "browser_text",
      model: "text-input-passthrough-v1",
      inputMode: "text",
      transcript: utterance,
      confidence: utterance ? 0.99 : 0.2,
      status: utterance ? "recognized" : "fallback",
      rawInput: request.utterance,
      reason: utterance ? undefined : "No typed text provided.",
      fallbackBehavior: "If text is empty, preserve session state and request clarification."
    };
  }

  const micTranscript = request.microphoneCapture?.transcript?.trim() ?? "";
  if (micTranscript) {
    return {
      provider: "browser_speech_recognition",
      model: "web-speech-api",
      inputMode: "microphone",
      transcript: micTranscript,
      confidence: clampConfidence(request.microphoneCapture?.confidence ?? 0.82),
      status: request.microphoneCapture?.status ?? "recognized",
      rawInput: micTranscript,
      reason: request.microphoneCapture?.reason,
      fallbackBehavior: "If mic capture is low confidence, keep transcript and route through deterministic clarification."
    };
  }

  return {
    provider: "browser_text",
    model: "microphone-fallback-to-text-v1",
    inputMode: "microphone",
    transcript: utterance,
    confidence: utterance ? 0.52 : 0.2,
    status: "fallback",
    rawInput: request.utterance,
    reason: "Microphone capture unavailable; reused text input.",
    fallbackBehavior: "Fallback to text mode while preserving inspectable reason in STT diagnostics."
  };
}
