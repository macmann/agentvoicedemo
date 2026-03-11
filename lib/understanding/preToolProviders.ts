import { detectTurnAct } from "@/orchestration/conversationPolicy";
import { parseScenarioSignals } from "@/orchestration/mockScenarios";
import { PreToolUnderstandingDiagnostics, PreToolUnderstandingResult } from "@/types/session";

const OPENAI_MODEL = process.env.OPENAI_UNDERSTANDING_MODEL ?? "gpt-5-mini";
const PROMPT_TYPE = "pretool_understanding_v1" as const;
const PRETOOL_PROVIDER = process.env.OPENAI_PRETOOL_PROVIDER ?? "mock";
const OPENAI_ENDPOINT_PATH = "/responses";

type Input = {
  utterance: string;
  recentConversation?: Array<{ role: string; text: string }>;
  activeSupportIntent?: "service_status" | "announcements" | "troubleshooting";
  pendingQuestion?: { expectedSlot?: string; prompt?: string };
  pendingWorkflow?: { workflowName?: string; missingSlots?: string[] };
  previousToolContext?: { toolName?: string; normalizedResult?: unknown };
};

type ProviderOutput = {
  understanding: PreToolUnderstandingResult;
  diagnostics: PreToolUnderstandingDiagnostics;
};

const PRETOOL_UNDERSTANDING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "inferredSupportIntent",
    "turnAct",
    "intentConfidence",
    "entities",
    "clarificationNeeded",
    "clarificationQuestion",
    "suggestedWorkflow",
    "continuationDetected",
    "correctionDetected",
    "handoffRecommended",
    "reason"
  ],
  properties: {
    inferredSupportIntent: { type: "string", enum: ["service_status", "announcements", "none"] },
    turnAct: { type: "string" },
    intentConfidence: { type: "number", minimum: 0, maximum: 1 },
    entities: {
      type: "object",
      additionalProperties: false,
      required: ["region", "category", "serviceNameOrRegion", "dateRange"],
      properties: {
        region: { type: ["string", "null"] },
        category: { type: ["string", "null"] },
        serviceNameOrRegion: { type: ["string", "null"] },
        dateRange: { type: ["string", "null"] }
      }
    },
    clarificationNeeded: { type: "boolean" },
    clarificationQuestion: { type: "string" },
    suggestedWorkflow: { type: "string" },
    continuationDetected: { type: "boolean" },
    correctionDetected: { type: "boolean" },
    handoffRecommended: { type: "boolean" },
    reason: { type: "string" }
  }
} as const;

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function extractRegion(utterance: string): string | undefined {
  const lowered = utterance.toLowerCase();
  const aliases = ["berlin", "munich", "leipzig", "hamburg", "frankfurt", "cologne"];
  const aliasMatch = aliases.find((city) => lowered.includes(city));
  if (aliasMatch) return aliasMatch.charAt(0).toUpperCase() + aliasMatch.slice(1);

  const match = utterance.match(/(?:i live in|my home is in|service in|status in|in)\s+([a-z][a-z\s-]{1,30})/i)?.[1]?.trim();
  if (!match) return undefined;
  return match
    .split(/\s+/)
    .slice(0, 3)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function shouldRescueToServiceStatus(utterance: string, understanding: PreToolUnderstandingResult): boolean {
  const lowered = utterance.toLowerCase();
  const roughConnectivitySignals = ["internet", "service", "issue", "down", "outage", "not working"];
  const hasConnectivitySignal = roughConnectivitySignals.some((signal) => lowered.includes(signal));
  const maybeAmbiguous = understanding.inferredSupportIntent === "none" || understanding.intentConfidence < 0.7;
  const strongAnnouncementsSignal = /\b(announcement|announcements|maintenance|notice|notices)\b/.test(lowered);
  return hasConnectivitySignal && maybeAmbiguous && !strongAnnouncementsSignal;
}

function applyRescueMapping(input: Input, providerOutput: ProviderOutput): ProviderOutput {
  if (!shouldRescueToServiceStatus(input.utterance, providerOutput.understanding)) {
    return {
      ...providerOutput,
      diagnostics: {
        ...providerOutput.diagnostics,
        rescueMappingApplied: false
      }
    };
  }

  const region = providerOutput.understanding.entities.region ?? providerOutput.understanding.entities.serviceNameOrRegion ?? extractRegion(input.utterance);

  return {
    understanding: {
      ...providerOutput.understanding,
      inferredSupportIntent: "service_status",
      intentConfidence: Math.max(providerOutput.understanding.intentConfidence, 0.74),
      entities: {
        ...providerOutput.understanding.entities,
        ...(region ? { region, serviceNameOrRegion: providerOutput.understanding.entities.serviceNameOrRegion ?? region } : {})
      },
      clarificationNeeded: providerOutput.understanding.clarificationNeeded && !region,
      clarificationQuestion: providerOutput.understanding.clarificationNeeded && !region
        ? providerOutput.understanding.clarificationQuestion ?? "Sure — what city or region should I check?"
        : undefined,
      suggestedWorkflow: providerOutput.understanding.suggestedWorkflow ?? "check_outage_status",
      reason: `${providerOutput.understanding.reason} Rescue mapping: rough connectivity phrasing mapped to service_status.`
    },
    diagnostics: {
      ...providerOutput.diagnostics,
      rescueMappingApplied: true
    }
  };
}

function sanitize(result: unknown, input: Input): { understanding: PreToolUnderstandingResult; validationStatus: PreToolUnderstandingDiagnostics["validationStatus"] } {
  const obj = (result ?? {}) as Record<string, unknown>;
  const inferredSupportIntent = obj.inferredSupportIntent === "service_status" || obj.inferredSupportIntent === "announcements" ? obj.inferredSupportIntent : "none";
  const defaultTurnAct = detectTurnAct(input.utterance, Boolean(input.pendingQuestion));
  const turnAct = typeof obj.turnAct === "string" ? obj.turnAct : defaultTurnAct;
  const intentConfidence = typeof obj.intentConfidence === "number" ? Math.max(0, Math.min(1, obj.intentConfidence)) : 0.58;
  const entitiesObj = typeof obj.entities === "object" && obj.entities ? (obj.entities as Record<string, unknown>) : {};
  const extractedRegion = typeof entitiesObj.region === "string" && entitiesObj.region.trim().length > 0
    ? entitiesObj.region
    : typeof entitiesObj.serviceNameOrRegion === "string" && entitiesObj.serviceNameOrRegion.trim().length > 0
      ? entitiesObj.serviceNameOrRegion
      : extractRegion(input.utterance);

  const entities: PreToolUnderstandingResult["entities"] = {
    region: extractedRegion,
    category: typeof entitiesObj.category === "string" ? entitiesObj.category : undefined,
    serviceNameOrRegion: typeof entitiesObj.serviceNameOrRegion === "string" ? entitiesObj.serviceNameOrRegion : extractedRegion,
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
  const region = signals.entities.serviceNameOrRegion ?? extractRegion(input.utterance);
  return {
    inferredSupportIntent: signals.intent === "service_status" || signals.intent === "announcements" ? signals.intent : "none",
    turnAct: detectTurnAct(input.utterance, Boolean(input.pendingQuestion)),
    intentConfidence: signals.confidence,
    entities: {
      serviceNameOrRegion: region,
      region,
      category: signals.entities.serviceCategory,
      dateRange: /this week/i.test(input.utterance) ? "this_week" : undefined
    },
    clarificationNeeded: signals.intent === "service_status" && !region,
    clarificationQuestion: signals.intent === "service_status" && !region ? "Sure — what city or region should I check?" : undefined,
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
    "Demo scope is strictly two support intents: service_status and announcements.",
    "Map rough natural connectivity complaints to service_status even if phrasing is imperfect.",
    "service_status examples: 'My internet is having issue', 'My internet is down', 'I live in Berlin and my internet is having issue', 'My home internet is not working', 'Can you check if there is an outage?', 'I want to know if there is an internet issue in Berlin', 'Is there internet status issue in Berlin?'",
    "announcements examples: 'Any upcoming announcements?', 'Any maintenance notices?', 'What announcements are active?', 'Any upcoming maintenance?'",
    "Extract region/city when user says forms like: 'I live in Berlin', 'my home is in Munich', 'service in Berlin', 'in Leipzig'.",
    "When region is present, populate entities.region with normalized city/region text (e.g. Berlin).",
    "If intent is service_status and region is missing, set clarificationNeeded=true with a safe question asking for city/region.",
    "Never suggest unsupported workflows.",
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

export async function getPreToolUnderstandingMock(input: Input, fallbackBehavior = "Mock pre-tool understanding selected.", providerSelectionReason = "Mock provider selected.", failure?: Partial<PreToolUnderstandingDiagnostics>) {
  const understanding = buildMock(input);
  const output: ProviderOutput = {
    understanding,
    diagnostics: {
      provider: "mock" as const,
      model: "deterministic-mock-pretool-v1",
      promptType: PROMPT_TYPE,
      rawOutput: JSON.stringify(understanding),
      validationStatus: "valid" as const,
      fallbackBehavior,
      providerSelectionReason,
      rescueMappingApplied: false,
      stage: "pre_tool",
      endpointPath: OPENAI_ENDPOINT_PATH,
      structuredSchemaUsed: true,
      requestPayloadBuilt: false,
      jsonSchemaValidationRequested: true,
      fallbackOccurred: true,
      ...failure
    }
  };
  return applyRescueMapping(input, output);
}

export async function getPreToolUnderstandingOpenAI(input: Input) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim().length < 20) {
    return getPreToolUnderstandingMock(
      input,
      "OPENAI_API_KEY missing/invalid; using mock pre-tool understanding.",
      "OpenAI provider unavailable: OPENAI_API_KEY missing or invalid.",
      { failureStage: "pre_tool", failureCategory: "missing_api_key", fallbackOccurred: true, requestPayloadBuilt: false }
    );
  }

  const endpoint = `${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}${OPENAI_ENDPOINT_PATH}`;

  try {
    const requestBody = {
      model: OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: buildSystemPrompt() }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: JSON.stringify(input) }]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "pretool_understanding",
          strict: true,
          schema: PRETOOL_UNDERSTANDING_SCHEMA
        }
      }
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return getPreToolUnderstandingMock(
        input,
        `OpenAI error ${response.status}; using mock pre-tool understanding.`,
        `OpenAI provider request failed at stage=pre_tool endpoint=${OPENAI_ENDPOINT_PATH} model=${OPENAI_MODEL} with HTTP ${response.status}. Body: ${errorBody.slice(0, 300)}.`,
        {
          failureStage: "pre_tool",
          failureCategory: "http_error",
          failureStatusCode: response.status,
          failureResponseBody: errorBody.slice(0, 1200),
          endpointPath: OPENAI_ENDPOINT_PATH,
          model: OPENAI_MODEL,
          requestPayloadBuilt: Boolean(requestBody.input?.length),
          structuredSchemaUsed: true,
          jsonSchemaValidationRequested: true,
          fallbackOccurred: true
        }
      );
    }

    const payload = (await response.json()) as { output_text?: string };
    const rawOutput = payload.output_text ?? "{}";
    const parsed = safeJsonParse(rawOutput);
    if (!parsed) {
      const mock = await getPreToolUnderstandingMock(
        input,
        "Model output was not valid JSON; reverted to mock pre-tool understanding.",
        "OpenAI output failed JSON validation at pre_tool stage; using mock fallback.",
        {
          failureStage: "pre_tool",
          failureCategory: "invalid_json",
          endpointPath: OPENAI_ENDPOINT_PATH,
          model: OPENAI_MODEL,
          requestPayloadBuilt: true,
          structuredSchemaUsed: true,
          jsonSchemaValidationRequested: true,
          fallbackOccurred: true
        }
      );
      return { ...mock, diagnostics: { ...mock.diagnostics, rawOutput, validationStatus: "fallback" as const } };
    }

    const sanitized = sanitize(parsed, input);
    const output: ProviderOutput = {
      understanding: sanitized.understanding,
      diagnostics: {
        provider: "openai" as const,
        model: OPENAI_MODEL,
        promptType: PROMPT_TYPE,
        rawOutput,
        validationStatus: sanitized.validationStatus,
        fallbackBehavior: "If validation fails, sanitize and keep deterministic guardrails.",
        providerSelectionReason: "OpenAI provider selected: valid API key detected.",
        rescueMappingApplied: false,
        stage: "pre_tool",
        endpointPath: OPENAI_ENDPOINT_PATH,
        structuredSchemaUsed: true,
        requestPayloadBuilt: true,
        jsonSchemaValidationRequested: true,
        fallbackOccurred: false
      }
    };
    return applyRescueMapping(input, output);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return getPreToolUnderstandingMock(
      input,
      "OpenAI request failed; using mock pre-tool understanding.",
      `OpenAI provider unavailable at stage=pre_tool endpoint=${OPENAI_ENDPOINT_PATH} model=${OPENAI_MODEL}: ${errorMessage}`,
      {
        failureStage: "pre_tool",
        failureCategory: "network_error",
        failureResponseBody: errorMessage,
        endpointPath: OPENAI_ENDPOINT_PATH,
        model: OPENAI_MODEL,
        requestPayloadBuilt: true,
        structuredSchemaUsed: true,
        jsonSchemaValidationRequested: true,
        fallbackOccurred: true
      }
    );
  }
}

export async function getPreToolUnderstanding(input: Input) {
  if (PRETOOL_PROVIDER !== "openai") {
    return getPreToolUnderstandingMock(
      input,
      "Pre-tool OpenAI provider disabled; using mock pre-tool understanding.",
      `Pre-tool provider set to '${PRETOOL_PROVIDER}'; OpenAI disabled for this node.`,
      { failureStage: "pre_tool", failureCategory: "provider_disabled", fallbackOccurred: true, requestPayloadBuilt: false }
    );
  }

  return getPreToolUnderstandingOpenAI(input);
}
