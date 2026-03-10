"use client";

import { playSynthesizedAudio, stopSynthesizedAudio } from "@/audio/ttsAdapter";
import { SessionState } from "@/types/session";
import { formatMs } from "@/utils/format";
import { useState } from "react";

export function SessionSummary({ session }: { session: SessionState }) {
  const [audioStatus, setAudioStatus] = useState("idle");

  const replay = async () => {
    if (!session.tts) return;
    const result = await playSynthesizedAudio(session.tts);
    setAudioStatus(result.ok ? "playing" : `blocked: ${result.reason}`);
  };

  const stop = () => {
    stopSynthesizedAudio();
    setAudioStatus("stopped");
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold">Session Summary</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="col-span-2">
          <p className="text-slate-500">Original utterance</p>
          <p className="font-medium">{session.utterance || "—"}</p>
        </div>
        <div className="col-span-2">
          <p className="text-slate-500">Transcript</p>
          <p className="font-medium">{session.transcript ?? "—"}</p>
        </div>
        <div>
          <p className="text-slate-500">STT mode / provider</p>
          <p className="font-medium">{session.stt?.inputMode ?? session.sttInputMode ?? "—"} / {session.stt?.provider ?? "—"}</p>
        </div>
        <div>
          <p className="text-slate-500">STT status / confidence</p>
          <p className="font-medium">{session.stt?.status ?? "—"} / {session.stt ? session.stt.confidence.toFixed(2) : "—"}</p>
        </div>
        <div>
          <p className="text-slate-500">Intent</p>
          <p className="font-medium">{session.understanding?.intent ?? "—"}</p>
        </div>
        <div>
          <p className="text-slate-500">Understanding mode</p>
          <p className="font-medium">{session.understandingDiagnostics?.provider === "mock" ? "mock mode" : session.understandingDiagnostics?.provider ?? "—"}</p>
        </div>
        <div>
          <p className="text-slate-500">Sentiment / empathy</p>
          <p className="font-medium">{session.understanding?.sentiment ?? "—"}{session.understanding?.empathyNeeded ? " (empathy cue)" : ""}</p>
        </div>
        <div className="col-span-2">
          <p className="text-slate-500">Final generated response</p>
          <p className="font-medium">{session.responseText ?? "—"}</p>
        </div>
        <div>
          <p className="text-slate-500">TTS first audio latency</p>
          <p className="font-medium">{session.tts ? `${session.tts.firstAudioLatencyMs}ms` : "—"}</p>
        </div>
        <div>
          <p className="text-slate-500">Audio status indicator</p>
          <p className="font-medium">{session.tts?.status ?? "—"} · {audioStatus}</p>
        </div>
        <div>
          <p className="text-slate-500">Voice style / speed</p>
          <p className="font-medium">{session.tts ? `${session.tts.settings.voiceStyle} / ${session.tts.settings.speed}x` : "—"}</p>
        </div>
        <div>
          <p className="text-slate-500">Streaming enabled</p>
          <p className="font-medium">{session.tts ? `${session.tts.settings.streamingEnabled}` : "—"}</p>
        </div>
        <div className="col-span-2 flex gap-2">
          <button className="rounded bg-indigo-600 px-3 py-2 text-white disabled:bg-indigo-300" onClick={replay} disabled={!session.tts} type="button">Play / Replay</button>
          <button className="rounded border border-slate-300 px-3 py-2" onClick={stop} type="button">Stop</button>
        </div>
        <div className="col-span-2">
          <p className="text-slate-500">TTS fallback reason</p>
          <p className="font-medium">{session.tts?.reason ?? "—"}</p>
        </div>
        <div className="col-span-2">
          <p className="text-slate-500">Latency breakdown</p>
          <p className="font-medium">STT {formatMs(session.latency?.sttMs)} · Understanding {formatMs(session.latency?.understandingMs)} · Tool {formatMs(session.latency?.toolMs)} · Response {formatMs(session.latency?.responseMs)} · TTS {formatMs(session.latency?.ttsMs)} · Total {formatMs(session.latency?.totalMs)}</p>
        </div>
      </div>
    </section>
  );
}
