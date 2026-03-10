import { SessionState, SttDiagnostics } from "@/types/session";

interface BrowserMicCaptureResult {
  transcript: string;
  confidence: number;
  status: "recognized" | "fallback";
  reason?: string;
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
};

declare global {
  interface Window {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  }
}

export async function getSpeechToText(state: SessionState): Promise<SttDiagnostics> {
  try {
    const response = await fetch("/api/stt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        utterance: state.utterance,
        inputMode: state.sttInputMode ?? "text",
        microphoneCapture: state.sttCapture
      })
    });

    if (!response.ok) {
      return {
        provider: "browser_text",
        model: "client-fallback-v1",
        inputMode: state.sttInputMode ?? "text",
        transcript: state.utterance,
        confidence: state.utterance ? 0.5 : 0.2,
        status: "fallback",
        rawInput: state.utterance,
        reason: `STT API unavailable (${response.status}).`,
        fallbackBehavior: "Fallback to local text transcript on API failure."
      };
    }

    return (await response.json()) as SttDiagnostics;
  } catch {
    return {
      provider: "browser_text",
      model: "client-fallback-v1",
      inputMode: state.sttInputMode ?? "text",
      transcript: state.utterance,
      confidence: state.utterance ? 0.5 : 0.2,
      status: "fallback",
      rawInput: state.utterance,
      reason: "STT request failed in browser; transcript preserved from input text.",
      fallbackBehavior: "Fallback to local text transcript on request exception."
    };
  }
}

export function captureFromMicrophone(): Promise<BrowserMicCaptureResult> {
  if (typeof window === "undefined") {
    return Promise.resolve({ transcript: "", confidence: 0, status: "fallback", reason: "Microphone capture unavailable on server." });
  }

  const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Recognition) {
    return Promise.resolve({ transcript: "", confidence: 0, status: "fallback", reason: "Browser SpeechRecognition API unavailable." });
  }

  return new Promise((resolve) => {
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    const timeout = window.setTimeout(() => {
      recognition.stop();
      resolve({ transcript: "", confidence: 0, status: "fallback", reason: "Microphone timeout without final transcript." });
    }, 8000);

    recognition.onresult = (event) => {
      window.clearTimeout(timeout);
      const first = event.results?.[0]?.[0];
      resolve({
        transcript: first?.transcript?.trim() ?? "",
        confidence: typeof first?.confidence === "number" ? first.confidence : 0.8,
        status: first?.transcript ? "recognized" : "fallback"
      });
    };

    recognition.onerror = (event) => {
      window.clearTimeout(timeout);
      resolve({ transcript: "", confidence: 0, status: "fallback", reason: `Microphone error: ${event.error ?? "unknown"}.` });
    };

    recognition.start();
  });
}
