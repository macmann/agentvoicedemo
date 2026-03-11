"use client";

import { FormEvent, useMemo, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { TOOL_NAMES } from "@/tools/runtimeToolConfig";
import { ToolName } from "@/tools/toolTypes";
import { useVoiceTester } from "@/state/useVoiceTester";
import { TesterLatencyMetrics, TesterMessage } from "@/types/tester";
import { IntentUnderstandingMode, PostToolResponseMode } from "@/state/useDashboardRuntimeConfig";

function StatusPill({ label, active }: { label: string; active: boolean }) {
  return <span className={cn("rounded-full px-2 py-1 text-xs", active ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500")}>{label}</span>;
}

function formatMs(value?: number) {
  return typeof value === "number" ? `${Math.round(value)} ms` : "-";
}

function MessageBubble({ message, preToolUsed }: { message: TesterMessage; preToolUsed?: boolean }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm", isUser && "bg-blue-600 text-white", !isUser && !isSystem && "bg-white text-slate-900 border border-slate-200", isSystem && "bg-amber-50 text-amber-900 border border-amber-200")}>
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
    <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-xs">
      <div className="flex items-end justify-between">
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
          <div key={label} className="flex justify-between gap-2 rounded bg-white px-2 py-1">
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

function yesNo(value?: boolean) {
  return value ? "yes" : "no";
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

  return (
    <main className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <section className="flex min-h-[70vh] flex-col rounded-2xl border border-slate-200 bg-slate-50">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold">Voice Testing UI</h1>
            <p className="text-xs text-slate-500">This demo supports live service status and announcement queries.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("rounded-full px-2 py-1 text-xs font-semibold", globalMode === "api" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700")}>{globalMode === "api" ? "Live API mode" : "Mock mode"}</span>
            <span className={cn("rounded-full px-2 py-1 text-xs font-semibold", dashboardConfig.intentUnderstandingMode === "llm_assisted" ? "bg-violet-100 text-violet-700" : "bg-slate-200 text-slate-700")}>Intent: {intentModeLabel(dashboardConfig.intentUnderstandingMode)}</span>
            <span className={cn("rounded-full px-2 py-1 text-xs font-semibold", dashboardConfig.postToolResponseMode === "llm_generated" ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-700")}>Response: {responseModeLabel(dashboardConfig.postToolResponseMode)}</span>
            <select
              className="rounded-full border border-violet-300 bg-white px-2 py-1 text-xs font-medium text-violet-800"
              value={dashboardConfig.intentUnderstandingMode}
              onChange={(e) => setDashboardConfig((prev) => ({ ...prev, intentUnderstandingMode: e.target.value as IntentUnderstandingMode }))}
              aria-label="Intent understanding mode"
            >
              <option value="deterministic">Deterministic</option>
              <option value="llm_assisted">LLM-assisted</option>
            </select>
            <select
              className="rounded-full border border-indigo-300 bg-white px-2 py-1 text-xs font-medium text-indigo-800"
              value={dashboardConfig.postToolResponseMode}
              onChange={(e) => setDashboardConfig((prev) => ({ ...prev, postToolResponseMode: e.target.value as PostToolResponseMode }))}
              aria-label="Post-tool response mode"
            >
              <option value="deterministic">Deterministic</option>
              <option value="llm_generated">LLM-generated</option>
            </select>
            <StatusPill label={statusText} active={status !== "idle"} />
          </div>
        </header>

        <div className="space-y-3 border-b border-slate-200 px-4 py-3">
          <LatencyPanel latency={latestTurn?.metadata.latency} providerMode={latestTurn?.metadata.providerMode} />
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
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

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={isProcessing || status === "listening"} onClick={startListening} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">🎙 Talk</button>
            <button type="button" disabled={status !== "listening"} onClick={stopListening} className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-600 disabled:opacity-40">Cancel / Stop (debug)</button>
            <button type="button" onClick={() => setVoiceModeEnabled((v) => !v)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs">Voice mode: {voiceModeEnabled ? "On" : "Off"}</button>
            <button type="button" onClick={replayLastAudio} className="rounded-lg border border-slate-300 px-3 py-2 text-xs" disabled={!latestTurn}>Replay audio</button>
            <button type="button" onClick={stopAudio} className="rounded-lg border border-slate-300 px-3 py-2 text-xs">Stop audio</button>
            <button type="button" onClick={resetConversation} className="rounded-lg border border-rose-200 px-3 py-2 text-xs text-rose-700">Reset conversation</button>
          </div>

          <div className="flex gap-2">
            <input value={text} onChange={(event) => setText(event.target.value)} disabled={isProcessing} placeholder="Type a customer message..." className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-400" />
            <button type="submit" disabled={isProcessing || !text.trim()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Send</button>
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
            <div className="rounded border border-violet-200 bg-violet-50 p-2">
              <p className="font-semibold">Intent understanding mode</p>
              <div className="mt-2 grid gap-2">
                <select
                  className="w-full rounded border border-violet-300 bg-white p-1"
                  value={dashboardConfig.intentUnderstandingMode}
                  onChange={(e) => setDashboardConfig((prev) => ({ ...prev, intentUnderstandingMode: e.target.value as IntentUnderstandingMode }))}
                >
                  <option value="deterministic">Deterministic</option>
                  <option value="llm_assisted">LLM-assisted</option>
                </select>
                <p className="text-[11px] text-violet-800">Deterministic: lower latency, stricter interpretation. LLM-assisted: higher latency, better natural-language understanding.</p>
              </div>
            </div>
            <div className="rounded border border-indigo-200 bg-indigo-50 p-2">
              <p className="font-semibold">Post-tool response mode</p>
              <div className="mt-2 grid gap-2">
                <select
                  className="w-full rounded border border-indigo-300 bg-white p-1"
                  value={dashboardConfig.postToolResponseMode}
                  onChange={(e) => setDashboardConfig((prev) => ({ ...prev, postToolResponseMode: e.target.value as PostToolResponseMode }))}
                >
                  <option value="deterministic">Deterministic</option>
                  <option value="llm_generated">LLM-generated</option>
                </select>
                <p className="text-[11px] text-indigo-800">Deterministic response: lower latency, more rigid wording. LLM-generated response: higher latency, more natural grounded wording.</p>
              </div>
            </div>
            <div className="rounded border border-slate-200 p-2">
              <p className="font-semibold">Tool Configuration</p>
              <label className="mt-2 block">
                <span className="mb-1 block">Global tool mode</span>
                <select className="w-full rounded border border-slate-300 p-1" value={globalMode} onChange={(e) => setGlobalToolMode(e.target.value === "default" ? undefined : (e.target.value as "mock" | "api"))}>
                  <option value="default">Code defaults</option>
                  <option value="mock">Mock</option>
                  <option value="api">Live API</option>
                </select>
              </label>
              <details className="mt-2">
                <summary className="cursor-pointer">Advanced per-tool overrides</summary>
                <div className="mt-2 space-y-2">
                  {TOOL_NAMES.map((toolName) => (
                    <label key={toolName} className="flex items-center justify-between gap-2">
                      <span>{toolName}</span>
                      <select value={perToolOverrides.find((item) => item.toolName === toolName)?.mode ?? "default"} onChange={(e) => setToolOverrideMode(toolName as ToolName, e.target.value as "mock" | "api" | "default")} className="rounded border border-slate-300 p-1">
                        <option value="default">Default</option>
                        <option value="mock">Mock</option>
                        <option value="api">API</option>
                      </select>
                    </label>
                  ))}
                </div>
              </details>
              <button type="button" onClick={resetToolSettings} className="mt-2 rounded border border-rose-200 px-2 py-1 text-rose-700">Reset tool settings</button>
            </div>

            <div className="rounded border border-slate-200 bg-slate-50 p-2">
              <p className="font-semibold">Turn trace summary</p>
              <div className="mt-1 space-y-1">
                <div><strong>Input mode used:</strong> {latestTurn?.metadata.intentUnderstandingMode ?? "-"}</div>
                <div><strong>Parsed support intent:</strong> {latestTurn?.metadata.supportIntent ?? "none"}</div>
                <div><strong>Parsed entities:</strong> <pre className="mt-1 overflow-x-auto rounded bg-white p-2">{JSON.stringify(latestTurn?.metadata.entities ?? {}, null, 2)}</pre></div>
                <div><strong>Routing outcome:</strong> {latestTurn?.metadata.routingDecision ?? "-"}</div>
                <div><strong>Tool selected:</strong> {latestTurn?.metadata.toolCalled ?? "none"}</div>
                <div><strong>Why clarification happened:</strong> {latestTurn?.metadata.clarificationReason ?? latestTurn?.metadata.preToolUsageReason ?? "-"}</div>
              </div>
            </div>

            <div><strong>Workflow:</strong> {latestTurn?.metadata.workflowSelected ?? "-"}</div>
            <div><strong>Support intent:</strong> {latestTurn?.metadata.supportIntent ?? "none"}</div>
            <div><strong>Active support intent:</strong> {latestTurn?.metadata.activeSupportIntent ?? "-"}</div>
            <div><strong>Request type:</strong> {latestTurn?.metadata.supportRequestType ?? "-"}</div>
            <div><strong>preToolUnderstandingUsed:</strong> {yesNo(latestTurn?.metadata.preToolUnderstandingUsed)}</div>
            <div><strong>intentUnderstandingModeUsed:</strong> {latestTurn?.metadata.intentUnderstandingMode ?? "-"}</div>
            <div><strong>postToolResponseModeUsed:</strong> {latestTurn?.metadata.postToolResponseModeUsed ?? "-"}</div>
            <div><strong>postToolLlmUsed:</strong> {yesNo(latestTurn?.metadata.postToolLlmUsed)}</div>
            <div><strong>responseGenerationSource:</strong> {latestTurn?.metadata.responseGenerationSource ?? "-"}</div>
            <div><strong>postToolProvider:</strong> {latestTurn?.metadata.postToolProvider ?? "-"}</div>
            <div><strong>postToolModel:</strong> {latestTurn?.metadata.postToolModel ?? "-"}</div>
            <div><strong>responseGenerationLatencyMs:</strong> {formatMs(latestTurn?.metadata.responseGenerationLatencyMs)}</div>
            <div><strong>postToolEndpointType:</strong> {latestTurn?.metadata.postToolEndpointType ?? "-"}</div>
            <div><strong>postToolFallbackOccurred:</strong> {String(latestTurn?.metadata.postToolFallbackOccurred ?? false)}</div>
            <div><strong>postToolFailureCategory:</strong> {latestTurn?.metadata.postToolFailureCategory ?? "-"}</div>
            <div><strong>postToolFailureStatusCode:</strong> {latestTurn?.metadata.postToolFailureStatusCode ?? "-"}</div>
            <div><strong>postToolRequestPayloadBuilt:</strong> {String(latestTurn?.metadata.postToolRequestPayloadBuilt ?? false)}</div>
            <div><strong>postToolStructuredSchemaUsed:</strong> {String(latestTurn?.metadata.postToolStructuredSchemaUsed ?? false)}</div>
            <div><strong>postToolJsonSchemaValidationRequested:</strong> {String(latestTurn?.metadata.postToolJsonSchemaValidationRequested ?? false)}</div>
            <div><strong>postToolFailureResponseBody:</strong> {latestTurn?.metadata.postToolFailureResponseBody ?? "-"}</div>
            <div><strong>groundedToolResultUsed:</strong> {yesNo(latestTurn?.metadata.groundedToolResultUsed)}</div>
            <div><strong>groundedSupportIntent:</strong> {latestTurn?.metadata.groundedSupportIntent ?? "-"}</div>
            <div><strong>groundedToolName:</strong> {latestTurn?.metadata.groundedToolName ?? "-"}</div>
            <div><strong>groundedMatchedRegion:</strong> {latestTurn?.metadata.groundedMatchedRegion ?? "-"}</div>
            <div><strong>groundedMatchedCategory:</strong> {latestTurn?.metadata.groundedMatchedCategory ?? "-"}</div>
            <div><strong>groundedOverallStatus:</strong> {latestTurn?.metadata.groundedOverallStatus ?? "-"}</div>
            <div><strong>groundedServiceStatus:</strong> {latestTurn?.metadata.groundedServiceStatus ?? "-"}</div>
            <div><strong>groundedClarificationNeeded:</strong> {String(latestTurn?.metadata.groundedClarificationNeeded ?? false)}</div>
            <div><strong>groundedClarificationPrompt:</strong> {latestTurn?.metadata.groundedClarificationPrompt ?? "-"}</div>
            <div><strong>preToolProvider:</strong> {latestTurn?.metadata.preToolProvider ?? "-"}</div>
            <div><strong>preToolModel:</strong> {latestTurn?.metadata.preToolModel ?? "-"}</div>
            <div><strong>preToolProviderSelectionReason:</strong> {latestTurn?.metadata.preToolProviderSelectionReason ?? "-"}</div>
            <div><strong>preToolEndpointType:</strong> {latestTurn?.metadata.preToolEndpointType ?? "-"}</div>
            <div><strong>preToolFallbackOccurred:</strong> {String(latestTurn?.metadata.preToolFallbackOccurred ?? false)}</div>
            <div><strong>preToolFailureCategory:</strong> {latestTurn?.metadata.preToolFailureCategory ?? "-"}</div>
            <div><strong>preToolFailureStatusCode:</strong> {latestTurn?.metadata.preToolFailureStatusCode ?? "-"}</div>
            <div><strong>preToolRequestPayloadBuilt:</strong> {String(latestTurn?.metadata.preToolRequestPayloadBuilt ?? false)}</div>
            <div><strong>preToolStructuredSchemaUsed:</strong> {String(latestTurn?.metadata.preToolStructuredSchemaUsed ?? false)}</div>
            <div><strong>preToolJsonSchemaValidationRequested:</strong> {String(latestTurn?.metadata.preToolJsonSchemaValidationRequested ?? false)}</div>
            <div><strong>preToolFailureResponseBody:</strong> {latestTurn?.metadata.preToolFailureResponseBody ?? "-"}</div>
            <div><strong>preToolLatencyMs:</strong> {formatMs(latestTurn?.metadata.preToolLatencyMs)}</div>
            <div><strong>inferredSupportIntent:</strong> {latestTurn?.metadata.preToolInferredSupportIntent ?? "-"}</div>
            <div><strong>intentConfidence:</strong> {latestTurn?.metadata.preToolIntentConfidence ?? "-"}</div>
            <div><strong>turnAct:</strong> {latestTurn?.metadata.preToolTurnAct ?? latestTurn?.metadata.turnAct ?? "-"}</div>
            <div><strong>clarificationNeeded:</strong> {String(latestTurn?.metadata.preToolClarificationNeeded ?? false)}</div>
            <div><strong>clarificationQuestion:</strong> {latestTurn?.metadata.preToolClarificationQuestion ?? "-"}</div>
            <div><strong>continuationDetected:</strong> {String(latestTurn?.metadata.preToolContinuationDetected ?? latestTurn?.metadata.continuationDetected ?? false)}</div>
            <div><strong>correctionDetected:</strong> {String(latestTurn?.metadata.preToolCorrectionDetected ?? false)}</div>
            <div><strong>Pre-tool decision:</strong> {renderPreToolReason(latestTurn)}</div>
            <div><strong>rescueMappingApplied:</strong> {String(latestTurn?.metadata.preToolRescueMappingApplied ?? false)}</div>
            <div><strong>Continuation detected:</strong> {String(latestTurn?.metadata.continuationDetected ?? false)}</div>
            <div><strong>Corrected slots:</strong> <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2">{JSON.stringify(latestTurn?.metadata.correctedSlots ?? {}, null, 2)}</pre></div>
            <div><strong>Support intent transition:</strong> {latestTurn?.metadata.supportIntentTransition ?? "-"}</div>
            <div><strong>Previous tool context:</strong> <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2">{JSON.stringify(latestTurn?.metadata.previousToolContext ?? {}, null, 2)}</pre></div>
            <div><strong>Out-of-scope demo request:</strong> {String(latestTurn?.metadata.outOfScopeDemoRequest ?? false)}</div>
            <div><strong>Routing decision:</strong> {latestTurn?.metadata.routingDecision ?? "-"}</div>
            <div><strong>Required slots:</strong> {(latestTurn?.metadata.requiredSlots ?? []).join(", ") || "-"}</div>
            <div><strong>Missing slots:</strong> {(latestTurn?.metadata.missingSlots ?? []).join(", ") || "-"}</div>
            <div><strong>Pending question:</strong> {latestTurn?.metadata.pendingQuestion?.prompt ?? "-"}</div>
            <div><strong>Tool clarification needed:</strong> {String(latestTurn?.metadata.toolClarificationNeeded ?? false)}</div>
            <div><strong>Tool clarification reason:</strong> {latestTurn?.metadata.clarificationReason ?? "-"}</div>
            <div><strong>Expected slot from tool:</strong> {latestTurn?.metadata.expectedSlotFromTool ?? "-"}</div>
            <div><strong>Candidate categories:</strong> {(latestTurn?.metadata.candidateCategories ?? []).join(", ") || "-"}</div>
            <div><strong>Pending question prompt:</strong> {latestTurn?.metadata.pendingQuestionPrompt ?? "-"}</div>
            <div><strong>Last unresolved tool context:</strong> <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2">{JSON.stringify(latestTurn?.metadata.lastUnresolvedToolContext ?? {}, null, 2)}</pre></div>
            <div><strong>Tool blocked (missing slot):</strong> {String(latestTurn?.metadata.toolExecutionBlockedDueToMissingSlot ?? false)}</div>
            <div><strong>Region extracted:</strong> {latestTurn?.metadata.regionExtracted ?? "-"}</div>
            <div><strong>Tool called:</strong> {latestTurn?.metadata.toolCalled ?? "-"}</div>
            <div><strong>Resolved mode:</strong> {latestTurn?.metadata.toolCalled ? resolveToolMode(latestTurn.metadata.toolCalled as ToolName) : "-"}</div>
            <div><strong>Tool execution mode:</strong> {latestTurn?.metadata.toolExecutionMode ?? "-"}</div>
            <div><strong>Fallback activated:</strong> {String(latestTurn?.metadata.fallbackActivated ?? false)}</div>
            <div><strong>Endpoint:</strong> {latestTurn?.metadata.toolEndpoint ?? "-"}</div>
            <div><strong>Request payload:</strong> <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2">{JSON.stringify(latestTurn?.metadata.toolRequestPayload ?? {}, null, 2)}</pre></div>
            <div><strong>Raw response:</strong> <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2">{JSON.stringify(latestTurn?.metadata.rawToolResponse ?? {}, null, 2)}</pre></div>
            <div><strong>Normalized result:</strong> <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2">{JSON.stringify(latestTurn?.metadata.normalizedToolResult ?? {}, null, 2)}</pre></div>
            <div><strong>Execution latency:</strong> {formatMs(latestTurn?.session.toolExecution?.executionTimeMs)}</div>
            <div><strong>Fallback behavior:</strong> {latestTurn?.session.toolExecution?.fallbackBehavior ?? "-"}</div>

            <div className="rounded border border-slate-200 p-2">
              <p className="font-semibold">Recent tool calls</p>
              <div className="mt-2 max-h-40 overflow-auto">
                {toolHistory.map((entry) => (
                  <div key={entry.id} className="mb-2 rounded border border-slate-100 p-1">
                    <div>#{entry.turnNumber} {new Date(entry.timestamp).toLocaleTimeString()}</div>
                    <div>{entry.toolName} • {entry.mode} • {entry.status} • {formatMs(entry.latencyMs)}</div>
                    <div className="text-slate-500">{entry.summary}</div>
                  </div>
                ))}
                {toolHistory.length === 0 && <div className="text-slate-500">No tool calls yet.</div>}
              </div>
            </div>
          </div>
        )}
      </aside>
    </main>
  );
}
