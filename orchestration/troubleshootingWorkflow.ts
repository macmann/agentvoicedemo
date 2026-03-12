import { PreToolUnderstandingResult } from "@/types/session";
import { TroubleshootingKbDocument, rankSectionsBySymptoms } from "@/orchestration/troubleshootingKb";

export type TroubleshootingResolutionStatus = "in_progress" | "resolved" | "service_visit";

const SERVICE_VISIT_SLOTS = ["Tomorrow 10am-11am", "Tomorrow 3pm-4pm"] as const;

type ServiceVisitStage = "offered" | "slot_selected" | "confirmed";

interface ServiceVisitState {
  stage: ServiceVisitStage;
  availableSlots: string[];
  selectedSlot?: string;
}

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
  serviceVisit?: ServiceVisitState;
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
  const issueTerms = [
    "internet",
    "wi-fi",
    "wifi",
    "router",
    "modem",
    "connection",
    "offline",
    "not working",
    "no internet",
    "still down",
    "troubleshoot",
    "troubleshooting",
    "help me troubleshoot",
    "can you troubleshoot"
  ];
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

  if (input.previous?.serviceVisit) {
    const availableSlots = input.previous.serviceVisit.availableSlots?.length ? input.previous.serviceVisit.availableSlots : [...SERVICE_VISIT_SLOTS];
    const selectedFromUtterance = resolveServiceVisitSlot(input.utterance, availableSlots);

    if (input.previous.serviceVisit.stage === "offered") {
      if (!selectedFromUtterance) {
        return {
          state: {
            ...input.previous,
            active: true,
            kbSource: input.kb.source,
            resolutionStatus: "service_visit",
            serviceVisit: { ...input.previous.serviceVisit, stage: "offered", availableSlots }
          },
          responseText: `This might require our service team to visit your location. Available slots are ${availableSlots[0]} and ${availableSlots[1]}. Please pick one slot.`,
          resolutionDetection
        };
      }

      return {
        state: {
          ...input.previous,
          active: true,
          kbSource: input.kb.source,
          resolutionStatus: "service_visit",
          serviceVisit: { stage: "slot_selected", availableSlots, selectedSlot: selectedFromUtterance }
        },
        responseText: `Great — I can book ${selectedFromUtterance}. Please confirm if I should proceed with this service visit slot.`,
        resolutionDetection
      };
    }

    if (input.previous.serviceVisit.stage === "slot_selected") {
      const selectedSlot = input.previous.serviceVisit.selectedSlot;
      if (selectedFromUtterance && selectedFromUtterance !== selectedSlot) {
        return {
          state: {
            ...input.previous,
            active: true,
            kbSource: input.kb.source,
            resolutionStatus: "service_visit",
            serviceVisit: { stage: "slot_selected", availableSlots, selectedSlot: selectedFromUtterance }
          },
          responseText: `Updated — I can book ${selectedFromUtterance}. Please confirm if I should proceed.`,
          resolutionDetection
        };
      }

      if (detectConfirmation(input.utterance)) {
        return {
          state: {
            ...input.previous,
            active: false,
            kbSource: input.kb.source,
            resolutionStatus: "resolved",
            resolutionReason: "service_visit_booked",
            serviceVisit: { stage: "confirmed", availableSlots, selectedSlot }
          },
          responseText: `Done — your service visit is booked for ${selectedSlot}. You’re all set.`,
          resolutionDetection
        };
      }

      return {
        state: {
          ...input.previous,
          active: true,
          kbSource: input.kb.source,
          resolutionStatus: "service_visit",
          serviceVisit: { stage: "slot_selected", availableSlots, selectedSlot }
        },
        responseText: `Please confirm the booking for ${selectedSlot}, or choose another slot: ${availableSlots[0]} or ${availableSlots[1]}.`,
        resolutionDetection
      };
    }
  }

  const suspectedSymptoms = extractSuspectedSymptoms(input.utterance, input.preTool);
  const ranked = rankSectionsBySymptoms({ kb: input.kb, utterance: input.utterance, suspectedSymptoms });
  const selectedSections = ranked.length ? ranked.slice(0, 2) : input.kb.sections.slice(0, 1);
  const rankedSectionIds = selectedSections.map((section) => section.id);
  const previousSectionIds = input.previous?.selectedKBSections ?? [];
  const mergedSectionIds = [...new Set([...rankedSectionIds, ...previousSectionIds])];
  const shouldResetProgress = Boolean(
    input.previous?.active && rankedSectionIds[0] && rankedSectionIds[0] !== previousSectionIds[0]
  );

  const steps = mergedSectionIds
    .map((id) => input.kb.sections.find((section) => section.id === id))
    .filter((section): section is NonNullable<typeof section> => Boolean(section))
    .flatMap((section) => section.steps.map((step) => `${section.title}: ${step}`));

  const currentStepIndex = shouldResetProgress ? 0 : input.previous ? input.previous.currentStepIndex + 1 : 0;
  const step = steps[currentStepIndex];
  const stepsShown = shouldResetProgress ? (step ? [step] : []) : [...(input.previous?.stepsShown ?? []), ...(step ? [step] : [])];

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
        resolutionStatus: "service_visit",
        kbSource: input.kb.source,
        escalationSummary,
        serviceVisit: {
          stage: "offered",
          availableSlots: [...SERVICE_VISIT_SLOTS]
        }
      },
      responseText: `This might require our service team to visit your location. Available slots are ${SERVICE_VISIT_SLOTS[0]} and ${SERVICE_VISIT_SLOTS[1]}. Please pick one slot.`,
      resolutionDetection
    };
  }

  const intro = input.previous?.active
    ? shouldResetProgress
      ? "Thanks — that helps. Let’s switch to the most relevant troubleshooting steps."
      : "Thanks — let’s try the next troubleshooting step."
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

function resolveServiceVisitSlot(utterance: string, availableSlots: string[]): string | undefined {
  const lowered = utterance.toLowerCase();
  if (lowered.includes("10") || lowered.includes("10am") || lowered.includes("morning") || lowered.includes("first")) {
    return availableSlots[0];
  }
  if (lowered.includes("3") || lowered.includes("3pm") || lowered.includes("afternoon") || lowered.includes("second")) {
    return availableSlots[1];
  }

  return availableSlots.find((slot) => lowered.includes(slot.toLowerCase()));
}

function detectConfirmation(utterance: string): boolean {
  const lowered = utterance.toLowerCase();
  return ["yes", "confirm", "book it", "proceed", "go ahead", "ok", "okay", "sounds good"].some((token) => lowered.includes(token));
}
