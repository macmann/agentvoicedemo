import { SttInputMode, SttResultContract } from "@/types/session";

interface SttAdapterRequest {
  utterance: string;
  inputMode: SttInputMode;
  language?: string;
  microphoneCapture?: {
    transcript?: string;
    confidence?: number;
    reason?: string;
    failureType?: "permission_denied" | "recording_failure" | "empty_transcript" | "low_confidence";
    timestamps?: Array<{ startMs: number; endMs: number; text: string }>;
  };
  streamingSimulated?: boolean;
}

const STT_CONFIDENCE_THRESHOLD = 0.72;

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, value));
}

export async function transcribeWithProvider(_request: SttAdapterRequest): Promise<SttResultContract | null> {
  return null;
}

export async function transcribeWithMock(request: SttAdapterRequest): Promise<SttResultContract> {
  const typed = request.utterance.trim();
  const language = request.language ?? "en-US";

  if (request.inputMode === "text") {
    const confidence = typed ? 0.99 : 0.12;
    const fallbackOccurred = !typed;
    return {
      transcript: typed,
      confidence,
      provider: "mock_text_passthrough",
      mode: typed ? "text" : "mock",
      language,
      streaming: Boolean(request.streamingSimulated),
      status: fallbackOccurred ? "fallback" : "recognized",
      fallbackOccurred,
      failureType: fallbackOccurred ? "empty_transcript" : undefined,
      fallbackBehavior: fallbackOccurred
        ? "Empty text falls back to safe clarify path and increments STT failure counters."
        : "Text input is used as a reliable demo-safe transcript source."
    };
  }

  const micTranscript = request.microphoneCapture?.transcript?.trim() ?? "";
  const micConfidence = clampConfidence(request.microphoneCapture?.confidence ?? 0.45);

  if (request.microphoneCapture?.failureType === "permission_denied") {
    return {
      transcript: typed,
      confidence: typed ? 0.5 : 0.1,
      provider: "mock_microphone_fallback",
      mode: "mock",
      language,
      streaming: Boolean(request.streamingSimulated),
      status: "fallback",
      fallbackOccurred: true,
      failureType: "permission_denied",
      reason: request.microphoneCapture.reason ?? "Microphone permission denied by browser.",
      fallbackBehavior: "Permission denial falls back to text transcript input."
    };
  }

  if (!micTranscript) {
    return {
      transcript: typed,
      confidence: typed ? 0.44 : 0.1,
      provider: "mock_microphone_fallback",
      mode: "mock",
      language,
      streaming: Boolean(request.streamingSimulated),
      status: "fallback",
      fallbackOccurred: true,
      failureType: request.microphoneCapture?.failureType ?? "recording_failure",
      reason: request.microphoneCapture?.reason ?? "No microphone transcript captured.",
      fallbackBehavior: "Recording failures fall back to text mode to keep demo deterministic and reliable."
    };
  }

  const lowConfidence = micConfidence < STT_CONFIDENCE_THRESHOLD;
  return {
    transcript: micTranscript,
    confidence: micConfidence,
    provider: "mock_browser_speech_recognition",
    mode: "microphone",
    language,
    streaming: Boolean(request.streamingSimulated),
    status: lowConfidence ? "fallback" : "recognized",
    timestamps: request.microphoneCapture?.timestamps,
    fallbackOccurred: lowConfidence,
    failureType: lowConfidence ? "low_confidence" : undefined,
    reason: lowConfidence ? `Transcript confidence below threshold (${STT_CONFIDENCE_THRESHOLD}).` : undefined,
    fallbackBehavior: "Low-confidence microphone transcripts are preserved for inspectability and routed safely."
  };
}

export async function getTranscript(request: SttAdapterRequest): Promise<SttResultContract> {
  const provider = await transcribeWithProvider(request);
  if (provider) return provider;
  return transcribeWithMock(request);
}

export { STT_CONFIDENCE_THRESHOLD };
