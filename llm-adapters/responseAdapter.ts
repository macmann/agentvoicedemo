import { ResponseGenerationContext, ResponseGenerationDiagnostics } from "@/types/session";

function generateResponseWithMock(context: ResponseGenerationContext): ResponseGenerationDiagnostics {
  if (context.workflowPath === "clarify") {
    return {
      provider: "mock",
      model: "deterministic-mock-response-v1",
      toneSettings: ["calm", "helpful", "empathetic", "voice-friendly", "concise"],
      maxResponseLength: 220,
      structuredContext: context,
      finalResponseText: context.clarificationState,
      guardrailNote: "Unsupported facts must not be invented. Use only structured context.",
      fallbackBehavior: "Client mock response used due to API issue."
    };
  }

  return {
    provider: "mock",
    model: "deterministic-mock-response-v1",
    toneSettings: ["calm", "helpful", "empathetic", "voice-friendly", "concise"],
    maxResponseLength: 220,
    structuredContext: context,
    finalResponseText: "Thanks for sharing that. I can help with the next step right away.",
    guardrailNote: "Unsupported facts must not be invented. Use only structured context.",
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
