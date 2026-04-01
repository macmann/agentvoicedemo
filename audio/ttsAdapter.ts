import { TtsDiagnostics, TtsSettingsView } from "@/types/session";

let activeAudio: HTMLAudioElement | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;

export function isSynthesizedAudioPlaying(): boolean {
  if (typeof window === "undefined") return false;

  if (activeAudio && !activeAudio.paused && !activeAudio.ended) {
    return true;
  }

  if ("speechSynthesis" in window) {
    return window.speechSynthesis.speaking;
  }

  return false;
}

async function resolvePreferredVoice(): Promise<SpeechSynthesisVoice | null> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;

  const voicesNow = window.speechSynthesis.getVoices();
  if (voicesNow.length > 0) {
    return voicesNow.find((voice) => voice.lang.toLowerCase().startsWith("en") || voice.name.toLowerCase().includes("en")) ?? voicesNow[0] ?? null;
  }

  return new Promise((resolve) => {
    const onVoicesChanged = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
      const loadedVoices = window.speechSynthesis.getVoices();
      resolve(loadedVoices.find((voice) => voice.lang.toLowerCase().startsWith("en") || voice.name.toLowerCase().includes("en")) ?? loadedVoices[0] ?? null);
    };

    window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged, { once: true });
    setTimeout(() => {
      window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
      const fallbackVoices = window.speechSynthesis.getVoices();
      resolve(fallbackVoices[0] ?? null);
    }, 400);
  });
}

export async function synthesizeSpeechWithMock(text: string, settings: TtsSettingsView): Promise<TtsDiagnostics> {
  return {
    provider: "mock_browser",
    model: "browser-speech-synthesis",
    status: "ready",
    firstAudioLatencyMs: 40,
    settings,
    responseText: text,
    reason: "Local browser speech synthesis mode."
  };
}

export async function synthesizeSpeechWithOpenAI(text: string, settings: TtsSettingsView): Promise<TtsDiagnostics> {
  const response = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, settings })
  });

  if (!response.ok) {
    return {
      provider: "mock_browser",
      model: "browser-speech-synthesis",
      status: "fallback",
      firstAudioLatencyMs: 0,
      settings,
      responseText: text,
      reason: `TTS API unavailable (${response.status}); local browser mode.`
    };
  }

  return (await response.json()) as TtsDiagnostics;
}

export async function getSpeechSynthesis(text: string, settings: TtsSettingsView): Promise<TtsDiagnostics> {
  try {
    const live = await synthesizeSpeechWithOpenAI(text, settings);
    if (live.provider === "openai") return live;
    const mock = await synthesizeSpeechWithMock(text, settings);
    return { ...mock, status: "fallback", reason: live.reason ?? mock.reason };
  } catch {
    return synthesizeSpeechWithMock(text, settings);
  }
}

export async function playSynthesizedAudio(tts: TtsDiagnostics): Promise<{ ok: boolean; reason?: string; firstAudioMs?: number; completedMs?: number }> {
  stopSynthesizedAudio();

  if (typeof window === "undefined") return { ok: false, reason: "Audio playback not available on server." };

  const playbackStart = Date.now();

  if (tts.audioUrl) {
    activeAudio = new Audio(tts.audioUrl);
    activeAudio.volume = 1;
    return await new Promise((resolve) => {
      if (!activeAudio) {
        resolve({ ok: false, reason: "Audio playback unavailable." });
        return;
      }

      let firstAudioMs: number | undefined;
      const audio = activeAudio;

      const cleanup = () => {
        audio.removeEventListener("playing", onPlaying);
        audio.removeEventListener("ended", onEnded);
        audio.removeEventListener("error", onError);
      };

      const onPlaying = () => {
        firstAudioMs = Date.now() - playbackStart;
      };
      const onEnded = () => {
        cleanup();
        const completedMs = Date.now() - playbackStart;
        resolve({ ok: true, firstAudioMs: firstAudioMs ?? completedMs, completedMs });
      };
      const onError = () => {
        cleanup();
        resolve({ ok: false, reason: "Audio playback failed in browser." });
      };

      audio.addEventListener("playing", onPlaying, { once: true });
      audio.addEventListener("ended", onEnded, { once: true });
      audio.addEventListener("error", onError, { once: true });

      audio.play().catch(() => {
        cleanup();
        resolve({ ok: false, reason: "Autoplay blocked by browser; use Play button." });
      });
    });
  }

  if (!("speechSynthesis" in window)) {
    return { ok: false, reason: "Browser SpeechSynthesis unavailable." };
  }

  activeUtterance = new SpeechSynthesisUtterance(tts.responseText);
  activeUtterance.rate = tts.settings.speed;
  activeUtterance.volume = 1;
  activeUtterance.pitch = 1;
  activeUtterance.voice = await resolvePreferredVoice();

  return await new Promise((resolve) => {
    if (!activeUtterance) {
      resolve({ ok: false, reason: "Speech utterance unavailable." });
      return;
    }

    let firstAudioMs: number | undefined;
    const onStart = () => {
      firstAudioMs = Date.now() - playbackStart;
    };
    const onEnd = () => {
      const completedMs = Date.now() - playbackStart;
      resolve({ ok: true, firstAudioMs: firstAudioMs ?? completedMs, completedMs });
    };
    const onError = () => {
      resolve({ ok: false, reason: "Speech synthesis failed in browser." });
    };

    activeUtterance.onstart = onStart;
    activeUtterance.onend = onEnd;
    activeUtterance.onerror = onError;

    window.speechSynthesis.speak(activeUtterance);
  });
}

export function stopSynthesizedAudio() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = null;
  }

  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  activeUtterance = null;
}
