import { TtsDiagnostics, TtsSettingsView } from "@/types/session";

const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";

export async function synthesizeWithOpenAI(text: string, settings: TtsSettingsView): Promise<TtsDiagnostics> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim().length < 20) {
    return {
      provider: "mock_browser",
      model: "browser-speech-synthesis",
      status: "fallback",
      firstAudioLatencyMs: 0,
      settings,
      responseText: text,
      reason: "OPENAI_API_KEY missing/invalid; browser mock TTS mode."
    };
  }

  const endpoint = `${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/audio/speech`;
  const started = Date.now();

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: OPENAI_TTS_MODEL,
        voice: settings.voiceStyle.includes("warm") ? "alloy" : "verse",
        speed: settings.speed,
        input: text,
        format: "mp3"
      })
    });

    if (!response.ok) {
      return {
        provider: "mock_browser",
        model: "browser-speech-synthesis",
        status: "fallback",
        firstAudioLatencyMs: Date.now() - started,
        settings,
        responseText: text,
        reason: `OpenAI TTS error ${response.status}; browser mock TTS mode.`
      };
    }

    const buffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(buffer).toString("base64");

    return {
      provider: "openai",
      model: OPENAI_TTS_MODEL,
      status: "ready",
      firstAudioLatencyMs: Date.now() - started,
      settings,
      responseText: text,
      audioUrl: `data:audio/mp3;base64,${audioBase64}`
    };
  } catch {
    return {
      provider: "mock_browser",
      model: "browser-speech-synthesis",
      status: "fallback",
      firstAudioLatencyMs: Date.now() - started,
      settings,
      responseText: text,
      reason: "OpenAI TTS request failed; browser mock TTS mode."
    };
  }
}
