import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";
import { runToolExecution } from "@/tools/toolRunner";
import { RuntimeToolConfig } from "@/tools/runtimeToolConfig";
import { SessionState } from "@/types/session";
import { TesterDebugState, TesterInputSource, VoicePhase } from "@/types/tester";
import { composeInlineTroubleshootingKb, InlineTroubleshootingKbFile, loadTroubleshootingKb } from "@/orchestration/troubleshootingKb";
import { buildTroubleshootingResponse, detectHomeInternetIssue } from "@/orchestration/troubleshootingWorkflow";

export interface RunAgenticTurnInput {
  utterance: string;
  inputSource: TesterInputSource;
  previousSession?: SessionState;
  runtimeToolConfig?: RuntimeToolConfig;
  voiceModeEnabled: boolean;
  ttsVoiceStyle?: string;
  troubleshootingKbMode?: "off" | "on";
  troubleshootingKbSource?: string;
  uploadedTroubleshootingKbs?: InlineTroubleshootingKbFile[];
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
  const troubleshootingMode = input.troubleshootingKbMode ?? "on";
  const homeInternetIssueDetected = detectHomeInternetIssue(transcriptText);

  let selectedTool: SessionState["toolExecution"] | undefined;
  let toolResult: SessionState["toolResult"] | undefined;
  let kbRetrieveError: string | undefined;
  let kbToolUsed = false;
  let kbTroubleshootingMetadata: Pick<
    TesterDebugState,
    | "troubleshootingActive"
    | "troubleshootingIssueType"
    | "troubleshootingSelectedKBSections"
    | "troubleshootingCurrentStep"
    | "troubleshootingStepsShown"
    | "troubleshootingResolutionStatus"
    | "troubleshootingKbSource"
    | "troubleshootingResolutionDetected"
    | "resolutionPhraseMatched"
    | "resolutionReason"
  > | undefined;

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

  if (homeInternetIssueDetected && troubleshootingMode === "on") {
    try {
      const kb = input.uploadedTroubleshootingKbs?.length
        ? composeInlineTroubleshootingKb(input.uploadedTroubleshootingKbs)
        : await loadTroubleshootingKb(input.troubleshootingKbSource);
      const troubleshootingResult = buildTroubleshootingResponse({
        utterance: transcriptText,
        kb,
        previous: input.previousSession?.conversation?.troubleshooting,
        maxStepsBeforeEscalation: 4
      });

      kbToolUsed = true;
      kbTroubleshootingMetadata = {
        troubleshootingActive: troubleshootingResult.state.active,
        troubleshootingIssueType: troubleshootingResult.state.issueType,
        troubleshootingSelectedKBSections: troubleshootingResult.state.selectedKBSections,
        troubleshootingCurrentStep: troubleshootingResult.state.stepsShown[troubleshootingResult.state.stepsShown.length - 1],
        troubleshootingStepsShown: troubleshootingResult.state.stepsShown,
        troubleshootingResolutionStatus: troubleshootingResult.state.resolutionStatus,
        troubleshootingKbSource: troubleshootingResult.state.kbSource,
        troubleshootingResolutionDetected: troubleshootingResult.resolutionDetection.resolved,
        resolutionPhraseMatched: troubleshootingResult.resolutionDetection.resolutionPhraseMatched,
        resolutionReason: troubleshootingResult.resolutionDetection.resolutionReason
      };

      const selectedSectionBodies = troubleshootingResult.state.selectedKBSections
        .map((id) => kb.sections.find((section) => section.id === id))
        .filter((section): section is NonNullable<typeof section> => Boolean(section))
        .map((section) => `## ${section.title}\n${section.rawBody}`)
        .join("\n\n");

      const kbGroundedAgent = new Agent({
        name: "TroubleshootingKbResponder",
        model: process.env.OPENAI_AGENT_MODEL || "gpt-4.1-mini",
        instructions:
          "You are a support responder using only the provided troubleshooting KB excerpt and prior troubleshooting state. Do not invent steps. Ask at most one follow-up question. Keep to 2 short paragraphs max."
      });

      const kbPrompt = [
        `User message: ${transcriptText}`,
        `Troubleshooting state summary: ${troubleshootingResult.responseText}`,
        `Selected KB source: ${kb.source}`,
        "KB excerpt:",
        selectedSectionBodies || "No KB section matched."
      ].join("\n\n");

      const kbRunResult = await run(kbGroundedAgent, kbPrompt);

      const responseText = typeof kbRunResult.finalOutput === "string" && kbRunResult.finalOutput.trim()
        ? kbRunResult.finalOutput
        : troubleshootingResult.responseText;
      const session: SessionState = {
        utterance: input.utterance,
        responseText,
        conversation: {
          conversationId: input.previousSession?.conversation?.conversationId ?? crypto.randomUUID(),
          turns: [
            ...(input.previousSession?.conversation?.turns ?? []).slice(-20),
            { id: `turn-${crypto.randomUUID()}`, role: "user", text: transcriptText, createdAt },
            { id: `turn-${crypto.randomUUID()}`, role: "assistant", text: responseText, createdAt }
          ],
          currentStatus: "speaking",
          pendingSlots: [],
          collectedSlots: {},
          activeSupportIntent: troubleshootingResult.state.resolutionStatus === "resolved" ? undefined : "troubleshooting",
          troubleshooting: troubleshootingResult.state
        },
        latency: {
          totalTurnMs: Date.now() - start,
          sttFinalizationMs: 0,
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
          toolCalled: "troubleshooting_kb",
          routingDecision: "no_workflow",
          agenticModel: process.env.OPENAI_AGENT_MODEL || "gpt-4.1-mini",
          agenticToolsAvailable: ["check_outage_status", "fetch_notifications", "diagnose_connectivity"],
          troubleshootingMode,
          ...kbTroubleshootingMetadata,
          latency: {
            totalTurnMs: session.latency?.totalTurnMs
          }
        }
      };
    } catch (error) {
      kbRetrieveError = error instanceof Error ? error.message : String(error);
    }
  }

  const agent = new Agent({
    name: "AgenticSupportOrchestrator",
    model: process.env.OPENAI_AGENT_MODEL || "gpt-4.1-mini",
    instructions:
      "You are an enterprise support voice agent. Decide directly whether to call a tool. No intent classification. Use tools when status or diagnostics are needed. Never answer with general world knowledge. If a needed fact is not in tool output or provided context, say you cannot verify it yet and ask a clarifying question or run a tool. Keep responses concise and user-friendly.",
    tools: [
      tool({
        name: "check_outage_status",
        description: "Check outage status for a service or region.",
        parameters: z.object({ serviceNameOrRegion: z.string() }),
        execute: async (args) => executeTool("check_outage_status", { serviceNameOrRegion: args.serviceNameOrRegion })
      }),
      tool({
        name: "fetch_notifications",
        description: "Fetch active service notifications.",
        parameters: z.object({ activeOnly: z.boolean() }),
        execute: async (args) => executeTool("fetch_notifications", { active: args.activeOnly })
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
      agenticModel: process.env.OPENAI_AGENT_MODEL || "gpt-4.1-mini",
      agenticToolsAvailable: ["check_outage_status", "fetch_notifications", "diagnose_connectivity"],
      troubleshootingMode,
      ...kbTroubleshootingMetadata,
      troubleshootingActive: kbTroubleshootingMetadata?.troubleshootingActive ?? false,
      troubleshootingKbSource: kbTroubleshootingMetadata?.troubleshootingKbSource ?? input.troubleshootingKbSource,
      troubleshootingResolutionDetected: kbTroubleshootingMetadata?.troubleshootingResolutionDetected ?? false,
      resolutionReason: kbTroubleshootingMetadata?.resolutionReason ?? (kbRetrieveError ? `kb_retrieval_failed:${kbRetrieveError}` : undefined),
      toolOutput: toolResult?.result,
      groundedToolName: kbToolUsed ? "troubleshooting_kb" : undefined,
      latency: {
        totalTurnMs: session.latency?.totalTurnMs,
        toolExecutionMs: selectedTool?.executionTimeMs
      }
    }
  };
}
