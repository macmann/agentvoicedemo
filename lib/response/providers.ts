import { ResponseGenerationContext, ResponseGenerationDiagnostics } from "@/types/session";

const OPENAI_MODEL = process.env.OPENAI_RESPONSE_MODEL ?? "gpt-5-mini";
const MAX_RESPONSE_LENGTH = 220;
const TONE_SETTINGS = ["calm", "helpful", "empathetic", "voice-friendly", "concise"];
const GUARDRAIL_NOTE = "Unsupported facts must not be invented. Use only structured context.";

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

function mockFromContext(context: ResponseGenerationContext) {
  if (context.responseMode === "conversational_only" && context.responseStrategy && CONVERSATIONAL_FALLBACKS[context.responseStrategy]) return CONVERSATIONAL_FALLBACKS[context.responseStrategy];
  if (context.workflowPath === "clarify") return context.clarificationState;
  if (context.pendingWorkflowState?.includes("awaiting_input")) return context.clarificationState;
  if (context.workflowPath === "handoff" || context.handoffState.startsWith("Handoff required")) {
    return "I’m transferring you to a specialist now and sharing your case details so you won’t need to repeat yourself.";
  }
  if (context.workflowResult.includes("\"overallStatus\":\"PARTIAL_OUTAGE\"")) {
    return "Yes, Core Internet is currently experiencing a partial outage. We expect recovery in about 2 hours. Is there anything else I can help you with?";
  }
  if (context.workflowResult.includes("\"overallStatus\":\"MAJOR_OUTAGE\"")) {
    return "There is a major outage affecting that service right now. Our teams are actively working on restoration.";
  }
  if (context.workflowResult.includes("\"clarificationNeeded\":true")) {
    return "I couldn’t confidently identify the service or region. Could you tell me the exact service name?";
  }
  if (context.workflowResult.includes("fetch_notifications") && context.workflowResult.includes("succeeded")) {
    return "I checked the latest announcements and found active service notifications. I can read the latest one if you want.";
  }
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
    toneSettings: TONE_SETTINGS,
    maxResponseLength: MAX_RESPONSE_LENGTH,
    structuredContext: context,
    finalResponseText,
    guardrailNote: GUARDRAIL_NOTE,
    fallbackBehavior: "Mock response template used when live generation is unavailable."
  };
}

export async function generateResponseWithOpenAI(context: ResponseGenerationContext): Promise<ResponseGenerationDiagnostics> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim().length < 20) return generateResponseWithMock(context);

  const endpoint = `${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.2,
        max_tokens: 110,
        messages: [
          {
            role: "system",
            content:
              "You generate customer-support voice replies. Output must be strictly grounded in normalizedToolResult/context and never add unsupported facts. Be concise and natural. Correctly distinguish OPERATIONAL vs PARTIAL_OUTAGE vs MAJOR_OUTAGE vs MAINTENANCE. Never say outage wording for OPERATIONAL. Ask at most one follow-up question only when clarificationStillNeeded=true."
          },
          { role: "user", content: JSON.stringify(context) }
        ]
      })
    });

    if (!response.ok) {
      const mock = await generateResponseWithMock(context);
      return { ...mock, fallbackBehavior: `OpenAI error ${response.status}; mock response used.` };
    }

    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const rawText = payload.choices?.[0]?.message?.content?.trim() || (await generateResponseWithMock(context)).finalResponseText;
    const sanitizedText = rawText
      .replace(/experiencing\s+a\s+operational/gi, "operational")
      .replace(/\s{2,}/g, " ")
      .trim();

    return {
      provider: "openai",
      model: OPENAI_MODEL,
      source: "llm_generated",
      toneSettings: TONE_SETTINGS,
      maxResponseLength: MAX_RESPONSE_LENGTH,
      structuredContext: context,
      finalResponseText: sanitizedText.slice(0, MAX_RESPONSE_LENGTH),
      guardrailNote: GUARDRAIL_NOTE,
      fallbackBehavior: "If unavailable, fallback to deterministic mock response."
    };
  } catch {
    const mock = await generateResponseWithMock(context);
    return { ...mock, fallbackBehavior: "OpenAI request failed; mock response used." };
  }
}

export async function getGeneratedResponse(context: ResponseGenerationContext): Promise<ResponseGenerationDiagnostics> {
  return generateResponseWithOpenAI(context);
}
