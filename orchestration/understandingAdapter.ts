import { CONVERSATIONAL_STRATEGIES, detectTurnAct } from "@/orchestration/conversationPolicy";
import { parseScenarioSignals } from "@/orchestration/mockScenarios";
import { ROUTING_CONFIG } from "@/orchestration/routingConfig";
import { StructuredUnderstandingResult, UnderstandingDiagnostics } from "@/types/session";

export interface UnderstandingProviderResult {
  understanding: StructuredUnderstandingResult;
  diagnostics: UnderstandingDiagnostics;
}

export async function understandWithMock(utterance: string, fallbackBehavior = "Client mock fallback used."): Promise<UnderstandingProviderResult> {
  const signals = parseScenarioSignals(utterance);
  const route = ROUTING_CONFIG[signals.intent];
  const turnAct = detectTurnAct(utterance, false);
  const understanding: StructuredUnderstandingResult = {
    intent: signals.intent,
    intentConfidence: signals.confidence,
    entities: signals.entities,
    sentiment: signals.sentiment,
    empathyNeeded: signals.empathyNeeded,
    workflowRequired: route.decision === "workflow",
    recommendedWorkflow: route.workflowName,
    handoffRecommended: signals.explicitHumanRequest,
    turnAct,
    responseStrategy: turnAct === "greeting" ? "greet_and_invite" : turnAct === "small_talk" ? "small_talk_and_invite" : route.decision === "clarify" ? "ask_clarification" : "continue_workflow",
    responseMode: CONVERSATIONAL_STRATEGIES.includes(turnAct === "greeting" ? "greet_and_invite" : turnAct === "small_talk" ? "small_talk_and_invite" : route.decision === "clarify" ? "ask_clarification" : "continue_workflow") ? "conversational_only" : "task_oriented",
    refersToPendingQuestion: false,
    resetPendingQuestion: false,
    replacePendingWorkflow: false,
    reason: route.reason
  };

  return {
    understanding,
    diagnostics: {
      provider: "mock",
      model: "deterministic-mock-v1",
      promptType: "structured_intent_v1",
      rawOutput: JSON.stringify(understanding),
      validationStatus: "valid",
      fallbackBehavior
    }
  };
}

export async function understandWithOpenAI(utterance: string): Promise<UnderstandingProviderResult> {
  const response = await fetch("/api/understanding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ utterance })
  });

  if (!response.ok) {
    return understandWithMock(utterance, `Understanding API unavailable (${response.status}); mock mode enabled.`);
  }

  return (await response.json()) as UnderstandingProviderResult;
}

export async function getUnderstandingResult(utterance: string): Promise<UnderstandingProviderResult> {
  try {
    return await understandWithOpenAI(utterance);
  } catch {
    return understandWithMock(utterance, "Understanding API request failed; mock mode enabled.");
  }
}
