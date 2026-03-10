import { SessionState } from "@/types/session";
import { formatMs } from "@/utils/format";

export function SessionSummary({ session }: { session: SessionState }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold">Session Summary</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="col-span-2">
          <p className="text-slate-500">Original utterance</p>
          <p className="font-medium">{session.utterance || "—"}</p>
        </div>
        <div className="col-span-2">
          <p className="text-slate-500">Transcript</p>
          <p className="font-medium">{session.transcript ?? "—"}</p>
        </div>
        <div>
          <p className="text-slate-500">Intent</p>
          <p className="font-medium">{session.understanding?.intent ?? "—"}</p>
        </div>
        <div>
          <p className="text-slate-500">Sentiment / empathy</p>
          <p className="font-medium">
            {session.understanding?.sentiment ?? "—"}
            {session.understanding?.empathyNeeded ? " (empathy cue)" : ""}
          </p>
        </div>
        <div className="col-span-2">
          <p className="text-slate-500">Entities</p>
          <p className="font-medium break-all">{session.understanding ? JSON.stringify(session.understanding.entities) : "—"}</p>
        </div>
        <div>
          <p className="text-slate-500">Workflow selected/skipped</p>
          <p className="font-medium">{session.routing?.workflowName ?? `Skipped (${session.routing?.decision ?? "—"})`}</p>
        </div>
        <div>
          <p className="text-slate-500">Tool result</p>
          <p className="font-medium break-all">{session.toolResult ? `${session.toolResult.toolName}: ${JSON.stringify(session.toolResult.result ?? session.toolResult.error)}` : "—"}</p>
        </div>
        <div className="col-span-2">
          <p className="text-slate-500">Final generated response</p>
          <p className="font-medium">{session.responseText ?? "—"}</p>
        </div>
        <div>
          <p className="text-slate-500">Handoff decision</p>
          <p className="font-medium">{session.handoff?.triggered ? `Triggered (${session.handoff.reason ?? "policy"})` : "Not triggered"}</p>
        </div>
        <div className="col-span-2">
          <p className="text-slate-500">Latency breakdown</p>
          <p className="font-medium">
            STT {formatMs(session.latency?.sttMs)} · Understanding {formatMs(session.latency?.understandingMs)} · Tool {formatMs(session.latency?.toolMs)} · Response {formatMs(session.latency?.responseMs)} · TTS {formatMs(session.latency?.ttsMs)} · Total {formatMs(session.latency?.totalMs)}
          </p>
        </div>
      </div>
    </section>
  );
}
