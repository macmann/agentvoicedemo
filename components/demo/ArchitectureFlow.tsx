"use client";

import { edges, nodePositions } from "@/flow-graph/layout";
import { nodeCatalog } from "@/flow-graph/nodeCatalog";
import { cn } from "@/lib/utils/cn";
import { FlowNodeId, NodeVisualState } from "@/types/session";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 74;

const nodeStateClass: Record<NodeVisualState, string> = {
  idle: "border-slate-300 bg-white text-slate-700",
  active: "border-indigo-500 bg-indigo-50 text-indigo-700 shadow-lg shadow-indigo-200",
  success: "border-emerald-500 bg-emerald-50 text-emerald-700",
  fallback: "border-amber-500 bg-amber-50 text-amber-700",
  failure: "border-red-500 bg-red-50 text-red-700",
  handoff: "border-rose-600 bg-rose-100 text-rose-800"
};

interface Props {
  selectedNode: FlowNodeId;
  onSelectNode: (id: FlowNodeId) => void;
  states: Record<FlowNodeId, NodeVisualState>;
  traversedEdges: string[];
}

function edgeStroke(traversed: boolean, to: FlowNodeId) {
  if (!traversed) return "#94a3b8";
  if (to === "handoff") return "#e11d48";
  return "#4f46e5";
}

export function ArchitectureFlow({ selectedNode, onSelectNode, states, traversedEdges }: Props) {
  return (
    <div className="h-full rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex flex-wrap gap-2 text-xs text-slate-600">
        <span className="rounded bg-white px-2 py-1">Top-down workflow: STT → Understanding → Decision → Tooling → Response → TTS</span>
        <span className="rounded bg-white px-2 py-1">Escalation branch: Decision / Tooling → Human handoff</span>
      </div>

      <div className="relative h-[680px] w-full overflow-hidden rounded-lg border border-slate-200 bg-white/60">
        <svg className="absolute left-0 top-0 h-full w-full">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
            </marker>
          </defs>

          {edges.map((edge) => {
            const from = nodePositions[edge.from];
            const to = nodePositions[edge.to];
            const edgeId = `${edge.from}->${edge.to}`;
            const traversed = traversedEdges.includes(edgeId);
            const stroke = edgeStroke(traversed, edge.to);
            const fromX = from.x + NODE_WIDTH / 2;
            const fromY = from.y + NODE_HEIGHT;
            const toX = to.x + NODE_WIDTH / 2;
            const toY = to.y;
            const isBranch = Math.abs(fromX - toX) > 20;
            const d = isBranch
              ? `M ${fromX} ${fromY} C ${fromX + 60} ${fromY + 8}, ${toX - 60} ${toY - 8}, ${toX} ${toY}`
              : `M ${fromX} ${fromY} L ${toX} ${toY}`;

            return (
              <g key={edgeId}>
                <path d={d} fill="none" stroke={stroke} strokeWidth="2.5" markerEnd="url(#arrow)" />
                {edge.label ? (
                  <text
                    x={(fromX + toX) / 2 + (isBranch ? 12 : 56)}
                    y={(fromY + toY) / 2 - (isBranch ? 8 : 0)}
                    textAnchor="middle"
                    className="fill-slate-500 text-[11px]"
                  >
                    {edge.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>

        {nodeCatalog.map((node) => (
          <button
            key={node.id}
            type="button"
            onClick={() => onSelectNode(node.id)}
            className={cn(
              "absolute rounded-xl border-2 p-3 text-left text-sm transition",
              nodeStateClass[states[node.id]],
              selectedNode === node.id && "ring-2 ring-offset-2 ring-indigo-500"
            )}
            style={{ left: nodePositions[node.id].x, top: nodePositions[node.id].y, width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
          >
            <p className="font-semibold">{node.label}</p>
            <p className="mt-1 text-xs opacity-80">State: {states[node.id]}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
