import { nodeCatalog } from "@/flow-graph/nodeCatalog";
import { FlowNodeId } from "@/types/session";

export function NodeDetailPanel({ nodeId }: { nodeId: FlowNodeId }) {
  const node = nodeCatalog.find((item) => item.id === nodeId) ?? nodeCatalog[0];

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
      </dl>
    </aside>
  );
}
