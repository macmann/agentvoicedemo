"use client";

import { useMemo, useState } from "react";
import { buildSimulationSteps, SimulationOptions } from "@/orchestration/simulateSession";
import { DemoLogEvent, FlowNodeId, NodeVisualState, SessionState } from "@/types/session";

const defaultNodeStates: Record<FlowNodeId, NodeVisualState> = {
  stt: "idle",
  understanding: "idle",
  decision: "idle",
  toolExecution: "idle",
  responseGeneration: "idle",
  tts: "idle",
  handoff: "idle"
};

export function useSessionSimulator(initialUtterance: string) {
  const [session, setSession] = useState<SessionState>({ utterance: initialUtterance });
  const [nodeStates, setNodeStates] = useState(defaultNodeStates);
  const [logs, setLogs] = useState<DemoLogEvent[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [running, setRunning] = useState(false);

  const activeSteps = useMemo(() => buildSimulationSteps({ forceFallback: false, workflowMode: "auto" }), []);

  const reset = (utterance: string) => {
    setSession({ utterance });
    setNodeStates(defaultNodeStates);
    setLogs([]);
    setStepIndex(0);
    setRunning(false);
  };

  const applyStep = (index: number, options: SimulationOptions) => {
    const steps = buildSimulationSteps(options);
    const step = steps[index];

    if (!step) {
      setRunning(false);
      return;
    }

    setRunning(true);
    setNodeStates((prev) => ({ ...prev, [step.id]: "active" }));

    setSession((prev) => {
      const next = step.run(prev);
      setNodeStates((nodePrev) => ({
        ...nodePrev,
        [step.id]: next.handoff?.triggered && step.id === "handoff" ? "handoff" : next.toolResult?.status === "failure" && step.id === "toolExecution" ? "fallback" : "success"
      }));
      setLogs((logPrev) => [
        {
          id: `${Date.now()}-${step.id}`,
          stage: step.label,
          message: `${step.id} completed`,
          timestamp: new Date().toLocaleTimeString()
        },
        ...logPrev
      ]);
      return next;
    });

    setStepIndex(index + 1);
    setRunning(false);
  };

  return {
    session,
    nodeStates,
    logs,
    stepIndex,
    running,
    totalSteps: activeSteps.length,
    applyStep,
    reset,
    setSession
  };
}
