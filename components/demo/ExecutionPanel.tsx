"use client";

import { DemoLogEvent, SessionState } from "@/types/session";
import { formatMs } from "@/utils/format";
import { useMemo, useState } from "react";

export function ExecutionPanel({ logs, session }: { logs: DemoLogEvent[]; session: SessionState }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const stages = [
    { label: "STT", value: session.latency?.sttMs },
    { label: "Understanding", value: session.latency?.understandingMs },
    { label: "Tool", value: session.latency?.toolMs },
    { label: "Response", value: session.latency?.responseMs },
    { label: "TTS", value: session.latency?.ttsMs }
  ];

  const inspectionPayload = useMemo(
    () => ({
      generatedAt: new Date().toISOString(),
      session,
      logs
    }),
    [logs, session]
  );

  const copyInspectionJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(inspectionPayload, null, 2));
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Execution Log & Latency Timeline</h2>
        <div className="flex items-center gap-2">
          <button className="rounded border border-slate-300 px-2 py-1 text-xs" onClick={copyInspectionJson} type="button">
            Copy inspection JSON
          </button>
          {copyStatus === "copied" ? <span className="text-xs text-emerald-700">Copied.</span> : null}
          {copyStatus === "error" ? <span className="text-xs text-rose-700">Copy failed.</span> : null}
        </div>
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <ul className="max-h-40 space-y-2 overflow-auto text-sm">
          {logs.length === 0 ? (
            <li className="text-slate-500">No events yet.</li>
          ) : (
            logs.map((event) => (
              <li key={event.id} className="rounded border border-slate-200 p-2">
                <p className="font-medium">{event.stage}</p>
                <p className="text-slate-600">{event.message}</p>
                <p className="text-xs text-slate-500">{event.timestamp}</p>
              </li>
            ))
          )}
        </ul>

        <div className="space-y-3 text-sm">
          {stages.map((stage) => (
            <div key={stage.label}>
              <div className="mb-1 flex justify-between">
                <span>{stage.label}</span>
                <span>{formatMs(stage.value)}</span>
              </div>
              <div className="h-2 rounded bg-slate-100">
                <div
                  className="h-2 rounded bg-indigo-500"
                  style={{ width: `${Math.min(((stage.value ?? 0) / 700) * 100, 100)}%` }}
                />
              </div>
            </div>
          ))}
          <div className="pt-2 font-semibold">Total: {formatMs(session.latency?.totalMs)}</div>

          <div className="rounded border border-slate-200 p-2">
            <p className="font-medium">Policy thresholds</p>
            <p className="text-slate-600">Intent confidence: {session.policy?.thresholds.minIntentConfidence ?? "—"}</p>
            <p className="text-slate-600">Low-confidence escalation: {session.policy?.thresholds.lowConfidenceEscalationCount ?? "—"}</p>
            <p className="text-slate-600">Tool-failure escalation: {session.policy?.thresholds.toolFailureEscalationCount ?? "—"}</p>
            <p className="text-slate-600">STT-failure escalation: {session.policy?.thresholds.sttFailureEscalationCount ?? "—"}</p>
          </div>


          <div className="rounded border border-slate-200 p-2">
            <p className="font-medium">STT diagnostics</p>
            <p className="text-slate-600">Mode: {session.stt?.inputMode ?? session.sttInputMode ?? "—"}</p>
            <p className="text-slate-600">Provider: {session.stt?.provider ?? "—"}</p>
            <p className="text-slate-600">Status: {session.stt?.status ?? "—"}</p>
            <p className="text-slate-600">Failure type: {session.stt?.failureType ?? "—"}</p>
            <p className="text-slate-600">Reason: {session.stt?.reason ?? "—"}</p>
          </div>

          <div className="rounded border border-slate-200 p-2">
            <p className="font-medium">Tool execution</p>
            <p className="text-slate-600">Tool: {session.toolExecution?.selectedTool ?? "—"}</p>
            <p className="text-slate-600">Mode: {session.toolExecution?.executionMode ?? "—"}</p>
            <p className="text-slate-600">Status: {session.toolExecution?.executionStatus ?? "—"}</p>
            <p className="text-slate-600">Error: {session.toolExecution?.errorMessage ?? "—"}</p>
          </div>

          <div className="rounded border border-slate-200 p-2">
            <p className="font-medium">Retry counters</p>
            <p className="text-slate-600">STT failures: {session.policy?.counters.sttFailures ?? 0}</p>
            <p className="text-slate-600">Tool failures: {session.policy?.counters.toolFailures ?? 0}</p>
            <p className="text-slate-600">Low-confidence turns: {session.policy?.counters.lowConfidence ?? 0}</p>
          </div>

          <div className="rounded border border-slate-200 p-2">
            <p className="font-medium">Response + TTS</p>
            <p className="text-slate-600">Response provider: {session.responseGeneration?.provider ?? "—"}</p>
            <p className="text-slate-600">TTS provider: {session.tts?.provider ?? "—"}</p>
            <p className="text-slate-600">TTS status: {session.tts?.status ?? "—"}</p>
            <p className="text-slate-600">TTS reason: {session.tts?.reason ?? "—"}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
