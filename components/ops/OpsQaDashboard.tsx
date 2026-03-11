"use client";

import { FormEvent, useMemo, useState } from "react";
import { useVoiceTester } from "@/state/useVoiceTester";
import { DemoPresetKey, useDashboardRuntimeConfig } from "@/state/useDashboardRuntimeConfig";
import { TOOL_NAMES } from "@/tools/runtimeToolConfig";
import { ToolName } from "@/tools/toolTypes";

const presets: Array<{ key: DemoPresetKey; label: string }> = [
  { key: "stable_mock_demo", label: "Stable mock demo" },
  { key: "live_outage_api_demo", label: "Live outage API demo" },
  { key: "mixed_mode_demo", label: "Mixed mode demo" },
  { key: "fast_latency_demo", label: "Fast latency demo" },
  { key: "clarification_handoff_demo", label: "Clarification / handoff demo" }
];

export function OpsQaDashboard() {
  const [text, setText] = useState("");
  const [layoutMode, setLayoutMode] = useState<"demo" | "tester" | "ops">("demo");
  const { config, setConfig, loadPreset, resetAll } = useDashboardRuntimeConfig();
  const tester = useVoiceTester();
  const latest = tester.latestTurn;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    const value = text;
    setText("");
    await tester.runTurn(value, "text");
  };

  const summary = useMemo(
    () => [
      `Tool mode: ${(config.toolConfig.globalMode ?? "default").toUpperCase()}`,
      `Understanding: ${config.understandingMode}`,
      `TTS: ${config.ttsProviderMode}`,
      `Voice mode: ${config.voiceModeEnabled ? "On" : "Off"}`,
      `Silence timeout: ${config.silenceTimeoutMs}ms`
    ],
    [config]
  );

  const timeline = useMemo(() => {
    const events: Array<{ when: string; label: string }> = [];
    tester.conversation.turns.forEach((turn) => {
      events.push({ when: turn.createdAt, label: `Turn start (${turn.inputSource})` });
      events.push({ when: turn.createdAt, label: `STT finalized: ${turn.transcriptText}` });
      events.push({ when: turn.createdAt, label: `Understanding complete: ${turn.metadata.intent ?? "unknown"}` });
      events.push({ when: turn.createdAt, label: `Routing selected: ${turn.metadata.workflowSelected ?? "none"}` });
      if (turn.metadata.toolCalled) events.push({ when: turn.createdAt, label: `Tool started: ${turn.metadata.toolCalled}` });
      if (turn.metadata.toolCalled) events.push({ when: turn.createdAt, label: `Tool completed: ${turn.metadata.toolExecutionMode ?? "-"}` });
      events.push({ when: turn.createdAt, label: `Response generated (${turn.metadata.responseStrategy ?? "-"})` });
      if (turn.session.tts) events.push({ when: turn.createdAt, label: "TTS playback started" });
      if (turn.metadata.handoffTriggered) events.push({ when: turn.createdAt, label: `Handoff triggered: ${turn.metadata.handoffReason ?? "policy"}` });
    });
    return events.reverse().slice(0, 30);
  }, [tester.conversation.turns]);

  return (
    <main className="space-y-3">
      <header className="rounded-xl border bg-white p-4">
        <h1 className="text-xl font-semibold">Ops / QA Dashboard</h1>
        <p className="text-xs text-slate-500">Unified runtime controls, live tester, and observability for demos.</p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {summary.map((item) => (
            <span key={item} className="rounded-full bg-slate-100 px-2 py-1">{item}</span>
          ))}
        </div>
      </header>

      <div className="flex gap-2 text-xs">
        <button className="rounded border px-2 py-1" onClick={() => setLayoutMode("demo")}>Demo Mode</button>
        <button className="rounded border px-2 py-1" onClick={() => setLayoutMode("tester")}>Tester Focus</button>
        <button className="rounded border px-2 py-1" onClick={() => setLayoutMode("ops")}>Ops Focus</button>
      </div>

      <section className={`grid gap-3 ${layoutMode === "demo" ? "xl:grid-cols-[320px_1fr_420px]" : layoutMode === "tester" ? "xl:grid-cols-[280px_1.5fr_320px]" : "xl:grid-cols-[280px_1fr_1.5fr]"}`}>
        <aside className="space-y-3 rounded-xl border bg-white p-3 xl:sticky xl:top-4 xl:h-fit">
          <h2 className="font-semibold">Configuration panel</h2>
          <label className="block text-xs">Global tool mode
            <select className="mt-1 w-full rounded border p-1" value={config.toolConfig.globalMode ?? "default"} onChange={(e) => tester.setGlobalToolMode(e.target.value === "default" ? undefined : (e.target.value as "mock" | "api"))}>
              <option value="default">Default</option><option value="mock">Mock</option><option value="api">API</option>
            </select>
          </label>
          <div className="space-y-1">
            <p className="text-xs font-medium">Per-tool override</p>
            {TOOL_NAMES.map((tool) => (
              <label className="flex items-center justify-between text-xs" key={tool}>{tool}
                <select className="rounded border p-1" value={tester.perToolOverrides.find((t) => t.toolName === tool)?.mode ?? "default"} onChange={(e) => tester.setToolOverrideMode(tool as ToolName, e.target.value as "default" | "mock" | "api")}>
                  <option value="default">default</option><option value="mock">mock</option><option value="api">api</option>
                </select>
              </label>
            ))}
          </div>
          <div className="rounded bg-slate-50 p-2 text-xs">
            <p>Provider mode: {config.understandingMode}</p>
            <p>Model: {config.understandingModel}</p>
            <p>Mock fallback: {String(config.mockFallbackEnabled)}</p>
            <p>TTS/provider: {config.ttsProviderMode}</p>
          </div>
          <label className="flex items-center justify-between text-xs">Voice mode
            <input type="checkbox" checked={config.voiceModeEnabled} onChange={(e) => tester.setVoiceModeEnabled(e.target.checked)} />
          </label>
          <label className="flex items-center justify-between text-xs">Filler phrase
            <input type="checkbox" checked={config.fillerEnabled} onChange={(e) => setConfig((prev) => ({ ...prev, fillerEnabled: e.target.checked }))} />
          </label>
          <label className="flex items-center justify-between text-xs">Streaming transcript
            <input type="checkbox" checked={config.streamingTranscript} onChange={(e) => setConfig((prev) => ({ ...prev, streamingTranscript: e.target.checked }))} />
          </label>
          <label className="block text-xs">Silence timeout: {config.silenceTimeoutMs}ms
            <input type="range" min={300} max={2000} step={50} value={config.silenceTimeoutMs} onChange={(e) => setConfig((prev) => ({ ...prev, silenceTimeoutMs: Number(e.target.value) }))} className="w-full" />
          </label>
          <label className="block text-xs">Debug verbosity
            <select className="mt-1 w-full rounded border p-1" value={config.debugVerbosity} onChange={(e) => setConfig((prev) => ({ ...prev, debugVerbosity: e.target.value as "basic" | "detailed" }))}>
              <option value="basic">basic</option><option value="detailed">detailed</option>
            </select>
          </label>
          <div className="space-y-1">
            {presets.map((preset) => <button key={preset.key} onClick={() => loadPreset(preset.key)} className="w-full rounded border px-2 py-1 text-left text-xs">Load: {preset.label}</button>)}
          </div>
          <div className="flex flex-wrap gap-1 text-xs">
            <button className="rounded border px-2 py-1" onClick={tester.resetConversation}>Reset conversation</button>
            <button className="rounded border px-2 py-1" onClick={tester.resetToolSettings}>Reset tool settings</button>
            <button className="rounded border px-2 py-1" onClick={resetAll}>Reset runtime config</button>
          </div>
        </aside>

        <section className="flex min-h-[70vh] flex-col rounded-xl border bg-slate-50">
          <header className="border-b bg-white p-3"><h2 className="font-semibold">Tester panel</h2></header>
          <div className="flex-1 space-y-2 overflow-auto p-3 text-sm">
            {tester.conversation.messages.length === 0 && <p className="rounded border border-dashed bg-white p-4 text-slate-500">Run a test utterance using voice or text.</p>}
            {tester.conversation.messages.map((msg) => <div key={msg.id} className={`rounded-xl p-2 ${msg.role === "user" ? "ml-12 bg-blue-600 text-white" : "mr-12 border bg-white"}`}>{msg.text}</div>)}
          </div>
          <form onSubmit={submit} className="space-y-2 border-t bg-white p-3">
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded border px-2 py-1 text-xs" onClick={tester.startListening} disabled={tester.isProcessing || tester.sttState.isListening || !config.voiceModeEnabled}>Start voice</button>
              <button type="button" className="rounded border px-2 py-1 text-xs" onClick={tester.stopListening} disabled={!tester.sttState.isListening}>Stop voice</button>
              <button type="button" className="rounded border px-2 py-1 text-xs" onClick={tester.replayLastAudio}>Replay latest audio</button>
              <button type="button" className="rounded border px-2 py-1 text-xs" onClick={tester.stopAudio}>Stop audio</button>
            </div>
            <p className="text-xs text-slate-500">Live transcript: {tester.sttState.finalTranscript || tester.sttState.interimTranscript || "-"}</p>
            <div className="flex gap-2">
              <input value={text} onChange={(e) => setText(e.target.value)} className="flex-1 rounded border px-3 py-2" placeholder="Type user message..." />
              <button className="rounded bg-blue-600 px-4 py-2 text-white" type="submit" disabled={tester.isProcessing}>Send</button>
            </div>
          </form>
        </section>

        <aside className="space-y-3 rounded-xl border bg-white p-3 text-xs">
          <h2 className="font-semibold">Monitoring / observability</h2>
          <div className="rounded border p-2">
            <p className="font-medium">Current turn/session state</p>
            <p>Status: {tester.conversation.status}</p>
            <p>Intent: {latest?.metadata.intent ?? "-"}</p>
            <p>turnAct: {latest?.metadata.turnAct ?? "-"}</p>
            <p>responseStrategy: {latest?.metadata.responseStrategy ?? "-"}</p>
            <p>workflow: {latest?.metadata.workflowSelected ?? "-"}</p>
            <p>pendingQuestion: {latest?.metadata.pendingQuestion?.prompt ?? "-"}</p>
            <p>pendingWorkflow: {latest?.metadata.pendingWorkflow ?? "-"}</p>
            <p>missing slots: {(latest?.metadata.missingSlots ?? []).join(", ") || "-"}</p>
            <p>collected slots: {JSON.stringify(latest?.metadata.collectedSlots ?? {})}</p>
          </div>
          <div className="rounded border p-2">
            <div className="flex items-center justify-between"><p className="font-medium">Tool monitor</p><button className="rounded border px-1" onClick={() => navigator.clipboard.writeText(JSON.stringify(latest?.metadata.rawToolResponse ?? {}, null, 2))}>Copy latest tool response JSON</button></div>
            <p>Selected tool: {latest?.metadata.toolCalled ?? "-"}</p>
            <p>Mode used: {latest?.metadata.toolExecutionMode ?? "-"}</p>
            <p>Endpoint: {latest?.metadata.toolEndpoint ?? "-"}</p>
            {config.debugVerbosity === "detailed" && <>
              <pre className="mt-1 max-h-24 overflow-auto rounded bg-slate-50 p-1">{JSON.stringify(latest?.metadata.toolRequestPayload ?? {}, null, 2)}</pre>
              <pre className="mt-1 max-h-24 overflow-auto rounded bg-slate-50 p-1">{JSON.stringify(latest?.metadata.rawToolResponse ?? {}, null, 2)}</pre>
              <pre className="mt-1 max-h-24 overflow-auto rounded bg-slate-50 p-1">{JSON.stringify(latest?.metadata.normalizedToolResult ?? {}, null, 2)}</pre>
            </>}
            <p>Execution status: {latest?.session.toolExecution?.executionStatus ?? "-"}</p>
            <p>Latency: {latest?.metadata.latency?.toolExecutionMs ?? "-"}ms</p>
            <p>Fallback used: {String(latest?.metadata.fallbackActivated ?? false)}</p>
          </div>
          <div className="rounded border p-2">
            <p className="font-medium">Voice / latency monitor</p>
            <p>STT mode/provider: {tester.sttState.providerMode}</p>
            <p>Interim transcript: {tester.sttState.interimTranscript || "-"}</p>
            <p>Final transcript: {tester.sttState.finalTranscript || "-"}</p>
            <p>TTFA: {latest?.metadata.latency?.ttfaMs ?? "-"}ms</p>
            <p>Voice phase: {latest?.metadata.voicePhase ?? "-"}</p>
            <p>TTS provider/mode: {latest?.metadata.ttsProviderMode ?? "-"}</p>
          </div>
          <div className="rounded border p-2">
            <div className="mb-1 flex items-center justify-between"><p className="font-medium">Event timeline</p><button onClick={tester.resetConversation} className="rounded border px-1">Clear logs</button></div>
            <div className="max-h-52 space-y-1 overflow-auto">
              {timeline.map((event, index) => <p key={`${event.when}-${index}`}>• {new Date(event.when).toLocaleTimeString()} — {event.label}</p>)}
              {timeline.length === 0 && <p className="text-slate-500">No events yet.</p>}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
