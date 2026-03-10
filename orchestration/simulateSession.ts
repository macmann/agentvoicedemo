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

function inferScenario(utterance: string) {
  const text = utterance.toLowerCase();
  if (text.includes("speak to a human") || text.includes("human")) return "human";
  if (text.includes("sick") || text.includes("reschedule") || text.includes("technician")) return "reschedule";
  if (text.includes("outage")) return "outage_check";
  if (text.includes("internet is down") || text.includes("internet")) return "internet_down";
  if (text.includes("router") && text.includes("blinking red")) return "router_red";
  if (text.includes("frustrating")) return "frustrated";
  return "general";
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
        const utterance = state.utterance.toLowerCase();
        const scenario = inferScenario(utterance);
        const wantsHuman = scenario === "human";
        const frustrated = scenario === "frustrated";
        const workflowRequired =
          options.workflowMode === "workflow" ||
          (options.workflowMode === "auto" && (utterance.includes("outage") || utterance.includes("reschedule")));
        const lowConfidence = scenario === "router_red";
        const understandingMs = randomBetween(200, 600);
        const entities: Record<string, string> = { issueType: "general_support" };
        if (scenario === "reschedule") {
          entities.issueType = "appointment";
          entities.action = "reschedule";
          entities.reason = "sick";
        } else if (scenario === "outage_check" || scenario === "internet_down" || scenario === "router_red") {
          entities.issueType = "connectivity";
          entities.symptom = scenario === "router_red" ? "router_blinking_red" : "internet_down";
        }

        return {
          ...state,
          understanding: {
            intent: wantsHuman ? "human_handoff_request" : workflowRequired ? "service_task" : lowConfidence ? "connectivity_issue" : "general_support",
            intentConfidence: wantsHuman ? 0.97 : lowConfidence ? 0.62 : 0.86,
            entities,
            sentiment: frustrated ? "negative" : "neutral",
            empathyNeeded: frustrated,
            workflowRequired,
            recommendedWorkflow: workflowRequired ? "network_or_appointment_workflow" : undefined,
            handoffRecommended: wantsHuman || frustrated,
            reason: wantsHuman ? "Explicit user request" : frustrated ? "Emotional escalation" : lowConfidence ? "Low confidence parse" : undefined
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
          : (state.understanding?.intentConfidence ?? 0) < 0.7
            ? "clarify"
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
