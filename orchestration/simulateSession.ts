import { synthesizeMockSpeech } from "@/audio/mockAudio";
import { executeMockTool } from "@/tools/mockTools";
import { generateMockResponse } from "@/llm-adapters/mockLlm";
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
        const sttMs = randomBetween(120, 240);
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
        const utterance = state.utterance.toLowerCase();
        const wantsHuman = utterance.includes("human");
        const frustrated = utterance.includes("frustrating");
        const workflowRequired =
          options.workflowMode === "workflow" ||
          (options.workflowMode === "auto" && (utterance.includes("outage") || utterance.includes("reschedule")));
        const understandingMs = randomBetween(90, 170);

        return {
          ...state,
          understanding: {
            intent: wantsHuman ? "human_handoff_request" : workflowRequired ? "service_task" : "general_support",
            intentConfidence: wantsHuman ? 0.97 : 0.84,
            entities: { utteranceType: workflowRequired ? "actionable" : "informational" },
            sentiment: frustrated ? "negative" : "neutral",
            empathyNeeded: frustrated,
            workflowRequired,
            recommendedWorkflow: workflowRequired ? "network_or_appointment_workflow" : undefined,
            handoffRecommended: wantsHuman || frustrated,
            reason: wantsHuman ? "Explicit user request" : frustrated ? "Emotional escalation" : undefined
          },
          latency: { ...state.latency, understandingMs }
        };
      }
    },
    {
      id: "decision",
      label: "Route selected",
      run: (state) => {
        const decision = state.understanding?.handoffRecommended
          ? "handoff"
          : state.understanding?.workflowRequired
            ? "workflow"
            : "no_workflow";
        return {
          ...state,
          routing: {
            decision,
            workflowName: decision === "workflow" ? "network_or_appointment_workflow" : undefined
          }
        };
      }
    },
    {
      id: "toolExecution",
      label: "Tool execution completed",
      run: (state) => {
        const toolMs = randomBetween(180, 600);
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
        const responseMs = randomBetween(180, 320);
        return {
          ...state,
          responseText: generateMockResponse(state),
          handoff: {
            triggered: state.routing?.decision === "handoff" || state.toolResult?.status === "failure",
            reason:
              state.routing?.decision === "handoff"
                ? state.understanding?.reason
                : state.toolResult?.status === "failure"
                  ? state.toolResult.error
                  : undefined,
            summary: `Intent=${state.understanding?.intent}; Decision=${state.routing?.decision}; Tool=${state.toolResult?.toolName}`
          },
          latency: { ...state.latency, responseMs }
        };
      }
    },
    {
      id: "tts",
      label: "Speech synthesized",
      run: (state) => {
        const ttsMs = randomBetween(100, 200);
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
