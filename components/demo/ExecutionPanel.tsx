import { DemoLogEvent, SessionState } from "@/types/session";
import { formatMs } from "@/utils/format";

export function ExecutionPanel({ logs, session }: { logs: DemoLogEvent[]; session: SessionState }) {
  const stages = [
    { label: "STT", value: session.latency?.sttMs },
    { label: "Understanding", value: session.latency?.understandingMs },
    { label: "Tool", value: session.latency?.toolMs },
    { label: "Response", value: session.latency?.responseMs },
    { label: "TTS", value: session.latency?.ttsMs }
  ];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold">Execution Log & Latency Timeline</h2>
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
            <p className="font-medium">Retry counters</p>
            <p className="text-slate-600">STT failures: {session.policy?.counters.sttFailures ?? 0}</p>
            <p className="text-slate-600">Tool failures: {session.policy?.counters.toolFailures ?? 0}</p>
            <p className="text-slate-600">Low-confidence turns: {session.policy?.counters.lowConfidence ?? 0}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
