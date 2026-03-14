import { ResponseGenerationContext, ResponseGenerationDiagnostics } from "@/types/session";

const OPENAI_MODEL = process.env.OPENAI_RESPONSE_MODEL ?? "gpt-5-mini";
const OPENAI_ENDPOINT_PATH = "/responses";
const MAX_RESPONSE_LENGTH = 220;
const TONE_SETTINGS = ["calm", "helpful", "empathetic", "voice-friendly", "concise"];
const GUARDRAIL_NOTE = "Unsupported facts must not be invented. Use only structured context.";

const RESPONSE_TEXT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["responseText"],
  properties: {
    responseText: { type: "string" }
  }
} as const;

const CONVERSATIONAL_FALLBACKS: Record<string, string> = {
  greet_and_invite: "Hi — how can I help you today?",
  small_talk_and_invite: "I’m doing well, thanks. What can I help you with today?",
  acknowledge_thanks: "You’re welcome. Let me know if you’d like me to check anything else.",
  farewell_close: "You’re all set. Take care.",
  repair_and_reset: "You’re right — sorry about that. Tell me what you’d like help with.",
  explain_and_continue: "I’m asking so I can narrow down the issue. If you want, I can also check outage status instead.",
  bounded_redirect: "I’m here to help with service and support issues. Tell me what you’d like me to check.",
  empathy_then_continue: "I hear you — that sounds frustrating. I can help with the next step when you’re ready."
};

function statusLabel(status?: string) {
  return (status ?? "UNKNOWN").toUpperCase();
}

function targetLabel(context: ResponseGenerationContext) {
  return [context.matchedRegion, context.matchedCategory].filter(Boolean).join(" ") || context.selectedRegionOrService || "that service";
}

function deterministicFromNormalizedResult(context: ResponseGenerationContext): string | undefined {
  const target = targetLabel(context);

  if (context.clarificationNeeded) {
    return context.clarificationPrompt ?? context.clarificationState;
  }

  if (context.supportIntent === "announcements") {
    const notifications = (context.normalizedToolResult?.notifications as Array<{ title?: string; body?: string }> | undefined) ?? [];
    if (!notifications.length) return "I checked announcements and there are no active notices right now.";
    const first = notifications[0];
    return `There’s one active announcement: ${first.title ?? "Service update"}. ${first.body ?? ""}`.trim();
  }

  if (context.supportIntent === "service_status" || context.toolName === "check_outage_status") {
    const normalizedStatus = statusLabel(context.overallStatus ?? context.serviceStatus);
    if (normalizedStatus === "OPERATIONAL") return `Good news — ${target} is currently operational with no broader outage reported.`;
    if (normalizedStatus === "PARTIAL_OUTAGE") return `I’m sorry — there’s currently a partial outage affecting ${target}. Our teams are actively working to restore full service as quickly as possible.`;
    if (normalizedStatus === "MAJOR_OUTAGE") return `I’m really sorry — there’s currently a major outage affecting ${target}. Our teams are working urgently to recover service as soon as possible.`;
    if (normalizedStatus === "MAINTENANCE") return `${target} is currently under planned maintenance. Service should stabilize as soon as that work is complete.`;
  }

  return undefined;
}

function mockFromContext(context: ResponseGenerationContext) {
  if (context.responseMode === "conversational_only" && context.responseStrategy && CONVERSATIONAL_FALLBACKS[context.responseStrategy]) return CONVERSATIONAL_FALLBACKS[context.responseStrategy];
  if (context.workflowPath === "clarify") return context.clarificationPrompt ?? context.clarificationState;
  if (context.pendingWorkflowState?.includes("awaiting_input")) return context.clarificationPrompt ?? context.clarificationState;
  if (context.workflowPath === "handoff" || context.handoffState.startsWith("Handoff required")) {
    return "I’m transferring you to a specialist now and sharing your case details so you won’t need to repeat yourself.";
  }

  const deterministic = deterministicFromNormalizedResult(context);
  if (deterministic) return deterministic;

  if (context.workflowResult.includes("reschedule_technician") && context.workflowResult.includes("succeeded")) {
    return "I’m sorry you’re not feeling well. Your technician visit has been rescheduled, and I can send a confirmation if you’d like.";
  }
  if (context.empathyNeeded && context.workflowResult.includes("No workflow action")) {
    return "I’m really sorry you’re dealing with that. I’m here with you, and I can help with the next step whenever you’re ready.";
  }
  if (context.workflowResult.includes("failed")) {
    return "I’m sorry — I couldn’t complete that action right now. I can connect you to a specialist immediately.";
  }
  return "Thanks for sharing that. Here’s what I can do next to help right away.";
}

export async function generateResponseWithMock(context: ResponseGenerationContext): Promise<ResponseGenerationDiagnostics> {
  const finalResponseText = mockFromContext(context);
  return {
    provider: "mock",
    model: "deterministic-mock-response-v1",
    source: "deterministic_template",
    stage: "post_tool",
    endpointPath: OPENAI_ENDPOINT_PATH,
    requestPayloadBuilt: false,
    structuredSchemaUsed: false,
    jsonSchemaValidationRequested: false,
    fallbackOccurred: true,
    toneSettings: TONE_SETTINGS,
    maxResponseLength: MAX_RESPONSE_LENGTH,
    structuredContext: context,
    finalResponseText,
    guardrailNote: GUARDRAIL_NOTE,
    fallbackBehavior: "Mock response template used when live generation is unavailable."
  };
}

function buildLlmUserContext(context: ResponseGenerationContext) {
  return {
    supportIntent: context.supportIntent,
    initialUserQuestion: context.initialUserQuestion,
    latestUserUtterance: context.originalUtterance,
    toolName: context.toolName,
    normalizedToolResult: context.normalizedToolResult,
    matchedRegion: context.matchedRegion,
    matchedCategory: context.matchedCategory,
    overallStatus: context.overallStatus,
    serviceStatus: context.serviceStatus,
    clarificationNeeded: context.clarificationNeeded,
    clarificationPrompt: context.clarificationPrompt,
    originalUtterance: context.originalUtterance,
    responseMode: context.responseMode,
    policyInstructions: context.policyInstructions,
    priorContext: context.followupCorrectionTurn || context.hasPendingQuestion ? context.previousToolContext : undefined
  };
}

export async function generateResponseWithOpenAI(context: ResponseGenerationContext): Promise<ResponseGenerationDiagnostics> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim().length < 20) {
    const mock = await generateResponseWithMock(context);
    return {
      ...mock,
      failureStage: "post_tool",
      failureCategory: "missing_api_key",
      fallbackBehavior: "OPENAI_API_KEY missing/invalid; mock response used.",
      requestPayloadBuilt: false
    };
  }

  const endpoint = `${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}${OPENAI_ENDPOINT_PATH}`;

  try {
    const requestBody = {
      model: OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You generate customer-support voice replies grounded only in supplied context and tool outputs. Treat initialUserQuestion as the user's original problem statement and latestUserUtterance as their most recent turn; use both when composing the answer so the reply stays on-topic and coherent. Do not use general world knowledge, and if evidence is missing say you cannot verify yet and ask a focused follow-up. Prioritize normalizedToolResult when present, and never invent unsupported facts. For service_status: OPERATIONAL means no broader outage; PARTIAL_OUTAGE means partial outage; MAJOR_OUTAGE means major outage; MAINTENANCE means maintenance. If status is PARTIAL_OUTAGE or MAJOR_OUTAGE, include a brief apology and a recovery-progress phrase. If status is OPERATIONAL, acknowledge positively without apologizing. If clarificationNeeded=true, ask exactly clarificationPrompt and do not add generic fallback copy. Keep answers natural, concise, and conversationally human."
            }
          ]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: JSON.stringify(buildLlmUserContext(context)) }]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "posttool_response",
          strict: true,
          schema: RESPONSE_TEXT_SCHEMA
        }
      },
      max_output_tokens: 130
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const mock = await generateResponseWithMock(context);
      return {
        ...mock,
        fallbackBehavior: `OpenAI error ${response.status}; deterministic response used.`,
        failureStage: "post_tool",
        failureCategory: "http_error",
        failureStatusCode: response.status,
        failureResponseBody: errorBody.slice(0, 1200),
        endpointPath: OPENAI_ENDPOINT_PATH,
        model: OPENAI_MODEL,
        requestPayloadBuilt: true,
        structuredSchemaUsed: true,
        jsonSchemaValidationRequested: true,
        fallbackOccurred: true
      };
    }

    const payload = (await response.json()) as { output_text?: string };
    let parsed: { responseText?: string } = {};
    if (payload.output_text) {
      try {
        parsed = JSON.parse(payload.output_text) as { responseText?: string };
      } catch {
        const mock = await generateResponseWithMock(context);
        return {
          ...mock,
          fallbackBehavior: "OpenAI output was not valid JSON; deterministic response used.",
          failureStage: "post_tool",
          failureCategory: "invalid_json",
          failureResponseBody: payload.output_text.slice(0, 1200),
          endpointPath: OPENAI_ENDPOINT_PATH,
          model: OPENAI_MODEL,
          requestPayloadBuilt: true,
          structuredSchemaUsed: true,
          jsonSchemaValidationRequested: true,
          fallbackOccurred: true
        };
      }
    }

    const candidate = typeof parsed.responseText === "string" ? parsed.responseText.trim() : "";
    const fallbackText = deterministicFromNormalizedResult(context) ?? (await generateResponseWithMock(context)).finalResponseText;
    const finalText = (candidate || fallbackText).replace(/\s{2,}/g, " ").trim().slice(0, MAX_RESPONSE_LENGTH);

    return {
      provider: "openai",
      model: OPENAI_MODEL,
      source: "llm_generated",
      stage: "post_tool",
      endpointPath: OPENAI_ENDPOINT_PATH,
      requestPayloadBuilt: true,
      structuredSchemaUsed: true,
      jsonSchemaValidationRequested: true,
      fallbackOccurred: false,
      toneSettings: TONE_SETTINGS,
      maxResponseLength: MAX_RESPONSE_LENGTH,
      structuredContext: context,
      finalResponseText: finalText,
      guardrailNote: GUARDRAIL_NOTE,
      fallbackBehavior: "If unavailable, fallback to deterministic response."
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const mock = await generateResponseWithMock(context);
    return {
      ...mock,
      fallbackBehavior: "OpenAI request failed; deterministic response used.",
      failureStage: "post_tool",
      failureCategory: "network_error",
      failureResponseBody: errorMessage,
      endpointPath: OPENAI_ENDPOINT_PATH,
      model: OPENAI_MODEL,
      requestPayloadBuilt: true,
      structuredSchemaUsed: true,
      jsonSchemaValidationRequested: true,
      fallbackOccurred: true
    };
  }
}

export async function getGeneratedResponse(context: ResponseGenerationContext): Promise<ResponseGenerationDiagnostics> {
  return generateResponseWithOpenAI(context);
}
