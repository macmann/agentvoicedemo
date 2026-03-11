import { ResponseGenerationContext, ResponseGenerationDiagnostics } from "@/types/session";

const TONE_SETTINGS = ["calm", "helpful", "empathetic", "voice-friendly", "concise"];
const MAX_RESPONSE_LENGTH = 220;
const GUARDRAIL_NOTE = "Unsupported facts must not be invented. Use only structured context.";

const CONVERSATIONAL_FALLBACKS: Record<string, string> = {
  greet_and_invite: "Hi — how can I help you today?",
  small_talk_and_invite: "I’m doing well, thanks. What can I help you with today?",
  acknowledge_thanks: "You’re welcome. Let me know if you’d like me to check anything else.",
  farewell_close: "You’re all set. Take care.",
  repair_and_reset: "You’re right — sorry about that. Tell me what you’d like help with.",
  explain_and_continue: "I’m asking so I can narrow down the issue. If you want, I can also check outage status instead.",
  bounded_redirect: "I’m here to help with service and support issues. Tell me what you’d like me to check.",
  empathy_then_continue: "I hear you — that sounds frustrating. I can help with the next step when you’re ready.",
  isolated_issue_escalation: "Service looks normal overall, so this may be isolated to your home connection. I can connect you with human support for the next step."
};

function mockFromContext(context: ResponseGenerationContext): string {
  if (context.responseMode === "conversational_only" && context.responseStrategy && CONVERSATIONAL_FALLBACKS[context.responseStrategy]) return CONVERSATIONAL_FALLBACKS[context.responseStrategy];
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
