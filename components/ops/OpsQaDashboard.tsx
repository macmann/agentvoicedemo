"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useVoiceTester } from "@/state/useVoiceTester";
import { DemoPresetKey, DashboardRuntimeConfig, useDashboardRuntimeConfig } from "@/state/useDashboardRuntimeConfig";
import { TOOL_NAMES } from "@/tools/runtimeToolConfig";
import { ToolName } from "@/tools/toolTypes";

const presets: Array<{ key: DemoPresetKey; label: string }> = [
  { key: "stable_mock_demo", label: "Stable mock demo" },
  { key: "live_outage_api_demo", label: "Live outage API demo" },
  { key: "mixed_mode_demo", label: "Mixed mode demo" },
  { key: "fast_latency_demo", label: "Fast latency demo" },
  { key: "clarification_handoff_demo", label: "Clarification / handoff demo" }
];

const badgeColor: Record<string, string> = {
  api: "bg-blue-100 text-blue-700 border-blue-200",
  mock: "bg-slate-200 text-slate-700 border-slate-300",
  live: "bg-blue-100 text-blue-700 border-blue-200",
  mixed: "bg-violet-100 text-violet-700 border-violet-200",
  success: "bg-emerald-100 text-emerald-700 border-emerald-200",
  fallback: "bg-amber-100 text-amber-800 border-amber-200",
  error: "bg-rose-100 text-rose-700 border-rose-200",
  default: "bg-slate-100 text-slate-700 border-slate-200"
};

function toneClass(value?: string) {
  if (!value) return badgeColor.default;
  return badgeColor[value] ?? badgeColor.default;
}

function PanelCard({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm ${className}`}>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function kv(label: string, value: React.ReactNode) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-start gap-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <div className="text-xs text-slate-700">{value}</div>
    </div>
  );
}

export function OpsQaDashboard() {
  const [text, setText] = useState("");
  const [layoutMode, setLayoutMode] = useState<"demo" | "tester" | "ops">("demo");
  const [notice, setNotice] = useState<string | null>(null);
  const [configPulse, setConfigPulse] = useState(false);
  const [testerPulse, setTesterPulse] = useState(false);
  const [monitorPulse, setMonitorPulse] = useState(false);
  const { config, setConfig, loadPreset, resetAll } = useDashboardRuntimeConfig();
  const tester = useVoiceTester();
  const latest = tester.latestTurn;
  const lastConfigRef = useRef<DashboardRuntimeConfig | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    const value = text;
    setText("");
    await tester.runTurn(value, "text");
  };

  const environment = useMemo(() => {
    const toolMode = config.toolConfig.globalMode;
    if (toolMode === "api" && config.understandingMode === "live") return "Live API";
    if (toolMode === "mock" && config.understandingMode === "mock") return "Mock";
    return "Mixed";
  }, [config.toolConfig.globalMode, config.understandingMode]);

  const statusSummary = useMemo(
    () => [
      { label: "Tool Mode", value: (config.toolConfig.globalMode ?? "default").toUpperCase(), tone: config.toolConfig.globalMode ?? "default" },
      { label: "Understanding", value: config.understandingMode, tone: config.understandingMode },
      { label: "Intent mode", value: config.intentUnderstandingMode === "llm_assisted" ? "LLM-assisted" : "Deterministic", tone: config.intentUnderstandingMode === "llm_assisted" ? "mixed" : "mock" },
      { label: "Response", value: config.postToolResponseMode === "llm_generated" ? "LLM-generated" : "Deterministic", tone: config.postToolResponseMode === "llm_generated" ? "mixed" : "mock" },
      { label: "Voice", value: config.voiceModeEnabled ? "On" : "Off", tone: config.voiceModeEnabled ? "success" : "default" },
      { label: "TTS", value: config.ttsProviderMode, tone: config.ttsProviderMode === "openai" ? "api" : "mock" },
      { label: "Silence Timeout", value: `${config.silenceTimeoutMs} ms`, tone: "default" }
    ],
    [config]
  );

  useEffect(() => {
    const prev = lastConfigRef.current;
    if (!prev) {
      lastConfigRef.current = config;
      return;
    }

    let message: string | null = null;
    if (prev.toolConfig.globalMode !== config.toolConfig.globalMode) message = `Tool mode switched to ${(config.toolConfig.globalMode ?? "default").toUpperCase()}`;
    else if (prev.understandingMode !== config.understandingMode) message = `Understanding switched to ${config.understandingMode}`;
    else if (prev.intentUnderstandingMode !== config.intentUnderstandingMode) message = `Intent mode switched to ${config.intentUnderstandingMode === "llm_assisted" ? "LLM-assisted" : "Deterministic"}`;
    else if (prev.postToolResponseMode !== config.postToolResponseMode) message = `Response mode switched to ${config.postToolResponseMode === "llm_generated" ? "LLM-generated" : "Deterministic"}`;
    else if (prev.ttsProviderMode !== config.ttsProviderMode) message = `TTS provider switched to ${config.ttsProviderMode}`;
    else if (prev.voiceModeEnabled !== config.voiceModeEnabled) message = `Voice mode turned ${config.voiceModeEnabled ? "on" : "off"}`;
    else if (prev.silenceTimeoutMs !== config.silenceTimeoutMs) message = `Silence timeout changed to ${config.silenceTimeoutMs} ms`;

    if (message) {
      setNotice(message);
      setConfigPulse(true);
      setTesterPulse(true);
      setMonitorPulse(true);
      const hide = window.setTimeout(() => setNotice(null), 2200);
      const clearPulses = window.setTimeout(() => {
        setConfigPulse(false);
        setTesterPulse(false);
        setMonitorPulse(false);
      }, 700);
      return () => {
        window.clearTimeout(hide);
        window.clearTimeout(clearPulses);
      };
    }

    lastConfigRef.current = config;
  }, [config]);

  useEffect(() => {
    lastConfigRef.current = config;
  }, [config]);

  const timeline = useMemo(() => {
    if (!latest) return [] as Array<{ label: string; latency?: number }>;
    const l = latest.metadata.latency ?? {};
    return [
      { label: "User Speech", latency: l.sttFinalizationMs ?? l.sttMs },
      { label: "STT Finalized", latency: l.sttFinalizationMs ?? l.sttMs },
      { label: "Understanding", latency: l.understandingMs },
      { label: "Pre-tool LLM", latency: l.preToolUnderstandingMs },
      { label: "Routing Decision", latency: l.routingPolicyMs },
      { label: "Tool Execution", latency: l.toolExecutionMs ?? l.toolMs },
      { label: "Response Generation", latency: l.responseGenerationMs ?? l.responseMs },
      { label: "TTS Playback", latency: l.ttsFirstAudioMs ?? l.ttsMs }
    ];
  }, [latest]);

  const latestTurnById = useMemo(() => {
    const map = new Map<string, typeof tester.conversation.turns[number]>();
    tester.conversation.turns.forEach((turn) => map.set(turn.id, turn));
    return map;
  }, [tester]);

  return (
    <main className="space-y-4 bg-gradient-to-b from-slate-50 to-slate-100 p-2 md:p-4">
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Operations Console</p>
            <h1 className="text-2xl font-bold text-slate-900">Voice AI Support System</h1>
            <p className="text-xs text-slate-500">Presentation-grade Ops / QA dashboard for runtime controls, testing, and observability.</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${environment === "Live API" ? toneClass("api") : environment === "Mock" ? toneClass("mock") : toneClass("mixed")}`}>
            Environment: {environment}
          </span>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">System Status</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {statusSummary.map((item) => (
              <span key={item.label} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass(item.tone)}`}>
                {item.label}: {item.value}
              </span>
            ))}
          </div>
        </div>
      </header>

      {notice && <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 shadow-sm">{notice}</div>}

      <div className="flex flex-wrap gap-2 text-xs">
        <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5" onClick={() => setLayoutMode("demo")}>Demo Mode</button>
        <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5" onClick={() => setLayoutMode("tester")}>Tester Focus</button>
        <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5" onClick={() => setLayoutMode("ops")}>Ops Focus</button>
      </div>

      <section className={`grid gap-4 ${layoutMode === "demo" ? "xl:grid-cols-[320px_1fr_400px]" : layoutMode === "tester" ? "xl:grid-cols-[280px_1.6fr_320px]" : "xl:grid-cols-[280px_1fr_1.5fr]"}`}>
        <aside className={`space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 xl:sticky xl:top-4 xl:h-fit ${configPulse ? "ring-2 ring-blue-300" : ""}`}>
          <h2 className="text-sm font-semibold text-slate-800">Configuration Panel</h2>

          <PanelCard title="Tool Configuration">
            <label className="block text-xs font-medium text-slate-700">Global tool mode
              <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2" value={config.toolConfig.globalMode ?? "default"} onChange={(e) => tester.setGlobalToolMode(e.target.value === "default" ? undefined : (e.target.value as "mock" | "api"))}>
                <option value="default">Default</option><option value="mock">Mock</option><option value="api">API</option>
              </select>
            </label>
            <div className="border-t border-slate-100 pt-2">
              <p className="mb-2 text-xs font-semibold text-slate-600">Per-tool override</p>
              <div className="space-y-1.5">
                {TOOL_NAMES.map((tool) => (
                  <label className="flex items-center justify-between text-xs text-slate-700" key={tool}>{tool}
                    <select className="rounded-md border border-slate-300 bg-white p-1" value={tester.perToolOverrides.find((t) => t.toolName === tool)?.mode ?? "default"} onChange={(e) => tester.setToolOverrideMode(tool as ToolName, e.target.value as "default" | "mock" | "api")}> 
                      <option value="default">default</option><option value="mock">mock</option><option value="api">api</option>
                    </select>
                  </label>
                ))}
              </div>
            </div>
            <button className="rounded-lg border border-slate-300 px-2 py-1 text-xs" onClick={tester.resetToolSettings}>Reset tools</button>
          </PanelCard>

          <PanelCard title="Voice Settings">
            <label className="flex items-center justify-between text-xs">Voice mode
              <input type="checkbox" checked={config.voiceModeEnabled} onChange={(e) => tester.setVoiceModeEnabled(e.target.checked)} />
            </label>
            <label className="flex items-center justify-between text-xs">Streaming transcript
              <input type="checkbox" checked={config.streamingTranscript} onChange={(e) => setConfig((prev) => ({ ...prev, streamingTranscript: e.target.checked }))} />
            </label>
            <label className="flex items-center justify-between text-xs">Filler phrase
              <input type="checkbox" checked={config.fillerEnabled} onChange={(e) => setConfig((prev) => ({ ...prev, fillerEnabled: e.target.checked }))} />
            </label>
            <label className="block text-xs">Silence timeout: <span className="font-semibold">{config.silenceTimeoutMs} ms</span>
              <input type="range" min={300} max={2000} step={50} value={config.silenceTimeoutMs} onChange={(e) => setConfig((prev) => ({ ...prev, silenceTimeoutMs: Number(e.target.value) }))} className="mt-2 w-full accent-blue-600" />
            </label>
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">Deterministic mode: lower latency, stricter interpretation. LLM-assisted mode: higher latency, better natural-language understanding before deterministic routing guardrails.</p>
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">Deterministic response: lower latency, more rigid wording. LLM-generated response: higher latency, more natural grounded wording after tool execution.</p>
          </PanelCard>

          <PanelCard title="Understanding">
            {kv("Provider mode", <span className={`rounded-full border px-2 py-0.5 text-[11px] ${toneClass(config.understandingMode)}`}>{config.understandingMode}</span>)}
            {kv("Model", config.understandingModel)}
            {kv("Intent mode", <span className={`rounded-full border px-2 py-0.5 text-[11px] ${config.intentUnderstandingMode === "llm_assisted" ? toneClass("mixed") : toneClass("mock")}`}>{config.intentUnderstandingMode === "llm_assisted" ? "LLM-assisted" : "Deterministic"}</span>)}
            {kv("Response mode", <span className={`rounded-full border px-2 py-0.5 text-[11px] ${config.postToolResponseMode === "llm_generated" ? toneClass("mixed") : toneClass("mock")}`}>{config.postToolResponseMode === "llm_generated" ? "LLM-generated" : "Deterministic"}</span>)}
            {kv("Mock fallback", <span className={`rounded-full border px-2 py-0.5 text-[11px] ${config.mockFallbackEnabled ? toneClass("fallback") : toneClass("default")}`}>{String(config.mockFallbackEnabled)}</span>)}
            <label className="block pt-1 text-xs">Intent understanding mode
              <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2" value={config.intentUnderstandingMode} onChange={(e) => setConfig((prev) => ({ ...prev, intentUnderstandingMode: e.target.value as "deterministic" | "llm_assisted" }))}>
                <option value="deterministic">deterministic (lower latency, stricter)</option><option value="llm_assisted">llm_assisted (higher latency, more natural)</option>
              </select>
            </label>
            <label className="block pt-1 text-xs">Post-tool response mode
              <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2" value={config.postToolResponseMode} onChange={(e) => setConfig((prev) => ({ ...prev, postToolResponseMode: e.target.value as "deterministic" | "llm_generated" }))}>
                <option value="deterministic">deterministic (lower latency, more rigid wording)</option><option value="llm_generated">llm_generated (higher latency, natural grounded wording)</option>
              </select>
            </label>
            <label className="block pt-1 text-xs">Debug verbosity
              <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2" value={config.debugVerbosity} onChange={(e) => setConfig((prev) => ({ ...prev, debugVerbosity: e.target.value as "basic" | "detailed" }))}>
                <option value="basic">basic</option><option value="detailed">detailed</option>
              </select>
            </label>
          </PanelCard>

          <PanelCard title="Demo Presets">
            <div className="space-y-1.5">
              {presets.map((preset) => <button key={preset.key} onClick={() => loadPreset(preset.key)} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-left text-xs">{preset.label}</button>)}
            </div>
            <div className="border-t border-slate-100 pt-2 text-xs">
              <button className="rounded-lg border border-slate-300 px-2 py-1" onClick={resetAll}>Reset runtime config</button>
            </div>
          </PanelCard>
        </aside>

        <section className={`flex min-h-[72vh] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm ${testerPulse ? "ring-2 ring-blue-300" : ""}`}>
          <header className="border-b border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Tester Panel</h2>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <button className="rounded-lg border border-slate-300 px-2 py-1" onClick={tester.resetConversation}>Reset Conversation</button>
                <button className="rounded-lg border border-slate-300 px-2 py-1" onClick={tester.resetConversation}>Clear Logs</button>
                <button className="rounded-lg border border-slate-300 px-2 py-1" onClick={tester.replayLastAudio}>Replay Last Audio</button>
                <button className="rounded-lg border border-slate-300 px-2 py-1" onClick={() => navigator.clipboard.writeText(JSON.stringify(latest?.metadata.normalizedToolResult ?? {}, null, 2))}>Copy Tool Result JSON</button>
              </div>
            </div>

            <div className="mt-2 grid gap-1 rounded-xl bg-slate-50 p-2 text-xs sm:grid-cols-2">
              <p>🎤 {tester.sttState.isListening ? "Listening" : "Idle"}</p>
              <p>⚙ {tester.isProcessing ? "Processing" : "Ready"}</p>
              <p>🔎 {tester.conversation.status === "tool" ? "Checking tools" : "Tool stage idle"}</p>
              <p>🔊 {tester.conversation.status === "speaking" ? "Speaking" : "Not speaking"}</p>
            </div>
          </header>

          <div className="flex-1 space-y-2 overflow-auto bg-slate-50/70 p-3 text-sm">
            {tester.conversation.messages.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-slate-500">Run a test utterance using voice or text.</p>}
            {tester.conversation.messages.map((msg) => {
              const turn = msg.turnId ? latestTurnById.get(msg.turnId) : undefined;
              const toolName = turn?.metadata.toolCalled;
              const toolMode = turn?.metadata.toolExecutionMode;
              const isUser = msg.role === "user";
              const isSystem = msg.role === "system";

              return (
                <div key={msg.id} className={`flex animate-fade-in-fast ${isUser ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
                    {toolName && (
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${toolMode === "api" ? toneClass("api") : toneClass("mock")}`}>
                        TOOL: {toolName} | {(toolMode ?? "mock").toUpperCase()}
                      </span>
                    )}
                    <div className={`rounded-2xl px-3 py-2 shadow-sm ${isUser ? "bg-blue-600 text-white" : isSystem ? "border border-slate-200 bg-amber-50 text-slate-800" : "border border-slate-200 bg-white text-slate-800"}`}>
                      {msg.text}
                    </div>
                    <span className="text-[10px] text-slate-400">{new Date(msg.createdAt).toLocaleTimeString()}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <form onSubmit={submit} className="space-y-2 border-t border-slate-200 bg-white p-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <button type="button" className="rounded-lg border border-slate-300 px-2 py-1" onClick={tester.startListening} disabled={tester.isProcessing || tester.sttState.isListening || !config.voiceModeEnabled}>Start voice</button>
              <button type="button" className="rounded-lg border border-slate-300 px-2 py-1" onClick={tester.stopListening} disabled={!tester.sttState.isListening}>Stop voice</button>
              <button type="button" className="rounded-lg border border-slate-300 px-2 py-1" onClick={tester.replayLastAudio}>Replay latest audio</button>
              <button type="button" className="rounded-lg border border-slate-300 px-2 py-1" onClick={tester.stopAudio}>Stop audio</button>
            </div>
            <p className="text-xs text-slate-500">Live transcript: {tester.sttState.finalTranscript || tester.sttState.interimTranscript || "-"}</p>
            <div className="flex gap-2">
              <input value={text} onChange={(e) => setText(e.target.value)} className="flex-1 rounded-xl border border-slate-300 px-3 py-2" placeholder="Type user message..." />
              <button className="rounded-xl bg-blue-600 px-4 py-2 text-white" type="submit" disabled={tester.isProcessing}>Send</button>
            </div>
          </form>
        </section>

        <aside className={`space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-xs ${monitorPulse ? "ring-2 ring-blue-300" : ""}`}>
          <h2 className="text-sm font-semibold text-slate-800">Monitoring / Observability</h2>
          <p className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] text-blue-800">
            This demo supports live service status and announcement queries. Other support actions are intentionally out of scope for this prototype.
          </p>

          <PanelCard title="Conversation State">
            {kv("Intent", latest?.metadata.intent ?? "-")}
            {kv("Support Intent", latest?.metadata.supportIntent ?? "none")}
            {kv("Active Support Intent", latest?.metadata.activeSupportIntent ?? "-")}
            {kv("Request Type", latest?.metadata.supportRequestType ?? "-")}
            {kv("Continuation", String(latest?.metadata.continuationDetected ?? false))}
            {kv("Support Intent Transition", latest?.metadata.supportIntentTransition ?? "-")}
            {kv("Corrected Slots", JSON.stringify(latest?.metadata.correctedSlots ?? {}))}
            {kv("Previous Tool Context", JSON.stringify(latest?.metadata.previousToolContext ?? {}))}
            {kv("Out of Scope", String(latest?.metadata.outOfScopeDemoRequest ?? false))}
            {kv("Turn Act", latest?.metadata.turnAct ?? "-")}
            {kv("Intent Mode", latest?.metadata.intentModeLabel ?? "-")}
            {kv("Strategy", latest?.metadata.responseStrategy ?? "-")}
            {kv("Routing", latest?.metadata.routingDecision ?? "-")}
            {kv("Workflow", latest?.metadata.workflowSelected ?? "-")}
            {kv("Required Slots", (latest?.metadata.requiredSlots ?? []).join(", ") || "-")}
            {kv("Pending Q", latest?.metadata.pendingQuestion?.prompt ?? "-")}
            {kv("Tool Clarification Needed", String(latest?.metadata.toolClarificationNeeded ?? false))}
            {kv("Tool Clarification Reason", latest?.metadata.clarificationReason ?? "-")}
            {kv("Expected Slot From Tool", latest?.metadata.expectedSlotFromTool ?? "-")}
            {kv("Candidate Categories", (latest?.metadata.candidateCategories ?? []).join(", ") || "-")}
            {kv("Pending Question Prompt", latest?.metadata.pendingQuestionPrompt ?? "-")}
            {kv("Last Unresolved Tool Context", JSON.stringify(latest?.metadata.lastUnresolvedToolContext ?? {}))}
            {kv("Missing Slots", (latest?.metadata.missingSlots ?? []).join(", ") || "-")}
            {kv("Tool Blocked (Missing Slot)", String(latest?.metadata.toolExecutionBlockedDueToMissingSlot ?? false))}
            {kv("Region Extracted", latest?.metadata.regionExtracted ?? "-")}
            {kv("Previous Status Result", latest?.metadata.previousStatusResult ?? "-")}
            {kv("Isolated Issue Detected", String(latest?.metadata.isolatedIssueDetected ?? false))}
            {kv("Escalation Recommended", String(latest?.metadata.escalationRecommended ?? false))}
            {kv("Handoff Triggered", String(latest?.metadata.handoffTriggered ?? false))}
            {kv("Handoff Reason", latest?.metadata.handoffReason ?? "-")}
            {kv("Preserved Support Context", JSON.stringify(latest?.metadata.preservedSupportContext ?? {}))}
          </PanelCard>

          <PanelCard title="Pre-tool Understanding">
            {kv("Intent mode", latest?.metadata.intentModeLabel ?? "-")}
            {kv("Pre-tool used", String(latest?.metadata.preToolUnderstandingUsed ?? false))}
            {kv("Pre-tool status", latest?.metadata.preToolUsageStatus ?? "-")}
            {kv("Pre-tool reason", latest?.metadata.preToolUsageReason ?? (latest?.metadata.intentUnderstandingMode === "deterministic" ? "Pre-tool LLM disabled by runtime mode" : "-"))}
            {kv("Provider", latest?.metadata.preToolProvider ?? "-")}
            {kv("Model", latest?.metadata.preToolModel ?? "-")}
            {kv("Provider Selection", latest?.metadata.preToolProviderSelectionReason ?? "-")}
            {kv("Inferred Support Intent", latest?.metadata.preToolInferredSupportIntent ?? "-")}
            {kv("Intent Confidence", String(latest?.metadata.preToolIntentConfidence ?? "-"))}
            {kv("Rescue Mapping Applied", String(latest?.metadata.preToolRescueMappingApplied ?? false))}
            {kv("Turn Act", latest?.metadata.preToolTurnAct ?? "-")}
            {kv("Clarification Needed", String(latest?.metadata.preToolClarificationNeeded ?? false))}
            {kv("Clarification Question", latest?.metadata.preToolClarificationQuestion ?? "-")}
            {kv("Entities", JSON.stringify(latest?.metadata.preToolEntities ?? {}))}
            {kv("Latency", `${latest?.metadata.preToolLatencyMs ?? latest?.metadata.latency?.preToolUnderstandingMs ?? "-"} ms`)}
            {kv("Usage status", latest?.metadata.preToolUsageStatus ?? "-")}
            {kv("Usage reason", latest?.metadata.preToolUsageReason ?? (latest?.metadata.intentUnderstandingMode === "deterministic" ? "Pre-tool LLM disabled by runtime mode" : "-"))}
          </PanelCard>

          <PanelCard title="Tool Execution">
            {kv("Tool Name", latest?.metadata.toolCalled ?? "-")}
            {kv("Mode", <span className={`rounded-full border px-2 py-0.5 text-[11px] ${latest?.metadata.toolExecutionMode === "api" ? toneClass("api") : toneClass("mock")}`}>{latest?.metadata.toolExecutionMode ?? "-"}</span>)}
            {kv("Endpoint", latest?.metadata.toolEndpoint ?? "-")}
            {kv("Latency", `${latest?.metadata.latency?.toolExecutionMs ?? "-"} ms`)}
            {kv("Fallback", <span className={`rounded-full border px-2 py-0.5 text-[11px] ${(latest?.metadata.fallbackActivated ?? false) ? toneClass("fallback") : toneClass("success")}`}>{String(latest?.metadata.fallbackActivated ?? false)}</span>)}
            {kv("Result", JSON.stringify(latest?.metadata.normalizedToolResult ?? {}))}

            <details className="rounded-xl border border-slate-200 bg-slate-50 p-2">
              <summary className="cursor-pointer text-xs font-semibold">Tool Result: {latest?.metadata.toolCalled ?? "-"}</summary>
              <div className="mt-2 space-y-2">
                <pre className="max-h-28 overflow-auto rounded-lg bg-white p-2 text-[11px]">{JSON.stringify(latest?.metadata.toolRequestPayload ?? {}, null, 2)}</pre>
                <pre className="max-h-28 overflow-auto rounded-lg bg-white p-2 text-[11px]">{JSON.stringify(latest?.metadata.rawToolResponse ?? {}, null, 2)}</pre>
                <pre className="max-h-28 overflow-auto rounded-lg bg-white p-2 text-[11px]">{JSON.stringify(latest?.metadata.normalizedToolResult ?? {}, null, 2)}</pre>
              </div>
            </details>
          </PanelCard>

          <PanelCard title="Post-tool Response Generation">
            {kv("Provider", latest?.metadata.postToolProvider ?? latest?.session.responseGeneration?.provider ?? "-")}
            {kv("Model", latest?.metadata.postToolModel ?? latest?.session.responseGeneration?.model ?? "-")}
            {kv("Mode", latest?.metadata.postToolResponseModeLabel ?? "-")}
            {kv("Source", latest?.metadata.responseGenerationSource ?? "-")}
            {kv("LLM used", String(latest?.metadata.postToolLlmUsed ?? false))}
            {kv("Grounded tool result", String(latest?.metadata.groundedToolResultUsed ?? false))}
            {kv("Latency", `${latest?.metadata.responseGenerationLatencyMs ?? latest?.metadata.latency?.responseGenerationMs ?? latest?.metadata.latency?.responseMs ?? "-"} ms`)}
            {kv("Tool used", String(Boolean(latest?.metadata.toolCalled)))}
            {kv("Grounded final response", latest?.finalResponseText ?? "-")}
          </PanelCard>

          <PanelCard title="Voice Metrics">
            {kv("STT Mode", tester.sttState.providerMode)}
            {kv("TTFA", `${latest?.metadata.latency?.ttfaMs ?? "-"} ms`)}
            {kv("Response Latency", `${latest?.metadata.latency?.responseGenerationMs ?? latest?.metadata.latency?.responseMs ?? "-"} ms`)}
            {kv("TTS Provider", latest?.metadata.ttsProviderMode ?? "-")}
          </PanelCard>

          <PanelCard title="Latency Breakdown">
            {[
              ["STT", latest?.metadata.latency?.sttFinalizationMs ?? latest?.metadata.latency?.sttMs],
              ["Understanding", latest?.metadata.latency?.understandingMs],
              ["Pre-tool", latest?.metadata.latency?.preToolUnderstandingMs],
              ["Routing", latest?.metadata.latency?.routingPolicyMs],
              ["Tool", latest?.metadata.latency?.toolExecutionMs ?? latest?.metadata.latency?.toolMs],
              ["Response", latest?.metadata.latency?.responseGenerationMs ?? latest?.metadata.latency?.responseMs],
              ["TTS", latest?.metadata.latency?.ttsFirstAudioMs ?? latest?.metadata.latency?.ttsMs],
              ["Total", latest?.metadata.latency?.totalTurnMs ?? latest?.metadata.latency?.totalMs]
            ].map(([name, value]) => {
              const ms = typeof value === "number" ? value : 0;
              const width = Math.min((ms / 2000) * 100, 100);
              return (
                <div key={name}>
                  <div className="flex items-center justify-between text-[11px]">
                    <span>{name}</span>
                    <span>{value ?? "-"} ms</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-200">
                    <div className="h-1.5 rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </PanelCard>

          <PanelCard title="Turn Timeline">
            <div className="space-y-1">
              {timeline.map((stage, index) => (
                <div key={stage.label} className="flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-[10px] font-semibold text-blue-700">{index + 1}</div>
                  <p className="flex-1 text-[11px] text-slate-700">{stage.label}</p>
                  <p className="text-[11px] text-slate-500">{stage.latency ? `${stage.latency} ms` : "-"}</p>
                </div>
              ))}
              {timeline.length === 0 && <p className="text-slate-500">No events yet.</p>}
            </div>
          </PanelCard>
        </aside>
      </section>
    </main>
  );
}
