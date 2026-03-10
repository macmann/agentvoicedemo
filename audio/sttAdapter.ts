import { SessionState, SttDiagnostics } from "@/types/session";

interface BrowserMicCaptureResult {
  transcript: string;
  confidence: number;
  status: "recognized" | "fallback";
  reason?: string;
  failureType?: "permission_denied" | "recording_failure" | "empty_transcript" | "low_confidence";
  timestamps?: Array<{ startMs: number; endMs: number; text: string }>;
}

type RecognitionCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results?: ArrayLike<ArrayLike<{ transcript?: string; confidence?: number }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

declare global {
  interface Window {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  }
}

let activeRecognition: InstanceType<RecognitionCtor> | null = null;
let activeStartTime = 0;
let activeFinalize: ((result: BrowserMicCaptureResult) => void) | null = null;

function finalizeCapture(result: BrowserMicCaptureResult) {
  if (!activeFinalize) return;
  const done = activeFinalize;
  activeFinalize = null;
  activeRecognition = null;
  done(result);
}

export async function requestMicrophonePermission() {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { granted: false, reason: "Microphone permission API unavailable in this environment." };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return { granted: true };
  } catch {
    return { granted: false, reason: "Microphone permission denied by browser/user settings." };
  }
}

export function startMicrophoneCapture(language = "en-US") {
  if (typeof window === "undefined") {
    return {
      ok: false as const,
      result: Promise.resolve({ transcript: "", confidence: 0, status: "fallback" as const, failureType: "recording_failure" as const, reason: "Microphone not available on server." })
    };
  }

  const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Recognition) {
    return {
      ok: false as const,
      result: Promise.resolve({ transcript: "", confidence: 0, status: "fallback" as const, failureType: "recording_failure" as const, reason: "SpeechRecognition API unavailable." })
    };
  }

  const recognition = new Recognition();
  recognition.lang = language;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  activeRecognition = recognition;
  activeStartTime = Date.now();

  const result = new Promise<BrowserMicCaptureResult>((resolve) => {
    activeFinalize = resolve;
    let finalTranscript = "";
    let bestConfidence = 0;

    recognition.onresult = (event) => {
      const first = event.results?.[event.results.length - 1]?.[0];
      if (!first?.transcript) return;
      finalTranscript = first.transcript.trim();
      bestConfidence = Math.max(bestConfidence, typeof first.confidence === "number" ? first.confidence : 0.8);
    };

    recognition.onerror = (event) => {
      finalizeCapture({
        transcript: "",
        confidence: 0,
        status: "fallback",
        failureType: "recording_failure",
        reason: `Microphone recording error: ${event.error ?? "unknown"}.`
      });
    };

    recognition.onend = () => {
      if (finalTranscript) {
        finalizeCapture({
          transcript: finalTranscript,
          confidence: bestConfidence || 0.8,
          status: "recognized",
          timestamps: [{ startMs: 0, endMs: Date.now() - activeStartTime, text: finalTranscript }]
        });
        return;
      }

      finalizeCapture({
        transcript: "",
        confidence: 0,
        status: "fallback",
        failureType: "empty_transcript",
        reason: "Recording ended without a usable transcript."
      });
    };

    recognition.start();
  });

  return { ok: true as const, result };
}

export function stopMicrophoneCapture() {
  activeRecognition?.stop();
}

export async function transcribeWithProvider(state: SessionState): Promise<SttDiagnostics | null> {
  const response = await fetch("/api/stt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      utterance: state.utterance,
      inputMode: state.sttInputMode ?? "text",
      language: "en-US",
      microphoneCapture: state.sttCapture,
      streamingSimulated: Boolean(state.sttStreamingSimulated)
    })
  });

  if (!response.ok) return null;
  const result = (await response.json()) as Omit<SttDiagnostics, "model" | "inputMode" | "rawInput">;
  return {
    ...result,
    model: "stt-adapter-v1",
    inputMode: state.sttInputMode ?? "text",
    rawInput: state.utterance
  };
}

export async function transcribeWithMock(state: SessionState): Promise<SttDiagnostics> {
  const transcript = state.utterance.trim();
  return {
    transcript,
    confidence: transcript ? 0.5 : 0.1,
    provider: "client_mock_fallback",
    mode: "mock",
    language: "en-US",
    streaming: Boolean(state.sttStreamingSimulated),
    status: transcript ? "recognized" : "fallback",
    fallbackOccurred: true,
    failureType: transcript ? "low_confidence" : "empty_transcript",
    fallbackBehavior: "STT adapter fallback preserves typed text for deterministic downstream routing.",
    reason: "Provider unavailable; using client fallback transcript.",
    model: "stt-adapter-v1",
    inputMode: state.sttInputMode ?? "text",
    rawInput: state.utterance
  };
}

export async function getTranscript(state: SessionState): Promise<SttDiagnostics> {
  try {
    const provider = await transcribeWithProvider(state);
    if (provider) return provider;
    return transcribeWithMock(state);
  } catch {
    return transcribeWithMock(state);
  }
}
