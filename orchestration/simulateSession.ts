import { synthesizeMockSpeech } from "@/audio/mockAudio";
import { generateMockResponse } from "@/llm-adapters/mockLlm";
import { runDeterministicHandoffPolicy, runDeterministicRoutingPolicy, runDeterministicUnderstandingPolicy } from "@/orchestration/deterministicPolicy";
import { runToolExecution } from "@/tools/toolRunner";
import { ToolExecutionMode } from "@/tools/toolTypes";
import { FlowNodeId, SessionState } from "@/types/session";
import { randomBetween } from "@/utils/format";

export interface SimulationOptions {
  forceFallback: boolean;
  workflowMode: "auto" | "workflow" | "no_workflow";
  toolMode: ToolExecutionMode;
}

export interface SimulationStep {
  id: FlowNodeId;
  label: string;
  run: (state: SessionState) => Promise<SessionState>;
}

export function buildSimulationSteps(options: SimulationOptions): SimulationStep[] {
  return [
    {
      id: "stt",
      label: "Speech recognized",
      run: async (state) => {
        const sttMs = randomBetween(300, 700);
        return {
          ...state,
          transcript: state.utterance,
          latency: { ...state.latency, sttMs }
        } as SessionState;
      }
    },
    {
      id: "understanding",
      label: "Intent and entities extracted",
      run: async (state) => {
        const understandingMs = randomBetween(200, 600);
        const evaluated = runDeterministicUnderstandingPolicy(
          state.utterance,
          { workflowMode: options.workflowMode },
          state.policy?.counters,
          state.understandingProviderResult
        );

        return {
          ...state,
          understanding: evaluated.understanding,
          understandingDiagnostics: evaluated.understandingDiagnostics,
          understandingProviderResult: undefined,
          policy: {
            ...evaluated.policy,
            counters: {
              ...evaluated.policy.counters,
              sttFailures: evaluated.sttFailureHint ? evaluated.policy.counters.sttFailures + 1 : evaluated.policy.counters.sttFailures,
              lowConfidence:
                evaluated.understanding.intentConfidence < evaluated.policy.thresholds.minIntentConfidence
                  ? evaluated.policy.counters.lowConfidence + 1
                  : evaluated.policy.counters.lowConfidence
            }
          },
          latency: { ...state.latency, understandingMs }
        } as SessionState;
      }
    },
    {
      id: "decision",
      label: "Route selected",
      run: async (state) => {
        const routing = runDeterministicRoutingPolicy({ understanding: state.understanding, policy: state.policy });
        return {
          ...state,
          routing,
          responseText: routing.decision === "clarify" ? routing.clarificationPrompt : state.responseText,
          policy: state.policy
            ? {
                ...state.policy,
                selectedRule: routing.selectedRule,
                whyChosen: routing.whyChosen
              }
            : state.policy
        } as SessionState;
      }
    },
    {
      id: "toolExecution",
      label: "Tool execution completed",
      run: async (state) => {
        if (state.routing?.decision !== "workflow") {
          return {
            ...state,
            toolExecution: {
              selectedTool: "create_support_ticket",
              requestPayload: { skipped: true },
              responsePayload: { skipped: true, reason: `routing=${state.routing?.decision}` },
              executionStatus: "success",
              executionTimeMs: 0,
              executionMode: options.toolMode,
              fallbackBehavior: "No tool executed for non-workflow path."
            },
            toolResult: {
              provider: options.toolMode === "mock" ? "mock_local" : "api",
              toolName: "none",
              status: "success",
              result: { skipped: true, reason: `routing=${state.routing?.decision}` }
            },
            latency: { ...state.latency, toolMs: 0 }
          } as SessionState;
        }

        const { toolResult, record } = await runToolExecution(state, {
          forceFallback: options.forceFallback,
          modeOverride: options.toolMode
        });

        return {
          ...state,
          toolExecution: record,
          toolResult,
          policy: state.policy
            ? {
                ...state.policy,
                counters: {
                  ...state.policy.counters,
                  toolFailures: toolResult.status === "failure" ? state.policy.counters.toolFailures + 1 : state.policy.counters.toolFailures
                }
              }
            : state.policy,
          latency: { ...state.latency, toolMs: record.executionTimeMs }
        } as SessionState;
      }
    },
    {
      id: "responseGeneration",
      label: "LLM response drafted",
      run: async (state) => {
        const responseMs = randomBetween(250, 700);
        return {
          ...state,
          responseText: generateMockResponse(state),
          handoff: runDeterministicHandoffPolicy(state),
          latency: { ...state.latency, responseMs }
        } as SessionState;
      }
    },
    {
      id: "tts",
      label: "Speech synthesized",
      run: async (state) => {
        const ttsMs = randomBetween(150, 400);
        synthesizeMockSpeech(state.responseText ?? "");
        const totalMs = (state.latency?.sttMs ?? 0) + (state.latency?.understandingMs ?? 0) + (state.latency?.toolMs ?? 0) + (state.latency?.responseMs ?? 0) + ttsMs;
        return {
          ...state,
          latency: { ...state.latency, ttsMs, totalMs }
        } as SessionState;
      }
    },
    {
      id: "handoff",
      label: "Handoff evaluated",
      run: async (state) => ({
        ...state,
        handoff: {
          ...state.handoff,
          triggered: state.handoff?.triggered ?? false,
          summary: state.handoff?.triggered
            ? state.handoff.summary ?? "Session packaged for human agent transfer."
            : "No handoff required for this interaction."
        }
      } as SessionState)
    }
  ];
}
