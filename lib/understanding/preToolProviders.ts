import { detectTurnAct } from "@/orchestration/conversationPolicy";
import { parseScenarioSignals } from "@/orchestration/mockScenarios";
import { PreToolUnderstandingDiagnostics, PreToolUnderstandingResult } from "@/types/session";

const OPENAI_MODEL = process.env.OPENAI_UNDERSTANDING_MODEL ?? "gpt-5-mini";
const PROMPT_TYPE = "pretool_understanding_v1" as const;

type Input = {
  utterance: string;
  recentConversation?: Array<{ role: string; text: string }>;
  activeSupportIntent?: "service_status" | "announcements";
  pendingQuestion?: { expectedSlot?: string; prompt?: string };
  pendingWorkflow?: { workflowName?: string; missingSlots?: string[] };
  previousToolContext?: { toolName?: string; normalizedResult?: unknown };
};

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function sanitize(result: unknown, input: Input): { understanding: PreToolUnderstandingResult; validationStatus: PreToolUnderstandingDiagnostics["validationStatus"] } {
  const obj = (result ?? {}) as Record<string, unknown>;
  const inferredSupportIntent = obj.inferredSupportIntent === "service_status" || obj.inferredSupportIntent === "announcements" ? obj.inferredSupportIntent : "none";
  const defaultTurnAct = detectTurnAct(input.utterance, Boolean(input.pendingQuestion));
  const turnAct = typeof obj.turnAct === "string" ? obj.turnAct : defaultTurnAct;
  const intentConfidence = typeof obj.intentConfidence === "number" ? Math.max(0, Math.min(1, obj.intentConfidence)) : 0.58;
  const entitiesObj = typeof obj.entities === "object" && obj.entities ? (obj.entities as Record<string, unknown>) : {};
  const entities: PreToolUnderstandingResult["entities"] = {
    region: typeof entitiesObj.region === "string" ? entitiesObj.region : undefined,
    category: typeof entitiesObj.category === "string" ? entitiesObj.category : undefined,
    serviceNameOrRegion: typeof entitiesObj.serviceNameOrRegion === "string" ? entitiesObj.serviceNameOrRegion : undefined,
    dateRange: typeof entitiesObj.dateRange === "string" ? entitiesObj.dateRange : undefined
  };
  const clarificationNeeded = Boolean(obj.clarificationNeeded);
  const clarificationQuestion = typeof obj.clarificationQuestion === "string" ? obj.clarificationQuestion : undefined;
  const suggestedWorkflow = typeof obj.suggestedWorkflow === "string" ? obj.suggestedWorkflow : undefined;
  const continuationDetected = Boolean(obj.continuationDetected);
  const correctionDetected = Boolean(obj.correctionDetected);
  const handoffRecommended = Boolean(obj.handoffRecommended);
  const reason = typeof obj.reason === "string" ? obj.reason : "Sanitized pre-tool understanding output.";

  const fullyValid =
    typeof obj.inferredSupportIntent === "string" &&
    typeof obj.turnAct === "string" &&
    typeof obj.intentConfidence === "number" &&
    typeof obj.entities === "object";

  return {
    understanding: {
      inferredSupportIntent,
      turnAct: turnAct as PreToolUnderstandingResult["turnAct"],
      intentConfidence,
      entities,
      clarificationNeeded,
      clarificationQuestion,
      suggestedWorkflow,
      continuationDetected,
      correctionDetected,
      handoffRecommended,
      reason
    },
    validationStatus: fullyValid ? "valid" : "sanitized"
  };
}

function buildMock(input: Input): PreToolUnderstandingResult {
  const signals = parseScenarioSignals(input.utterance);
  const continuationDetected = /^\s*(no|actually|i mean|sorry)\b/i.test(input.utterance) || Boolean(input.activeSupportIntent && input.pendingQuestion);
  return {
    inferredSupportIntent: signals.intent === "service_status" || signals.intent === "announcements" ? signals.intent : "none",
    turnAct: detectTurnAct(input.utterance, Boolean(input.pendingQuestion)),
    intentConfidence: signals.confidence,
    entities: {
      serviceNameOrRegion: signals.entities.serviceNameOrRegion,
      region: signals.entities.serviceNameOrRegion,
      category: signals.entities.serviceCategory,
      dateRange: /this week/i.test(input.utterance) ? "this_week" : undefined
    },
    clarificationNeeded: signals.intent === "service_status" && !signals.entities.serviceNameOrRegion,
    clarificationQuestion: signals.intent === "service_status" && !signals.entities.serviceNameOrRegion ? "Sure — what city or region should I check?" : undefined,
    suggestedWorkflow: signals.intent === "service_status" ? "check_outage_status" : signals.intent === "announcements" ? "fetch_notifications" : undefined,
    continuationDetected,
    correctionDetected: /\b(no|actually|i mean)\b/i.test(input.utterance),
    handoffRecommended: signals.explicitHumanRequest,
    reason: "Mock pre-tool understanding based on deterministic scenario parsing."
  };
}

function buildSystemPrompt() {
  return [
    "You are a pre-tool support intent understanding engine.",
    "Return strict JSON only with these keys:",
    "inferredSupportIntent,turnAct,intentConfidence,entities,clarificationNeeded,clarificationQuestion,suggestedWorkflow,continuationDetected,correctionDetected,handoffRecommended,reason",
    "Allowed inferredSupportIntent: service_status | announcements | none",
    "Allowed turnAct: greeting|small_talk|thanks|farewell|task_request|slot_answer|correction|objection|emotion|meta_question|handoff_request|unclear",
    "You are ONLY for telecom support demo scope: service status + announcements.",
    "Never suggest unsupported workflows.",
    "If service_status request lacks region/service target, set clarificationNeeded true and propose one scope-safe question.",
    "Prefer extracting region/service/category/date cues.",
    "JSON schema example:",
    JSON.stringify({
      inferredSupportIntent: "none",
      turnAct: "unclear",
      intentConfidence: 0.4,
      entities: { region: "", category: "", serviceNameOrRegion: "", dateRange: "" },
      clarificationNeeded: false,
      clarificationQuestion: "",
      suggestedWorkflow: "",
      continuationDetected: false,
      correctionDetected: false,
      handoffRecommended: false,
      reason: ""
    })
  ].join("\n");
}

export async function getPreToolUnderstandingMock(input: Input, fallbackBehavior = "Mock pre-tool understanding selected.") {
  const understanding = buildMock(input);
  return {
    understanding,
    diagnostics: {
      provider: "mock" as const,
      model: "deterministic-mock-pretool-v1",
      promptType: PROMPT_TYPE,
      rawOutput: JSON.stringify(understanding),
      validationStatus: "valid" as const,
      fallbackBehavior
    }
  };
}

export async function getPreToolUnderstandingOpenAI(input: Input) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim().length < 20) return getPreToolUnderstandingMock(input, "OPENAI_API_KEY missing/invalid; using mock pre-tool understanding.");

  const endpoint = `${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: JSON.stringify(input) }
        ]
      })
    });

    if (!response.ok) return getPreToolUnderstandingMock(input, `OpenAI error ${response.status}; using mock pre-tool understanding.`);

    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const rawOutput = payload.choices?.[0]?.message?.content ?? "{}";
    const parsed = safeJsonParse(rawOutput);
    if (!parsed) {
      const mock = await getPreToolUnderstandingMock(input, "Model output was not valid JSON; reverted to mock pre-tool understanding.");
      return { ...mock, diagnostics: { ...mock.diagnostics, rawOutput, validationStatus: "fallback" as const } };
    }

    const sanitized = sanitize(parsed, input);
    return {
      understanding: sanitized.understanding,
      diagnostics: {
        provider: "openai" as const,
        model: OPENAI_MODEL,
        promptType: PROMPT_TYPE,
        rawOutput,
        validationStatus: sanitized.validationStatus,
        fallbackBehavior: "If validation fails, sanitize and keep deterministic guardrails."
      }
    };
  } catch {
    return getPreToolUnderstandingMock(input, "OpenAI request failed; using mock pre-tool understanding.");
  }
}

export async function getPreToolUnderstanding(input: Input) {
  return getPreToolUnderstandingOpenAI(input);
}
