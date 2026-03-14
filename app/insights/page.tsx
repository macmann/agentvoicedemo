"use client";

import { useEffect, useMemo, useState } from "react";
import { loadStoredTurns } from "@/state/testerHistoryStorage";
import { TesterTurnRecord } from "@/types/tester";

function badgeClass(severity: "ok" | "info" | "warning") {
  if (severity === "warning") return "bg-amber-100 text-amber-800";
  if (severity === "info") return "bg-blue-100 text-blue-800";
  return "bg-emerald-100 text-emerald-800";
}

function formatMs(value?: number) {
  return typeof value === "number" ? `${Math.round(value)} ms` : "—";
}

function formatPct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 60_000) return "just now";
  const min = Math.floor(diffMs / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}


export default function InsightsPage() {
  const [turns, setTurns] = useState<TesterTurnRecord[]>([]);

  useEffect(() => {
    const read = () => setTurns(loadStoredTurns());
    read();
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, []);

  const stats = useMemo(() => {
    const withLatency = turns.filter((turn) => typeof turn.metadata.latency?.ttfaMs === "number");
    const ttfaMedian = withLatency.length
      ? [...withLatency]
          .map((turn) => turn.metadata.latency.ttfaMs as number)
          .sort((a, b) => a - b)[Math.floor(withLatency.length / 2)]
      : undefined;

    const fallbackCount = turns.filter((turn) => Boolean(turn.metadata.fallbackActivated)).length;
    const handoffCount = turns.filter((turn) => Boolean(turn.metadata.handoffTriggered)).length;
    const toolTurns = turns.filter((turn) => Boolean(turn.metadata.toolCalled));

    const loopMetrics = [
      {
        loop: "Understanding",
        owner: "Pre-tool interpreter",
        p95Ms: turns.length
          ? percentile(
              turns
                .map((turn) => turn.metadata.latency?.preToolUnderstandingMs ?? turn.metadata.latency?.understandingMs)
                .filter((ms): ms is number => typeof ms === "number"),
              95
            )
          : undefined,
        successRate: turns.length ? formatPct((turns.length - fallbackCount) / turns.length) : "—",
        fallbackRate: turns.length ? formatPct(fallbackCount / turns.length) : "—",
        driftSignal: turns.length ? "Derived from recorded turns" : "No data yet",
        action: "Monitor low-confidence/fallback spikes"
      },
      {
        loop: "Routing + policy",
        owner: "Deterministic policy engine",
        p95Ms: percentile(
          turns.map((turn) => turn.metadata.latency?.routingPolicyMs).filter((ms): ms is number => typeof ms === "number"),
          95
        ),
        successRate: turns.length ? formatPct((turns.length - handoffCount) / turns.length) : "—",
        fallbackRate: turns.length ? formatPct(handoffCount / turns.length) : "—",
        driftSignal: turns.length ? "Handoff rate from actual turns" : "No data yet",
        action: "Review handoff causes when above baseline"
      },
      {
        loop: "Tool execution",
        owner: "Tool runner",
        p95Ms: percentile(
          turns.map((turn) => turn.metadata.latency?.toolExecutionMs ?? turn.metadata.latency?.toolMs).filter((ms): ms is number => typeof ms === "number"),
          95
        ),
        successRate: toolTurns.length
          ? formatPct(toolTurns.filter((turn) => !turn.metadata.fallbackActivated).length / toolTurns.length)
          : "—",
        fallbackRate: toolTurns.length
          ? formatPct(toolTurns.filter((turn) => Boolean(turn.metadata.fallbackActivated)).length / toolTurns.length)
          : "—",
        driftSignal: toolTurns.length ? "Tool latency/fallback from recorded turns" : "No tool data yet",
        action: "Check API timeout patterns and fallback behavior"
      },
      {
        loop: "Response + voice",
        owner: "Response + TTS",
        p95Ms: percentile(
          turns.map((turn) => turn.metadata.latency?.ttsFirstAudioMs).filter((ms): ms is number => typeof ms === "number"),
          95
        ),
        successRate: turns.length
          ? formatPct(turns.filter((turn) => turn.session.tts?.status === "played").length / turns.length)
          : "—",
        fallbackRate: turns.length
          ? formatPct(turns.filter((turn) => turn.session.tts?.status === "fallback").length / turns.length)
          : "—",
        driftSignal: turns.length ? "Voice playback from actual sessions" : "No voice data yet",
        action: "Track TTFA trend versus target"
      }
    ];

    const events = turns
      .slice(-8)
      .reverse()
      .map((turn) => {
        const severity: "ok" | "info" | "warning" = turn.metadata.fallbackActivated
          ? "warning"
          : turn.metadata.handoffTriggered
            ? "info"
            : "ok";

        return {
          time: formatAgo(turn.createdAt),
          loop: turn.metadata.toolCalled ? "Tool execution" : "Conversation",
          severity,
          summary: turn.finalResponseText.slice(0, 120) || "Turn completed",
          resolution: turn.metadata.handoffTriggered
            ? `Handoff: ${turn.metadata.handoffReason ?? "policy trigger"}`
            : turn.metadata.fallbackActivated
              ? "Fallback path activated"
              : "Completed without fallback"
        };
      });

    return {
      turnCount: turns.length,
      ttfaMedian,
      fallbackRate: turns.length ? formatPct(fallbackCount / turns.length) : "—",
      handoffRate: turns.length ? formatPct(handoffCount / turns.length) : "—",
      loopMetrics,
      events
    };
  }, [turns]);

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-neutral-200 bg-white p-6">
        <h1 className="text-3xl font-semibold tracking-tight">Agentic AI Observability Insights</h1>
        <p className="mt-2 text-sm text-neutral-700">Metrics are computed from real tester turns saved in your browser.</p>
      </header>

      {stats.turnCount === 0 && (
        <section className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
          <h2 className="text-lg font-semibold text-neutral-900">No data yet</h2>
          <p className="mt-2 text-sm text-neutral-700">
            Run at least one turn in the tester page, then return here to see live insights.
          </p>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Recorded turns</p>
          <p className="mt-1 text-2xl font-semibold text-neutral-900">{stats.turnCount}</p>
          <p className="mt-1 text-xs text-neutral-600">Stored in local browser history</p>
        </article>
        <article className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Median TTFA</p>
          <p className="mt-1 text-2xl font-semibold text-neutral-900">{formatMs(stats.ttfaMedian)}</p>
          <p className="mt-1 text-xs text-neutral-600">Based on captured turns</p>
        </article>
        <article className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Fallback activations</p>
          <p className="mt-1 text-2xl font-semibold text-neutral-900">{stats.fallbackRate}</p>
          <p className="mt-1 text-xs text-neutral-600">Derived from turn metadata</p>
        </article>
        <article className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Handoff rate</p>
          <p className="mt-1 text-2xl font-semibold text-neutral-900">{stats.handoffRate}</p>
          <p className="mt-1 text-xs text-neutral-600">Derived from policy outcomes</p>
        </article>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Loop health monitor</h2>
          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-700">Live from local turn history</span>
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
              {stats.loopMetrics.map((row) => (
                <tr key={row.loop} className="border-b border-neutral-100 align-top last:border-b-0">
                  <td className="py-3 pr-4 font-medium text-neutral-900">{row.loop}</td>
                  <td className="py-3 pr-4 text-neutral-700">{row.owner}</td>
                  <td className="py-3 pr-4 text-neutral-700">{formatMs(row.p95Ms)}</td>
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
          {stats.events.length === 0 && <p className="text-sm text-neutral-600">No recent events yet.</p>}
          {stats.events.map((event) => (
            <article key={`${event.time}-${event.summary}`} className="rounded-xl border border-neutral-200 p-3">
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

function percentile(values: number[], p: number) {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}
