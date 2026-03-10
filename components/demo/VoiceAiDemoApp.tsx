"use client";

import { useState } from "react";
import { ArchitectureFlow } from "@/components/demo/ArchitectureFlow";
import { ControlsPanel } from "@/components/demo/ControlsPanel";
import { ExecutionPanel } from "@/components/demo/ExecutionPanel";
import { NodeDetailPanel } from "@/components/demo/NodeDetailPanel";
import { SessionSummary } from "@/components/demo/SessionSummary";
import { sampleUtterances } from "@/mock-data/utterances";
import { SimulationOptions } from "@/orchestration/simulateSession";
import { useSessionSimulator } from "@/state/useSessionSimulator";
import { FlowNodeId } from "@/types/session";

export function VoiceAiDemoApp() {
  const [selectedNode, setSelectedNode] = useState<FlowNodeId>("stt");
  const [stepMode, setStepMode] = useState(false);
  const [forceFallback, setForceFallback] = useState(false);
  const [workflowMode, setWorkflowMode] = useState<"auto" | "workflow" | "no_workflow">("auto");
  const { session, nodeStates, logs, stepIndex, totalSteps, applyStep, runAll, reset, setSession, traversedEdges } = useSessionSimulator(sampleUtterances[0]);

  const options: SimulationOptions = { forceFallback, workflowMode };

  const handleRun = async () => {
    if (stepMode) {
      await applyStep(stepIndex, options);
      return;
    }

    await runAll(options);
  };

  const handleNext = async () => applyStep(stepIndex, options);

  const handleUtterance = (utterance: string) => {
    setSession((prev) => ({ ...prev, utterance }));
  };

  return (
    <main className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Enterprise Voice AI Support — MVP Architecture Simulator</h1>
        <p className="text-sm text-slate-600">
          Demo goals: low latency voice loop, deterministic workflow control, natural conversational behavior, and graceful handoff with inspectable state.
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-[320px_1fr_340px]">
        <div className="space-y-4">
          <ControlsPanel
            utterance={session.utterance}
            sampleUtterances={sampleUtterances}
            stepMode={stepMode}
            forceFallback={forceFallback}
            workflowMode={workflowMode}
            onUtteranceChange={handleUtterance}
            onStepModeChange={setStepMode}
            onForceFallbackChange={setForceFallback}
            onWorkflowModeChange={setWorkflowMode}
            onRun={handleRun}
            onNext={handleNext}
            onReset={() => reset(session.utterance)}
            nextDisabled={stepIndex >= totalSteps}
          />
          <SessionSummary session={session} />
        </div>

        <div className="h-[420px]">
          <ArchitectureFlow selectedNode={selectedNode} onSelectNode={setSelectedNode} states={nodeStates} traversedEdges={traversedEdges} />
        </div>

        <NodeDetailPanel nodeId={selectedNode} />
      </div>

      <ExecutionPanel logs={logs} session={session} />
    </main>
  );
}
