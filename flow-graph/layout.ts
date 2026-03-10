import { FlowNodeId } from "@/types/session";

export const nodePositions: Record<FlowNodeId, { x: number; y: number }> = {
  stt: { x: 40, y: 80 },
  understanding: { x: 300, y: 80 },
  decision: { x: 560, y: 80 },
  toolExecution: { x: 820, y: 80 },
  responseGeneration: { x: 1080, y: 80 },
  tts: { x: 1340, y: 80 },
  handoff: { x: 820, y: 250 }
};

export const edges: Array<{ from: FlowNodeId; to: FlowNodeId }> = [
  { from: "stt", to: "understanding" },
  { from: "understanding", to: "decision" },
  { from: "decision", to: "toolExecution" },
  { from: "toolExecution", to: "responseGeneration" },
  { from: "responseGeneration", to: "tts" },
  { from: "decision", to: "handoff" },
  { from: "toolExecution", to: "handoff" }
];
