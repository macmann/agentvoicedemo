"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestMicrophonePermission, startMicrophoneCapture, stopMicrophoneCapture } from "@/audio/sttAdapter";
import { ArchitectureFlow } from "@/components/demo/ArchitectureFlow";
import { ControlsPanel } from "@/components/demo/ControlsPanel";
import { ExecutionPanel } from "@/components/demo/ExecutionPanel";
import { NodeDetailPanel } from "@/components/demo/NodeDetailPanel";
import { SessionSummary } from "@/components/demo/SessionSummary";
import { sampleUtterances } from "@/mock-data/utterances";
import { SimulationOptions } from "@/orchestration/simulateSession";
import { useRuntimeToolConfig } from "@/state/useRuntimeToolConfig";
import { useSessionSimulator } from "@/state/useSessionSimulator";
import { resolveToolExecutionMode, TOOL_NAMES } from "@/tools/runtimeToolConfig";
import { ToolExecutionMode, ToolName } from "@/tools/toolTypes";
import { FlowNodeId } from "@/types/session";

type RunSnapshot = {
  id: string;
  runAt: string;
  utterance: string;
  route: string;
  tool: string;
  status: string;
  totalLatencyMs: number;
};

export function VoiceAiDemoApp() {
  const [selectedNode, setSelectedNode] = useState<FlowNodeId>("stt");
  const [stepMode, setStepMode] = useState(false);
  const [forceFallback, setForceFallback] = useState(false);
  const [workflowMode, setWorkflowMode] = useState<"auto" | "workflow" | "no_workflow">("auto");
  const [toolMode, setToolMode] = useState<ToolExecutionMode>("mock");
  const [microphoneState, setMicrophoneState] = useState<"idle" | "listening" | "recognized" | "fallback">("idle");
  const [microphoneReason, setMicrophoneReason] = useState<string>();
  const [runHistory, setRunHistory] = useState<RunSnapshot[]>([]);
  const lastCapturedRun = useRef<string | null>(null);
  const capturePromise = useRef<
    Promise<{
      transcript: string;
      confidence: number;
      status: "recognized" | "fallback";
      reason?: string;
      failureType?: "permission_denied" | "recording_failure" | "empty_transcript" | "low_confidence";
      timestamps?: Array<{ startMs: number; endMs: number; text: string }>;
    }> | null
  >(null);

  const { runtimeConfig, setGlobalMode, setPerToolMode, reset: resetToolSettings } = useRuntimeToolConfig();
  const { session, nodeStates, logs, stepIndex, totalSteps, applyStep, runAll, reset, setSession, traversedEdges } = useSessionSimulator(sampleUtterances[0], runtimeConfig);

  const options: SimulationOptions = useMemo(
    () => ({ forceFallback, workflowMode, toolMode, runtimeToolConfig: runtimeConfig }),
    [forceFallback, workflowMode, toolMode, runtimeConfig]
  );
  const progressLabel = useMemo(() => `${Math.min(stepIndex, totalSteps)}/${totalSteps} steps`, [stepIndex, totalSteps]);

  const handleRun = useCallback(async () => {
    if (stepMode) {
      await applyStep(stepIndex, options);
      return;
    }

    await runAll(options);
  }, [applyStep, options, runAll, stepIndex, stepMode]);

  const handleNext = useCallback(async () => applyStep(stepIndex, options), [applyStep, options, stepIndex]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement)?.tagName)) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "enter") {
        event.preventDefault();
        void handleRun();
      }

      if (stepMode && event.key.toLowerCase() === "n" && stepIndex < totalSteps) {
        event.preventDefault();
        void handleNext();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleNext, handleRun, stepIndex, stepMode, totalSteps]);

  useEffect(() => {
    if (stepIndex < totalSteps || totalSteps === 0 || logs.length === 0) {
      return;
    }

    const signature = `${session.utterance}-${session.latency?.totalMs ?? 0}-${logs[0]?.id ?? ""}`;
    if (lastCapturedRun.current === signature) {
      return;
    }

    lastCapturedRun.current = signature;
    const snapshot: RunSnapshot = {
      id: signature,
      runAt: new Date().toLocaleString(),
      utterance: session.utterance,
      route: session.routing?.decision ?? "unknown",
      tool: session.toolExecution?.selectedTool ?? "none",
      status: session.handoff?.triggered ? "handoff" : session.toolExecution?.executionStatus ?? "completed",
      totalLatencyMs: session.latency?.totalMs ?? 0
    };

    setRunHistory((prev) => [snapshot, ...prev].slice(0, 12));
  }, [logs, session, stepIndex, totalSteps]);

  const handleUtterance = (utterance: string) => setSession((prev) => ({ ...prev, utterance }));

  const finalizeCapture = async () => {
    if (!capturePromise.current) return;
    const result = await capturePromise.current;
    capturePromise.current = null;
    setMicrophoneState(result.status);
    setMicrophoneReason(result.reason);

    if (result.transcript) {
      setSession((prev) => ({ ...prev, utterance: result.transcript, sttCapture: result }));
      return;
    }

    setSession((prev) => ({ ...prev, sttCapture: result }));
  };

  const handleStartMicrophone = async () => {
    const permission = await requestMicrophonePermission();
    if (!permission.granted) {
      setMicrophoneState("fallback");
      setMicrophoneReason(permission.reason);
      setSession((prev) => ({
        ...prev,
        sttCapture: {
          transcript: "",
          confidence: 0,
          status: "fallback",
          reason: permission.reason,
          failureType: "permission_denied"
        }
      }));
      return;
    }

    setMicrophoneState("listening");
    setMicrophoneReason(undefined);
    const capture = startMicrophoneCapture();
    capturePromise.current = capture.result;
    if (!capture.ok) await finalizeCapture();
  };

  const handleStopMicrophone = async () => {
    stopMicrophoneCapture();
    await finalizeCapture();
  };

  return (
    <main className="space-y-4">
      <header className="rounded-xl border border-slate-200 bg-white p-4">
        <h1 className="text-2xl font-bold tracking-tight">Enterprise Voice AI Support — Configuration & Monitoring Console</h1>
        <p className="mt-1 text-sm text-slate-600">Top-down workflow view plus horizontally organized operational panels for easier scanning.</p>
        <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
          <span className="rounded bg-slate-100 px-2 py-1">Progress: {progressLabel}</span>
          <span className="rounded bg-slate-100 px-2 py-1">Run mode: {stepMode ? "Step-by-step" : "Full pipeline"}</span>
          <span className="rounded bg-slate-100 px-2 py-1">Shortcut: Ctrl/Cmd + Enter</span>
          <span className="rounded bg-slate-100 px-2 py-1">Shortcut: N (step mode)</span>
        </div>
      </header>

      <section className="min-h-[730px]">
        <ArchitectureFlow selectedNode={selectedNode} onSelectNode={setSelectedNode} states={nodeStates} traversedEdges={traversedEdges} />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Runtime Configuration</h2>
            <span
              className={
                runtimeConfig.globalMode === "api"
                  ? "rounded bg-rose-100 px-2 py-1 text-xs text-rose-700"
                  : "rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-700"
              }
            >
              {runtimeConfig.globalMode === "api" ? "Using OSS API" : "Mock/local mode"}
            </span>
          </div>
          <div className="mt-2 grid gap-2">
            <label className="block">
              Global mode
              <select
                className="ml-2 rounded border border-slate-300 p-1"
                value={runtimeConfig.globalMode ?? "default"}
                onChange={(e) => setGlobalMode(e.target.value === "default" ? undefined : (e.target.value as "mock" | "api"))}
              >
                <option value="default">Code defaults</option>
                <option value="mock">Mock</option>
                <option value="api">Live API</option>
              </select>
            </label>
            <button type="button" className="rounded border border-rose-200 px-2 py-1 text-rose-700" onClick={resetToolSettings}>
              Reset tool settings
            </button>
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer">Per-tool overrides</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {TOOL_NAMES.map((tool) => (
                <label key={tool} className="flex items-center justify-between gap-2 rounded border border-slate-200 px-2 py-1 text-xs">
                  <span>{tool}</span>
                  <select
                    value={runtimeConfig.perToolMode?.[tool] ?? "default"}
                    onChange={(e) => setPerToolMode(tool, e.target.value === "default" ? undefined : (e.target.value as "mock" | "api"))}
                    className="rounded border border-slate-300 p-1"
                  >
                    <option value="default">Default</option>
                    <option value="mock">Mock</option>
                    <option value="api">API</option>
                  </select>
                </label>
              ))}
            </div>
          </details>
        </section>

        <ControlsPanel
          utterance={session.utterance}
          sampleUtterances={sampleUtterances}
          stepMode={stepMode}
          forceFallback={forceFallback}
          workflowMode={workflowMode}
          sttInputMode={session.sttInputMode ?? "text"}
          sttStreamingSimulated={session.sttStreamingSimulated ?? true}
          microphoneState={microphoneState}
          microphoneReason={microphoneReason}
          onUtteranceChange={handleUtterance}
          onStepModeChange={setStepMode}
          onForceFallbackChange={setForceFallback}
          onWorkflowModeChange={setWorkflowMode}
          onSttInputModeChange={(value) => setSession((prev) => ({ ...prev, sttInputMode: value }))}
          onSttStreamingSimulatedChange={(value) => setSession((prev) => ({ ...prev, sttStreamingSimulated: value }))}
          onStartMicrophoneCapture={handleStartMicrophone}
          onStopMicrophoneCapture={handleStopMicrophone}
          toolMode={toolMode}
          onToolModeChange={setToolMode}
          onRun={handleRun}
          onNext={handleNext}
          onReset={() => {
            setMicrophoneState("idle");
            setMicrophoneReason(undefined);
            reset(session.utterance);
          }}
          nextDisabled={stepIndex >= totalSteps}
        />

        <NodeDetailPanel nodeId={selectedNode} session={session} />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <SessionSummary session={session} />

        <section className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
          <p className="font-semibold">Tool execution monitor</p>
          <p>Workflow: {session.routing?.workflowName ?? "-"}</p>
          <p>Tool: {session.toolExecution?.selectedTool ?? "-"}</p>
          <p>
            Mode: {session.toolExecution?.executionMode ?? (session.toolExecution?.selectedTool ? resolveToolExecutionMode(session.toolExecution.selectedTool as ToolName, runtimeConfig) : "-")}
          </p>
          <p>Endpoint: {session.toolExecution?.endpoint ?? "-"}</p>
          <p>Status: {session.toolExecution?.executionStatus ?? "-"}</p>
          <p>Latency: {session.toolExecution?.executionTimeMs ?? 0} ms</p>
          <p>Fallback: {String(session.toolExecution?.fallbackActivated ?? false)}</p>
          <p className="mt-1">Request</p>
          <pre className="overflow-x-auto rounded bg-slate-50 p-2">{JSON.stringify(session.toolExecution?.requestPayload ?? {}, null, 2)}</pre>
          <p className="mt-1">Raw response</p>
          <pre className="overflow-x-auto rounded bg-slate-50 p-2">{JSON.stringify(session.toolExecution?.rawResponsePayload ?? {}, null, 2)}</pre>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
          <p className="font-semibold">Past test runs</p>
          <div className="mt-2 max-h-72 space-y-2 overflow-auto">
            {runHistory.length === 0 ? (
              <p className="text-slate-500">No completed tests yet.</p>
            ) : (
              runHistory.map((run) => (
                <div key={run.id} className="rounded border border-slate-200 p-2">
                  <p className="font-medium text-slate-700">{run.runAt}</p>
                  <p className="text-slate-600">Utterance: {run.utterance}</p>
                  <p className="text-slate-600">Route: {run.route} • Tool: {run.tool}</p>
                  <p className="text-slate-600">Status: {run.status} • Total: {run.totalLatencyMs} ms</p>
                </div>
              ))
            )}
          </div>
        </section>
      </section>

      <ExecutionPanel logs={logs} session={session} />
    </main>
  );
}
