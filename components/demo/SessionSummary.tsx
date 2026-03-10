import { SessionState } from "@/types/session";
import { formatMs } from "@/utils/format";

export function SessionSummary({ session }: { session: SessionState }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold">Session Summary</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-slate-500">Intent</p>
          <p className="font-medium">{session.understanding?.intent ?? "—"}</p>
        </div>
        <div>
          <p className="text-slate-500">Routing</p>
          <p className="font-medium">{session.routing?.decision ?? "—"}</p>
        </div>
        <div>
          <p className="text-slate-500">Tool status</p>
          <p className="font-medium">{session.toolResult?.status ?? "—"}</p>
        </div>
        <div>
          <p className="text-slate-500">Handoff</p>
          <p className="font-medium">{session.handoff?.triggered ? "Triggered" : "Not triggered"}</p>
        </div>
        <div>
          <p className="text-slate-500">Total latency</p>
          <p className="font-medium">{formatMs(session.latency?.totalMs)}</p>
        </div>
        <div>
          <p className="text-slate-500">Response preview</p>
          <p className="font-medium">{session.responseText ?? "—"}</p>
        </div>
      </div>
    </section>
  );
}
