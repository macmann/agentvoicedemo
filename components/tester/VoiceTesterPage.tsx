"use client";

import { FormEvent, useMemo, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { useVoiceTester } from "@/state/useVoiceTester";
import { TesterMessage } from "@/types/tester";

function StatusPill({ label, active }: { label: string; active: boolean }) {
  return <span className={cn("rounded-full px-2 py-1 text-xs", active ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500")}>{label}</span>;
}

function MessageBubble({ message }: { message: TesterMessage }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm",
          isUser && "bg-blue-600 text-white",
          !isUser && !isSystem && "bg-white text-slate-900 border border-slate-200",
          isSystem && "bg-amber-50 text-amber-900 border border-amber-200"
        )}
      >
        <p>{message.text}</p>
      </div>
    </div>
  );
}

export function VoiceTesterPage() {
  const [text, setText] = useState("");
  const {
    conversation,
    latestTurn,
    voiceModeEnabled,
    setVoiceModeEnabled,
    isProcessing,
    isDebugOpen,
    setIsDebugOpen,
    playbackStatus,
    runTurn,
    startListening,
    stopListening,
    replayLastAudio,
    stopAudio,
    resetConversation
  } = useVoiceTester();

  const status = conversation.status;
  const empty = conversation.messages.length === 0;

  const statusText = useMemo(() => {
    if (status === "listening") return "Listening for your voice...";
    if (status === "thinking") return "Understanding and routing your request...";
    if (status === "tool") return "Calling mocked backend tools...";
    if (status === "speaking") return "Assistant is responding...";
    if (status === "error") return "A fallback path was used.";
    return "Ready";
  }, [status]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = text;
    setText("");
    await runTurn(value, "text");
  };

  return (
    <main className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <section className="flex min-h-[70vh] flex-col rounded-2xl border border-slate-200 bg-slate-50">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold">Voice Testing UI</h1>
            <p className="text-xs text-slate-500">Product-style support assistant sandbox using deterministic mocked pipeline.</p>
          </div>
          <StatusPill label={statusText} active={status !== "idle"} />
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {empty && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
              Try: “My internet is down.”, “Can you check if there’s an outage in my area?”, or “I want to speak to a human.”
            </div>
          )}
          {conversation.messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3 border-t border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isProcessing || status === "listening"}
              onClick={startListening}
              className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              🎙 Start listening
            </button>
            <button
              type="button"
              disabled={status !== "listening"}
              onClick={stopListening}
              className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              Stop
            </button>
            <button type="button" onClick={() => setVoiceModeEnabled((v) => !v)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs">
              Voice mode: {voiceModeEnabled ? "On" : "Off"}
            </button>
            <button type="button" onClick={replayLastAudio} className="rounded-lg border border-slate-300 px-3 py-2 text-xs" disabled={!latestTurn}>
              Replay audio
            </button>
            <button type="button" onClick={stopAudio} className="rounded-lg border border-slate-300 px-3 py-2 text-xs">
              Stop audio
            </button>
            <button type="button" onClick={resetConversation} className="rounded-lg border border-rose-200 px-3 py-2 text-xs text-rose-700">
              Reset conversation
            </button>
          </div>

          <div className="flex gap-2">
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              disabled={isProcessing}
              placeholder="Type a customer message..."
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
            <button type="submit" disabled={isProcessing || !text.trim()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              Send
            </button>
          </div>
          <p className="text-xs text-slate-500">Playback: {playbackStatus}</p>
        </form>
      </section>

      <aside className="rounded-2xl border border-slate-200 bg-white">
        <button className="flex w-full items-center justify-between border-b border-slate-200 px-4 py-3 text-sm font-medium" onClick={() => setIsDebugOpen((v) => !v)}>
          Debug panel
          <span>{isDebugOpen ? "Hide" : "Show"}</span>
        </button>
        {isDebugOpen && (
          <div className="space-y-3 p-4 text-xs text-slate-700">
            <div><strong>Intent:</strong> {latestTurn?.metadata.intent ?? "-"}</div>
            <div><strong>Entities:</strong> {JSON.stringify(latestTurn?.metadata.entities ?? {}, null, 2)}</div>
            <div><strong>Workflow:</strong> {latestTurn?.metadata.workflowSelected ?? "-"}</div>
            <div><strong>Tool called:</strong> {latestTurn?.metadata.toolCalled ?? "-"}</div>
            <div><strong>Tool output:</strong> <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2">{JSON.stringify(latestTurn?.metadata.toolOutput ?? {}, null, 2)}</pre></div>
            <div><strong>Routing:</strong> {latestTurn?.metadata.routingDecision ?? "-"}</div>
            <div><strong>Handoff:</strong> {latestTurn?.metadata.handoffTriggered ? "Triggered" : "No"}</div>
            <div><strong>Handoff reason:</strong> {latestTurn?.metadata.handoffReason ?? "-"}</div>
            <div><strong>Handoff summary:</strong> {latestTurn?.metadata.handoffSummary ?? "-"}</div>
            <div><strong>Provider mode:</strong> {latestTurn?.metadata.providerMode ?? "mock"}</div>
            <div><strong>Latency:</strong> {JSON.stringify(latestTurn?.metadata.latency ?? {}, null, 2)}</div>
          </div>
        )}
      </aside>
    </main>
  );
}
