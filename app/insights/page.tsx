const loopMetrics = [
  {
    loop: "Loop 1 · Pre-tool understanding",
    owner: "Agentic planner",
    p95Ms: 320,
    successRate: "98.7%",
    fallbackRate: "1.3%",
    driftSignal: "Entity extraction drift: low",
    action: "Monitor clarification prompts when confidence < 0.75"
  },
  {
    loop: "Loop 2 · Policy + routing",
    owner: "Deterministic guardrails",
    p95Ms: 54,
    successRate: "99.9%",
    fallbackRate: "0.1%",
    driftSignal: "No route ambiguity trend",
    action: "Alert if handoff spikes > 8% in 1 hour"
  },
  {
    loop: "Loop 3 · Tool execution",
    owner: "Tool runner",
    p95Ms: 810,
    successRate: "96.4%",
    fallbackRate: "3.6%",
    driftSignal: "External API timeout risk: medium",
    action: "Shift tool mode to mock on sustained endpoint errors"
  },
  {
    loop: "Loop 4 · Response + voice",
    owner: "Post-tool response + TTS",
    p95Ms: 420,
    successRate: "99.1%",
    fallbackRate: "0.9%",
    driftSignal: "Voice latency regression: stable",
    action: "Track TTFA target under 1200 ms"
  }
] as const;

const observabilitySignals = [
  { label: "Agentic turns (24h)", value: "3,842", note: "+12.4% vs prior day" },
  { label: "Median TTFA", value: "840 ms", note: "Target < 1200 ms" },
  { label: "Fallback activations", value: "2.1%", note: "Mostly tool timeouts" },
  { label: "Handoff rate", value: "6.3%", note: "Within expected range" }
] as const;

const loopEvents = [
  {
    time: "09:14",
    loop: "Tool execution",
    severity: "warning",
    summary: "Outage API latency increased to 1.8s p95",
    resolution: "Auto-switched check_outage_status to mock for 3 minutes"
  },
  {
    time: "08:47",
    loop: "Pre-tool understanding",
    severity: "info",
    summary: "Minor rise in clarification-needed outcomes",
    resolution: "No action; confidence remained above policy threshold"
  },
  {
    time: "08:05",
    loop: "Response + voice",
    severity: "ok",
    summary: "TTFA improved after warm-start caching",
    resolution: "Sustained across 200+ turns"
  }
] as const;

function badgeClass(severity: "ok" | "info" | "warning") {
  if (severity === "warning") return "bg-amber-100 text-amber-800";
  if (severity === "info") return "bg-blue-100 text-blue-800";
  return "bg-emerald-100 text-emerald-800";
}

export const metadata = {
  title: "Insights"
};

export default function InsightsPage() {
  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-neutral-200 bg-white p-6">
        <h1 className="text-3xl font-semibold tracking-tight">Agentic AI Observability Insights</h1>
        <p className="mt-2 text-sm text-neutral-700">
          Monitoring view for each orchestration loop: understanding, routing, tool execution, and response delivery.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {observabilitySignals.map((signal) => (
          <article key={signal.label} className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="text-xs text-neutral-500">{signal.label}</p>
            <p className="mt-1 text-2xl font-semibold text-neutral-900">{signal.value}</p>
            <p className="mt-1 text-xs text-neutral-600">{signal.note}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Loop health monitor</h2>
          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-700">Agentic observability enabled</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-neutral-500">
                <th className="py-2 pr-4 font-medium">Loop</th>
                <th className="py-2 pr-4 font-medium">Owner</th>
                <th className="py-2 pr-4 font-medium">p95 latency</th>
                <th className="py-2 pr-4 font-medium">Success</th>
                <th className="py-2 pr-4 font-medium">Fallback</th>
                <th className="py-2 pr-4 font-medium">Drift signal</th>
                <th className="py-2 font-medium">Suggested action</th>
              </tr>
            </thead>
            <tbody>
              {loopMetrics.map((row) => (
                <tr key={row.loop} className="border-b border-neutral-100 align-top last:border-b-0">
                  <td className="py-3 pr-4 font-medium text-neutral-900">{row.loop}</td>
                  <td className="py-3 pr-4 text-neutral-700">{row.owner}</td>
                  <td className="py-3 pr-4 text-neutral-700">{row.p95Ms} ms</td>
                  <td className="py-3 pr-4 text-emerald-700">{row.successRate}</td>
                  <td className="py-3 pr-4 text-amber-700">{row.fallbackRate}</td>
                  <td className="py-3 pr-4 text-neutral-700">{row.driftSignal}</td>
                  <td className="py-3 text-neutral-700">{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Recent loop events</h2>
        <div className="mt-3 space-y-3">
          {loopEvents.map((event) => (
            <article key={`${event.time}-${event.loop}`} className="rounded-xl border border-neutral-200 p-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-500">{event.time}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass(event.severity)}`}>{event.severity.toUpperCase()}</span>
                <span className="text-xs font-medium text-neutral-700">{event.loop}</span>
              </div>
              <p className="mt-1 text-sm text-neutral-900">{event.summary}</p>
              <p className="mt-1 text-xs text-neutral-600">Resolution: {event.resolution}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
