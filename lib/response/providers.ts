import { ResponseGenerationContext, ResponseGenerationDiagnostics } from "@/types/session";

const OPENAI_MODEL = process.env.OPENAI_RESPONSE_MODEL ?? "gpt-5-mini";
const MAX_RESPONSE_LENGTH = 220;
const TONE_SETTINGS = ["calm", "helpful", "empathetic", "voice-friendly", "concise"];
const GUARDRAIL_NOTE = "Unsupported facts must not be invented. Use only structured context.";

function mockFromContext(context: ResponseGenerationContext) {
  if (context.workflowPath === "clarify") return context.clarificationState;
  if (context.workflowPath === "handoff" || context.handoffState.startsWith("Handoff required")) {
    return "I’m transferring you to a specialist now and sharing your case details so you won’t need to repeat yourself.";
  }
  if (context.workflowResult.includes("check_outage_status") && context.workflowResult.includes("succeeded")) {
    return "I’m sorry about the interruption. There is a confirmed outage in your area, and service is expected back in about 2 hours.";
  }
  if (context.workflowResult.includes("reschedule_technician") && context.workflowResult.includes("succeeded")) {
    return "I’m sorry you’re not feeling well. Your technician visit has been rescheduled, and I can send a confirmation if you’d like.";
  }
  if (context.empathyNeeded && context.workflowResult.includes("No workflow action")) {
    return "I’m really sorry you’re dealing with that. I’m here with you, and I can help with any next step whenever you’re ready.";
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
              "You generate customer-support voice replies. Keep it short, spoken-language friendly, calm, helpful, empathetic, one main message, and grounded only in supplied context. Never invent unsupported facts."
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
    const finalResponseText = payload.choices?.[0]?.message?.content?.trim() || (await generateResponseWithMock(context)).finalResponseText;

    return {
      provider: "openai",
      model: OPENAI_MODEL,
      toneSettings: TONE_SETTINGS,
      maxResponseLength: MAX_RESPONSE_LENGTH,
      structuredContext: context,
      finalResponseText: finalResponseText.slice(0, MAX_RESPONSE_LENGTH),
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
