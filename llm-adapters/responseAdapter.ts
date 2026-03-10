import { ResponseGenerationContext, ResponseGenerationDiagnostics } from "@/types/session";

const TONE_SETTINGS = ["calm", "helpful", "empathetic", "voice-friendly", "concise"];
const MAX_RESPONSE_LENGTH = 220;
const GUARDRAIL_NOTE = "Unsupported facts must not be invented. Use only structured context.";

function mockFromContext(context: ResponseGenerationContext): string {
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

function generateResponseWithMock(context: ResponseGenerationContext): ResponseGenerationDiagnostics {
  return {
    provider: "mock",
    model: "deterministic-mock-response-v1",
    toneSettings: TONE_SETTINGS,
    maxResponseLength: MAX_RESPONSE_LENGTH,
    structuredContext: context,
    finalResponseText: mockFromContext(context),
    guardrailNote: GUARDRAIL_NOTE,
    fallbackBehavior: "Client mock response used due to API issue."
  };
}

export async function generateResponseWithOpenAI(context: ResponseGenerationContext): Promise<ResponseGenerationDiagnostics> {
  const response = await fetch("/api/response", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context })
  });

  if (!response.ok) {
    return generateResponseWithMock(context);
  }

  return (await response.json()) as ResponseGenerationDiagnostics;
}

export async function getGeneratedResponse(context: ResponseGenerationContext): Promise<ResponseGenerationDiagnostics> {
  try {
    return await generateResponseWithOpenAI(context);
  } catch {
    return generateResponseWithMock(context);
  }
}
