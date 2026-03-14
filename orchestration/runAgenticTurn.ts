import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";
import { runToolExecution } from "@/tools/toolRunner";
import { RuntimeToolConfig } from "@/tools/runtimeToolConfig";
import { SessionState } from "@/types/session";
import { TesterDebugState, TesterInputSource, VoicePhase } from "@/types/tester";

export interface RunAgenticTurnInput {
  utterance: string;
  inputSource: TesterInputSource;
  previousSession?: SessionState;
  runtimeToolConfig?: RuntimeToolConfig;
  voiceModeEnabled: boolean;
  ttsVoiceStyle?: string;
  onStage?: (stage: VoicePhase) => void;
}

export interface RunAgenticTurnOutput {
  session: SessionState;
  responseText: string;
  transcriptText: string;
  createdAt: string;
  metadata: TesterDebugState;
}

export async function runAgenticTurn(input: RunAgenticTurnInput): Promise<RunAgenticTurnOutput> {
  const createdAt = new Date().toISOString();
  const start = Date.now();
  input.onStage?.("processing");

  const transcriptText = input.utterance.trim();

  let selectedTool: SessionState["toolExecution"] | undefined;
  let toolResult: SessionState["toolResult"] | undefined;

  const executeTool = async (toolName: "check_outage_status" | "fetch_notifications" | "diagnose_connectivity", payload: Record<string, unknown>) => {
    input.onStage?.("checking_tool");
    const execution = await runToolExecution(
      {
        utterance: transcriptText,
        understanding: { intent: toolName, intentConfidence: 0.9, entities: payload as Record<string, string>, empathyNeeded: false, workflowRequired: true, recommendedWorkflow: toolName, handoffRecommended: false, turnAct: "task_request", responseStrategy: "continue_workflow", responseMode: "task_oriented", refersToPendingQuestion: false, resetPendingQuestion: false, replacePendingWorkflow: false },
        routing: { decision: "workflow", workflowName: toolName, selectedRule: "agentic_tool_decision", whyChosen: "OpenAI Agent SDK selected this tool.", dialogueState: "ready_to_execute" }
      },
      { forceFallback: false, runtimeConfig: input.runtimeToolConfig }
    );

    selectedTool = {
      ...execution.record,
      requestPayload: (execution.record.requestPayload as Record<string, unknown>) ?? {},
      rawResponsePayload: execution.record.rawResponsePayload as Record<string, unknown> | undefined,
      normalizedResult: execution.record.normalizedResult as Record<string, unknown> | undefined
    };
    toolResult = execution.toolResult;
    return execution.toolResult.status === "success" ? execution.toolResult.result : { error: execution.toolResult.error };
  };

  const agent = new Agent({
    name: "AgenticSupportOrchestrator",
    model: process.env.OPENAI_AGENT_MODEL || "gpt-4.1-mini",
    instructions:
      "You are an enterprise support voice agent. Decide directly whether to call a tool. No intent classification. Use tools when status or diagnostics are needed. Keep responses concise and user-friendly.",
    tools: [
      tool({
        name: "check_outage_status",
        description: "Check outage status for a service or region.",
        parameters: z.object({ serviceNameOrRegion: z.string().optional() }),
        execute: async (args) => executeTool("check_outage_status", { serviceNameOrRegion: args.serviceNameOrRegion ?? "" })
      }),
      tool({
        name: "fetch_notifications",
        description: "Fetch active service notifications.",
        parameters: z.object({ activeOnly: z.boolean().optional() }),
        execute: async (args) => executeTool("fetch_notifications", { active: args.activeOnly ?? true })
      }),
      tool({
        name: "diagnose_connectivity",
        description: "Run connectivity diagnostics for local-user issue.",
        parameters: z.object({}).strict(),
        execute: async () => executeTool("diagnose_connectivity", {})
      })
    ]
  });

  const history = (input.previousSession?.conversation?.turns ?? [])
    .slice(-6)
    .map((turn) => `${turn.role}: ${turn.text}`)
    .join("\n");

  const runResult = await run(agent, `${history ? `${history}\n` : ""}user: ${transcriptText}`);
  const responseText = typeof runResult.finalOutput === "string" ? runResult.finalOutput : "I checked that for you.";

  input.onStage?.("speaking_final");

  const session: SessionState = {
    utterance: input.utterance,
    responseText,
    toolExecution: selectedTool,
    toolResult,
    conversation: {
      conversationId: input.previousSession?.conversation?.conversationId ?? crypto.randomUUID(),
      turns: [
        ...(input.previousSession?.conversation?.turns ?? []).slice(-20),
        { id: `turn-${crypto.randomUUID()}`, role: "user", text: transcriptText, createdAt },
        { id: `turn-${crypto.randomUUID()}`, role: "assistant", text: responseText, createdAt }
      ],
      currentStatus: "speaking",
      pendingSlots: [],
      collectedSlots: {}
    },
    latency: {
      totalTurnMs: Date.now() - start,
      sttFinalizationMs: 0,
      toolExecutionMs: selectedTool?.executionTimeMs,
      responseGenerationMs: 0
    }
  };

  return {
    session,
    responseText,
    transcriptText,
    createdAt,
    metadata: {
      orchestrationApproach: "agentic",
      providerMode: "live",
      toolCalled: selectedTool?.selectedTool,
      routingDecision: selectedTool ? "workflow" : "no_workflow",
      toolExecutionMode: selectedTool?.executionMode,
      toolOutput: toolResult?.result,
      agenticModel: process.env.OPENAI_AGENT_MODEL || "gpt-4.1-mini",
      agenticToolsAvailable: ["check_outage_status", "fetch_notifications", "diagnose_connectivity"],
      latency: {
        totalTurnMs: session.latency?.totalTurnMs,
        toolExecutionMs: selectedTool?.executionTimeMs
      }
    }
  };
}
