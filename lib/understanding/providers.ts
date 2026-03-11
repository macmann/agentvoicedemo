import { CONVERSATIONAL_STRATEGIES, detectTurnAct } from "@/orchestration/conversationPolicy";
import { parseScenarioSignals } from "@/orchestration/mockScenarios";
import { ROUTING_CONFIG, UnderstoodIntent } from "@/orchestration/routingConfig";
import { StructuredUnderstandingResult, UnderstandingDiagnostics } from "@/types/session";

const PROMPT_TYPE = "structured_intent_v1" as const;
const OPENAI_MODEL = process.env.OPENAI_UNDERSTANDING_MODEL ?? "gpt-5-mini";

const KNOWN_INTENTS: UnderstoodIntent[] = ["report_internet_issue", "report_router_issue", "outage_check", "reschedule_visit", "talk_to_human", "announcement_check", "empathy_only", "unclear"];

function buildSystemPrompt() {
  return [
    "You are a support-intent understanding engine for a telecom voice support prototype.",
    "Return JSON only. No prose, no markdown, no extra keys.",
    "Classify the user into one of the known intents only:",
    KNOWN_INTENTS.join(", "),
    "Extract entities as Record<string,string>.",
    "Schema requires: intent,intentConfidence,entities,empathyNeeded,workflowRequired,recommendedWorkflow,handoffRecommended,turnAct,responseStrategy,responseMode,refersToPendingQuestion,resetPendingQuestion,replacePendingWorkflow,reason.",
    JSON.stringify({
      intent: "string",
      intentConfidence: 0,
      entities: { key: "value" },
      sentiment: "string optional",
      empathyNeeded: true,
      workflowRequired: false,
      recommendedWorkflow: "string optional",
      handoffRecommended: false,
      turnAct: "greeting|small_talk|thanks|farewell|task_request|slot_answer|correction|objection|emotion|meta_question|handoff_request|unclear",
      responseStrategy: "greet_and_invite|small_talk_and_invite|acknowledge_thanks|farewell_close|continue_workflow|ask_clarification|repair_and_reset|empathy_then_continue|explain_and_continue|replace_workflow|handoff|bounded_redirect",
      responseMode: "conversational_only|task_oriented",
      refersToPendingQuestion: false,
      resetPendingQuestion: false,
      replacePendingWorkflow: false,
      reason: "string optional"
    })
  ].join("\n");
}

function safeJsonParse(raw: string): unknown { try { return JSON.parse(raw); } catch { return undefined; } }
function normalizeIntent(value: unknown): UnderstoodIntent { if (typeof value !== "string") return "unclear"; const n = value.trim().toLowerCase(); return (KNOWN_INTENTS.find((i) => i === n) ?? "unclear") as UnderstoodIntent; }

function sanitizeUnderstanding(candidate: unknown, utterance: string): { understanding: StructuredUnderstandingResult; validationStatus: UnderstandingDiagnostics["validationStatus"] } {
  const obj = (candidate ?? {}) as Record<string, unknown>;
  const intent = normalizeIntent(obj.intent);
  const confidence = typeof obj.intentConfidence === "number" ? Math.min(Math.max(obj.intentConfidence, 0), 1) : 0.55;
  const entitiesObj = typeof obj.entities === "object" && obj.entities !== null ? (obj.entities as Record<string, unknown>) : {};
  const entities = Object.fromEntries(Object.entries(entitiesObj).map(([k, v]) => [k, String(v)]));
  const sentiment = typeof obj.sentiment === "string" ? obj.sentiment : undefined;
  const empathyNeeded = Boolean(obj.empathyNeeded);
  const workflowRequired = Boolean(obj.workflowRequired);
  const recommendedWorkflow = typeof obj.recommendedWorkflow === "string" ? obj.recommendedWorkflow : undefined;
  const handoffRecommended = Boolean(obj.handoffRecommended);
  const reason = typeof obj.reason === "string" ? obj.reason : undefined;
  const turnAct = typeof obj.turnAct === "string" ? obj.turnAct : detectTurnAct(utterance, false);
  const responseStrategy = typeof obj.responseStrategy === "string" ? obj.responseStrategy : "continue_workflow";
  const responseMode = typeof obj.responseMode === "string" ? obj.responseMode : CONVERSATIONAL_STRATEGIES.includes(responseStrategy as StructuredUnderstandingResult["responseStrategy"]) ? "conversational_only" : "task_oriented";

  const maybeRoute = ROUTING_CONFIG[intent];
  const normalizedWorkflow = workflowRequired ? recommendedWorkflow ?? maybeRoute.workflowName : undefined;

  const understanding: StructuredUnderstandingResult = {
    intent,
    intentConfidence: confidence,
    entities,
    sentiment,
    empathyNeeded,
    workflowRequired,
    recommendedWorkflow: normalizedWorkflow,
    handoffRecommended,
    turnAct: turnAct as StructuredUnderstandingResult["turnAct"],
    responseStrategy: responseStrategy as StructuredUnderstandingResult["responseStrategy"],
    responseMode: responseMode as StructuredUnderstandingResult["responseMode"],
    refersToPendingQuestion: Boolean(obj.refersToPendingQuestion),
    resetPendingQuestion: Boolean(obj.resetPendingQuestion),
    replacePendingWorkflow: Boolean(obj.replacePendingWorkflow),
    reason
  };

  const fullyValid = typeof obj.intent === "string" && typeof obj.intentConfidence === "number" && typeof obj.entities === "object";
  return { understanding, validationStatus: fullyValid ? "valid" : "sanitized" };
}

function mockUnderstanding(utterance: string): StructuredUnderstandingResult {
  const signals = parseScenarioSignals(utterance);
  const route = ROUTING_CONFIG[signals.intent];
  const turnAct = detectTurnAct(utterance, false);
  return {
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
}

export async function understandWithMock(utterance: string, fallbackBehavior = "Mock understanding selected.") {
  const understanding = mockUnderstanding(utterance);
  return { understanding, diagnostics: { provider: "mock" as const, model: "deterministic-mock-v1", promptType: PROMPT_TYPE, rawOutput: JSON.stringify(understanding), validationStatus: "valid" as const, fallbackBehavior } };
}

export async function understandWithOpenAI(utterance: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim().length < 20) return understandWithMock(utterance, "OPENAI_API_KEY missing/invalid; using mock mode.");
  const endpoint = `${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions`;
  try {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: OPENAI_MODEL, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: buildSystemPrompt() }, { role: "user", content: utterance }] }) });
    if (!response.ok) return understandWithMock(utterance, `OpenAI error ${response.status}; using mock mode.`);
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const rawOutput = payload.choices?.[0]?.message?.content ?? "{}";
    const parsed = safeJsonParse(rawOutput);
    if (!parsed) {
      const mock = await understandWithMock(utterance, "Model output was not valid JSON; reverted to mock mode.");
      return { ...mock, diagnostics: { ...mock.diagnostics, rawOutput, validationStatus: "fallback" as const } };
    }
    const sanitized = sanitizeUnderstanding(parsed, utterance);
    return { understanding: sanitized.understanding, diagnostics: { provider: "openai" as const, model: OPENAI_MODEL, promptType: PROMPT_TYPE, rawOutput, validationStatus: sanitized.validationStatus, fallbackBehavior: "If validation fails, fall back to mock understanding or safe unclear intent." } };
  } catch {
    return understandWithMock(utterance, "OpenAI request failed; using mock mode.");
  }
}

export async function getUnderstandingResult(utterance: string) { return understandWithOpenAI(utterance); }
