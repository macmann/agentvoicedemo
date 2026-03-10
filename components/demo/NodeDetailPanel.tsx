import { nodeCatalog } from "@/flow-graph/nodeCatalog";
import { FlowNodeId, SessionState } from "@/types/session";

export function NodeDetailPanel({ nodeId, session }: { nodeId: FlowNodeId; session: SessionState }) {
  const node = nodeCatalog.find((item) => item.id === nodeId) ?? nodeCatalog[0];
  const isDecisionNode = nodeId === "decision";
  const isUnderstandingNode = nodeId === "understanding";
  const isToolNode = nodeId === "toolExecution";

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


        {isUnderstandingNode ? (
          <>
            <div>
              <dt className="font-medium text-slate-500">Provider</dt>
              <dd>{session.understandingDiagnostics?.provider ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Model</dt>
              <dd>{session.understandingDiagnostics?.model ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Prompt type</dt>
              <dd>{session.understandingDiagnostics?.promptType ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Validation status</dt>
              <dd>{session.understandingDiagnostics?.validationStatus ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Routing threshold</dt>
              <dd>{session.policy?.thresholds.minIntentConfidence ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Raw structured output</dt>
              <dd className="break-all">{session.understandingDiagnostics?.rawOutput ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Fallback behavior</dt>
              <dd>{session.understandingDiagnostics?.fallbackBehavior ?? "—"}</dd>
            </div>
          </>
        ) : null}


        {isToolNode ? (
          <>
            <div>
              <dt className="font-medium text-slate-500">Selected tool</dt>
              <dd>{session.toolExecution?.selectedTool ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Execution mode</dt>
              <dd>{session.toolExecution?.executionMode ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Execution status</dt>
              <dd>{session.toolExecution?.executionStatus ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Execution time</dt>
              <dd>{session.toolExecution?.executionTimeMs ?? "—"}ms</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Endpoint</dt>
              <dd className="break-all">{session.toolExecution?.endpoint ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Request payload</dt>
              <dd className="break-all">{session.toolExecution ? JSON.stringify(session.toolExecution.requestPayload) : "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Response payload</dt>
              <dd className="break-all">{session.toolExecution ? JSON.stringify(session.toolExecution.responsePayload ?? session.toolExecution.errorMessage) : "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Fallback behavior</dt>
              <dd>{session.toolExecution?.fallbackBehavior ?? "—"}</dd>
            </div>
          </>
        ) : null}

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
