import { synthesizeMockSpeech } from "@/audio/mockAudio";
import { executeMockTool } from "@/tools/mockTools";
import { generateMockResponse } from "@/llm-adapters/mockLlm";
import { runDeterministicHandoffPolicy, runDeterministicRoutingPolicy, runDeterministicUnderstandingPolicy } from "@/orchestration/deterministicPolicy";
import { FlowNodeId, SessionState } from "@/types/session";
import { randomBetween } from "@/utils/format";

export interface SimulationOptions {
  forceFallback: boolean;
  workflowMode: "auto" | "workflow" | "no_workflow";
}

export interface SimulationStep {
  id: FlowNodeId;
  label: string;
  run: (state: SessionState) => SessionState;
}

export function buildSimulationSteps(options: SimulationOptions): SimulationStep[] {
  return [
    {
      id: "stt",
      label: "Speech recognized",
      run: (state) => {
        const sttMs = randomBetween(300, 700);
        return {
          ...state,
          transcript: state.utterance,
          latency: { ...state.latency, sttMs }
        };
      }
    },
    {
      id: "understanding",
      label: "Intent and entities extracted",
      run: (state) => {
        const understandingMs = randomBetween(200, 600);

        return {
          ...state,
          understanding: runDeterministicUnderstandingPolicy(state.utterance, { workflowMode: options.workflowMode }),
          latency: { ...state.latency, understandingMs }
        };
      }
    },
    {
      id: "decision",
      label: "Route selected",
      run: (state) => {
        return {
          ...state,
          routing: runDeterministicRoutingPolicy(state.understanding)
        };
      }
    },
    {
      id: "toolExecution",
      label: "Tool execution completed",
      run: (state) => {
        if (state.routing?.decision !== "workflow") {
          return {
            ...state,
            toolResult: {
              toolName: "none",
              status: "success",
              result: { skipped: true, reason: `routing=${state.routing?.decision}` }
            },
            latency: { ...state.latency, toolMs: 0 }
          };
        }

        const toolMs = randomBetween(100, 1200);
        return {
          ...state,
          toolResult: executeMockTool(state, options.forceFallback),
          latency: { ...state.latency, toolMs }
        };
      }
    },
    {
      id: "responseGeneration",
      label: "LLM response drafted",
      run: (state) => {
        const responseMs = randomBetween(250, 700);
        return {
          ...state,
          responseText: generateMockResponse(state),
          handoff: runDeterministicHandoffPolicy(state),
          latency: { ...state.latency, responseMs }
        };
      }
    },
    {
      id: "tts",
      label: "Speech synthesized",
      run: (state) => {
        const ttsMs = randomBetween(150, 400);
        synthesizeMockSpeech(state.responseText ?? "");
        const totalMs = (state.latency?.sttMs ?? 0) + (state.latency?.understandingMs ?? 0) + (state.latency?.toolMs ?? 0) + (state.latency?.responseMs ?? 0) + ttsMs;
        return {
          ...state,
          latency: { ...state.latency, ttsMs, totalMs }
        };
      }
    },
    {
      id: "handoff",
      label: "Handoff evaluated",
      run: (state) => ({
        ...state,
        handoff: {
          ...state.handoff,
          triggered: state.handoff?.triggered ?? false,
          summary: state.handoff?.triggered
            ? state.handoff.summary ?? "Session packaged for human agent transfer."
            : "No handoff required for this interaction."
        }
      })
    }
  ];
}
