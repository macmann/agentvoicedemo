import { nodeCatalog } from "@/flow-graph/nodeCatalog";
import { FlowNodeId, SessionState } from "@/types/session";

export function NodeDetailPanel({ nodeId, session }: { nodeId: FlowNodeId; session: SessionState }) {
  const node = nodeCatalog.find((item) => item.id === nodeId) ?? nodeCatalog[0];
  const isDecisionNode = nodeId === "decision";
  const isSttNode = nodeId === "stt";
  const isUnderstandingNode = nodeId === "understanding";
  const isToolNode = nodeId === "toolExecution";
  const isResponseNode = nodeId === "responseGeneration";
  const isTtsNode = nodeId === "tts";

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

        {isSttNode ? (
          <>
            <div>
              <dt className="font-medium text-slate-500">Input mode</dt>
              <dd>{session.stt?.inputMode ?? session.sttInputMode ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Provider</dt>
              <dd>{session.stt?.provider ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Streaming indicator</dt>
              <dd>{session.stt?.streaming ? "simulated_streaming:on" : "simulated_streaming:off"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Language</dt>
              <dd>{session.stt?.language ?? "en-US"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Model</dt>
              <dd>{session.stt?.model ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Recognition status</dt>
              <dd>{session.stt?.status ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Confidence</dt>
              <dd>{session.stt?.confidence ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Confidence threshold</dt>
              <dd>{session.policy?.thresholds.minIntentConfidence ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Transcript output</dt>
              <dd>{session.stt?.transcript ?? session.transcript ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Fallback reason</dt>
              <dd>{session.stt?.reason ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Fallback behavior</dt>
              <dd>{session.stt?.fallbackBehavior ?? "—"}</dd>
            </div>
          </>
        ) : null}


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
              <dd className="whitespace-pre-wrap break-words">{session.understandingDiagnostics?.rawOutput ?? "—"}</dd>
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
              <dd className="whitespace-pre-wrap break-words">{session.toolExecution ? JSON.stringify(session.toolExecution.requestPayload, null, 2) : "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Raw response payload</dt>
              <dd className="whitespace-pre-wrap break-words">{session.toolExecution ? JSON.stringify(session.toolExecution.rawResponsePayload ?? session.toolExecution.errorMessage, null, 2) : "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Normalized result</dt>
              <dd className="whitespace-pre-wrap break-words">{session.toolExecution ? JSON.stringify(session.toolExecution.normalizedResult ?? {}, null, 2) : "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Fallback activated</dt>
              <dd>{String(session.toolExecution?.fallbackActivated ?? false)}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Fallback behavior</dt>
              <dd>{session.toolExecution?.fallbackBehavior ?? "—"}</dd>
            </div>
          </>
        ) : null}



        {isResponseNode ? (
          <>
            <div>
              <dt className="font-medium text-slate-500">Provider</dt>
              <dd>{session.responseGeneration?.provider ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Model</dt>
              <dd>{session.responseGeneration?.model ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Tone settings</dt>
              <dd className="break-all">{session.responseGeneration?.toneSettings.join(", ") ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Max response length</dt>
              <dd>{session.responseGeneration?.maxResponseLength ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Structured input context</dt>
              <dd className="whitespace-pre-wrap break-words">{session.responseGeneration ? JSON.stringify(session.responseGeneration.structuredContext, null, 2) : "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Final response text</dt>
              <dd>{session.responseGeneration?.finalResponseText ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Guardrail note</dt>
              <dd>{session.responseGeneration?.guardrailNote ?? "—"}</dd>
            </div>
          </>
        ) : null}

        {isTtsNode ? (
          <>
            <div>
              <dt className="font-medium text-slate-500">Provider</dt>
              <dd>{session.tts?.provider ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Model</dt>
              <dd>{session.tts?.model ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Voice settings</dt>
              <dd className="whitespace-pre-wrap break-words">{session.tts ? JSON.stringify(session.tts.settings, null, 2) : "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">First-audio latency</dt>
              <dd>{session.tts?.firstAudioLatencyMs ?? "—"}ms</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Audio status</dt>
              <dd>{session.tts?.status ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Fallback reason</dt>
              <dd>{session.tts?.reason ?? "—"}</dd>
            </div>
          </>
        ) : null}

        {isDecisionNode ? (
          <>
            <div>
              <dt className="font-medium text-slate-500">Routing config</dt>
              <dd className="whitespace-pre-wrap break-words">{session.policy?.routingConfig ? JSON.stringify(session.policy.routingConfig, null, 2) : "—"}</dd>
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
              <dd className="whitespace-pre-wrap break-words">{session.policy?.counters ? JSON.stringify(session.policy.counters, null, 2) : "—"}</dd>
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
