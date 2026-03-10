"use client";

import { edges, nodePositions } from "@/flow-graph/layout";
import { nodeCatalog } from "@/flow-graph/nodeCatalog";
import { FlowNodeId, NodeVisualState } from "@/types/session";
import { cn } from "@/lib/utils/cn";

const nodeStateClass: Record<NodeVisualState, string> = {
  idle: "border-slate-300 bg-white text-slate-700",
  active: "border-blue-500 bg-blue-50 text-blue-700 shadow-lg shadow-blue-200 animate-pulse",
  success: "border-emerald-500 bg-emerald-50 text-emerald-700",
  fallback: "border-amber-500 bg-amber-50 text-amber-700",
  failure: "border-red-500 bg-red-50 text-red-700",
  handoff: "border-red-600 bg-red-100 text-red-800"
};

interface Props {
  selectedNode: FlowNodeId;
  onSelectNode: (id: FlowNodeId) => void;
  states: Record<FlowNodeId, NodeVisualState>;
  traversedEdges: string[];
}

export function ArchitectureFlow({ selectedNode, onSelectNode, states, traversedEdges }: Props) {
  return (
    <div className="h-full overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="relative h-[360px] min-w-[1500px]">
        <svg className="absolute left-0 top-0 h-full w-full">
          {edges.map((edge) => {
            const from = nodePositions[edge.from];
            const to = nodePositions[edge.to];
            const edgeId = `${edge.from}->${edge.to}`;
            const traversed = traversedEdges.includes(edgeId);
            const handoffPath = traversed && edge.to === "handoff";
            return (
              <line
                key={edgeId}
                x1={from.x + 190}
                y1={from.y + 35}
                x2={to.x}
                y2={to.y + 35}
                stroke={handoffPath ? "#dc2626" : traversed ? "#4f46e5" : "#94a3b8"}
                strokeWidth="2"
                markerEnd="url(#arrow)"
              />
            );
          })}
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
            </marker>
          </defs>
        </svg>

        {nodeCatalog.map((node) => (
          <button
            key={node.id}
            type="button"
            onClick={() => onSelectNode(node.id)}
            className={cn(
              "absolute w-[190px] rounded-xl border-2 p-3 text-left text-sm transition",
              nodeStateClass[states[node.id]],
              selectedNode === node.id && "ring-2 ring-offset-2 ring-indigo-500"
            )}
            style={{ left: nodePositions[node.id].x, top: nodePositions[node.id].y }}
          >
            <p className="font-semibold">{node.label}</p>
            <p className="mt-1 text-xs opacity-80">{states[node.id]}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
