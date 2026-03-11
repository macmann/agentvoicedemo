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
  resolutionReason?: string;
}

export interface TroubleshootingResolutionDetection {
  resolved: boolean;
  resolutionPhraseMatched?: string;
  resolutionReason?: string;
}

const NEGATIVE_RESOLUTION_PATTERNS: RegExp[] = [
  /not\s+fixed/,
  /still\s+not\s+fixed/,
  /isn['’]?t\s+fixed/,
  /not\s+working/,
  /still\s+down/,
  /still\s+broken/,
  /didn['’]?t\s+fix/,
  /that\s+didn['’]?t\s+work/
];

const POSITIVE_RESOLUTION_PATTERNS: Array<{ pattern: RegExp; phrase: string }> = [
  { pattern: /it['’]?s\s+working\s+now/, phrase: "it's working now" },
  { pattern: /working\s+fine\s+now/, phrase: "working fine now" },
  { pattern: /that\s+fixed\s+it/, phrase: "that fixed it" },
  { pattern: /it['’]?s\s+fixed/, phrase: "it's fixed" },
  { pattern: /i['’]?m\s+back\s+online/, phrase: "i'm back online" },
  { pattern: /all\s+good\s+now/, phrase: "all good now" },
  { pattern: /it['’]?s\s+fine\s+now/, phrase: "it's fine now" },
  { pattern: /yes[,\s]+it\s+works\s+now/, phrase: "yes, it works now" },
  { pattern: /thank\s*you[,\s]+it\s+works\s+now/, phrase: "thank you, it works now" },
  { pattern: /internet\s+is\s+back/, phrase: "the internet is back" },
  { pattern: /resolved/, phrase: "resolved" },
  { pattern: /works\s+now/, phrase: "works now" },
  { pattern: /working\s+again/, phrase: "working again" },
  { pattern: /back\s+up/, phrase: "back up" }
];

export function detectTroubleshootingResolved(utterance: string): TroubleshootingResolutionDetection {
  const lowered = utterance.toLowerCase();
  const negative = NEGATIVE_RESOLUTION_PATTERNS.find((pattern) => pattern.test(lowered));
  if (negative) {
    return {
      resolved: false,
      resolutionReason: `negative_resolution_signal:${negative.source}`
    };
  }

  const positive = POSITIVE_RESOLUTION_PATTERNS.find(({ pattern }) => pattern.test(lowered));
  if (!positive) return { resolved: false, resolutionReason: "no_resolution_phrase_match" };

  return {
    resolved: true,
    resolutionPhraseMatched: positive.phrase,
    resolutionReason: "explicit_resolution_confirmation"
  };
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
}): { state: TroubleshootingState; responseText: string; selectedStep?: string; resolutionDetection: TroubleshootingResolutionDetection } {
  const maxSteps = input.maxStepsBeforeEscalation ?? 4;
  const resolutionDetection = detectTroubleshootingResolved(input.utterance);

  if (resolutionDetection.resolved) {
    return {
      state: {
        ...(input.previous ?? {
          active: true,
          suspectedSymptoms: [],
          selectedKBSections: [],
          currentStepIndex: 0,
          stepsShown: []
        }),
        active: false,
        kbSource: input.kb.source,
        resolutionStatus: "resolved",
        resolutionReason: resolutionDetection.resolutionReason
      },
      responseText: "Glad that fixed it. I’ll mark this as resolved.",
      resolutionDetection
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
      responseText: "Thanks for trying those steps. I’m escalating this to human support and sharing what we already checked.",
      resolutionDetection
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
    selectedStep: step,
    resolutionDetection
  };
}
