"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArchitectureFlow } from "@/components/demo/ArchitectureFlow";
import { ControlsPanel } from "@/components/demo/ControlsPanel";
import { ExecutionPanel } from "@/components/demo/ExecutionPanel";
import { NodeDetailPanel } from "@/components/demo/NodeDetailPanel";
import { SessionSummary } from "@/components/demo/SessionSummary";
import { requestMicrophonePermission, startMicrophoneCapture, stopMicrophoneCapture } from "@/audio/sttAdapter";
import { sampleUtterances } from "@/mock-data/utterances";
import { SimulationOptions } from "@/orchestration/simulateSession";
import { ToolExecutionMode } from "@/tools/toolTypes";
import { useSessionSimulator } from "@/state/useSessionSimulator";
import { FlowNodeId } from "@/types/session";

export function VoiceAiDemoApp() {
  const [selectedNode, setSelectedNode] = useState<FlowNodeId>("stt");
  const [stepMode, setStepMode] = useState(false);
  const [forceFallback, setForceFallback] = useState(false);
  const [workflowMode, setWorkflowMode] = useState<"auto" | "workflow" | "no_workflow">("auto");
  const [toolMode, setToolMode] = useState<ToolExecutionMode>("mock");
  const [microphoneState, setMicrophoneState] = useState<"idle" | "listening" | "recognized" | "fallback">("idle");
  const [microphoneReason, setMicrophoneReason] = useState<string>();
  const capturePromise = useRef<Promise<{ transcript: string; confidence: number; status: "recognized" | "fallback"; reason?: string; failureType?: "permission_denied" | "recording_failure" | "empty_transcript" | "low_confidence"; timestamps?: Array<{ startMs: number; endMs: number; text: string }>; }> | null>(null);
  const { session, nodeStates, logs, stepIndex, totalSteps, applyStep, runAll, reset, setSession, traversedEdges } = useSessionSimulator(sampleUtterances[0]);

  const options: SimulationOptions = useMemo(() => ({ forceFallback, workflowMode, toolMode }), [forceFallback, workflowMode, toolMode]);
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
      if ((event.target as HTMLElement)?.tagName === "INPUT" || (event.target as HTMLElement)?.tagName === "TEXTAREA" || (event.target as HTMLElement)?.tagName === "SELECT") {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "enter") {
        event.preventDefault();
        void handleRun();
      }

      if (stepMode && event.key.toLowerCase() === "n") {
        event.preventDefault();
        if (stepIndex < totalSteps) {
          void handleNext();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleNext, handleRun, stepIndex, stepMode, totalSteps]);

  const handleUtterance = (utterance: string) => {
    setSession((prev) => ({ ...prev, utterance }));
  };

  const finalizeCapture = async () => {
    if (!capturePromise.current) return;
    const result = await capturePromise.current;
    capturePromise.current = null;
    setMicrophoneState(result.status);
    setMicrophoneReason(result.reason);
    if (result.transcript) {
      setSession((prev) => ({
        ...prev,
        utterance: result.transcript,
        sttCapture: result
      }));
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
    if (!capture.ok) {
      await finalizeCapture();
    }
  };

  const handleStopMicrophone = async () => {
    stopMicrophoneCapture();
    await finalizeCapture();
  };

  return (
    <main className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Enterprise Voice AI Support — MVP Architecture Simulator</h1>
        <p className="text-sm text-slate-600">
          Demo goals: low latency voice loop, deterministic workflow control, natural conversational behavior, and graceful handoff with inspectable state.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="rounded bg-slate-100 px-2 py-1">Progress: {progressLabel}</span>
          <span className="rounded bg-slate-100 px-2 py-1">Shortcut: Ctrl/Cmd + Enter = run</span>
          <span className="rounded bg-slate-100 px-2 py-1">Shortcut: N = next step (step mode)</span>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[320px_1fr_340px]">
        <div className="space-y-4">
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
          <SessionSummary session={session} />
        </div>

        <div className="h-[420px]">
          <ArchitectureFlow selectedNode={selectedNode} onSelectNode={setSelectedNode} states={nodeStates} traversedEdges={traversedEdges} />
        </div>

        <NodeDetailPanel nodeId={selectedNode} session={session} />
      </div>

      <ExecutionPanel logs={logs} session={session} />
    </main>
  );
}
