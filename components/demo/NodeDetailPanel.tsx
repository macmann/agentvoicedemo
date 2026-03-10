import { nodeCatalog } from "@/flow-graph/nodeCatalog";
import { FlowNodeId, SessionState } from "@/types/session";

export function NodeDetailPanel({ nodeId, session }: { nodeId: FlowNodeId; session: SessionState }) {
  const node = nodeCatalog.find((item) => item.id === nodeId) ?? nodeCatalog[0];
  const isDecisionNode = nodeId === "decision";

  return (
    <aside className="h-full rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-lg font-semibold">{node.label}</h3>
      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="font-medium text-slate-500">Purpose</dt>
          <dd>{node.purpose}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Input</dt>
          <dd>{node.input}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Output</dt>
          <dd>{node.output}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Parameters</dt>
          <dd className="mt-1 flex flex-wrap gap-2">
            {node.parameters.map((param) => (
              <span key={param} className="rounded bg-slate-100 px-2 py-1 text-xs">
                {param}
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Latency Estimate</dt>
          <dd>{node.latencyEstimate}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Fallback Behavior</dt>
          <dd>{node.fallbackBehavior}</dd>
        </div>

        {isDecisionNode ? (
          <>
            <div>
              <dt className="font-medium text-slate-500">Routing config</dt>
              <dd className="break-all">{session.policy?.routingConfig ? JSON.stringify(session.policy.routingConfig) : "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Selected rule</dt>
              <dd>{session.routing?.selectedRule ?? session.policy?.selectedRule ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Confidence threshold</dt>
              <dd>{session.policy?.confidenceThreshold ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Handoff rule</dt>
              <dd>{session.policy?.handoffRule ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Retry counts</dt>
              <dd className="break-all">{session.policy?.counters ? JSON.stringify(session.policy.counters) : "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Why this path was chosen</dt>
              <dd>{session.routing?.whyChosen ?? session.policy?.whyChosen ?? "—"}</dd>
            </div>
          </>
        ) : null}
      </dl>
    </aside>
  );
}
