import { TtsDiagnostics, TtsSettingsView } from "@/types/session";

let activeAudio: HTMLAudioElement | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;

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
    try {
      await activeAudio.play();
      const firstAudioMs = Date.now() - playbackStart;
      return { ok: true, firstAudioMs, completedMs: firstAudioMs };
    } catch {
      return { ok: false, reason: "Autoplay blocked by browser; use Play button." };
    }
  }

  if (!("speechSynthesis" in window)) {
    return { ok: false, reason: "Browser SpeechSynthesis unavailable." };
  }

  activeUtterance = new SpeechSynthesisUtterance(tts.responseText);
  activeUtterance.rate = tts.settings.speed;
  const voices = window.speechSynthesis.getVoices();
  activeUtterance.voice = voices.find((voice) => voice.name.toLowerCase().includes("en")) ?? null;
  window.speechSynthesis.speak(activeUtterance);
  const firstAudioMs = Date.now() - playbackStart;
  return { ok: true, firstAudioMs, completedMs: firstAudioMs };
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
