"use client";

import { FormEvent, ReactNode, useMemo, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { TOOL_NAMES } from "@/tools/runtimeToolConfig";
import { ToolName } from "@/tools/toolTypes";
import { useVoiceTester } from "@/state/useVoiceTester";
import { TesterLatencyMetrics, TesterMessage } from "@/types/tester";
import { IntentUnderstandingMode, OrchestrationApproach, PostToolResponseMode } from "@/state/useDashboardRuntimeConfig";

function StatusPill({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", active ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500")}>
      {label}
    </span>
  );
}

function SectionCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {description && <p className="text-xs text-slate-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function formatMs(value?: number) {
  return typeof value === "number" ? `${Math.round(value)} ms` : "-";
}

function MessageBubble({ message, preToolUsed }: { message: TesterMessage; preToolUsed?: boolean }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm",
          isUser && "bg-blue-600 text-white",
          !isUser && !isSystem && "border border-slate-200 bg-white text-slate-900",
          isSystem && "border border-amber-200 bg-amber-50 text-amber-900"
        )}
      >
        <p>{message.text}</p>
        {!isUser && preToolUsed && <p className="mt-2 inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">Used pre-tool LLM</p>}
      </div>
    </div>
  );
}

function LatencyPanel({ latency, providerMode }: { latency?: TesterLatencyMetrics; providerMode?: string }) {
  const rows = [
    ["Pre-tool understanding", formatMs(latency?.preToolUnderstandingMs)],
    ["Routing/policy", formatMs(latency?.routingPolicyMs)],
    ["Tool execution", formatMs(latency?.toolExecutionMs)],
    ["Response generation", formatMs(latency?.responseGenerationMs)],
    ["TTS first audio", formatMs(latency?.ttsFirstAudioMs)],
    ["Total turn", formatMs(latency?.totalTurnMs)]
  ] as const;

  return (
    <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-3 text-xs">
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-slate-600">Time to first audio (TTFA)</p>
          <p className="text-lg font-semibold text-blue-800">{formatMs(latency?.ttfaMs)}</p>
        </div>
        <div className="text-right">
          <p className="text-slate-500">Total turn</p>
          <p className="font-semibold text-slate-800">{formatMs(latency?.totalTurnMs)}</p>
        </div>
      </div>
      <p className="mt-1 text-slate-500">Provider mode: {providerMode ?? "-"}</p>
      <div className="mt-2 grid grid-cols-1 gap-1 text-slate-700 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2 rounded bg-white/90 px-2 py-1">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function intentModeLabel(mode: IntentUnderstandingMode | undefined) {
  return mode === "llm_assisted" ? "LLM-assisted" : "Deterministic";
}

function responseModeLabel(mode: PostToolResponseMode | undefined) {
  return mode === "llm_generated" ? "LLM-generated" : "Deterministic";
}

function renderPreToolReason(latestTurn: ReturnType<typeof useVoiceTester>["latestTurn"]) {
  if (!latestTurn) return "No turn yet.";
  const mode = latestTurn.metadata.intentUnderstandingMode ?? "deterministic";
  if (mode === "deterministic") return "Pre-tool LLM disabled by runtime mode";
  return latestTurn.metadata.preToolUsageReason ?? "Pre-tool LLM status unavailable.";
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
    sttState,
    runTurn,
    startListening,
    stopListening,
    replayLastAudio,
    stopAudio,
    resetConversation,
    runtimeConfig,
    dashboardConfig,
    setDashboardConfig,
    setGlobalToolMode,
    setToolOverrideMode,
    resetToolSettings,
    perToolOverrides,
    resolveToolMode,
    toolHistory
  } = useVoiceTester();

  const status = conversation.status;
  const empty = conversation.messages.length === 0;
  const liveTranscript = sttState.finalTranscript || sttState.interimTranscript;
  const globalMode = runtimeConfig.globalMode ?? "default";

  const statusText = useMemo(() => {
    if (status === "listening") return sttState.isSpeechDetected ? "Listening" : "Listening (waiting for speech)";
    if (status === "thinking") return "Processing";
    if (status === "tool") return "Checking tool";
    if (status === "speaking") return latestTurn?.metadata.fillerUsed ? "Speaking filler / final" : "Speaking";
    if (status === "error") return "Error";
    return "Ready";
  }, [status, sttState.isSpeechDetected, latestTurn?.metadata.fillerUsed]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = text;
    setText("");
    await runTurn(value, "text");
  };

  const summaryRows = [
    ["Approach", dashboardConfig.orchestrationApproach],
    ["Input mode", latestTurn?.metadata.intentUnderstandingMode ?? "-"],
    ["Support intent", latestTurn?.metadata.supportIntent ?? "none"],
    ["Routing", latestTurn?.metadata.routingDecision ?? "-"],
    ["Tool selected", latestTurn?.metadata.toolCalled ?? "none"],
    ["Tool mode", latestTurn?.metadata.toolCalled ? resolveToolMode(latestTurn.metadata.toolCalled as ToolName) : "-"],
    ["Clarification", latestTurn?.metadata.clarificationReason ?? "none"],
    ["Pre-tool decision", renderPreToolReason(latestTurn)]
  ] as const;

  return (
    <main className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_390px]">
      <section className="flex h-[78vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50 px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Voice Console</h1>
              <p className="text-xs text-slate-600">Test voice turns, tune runtime behavior, and inspect pipeline diagnostics in one place.</p>
            </div>
            <StatusPill label={statusText} active={status !== "idle"} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">Approach: {dashboardConfig.orchestrationApproach === "agentic" ? "Agentic" : "Hybrid"}</span>
            <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-medium text-violet-800">Intent: {intentModeLabel(dashboardConfig.intentUnderstandingMode)}</span>
            <span className="rounded-full bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-800">Response: {responseModeLabel(dashboardConfig.postToolResponseMode)}</span>
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">KB: {dashboardConfig.troubleshootingKbMode}</span>
            <span className={cn("rounded-full px-2 py-1 text-xs font-medium", globalMode === "default" ? "bg-slate-200 text-slate-700" : "bg-cyan-100 text-cyan-800")}>Tools: {globalMode === "default" ? "Code defaults" : globalMode.toUpperCase()}</span>
          </div>
        </header>

        <div className="border-b border-slate-200 px-4 py-3">
          <LatencyPanel latency={latestTurn?.metadata.latency} providerMode={latestTurn?.metadata.providerMode} />
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-4 py-4">
          {empty && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">Try: “Is there an outage?”, “Is FTTH in Berlin down?”, “Any upcoming announcements?”, or “I want to speak to a human.”</div>}
          {conversation.messages.map((message) => {
            const turn = message.turnId ? conversation.turns.find((item) => item.id === message.turnId) : undefined;
            return <MessageBubble key={message.id} message={message} preToolUsed={turn?.metadata.preToolUnderstandingUsed} />;
          })}
        </div>

        <form onSubmit={submit} className="space-y-3 border-t border-slate-200 bg-white p-4">
          {sttState.isListening && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
              <div className="flex items-center justify-between">
                <strong className="inline-flex items-center gap-2">🎙 Listening {sttState.isSpeechDetected ? "• speech detected" : "• waiting for speech"}</strong>
                <span>silence: {Math.round(sttState.silenceMs)} ms</span>
              </div>
              <p className="mt-1 text-blue-800">{liveTranscript ? `"${liveTranscript}"` : "Hearing you... Start talking naturally."}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <button type="button" disabled={isProcessing || status === "listening"} onClick={startListening} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">🎙 Talk</button>
            <button type="button" disabled={status !== "listening"} onClick={() => { void stopListening(); }} className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-600 disabled:opacity-40">Stop</button>
            <button type="button" onClick={() => setVoiceModeEnabled((v) => !v)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs">Voice: {voiceModeEnabled ? "On" : "Off"}</button>
            <button type="button" onClick={replayLastAudio} className="rounded-lg border border-slate-300 px-3 py-2 text-xs" disabled={!latestTurn}>Replay</button>
            <button type="button" onClick={stopAudio} className="rounded-lg border border-slate-300 px-3 py-2 text-xs">Mute</button>
            <button type="button" onClick={resetConversation} className="rounded-lg border border-rose-200 px-3 py-2 text-xs text-rose-700">Reset</button>
          </div>

          <div className="flex gap-2">
            <input value={text} onChange={(event) => setText(event.target.value)} disabled={isProcessing} placeholder="Type a customer message..." className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-400" />
            <button type="submit" disabled={isProcessing || !text.trim()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Send</button>
          </div>
          <p className="text-xs text-slate-500">Playback: {playbackStatus}</p>
        </form>
      </section>

      <aside className="space-y-3">
        <SectionCard title="Configuration" description="All runtime toggles are grouped here for quick tuning.">
          <div className="space-y-3 text-xs">
            <label className="block">
              <span className="mb-1 block font-medium text-slate-700">Approach</span>
              <select
                className="w-full rounded-lg border border-emerald-300 bg-white p-2"
                value={dashboardConfig.orchestrationApproach}
                onChange={(e) => {
                  const nextApproach = e.target.value as OrchestrationApproach;
                  setDashboardConfig((prev) => ({
                    ...prev,
                    orchestrationApproach: nextApproach,
                    postToolResponseMode: nextApproach === "agentic" ? "llm_generated" : prev.postToolResponseMode
                  }));
                }}
              >
                <option value="hybrid">Hybrid</option>
                <option value="agentic">Agentic (OpenAI Agent SDK)</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-medium text-slate-700">Intent understanding</span>
              <select disabled={dashboardConfig.orchestrationApproach === "agentic"} className="w-full rounded-lg border border-violet-300 bg-white p-2 disabled:opacity-50" value={dashboardConfig.intentUnderstandingMode} onChange={(e) => setDashboardConfig((prev) => ({ ...prev, intentUnderstandingMode: e.target.value as IntentUnderstandingMode }))}>
                <option value="deterministic">Deterministic</option>
                <option value="llm_assisted">LLM-assisted</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-medium text-slate-700">Post-tool response</span>
              <select
                disabled={dashboardConfig.orchestrationApproach === "agentic"}
                className="w-full rounded-lg border border-indigo-300 bg-white p-2 disabled:opacity-50"
                value={dashboardConfig.postToolResponseMode}
                onChange={(e) => setDashboardConfig((prev) => ({ ...prev, postToolResponseMode: e.target.value as PostToolResponseMode }))}
              >
                <option value="deterministic">Deterministic</option>
                <option value="llm_generated">LLM-generated</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-medium text-slate-700">Troubleshooting KB</span>
              <select className="w-full rounded-lg border border-amber-300 bg-white p-2" value={dashboardConfig.troubleshootingKbMode} onChange={(e) => setDashboardConfig((prev) => ({ ...prev, troubleshootingKbMode: e.target.value as "off" | "on" }))}>
                <option value="on">On</option>
                <option value="off">Off</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-medium text-slate-700">Voice style</span>
              <select className="w-full rounded-lg border border-emerald-300 bg-white p-2" value={dashboardConfig.ttsVoiceStyle} onChange={(e) => setDashboardConfig((prev) => ({ ...prev, ttsVoiceStyle: e.target.value }))}>
                <option value="calm-neutral">Calm neutral</option>
                <option value="warm-friendly">Warm friendly</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-medium text-slate-700">Global tool mode</span>
              <select className="w-full rounded-lg border border-slate-300 bg-white p-2" value={globalMode} onChange={(e) => setGlobalToolMode(e.target.value === "default" ? undefined : (e.target.value as "mock" | "api"))}>
                <option value="default">Code defaults</option>
                <option value="mock">Mock</option>
                <option value="api">Live API</option>
              </select>
            </label>
            <details className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <summary className="cursor-pointer font-medium text-slate-700">Per-tool overrides</summary>
              <div className="mt-2 space-y-2">
                {TOOL_NAMES.map((toolName) => (
                  <label key={toolName} className="flex items-center justify-between gap-2">
                    <span className="truncate">{toolName}</span>
                    <select value={perToolOverrides.find((item) => item.toolName === toolName)?.mode ?? "default"} onChange={(e) => setToolOverrideMode(toolName as ToolName, e.target.value as "mock" | "api" | "default")} className="rounded border border-slate-300 bg-white p-1">
                      <option value="default">Default</option>
                      <option value="mock">Mock</option>
                      <option value="api">API</option>
                    </select>
                  </label>
                ))}
              </div>
            </details>
            <button type="button" onClick={resetToolSettings} className="w-full rounded-lg border border-rose-200 px-2 py-2 text-rose-700">Reset tool settings</button>
          </div>
        </SectionCard>

        <SectionCard title="Turn summary" description="Key routing information from the latest turn.">
          <div className="space-y-2 text-xs">
            {summaryRows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 rounded-lg bg-slate-50 px-2 py-1.5">
                <span className="text-slate-500">{label}</span>
                <span className="max-w-[60%] truncate text-right font-medium text-slate-800">{value}</span>
              </div>
            ))}
            <div>
              <p className="mb-1 text-slate-500">Entities</p>
              <pre className="overflow-x-auto rounded-lg bg-slate-900 p-2 text-[11px] text-slate-100">{JSON.stringify(latestTurn?.metadata.entities ?? {}, null, 2)}</pre>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Debug panel" description="Deep diagnostics and full metadata payload.">
          <button className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium" onClick={() => setIsDebugOpen((v) => !v)}>
            {isDebugOpen ? "Hide" : "Show"} debug details
          </button>
          {isDebugOpen && (
            <div className="space-y-3 text-xs">
              <div>
                <p className="mb-1 font-medium text-slate-700">Latest turn metadata</p>
                <pre className="max-h-60 overflow-auto rounded-lg bg-slate-900 p-2 text-[11px] text-slate-100">{JSON.stringify(latestTurn?.metadata ?? {}, null, 2)}</pre>
              </div>
              <div>
                <p className="mb-1 font-medium text-slate-700">Recent tool calls</p>
                <div className="max-h-40 space-y-2 overflow-auto">
                  {toolHistory.map((entry) => (
                    <div key={entry.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <div className="font-medium">#{entry.turnNumber} · {new Date(entry.timestamp).toLocaleTimeString()}</div>
                      <div>{entry.toolName} • {entry.mode} • {entry.status} • {formatMs(entry.latencyMs)}</div>
                      <div className="text-slate-500">{entry.summary}</div>
                    </div>
                  ))}
                  {toolHistory.length === 0 && <div className="text-slate-500">No tool calls yet.</div>}
                </div>
              </div>
            </div>
          )}
        </SectionCard>
      </aside>
    </main>
  );
}
