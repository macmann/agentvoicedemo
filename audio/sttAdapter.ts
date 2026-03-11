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
  onresult: ((event: { results?: ArrayLike<{ isFinal?: boolean; [index: number]: { transcript?: string; confidence?: number } }> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

interface LiveCaptureCallbacks {
  onInterimTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  onSpeechState?: (payload: { isSpeechDetected: boolean; silenceMs: number; recordingStartedAt: number; lastSpeechAt?: number }) => void;
  onAutoSubmit?: () => void;
}

interface StartMicOptions extends LiveCaptureCallbacks {
  language?: string;
  silenceThresholdMs?: number;
  speechEnergyThreshold?: number;
}

declare global {
  interface Window {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  }
}

let activeRecognition: InstanceType<RecognitionCtor> | null = null;
let activeStartTime = 0;
let activeFinalize: ((result: BrowserMicCaptureResult) => void) | null = null;
let activeMediaStream: MediaStream | null = null;
let activeAudioContext: AudioContext | null = null;
let activeVadRaf: number | null = null;

function cleanupVad() {
  if (activeVadRaf !== null) {
    cancelAnimationFrame(activeVadRaf);
    activeVadRaf = null;
  }
  if (activeAudioContext) {
    void activeAudioContext.close();
    activeAudioContext = null;
  }
  if (activeMediaStream) {
    activeMediaStream.getTracks().forEach((track) => track.stop());
    activeMediaStream = null;
  }
}

function finalizeCapture(result: BrowserMicCaptureResult) {
  if (!activeFinalize) return;
  cleanupVad();
  const done = activeFinalize;
  activeFinalize = null;
  activeRecognition = null;
  done(result);
}

function monitorSpeechEnergy(options: {
  stream: MediaStream;
  recordingStartedAt: number;
  silenceThresholdMs: number;
  speechEnergyThreshold: number;
  onSpeechState?: LiveCaptureCallbacks["onSpeechState"];
  onSilenceTimeout: () => void;
}) {
  const { stream, recordingStartedAt, silenceThresholdMs, speechEnergyThreshold, onSpeechState, onSilenceTimeout } = options;
  const audioContext = new AudioContext();
  activeAudioContext = audioContext;
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.7;
  source.connect(analyser);

  const dataArray = new Uint8Array(analyser.fftSize);
  let lastSpeechAt = recordingStartedAt;
  let isSpeechDetected = false;

  const tick = () => {
    analyser.getByteTimeDomainData(dataArray);
    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i += 1) {
      const normalized = (dataArray[i] - 128) / 128;
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / dataArray.length);
    const now = Date.now();

    if (rms >= speechEnergyThreshold) {
      lastSpeechAt = now;
      isSpeechDetected = true;
      onSpeechState?.({ isSpeechDetected: true, silenceMs: 0, recordingStartedAt, lastSpeechAt });
    } else {
      const silenceMs = now - lastSpeechAt;
      onSpeechState?.({ isSpeechDetected, silenceMs, recordingStartedAt, lastSpeechAt: isSpeechDetected ? lastSpeechAt : undefined });
      if (isSpeechDetected && silenceMs >= silenceThresholdMs) {
        onSilenceTimeout();
        return;
      }
    }

    activeVadRaf = requestAnimationFrame(tick);
  };

  tick();
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

export function startMicrophoneCapture(options: StartMicOptions = {}) {
  const { language = "en-US", silenceThresholdMs = 1000, speechEnergyThreshold = 0.025, onInterimTranscript, onFinalTranscript, onSpeechState, onAutoSubmit } = options;

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
    let finalizedTranscript = "";
    let bestConfidence = 0;

    recognition.onresult = (event) => {
      const eventResults = event.results;
      if (!eventResults) return;

      let interim = "";
      for (let i = 0; i < eventResults.length; i += 1) {
        const segment = eventResults[i]?.[0];
        const text = segment?.transcript?.trim();
        if (!text) continue;
        if (eventResults[i].isFinal) {
          finalizedTranscript = `${finalizedTranscript} ${text}`.trim();
          bestConfidence = Math.max(bestConfidence, typeof segment.confidence === "number" ? segment.confidence : 0.8);
          onFinalTranscript?.(finalizedTranscript);
        } else {
          interim = `${interim} ${text}`.trim();
        }
      }

      onInterimTranscript?.(interim);
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
      const transcript = finalizedTranscript.trim();
      if (transcript) {
        finalizeCapture({
          transcript,
          confidence: bestConfidence || 0.8,
          status: "recognized",
          timestamps: [{ startMs: 0, endMs: Date.now() - activeStartTime, text: transcript }]
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

  void navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      activeMediaStream = stream;
      monitorSpeechEnergy({
        stream,
        recordingStartedAt: activeStartTime,
        silenceThresholdMs,
        speechEnergyThreshold,
        onSpeechState,
        onSilenceTimeout: () => {
          onAutoSubmit?.();
          stopMicrophoneCapture();
        }
      });
    })
    .catch(() => {
      onSpeechState?.({ isSpeechDetected: false, silenceMs: 0, recordingStartedAt: activeStartTime });
    });

  return { ok: true as const, result };
}

export function stopMicrophoneCapture() {
  cleanupVad();
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
