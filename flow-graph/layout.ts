import { FlowNodeId } from "@/types/session";

export const nodePositions: Record<FlowNodeId, { x: number; y: number }> = {
  stt: { x: 340, y: 20 },
  understanding: { x: 340, y: 130 },
  decision: { x: 340, y: 240 },
  toolExecution: { x: 340, y: 350 },
  responseGeneration: { x: 340, y: 460 },
  tts: { x: 340, y: 570 },
  handoff: { x: 650, y: 350 }
};

export const edges: Array<{ from: FlowNodeId; to: FlowNodeId; label?: string }> = [
  { from: "stt", to: "understanding", label: "transcript" },
  { from: "understanding", to: "decision", label: "intent + slots" },
  { from: "decision", to: "toolExecution", label: "workflow path" },
  { from: "toolExecution", to: "responseGeneration", label: "grounded result" },
  { from: "responseGeneration", to: "tts", label: "voice response" },
  { from: "decision", to: "handoff", label: "escalate" },
  { from: "toolExecution", to: "handoff", label: "tool failure" }
];
