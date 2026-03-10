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
  const [traversedEdges, setTraversedEdges] = useState<string[]>([]);

  const activeSteps = useMemo(() => buildSimulationSteps({ forceFallback: false, workflowMode: "auto" }), []);

  const reset = (utterance: string) => {
    setSession({ utterance });
    setNodeStates(defaultNodeStates);
    setLogs([]);
    setStepIndex(0);
    setRunning(false);
    setTraversedEdges([]);
  };

  const getLatencyForStep = (id: FlowNodeId, next: SessionState) => {
    if (id === "stt") return next.latency?.sttMs ?? 0;
    if (id === "understanding") return next.latency?.understandingMs ?? 0;
    if (id === "toolExecution") return next.latency?.toolMs ?? 0;
    if (id === "responseGeneration") return next.latency?.responseMs ?? 0;
    if (id === "tts") return next.latency?.ttsMs ?? 0;
    return 120;
  };

  const applyStep = async (index: number, options: SimulationOptions) => {
    const steps = buildSimulationSteps(options);
    const step = steps[index];

    if (!step) {
      setRunning(false);
      return;
    }

    if (step.id === "toolExecution" && session.routing?.decision === "clarify") {
      setNodeStates((prev) => ({ ...prev, decision: "fallback", toolExecution: "idle" }));
      setLogs((logPrev) => [
        {
          id: `${Date.now()}-clarify-stop`,
          stage: "Routing clarify stop",
          message: `Stopped before tool execution: ${session.routing?.clarificationReason ?? "clarification requested"}`,
          timestamp: new Date().toLocaleTimeString()
        },
        ...logPrev
      ]);
      setRunning(false);
      return;
    }

    setRunning(true);
    setNodeStates((prev) => ({ ...prev, [step.id]: "active" }));

    if (index > 0) {
      const prevId = steps[index - 1]?.id;
      if (prevId) {
        setTraversedEdges((prev) => {
          const next = `${prevId}->${step.id}`;
          return prev.includes(next) ? prev : [...prev, next];
        });
      }
    }

    let nextSession: SessionState | undefined;

    setSession((prev) => {
      const next = step.run(prev);
      nextSession = next;
      setNodeStates((nodePrev) => ({
        ...nodePrev,
        [step.id]:
          next.handoff?.triggered && step.id === "handoff"
            ? "handoff"
            : next.toolResult?.status === "failure" && step.id === "toolExecution"
              ? "fallback"
              : next.routing?.decision === "clarify" && step.id === "decision"
                ? "fallback"
                : "success"
      }));
      setLogs((logPrev) => [
        {
          id: `${Date.now()}-${step.id}`,
          stage: step.label,
          message:
            step.id === "decision" && next.routing?.decision === "clarify"
              ? `decision completed: clarify (${next.routing.clarificationReason})`
              : `${step.id} completed`,
          timestamp: new Date().toLocaleTimeString()
        },
        ...logPrev
      ]);
      return next;
    });

    if (nextSession) {
      await new Promise((resolve) => setTimeout(resolve, Math.max(60, getLatencyForStep(step.id, nextSession!))));
    }

    setStepIndex(index + 1);
    setRunning(false);
  };

  const runAll = async (options: SimulationOptions) => {
    for (let i = stepIndex; i < activeSteps.length; i += 1) {
      await applyStep(i, options);
    }
  };

  return {
    session,
    nodeStates,
    logs,
    stepIndex,
    running,
    traversedEdges,
    totalSteps: activeSteps.length,
    applyStep,
    runAll,
    reset,
    setSession
  };
}
