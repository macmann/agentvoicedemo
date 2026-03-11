import { PreToolUnderstandingDiagnostics, PreToolUnderstandingResult } from "@/types/session";

export interface PreToolUnderstandingProviderResult {
  understanding: PreToolUnderstandingResult;
  diagnostics: PreToolUnderstandingDiagnostics;
}

export interface PreToolUnderstandingInput {
  utterance: string;
  recentConversation?: Array<{ role: string; text: string }>;
  activeSupportIntent?: "service_status" | "announcements";
  pendingQuestion?: { expectedSlot?: string; prompt?: string };
  pendingWorkflow?: { workflowName?: string; missingSlots?: string[] };
  previousToolContext?: { toolName?: string; normalizedResult?: unknown };
}

function defaultFallback(input: PreToolUnderstandingInput): PreToolUnderstandingProviderResult {
  return {
    understanding: {
      inferredSupportIntent: "none",
      turnAct: "unclear",
      intentConfidence: 0.5,
      entities: {},
      clarificationNeeded: false,
      continuationDetected: false,
      correctionDetected: false,
      handoffRecommended: false,
      reason: "Pre-tool adapter fallback used."
    },
    diagnostics: {
      provider: "mock",
      model: "deterministic-mock-pretool-v1",
      promptType: "pretool_understanding_v1",
      rawOutput: JSON.stringify({ utterance: input.utterance }),
      validationStatus: "fallback",
      fallbackBehavior: "Pre-tool API unavailable; deterministic-only understanding used.",
      providerSelectionReason: "Pre-tool endpoint unavailable from client adapter.",
      rescueMappingApplied: false
    }
  };
}

export async function getPreToolUnderstandingResult(input: PreToolUnderstandingInput): Promise<PreToolUnderstandingProviderResult> {
  try {
    const response = await fetch("/api/pretool-understanding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });

    if (!response.ok) return defaultFallback(input);

    return (await response.json()) as PreToolUnderstandingProviderResult;
  } catch {
    return defaultFallback(input);
  }
}
