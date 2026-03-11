import { PreToolUnderstandingResult } from "@/types/session";
import { TroubleshootingKbDocument, rankSectionsBySymptoms } from "@/orchestration/troubleshootingKb";

export type TroubleshootingResolutionStatus = "in_progress" | "resolved" | "escalate";

export interface TroubleshootingState {
  active: boolean;
  issueType?: string;
  suspectedSymptoms: string[];
  selectedKBSections: string[];
  currentStepIndex: number;
  stepsShown: string[];
  resolutionStatus: TroubleshootingResolutionStatus;
  kbSource?: string;
  escalationSummary?: string;
}

export function detectTroubleshootingResolved(utterance: string): boolean {
  const lowered = utterance.toLowerCase();
  if (/not\s+fixed|still\s+not\s+fixed|isn't\s+fixed|not\s+working|still\s+down/.test(lowered)) return false;
  return ["fixed", "works now", "working now", "resolved", "all good", "it works", "solved"].some((token) => lowered.includes(token));
}

export function detectHomeInternetIssue(utterance: string): boolean {
  const lowered = utterance.toLowerCase();
  const issueTerms = ["internet", "wi-fi", "wifi", "router", "modem", "connection", "offline", "not working", "no internet", "still down"];
  return issueTerms.some((token) => lowered.includes(token));
}

function extractSuspectedSymptoms(utterance: string, preTool?: PreToolUnderstandingResult): string[] {
  const lowered = utterance.toLowerCase();
  const symptoms = new Set<string>();

  if (/red|blinking|blink/.test(lowered)) symptoms.add("red_or_blinking_light");
  if (/no lights|lights off|no power/.test(lowered)) symptoms.add("router_no_lights");
  if (/(wi-?fi|wifi).*(no internet|not working)|connected but no internet/.test(lowered)) symptoms.add("wifi_connected_no_internet");
  if (/slow|unstable|dropping|disconnect/.test(lowered)) symptoms.add("slow_or_unstable_connection");

  if (preTool?.reason) symptoms.add(preTool.reason.toLowerCase());

  return [...symptoms];
}

export function shouldEnterTroubleshooting(params: {
  previousStatusOperational: boolean;
  activeSupportIntent?: "service_status" | "announcements" | "troubleshooting";
  utterance: string;
  kbMode: "off" | "on";
}): boolean {
  if (params.kbMode === "off") return false;
  return Boolean(params.previousStatusOperational && params.activeSupportIntent === "service_status" && detectHomeInternetIssue(params.utterance));
}

export function buildTroubleshootingResponse(input: {
  utterance: string;
  kb: TroubleshootingKbDocument;
  previous?: TroubleshootingState;
  preTool?: PreToolUnderstandingResult;
  maxStepsBeforeEscalation?: number;
}): { state: TroubleshootingState; responseText: string; selectedStep?: string } {
  const maxSteps = input.maxStepsBeforeEscalation ?? 4;

  if (detectTroubleshootingResolved(input.utterance)) {
    return {
      state: {
        ...(input.previous ?? {
          active: true,
          suspectedSymptoms: [],
          selectedKBSections: [],
          currentStepIndex: 0,
          stepsShown: []
        }),
        active: true,
        kbSource: input.kb.source,
        resolutionStatus: "resolved"
      },
      responseText: "Glad that fixed it. I’ll mark this as resolved."
    };
  }

  const suspectedSymptoms = extractSuspectedSymptoms(input.utterance, input.preTool);
  const ranked = rankSectionsBySymptoms({ kb: input.kb, utterance: input.utterance, suspectedSymptoms });
  const selectedSections = ranked.length ? ranked.slice(0, 2) : input.kb.sections.slice(0, 1);
  const mergedSectionIds = [...new Set([...(input.previous?.selectedKBSections ?? []), ...selectedSections.map((section) => section.id)])];

  const steps = mergedSectionIds
    .map((id) => input.kb.sections.find((section) => section.id === id))
    .filter((section): section is NonNullable<typeof section> => Boolean(section))
    .flatMap((section) => section.steps.map((step) => `${section.title}: ${step}`));

  const currentStepIndex = input.previous ? input.previous.currentStepIndex + 1 : 0;
  const step = steps[currentStepIndex];
  const stepsShown = [...(input.previous?.stepsShown ?? []), ...(step ? [step] : [])];

  if (!step || stepsShown.length >= maxSteps) {
    const escalationSummary = `Troubleshooting attempted ${stepsShown.length} steps from ${mergedSectionIds.join(", ") || "default"}; issue remains unresolved.`;
    return {
      state: {
        active: true,
        issueType: mergedSectionIds[0],
        suspectedSymptoms,
        selectedKBSections: mergedSectionIds,
        currentStepIndex,
        stepsShown,
        resolutionStatus: "escalate",
        kbSource: input.kb.source,
        escalationSummary
      },
      responseText: "Thanks for trying those steps. I’m escalating this to human support and sharing what we already checked."
    };
  }

  const intro = input.previous?.active
    ? "Thanks — let’s try the next troubleshooting step."
    : "Okay — the wider service looks normal, so let’s try a few troubleshooting steps.";

  return {
    state: {
      active: true,
      issueType: mergedSectionIds[0],
      suspectedSymptoms,
      selectedKBSections: mergedSectionIds,
      currentStepIndex,
      stepsShown,
      resolutionStatus: "in_progress",
      kbSource: input.kb.source
    },
    responseText: `${intro} ${step} Did that resolve it?`,
    selectedStep: step
  };
}
