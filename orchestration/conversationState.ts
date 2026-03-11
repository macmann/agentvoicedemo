import { WORKFLOW_SLOT_CONFIG } from "@/orchestration/workflowSlots";
import { PendingQuestionState, PendingWorkflowState, SessionState } from "@/types/session";

const REGION_OR_SERVICE_HINTS = ["internet", "mobile", "fiber", "core", "downtown", "uptown", "east", "west", "north", "south", "region"];
const POSTCODE_REGEX = /\b([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}|\d{5})\b/i;
const ISO_DATE_REGEX = /\b(\d{4}-\d{2}-\d{2})\b/;
const AMBIGUOUS_SLOT_ANSWERS = ["not sure", "whatever", "anything", "idk", "don't know", "frustrating", "this is frustrating"];

const ALL_DEVICE_PATTERNS = ["all devices", "everything", "all of them", "whole house", "entire house", "all offline", "all"];
const SINGLE_DEVICE_PATTERNS = ["one device", "only one", "single device", "just my", "my phone", "my laptop", "only my", "just one"];
const TIME_WINDOW_PATTERNS: Array<{ token: string; normalized: string }> = [
  { token: "morning", normalized: "morning" },
  { token: "afternoon", normalized: "afternoon" },
  { token: "evening", normalized: "evening" },
  { token: "night", normalized: "night" }
];

export interface SlotResolutionResult {
  matched: boolean;
  confidence: "high" | "medium" | "low";
  normalizedValue?: string;
  rawValue?: string;
  reason: "matched" | "ambiguous" | "no_match";
}

function toKnownWorkflowName(name?: string): PendingWorkflowState["workflowName"] | undefined {
  if (name === "diagnose_connectivity") return name;
  if (name === "check_outage_status") return name;
  if (name === "reschedule_technician") return name;
  if (name === "create_support_ticket") return name;
  return undefined;
}

function normalizeDateSlot(utterance: string): SlotResolutionResult {
  const lowered = utterance.toLowerCase().trim();
  const isoDate = utterance.match(ISO_DATE_REGEX)?.[1];
  if (isoDate) {
    return { matched: true, confidence: "high", normalizedValue: isoDate, rawValue: utterance.trim(), reason: "matched" };
  }

  const day = lowered.includes("tomorrow") ? "tomorrow" : lowered.includes("today") ? "today" : undefined;
  const timeWindow = TIME_WINDOW_PATTERNS.find((pattern) => lowered.includes(pattern.token))?.normalized;

  if (day && timeWindow) {
    return { matched: true, confidence: "high", normalizedValue: `${day}_${timeWindow}`, rawValue: utterance.trim(), reason: "matched" };
  }
  if (day) {
    return { matched: true, confidence: "medium", normalizedValue: day, rawValue: utterance.trim(), reason: "matched" };
  }

  if (lowered.length > 2 && /\d/.test(lowered)) {
    return { matched: true, confidence: "medium", normalizedValue: utterance.trim(), rawValue: utterance.trim(), reason: "matched" };
  }

  return { matched: false, confidence: "low", reason: "no_match" };
}

function normalizeDeviceScopeSlot(utterance: string): SlotResolutionResult {
  const lowered = utterance.toLowerCase().trim();
  if (ALL_DEVICE_PATTERNS.some((pattern) => lowered.includes(pattern))) {
    return { matched: true, confidence: "high", normalizedValue: "all_devices", rawValue: utterance.trim(), reason: "matched" };
  }

  if (SINGLE_DEVICE_PATTERNS.some((pattern) => lowered.includes(pattern))) {
    return { matched: true, confidence: "high", normalizedValue: "single_device", rawValue: utterance.trim(), reason: "matched" };
  }

  if (lowered.includes("device") && lowered.length <= 40) {
    return { matched: false, confidence: "low", reason: "ambiguous" };
  }

  return { matched: false, confidence: "low", reason: "no_match" };
}

export function resolvePendingQuestionAnswer(utterance: string, pendingQuestion?: PendingQuestionState): SlotResolutionResult {
  if (!pendingQuestion) return { matched: false, confidence: "low", reason: "no_match" };

  if (pendingQuestion.expectedSlot === "serviceNameOrDevice") {
    return normalizeDeviceScopeSlot(utterance);
  }

  if (pendingQuestion.expectedSlot === "date") {
    return normalizeDateSlot(utterance);
  }

  if (pendingQuestion.expectedSlot === "serviceNameOrRegion") {
    const lowered = utterance.toLowerCase().trim();
    if (AMBIGUOUS_SLOT_ANSWERS.some((phrase) => lowered.includes(phrase))) {
      return { matched: false, confidence: "low", reason: "ambiguous" };
    }
    const postcode = utterance.match(POSTCODE_REGEX)?.[1];
    if (postcode) {
      return { matched: true, confidence: "high", normalizedValue: postcode.toUpperCase().replace(/\s+/g, ""), rawValue: utterance.trim(), reason: "matched" };
    }
    if (lowered.length <= 40) {
      return { matched: true, confidence: REGION_OR_SERVICE_HINTS.some((token) => lowered.includes(token)) ? "high" : "medium", normalizedValue: utterance.trim(), rawValue: utterance.trim(), reason: "matched" };
    }
    return { matched: false, confidence: "low", reason: "no_match" };
  }

  return { matched: false, confidence: "low", reason: "no_match" };
}

function extractConversationSlots(utterance: string): Record<string, string> {
  const slots: Record<string, string> = {};
  const lowered = utterance.toLowerCase().trim();
  const postcode = utterance.match(POSTCODE_REGEX)?.[1];
  const isoDate = utterance.match(ISO_DATE_REGEX)?.[1];

  if (postcode) {
    slots.postcode = postcode.toUpperCase().replace(/\s+/g, "");
    slots.serviceNameOrRegion = slots.postcode;
  }
  if (isoDate) slots.date = isoDate;
  if (lowered.includes("today")) slots.date = "today";
  if (lowered.includes("tomorrow")) slots.date = "tomorrow";

  if (REGION_OR_SERVICE_HINTS.some((token) => lowered.includes(token))) {
    slots.serviceNameOrRegion = utterance.trim();
    slots.serviceNameOrDevice = utterance.trim();
  }

  if (lowered.includes("router") || lowered.includes("modem") || lowered.includes("device")) {
    slots.serviceNameOrDevice = utterance.trim();
    slots.device = utterance.trim();
  }

  return slots;
}

export function deriveConversationState(input: {
  previous?: SessionState["conversation"];
  utterance: string;
  createdAt: string;
  workflowName?: string | null;
  intent?: string;
  handoff?: SessionState["handoff"];
  toolResult?: SessionState["toolResult"];
  dialogueState?: SessionState["routing"] extends { dialogueState?: infer T } ? T : string;
  routingDecision?: SessionState["routing"] extends { decision?: infer T } ? T : string;
  pendingQuestion?: PendingQuestionState;
  answeredPendingQuestion?: boolean;
  slotResolutionResult?: SlotResolutionResult;
}): NonNullable<SessionState["conversation"]> {
  const workflowHint = input.workflowName === null ? undefined : input.workflowName ?? input.previous?.pendingWorkflow?.workflowName;
  const activeWorkflow = toKnownWorkflowName(workflowHint);

  const extracted = extractConversationSlots(input.utterance);
  const collectedSlots = {
    ...(input.previous?.collectedSlots ?? {}),
    ...extracted
  };

  if (input.slotResolutionResult?.matched && input.pendingQuestion?.expectedSlot) {
    collectedSlots[input.pendingQuestion.expectedSlot] = input.slotResolutionResult.normalizedValue ?? input.slotResolutionResult.rawValue ?? input.utterance.trim();
    if (input.slotResolutionResult.rawValue) {
      collectedSlots[`${input.pendingQuestion.expectedSlot}Raw`] = input.slotResolutionResult.rawValue;
    }
  }

  const requiredSlots = activeWorkflow ? WORKFLOW_SLOT_CONFIG[activeWorkflow].requiredSlots : [];
  const missingSlots = requiredSlots.filter((slot) => !collectedSlots[slot]);
  const status: PendingWorkflowState["status"] = !activeWorkflow
    ? "cancelled"
    : missingSlots.length > 0
      ? "awaiting_input"
      : "ready";

  const pendingWorkflow = activeWorkflow
    ? {
        workflowName: activeWorkflow,
        status,
        requiredSlots,
        missingSlots,
        collectedSlots,
        clarificationPrompt: missingSlots[0] ? WORKFLOW_SLOT_CONFIG[activeWorkflow].prompts[missingSlots[0]] : undefined,
        originalIntent: input.previous?.pendingWorkflow?.originalIntent ?? input.intent,
        attempts: missingSlots.length > 0
          ? (input.previous?.pendingWorkflow?.attempts ?? 0) + (input.answeredPendingQuestion ? 0 : 1)
          : input.previous?.pendingWorkflow?.attempts ?? 0
      }
    : undefined;

  const turns = [
    ...(input.previous?.turns ?? []),
    {
      id: `turn-${crypto.randomUUID()}`,
      role: "user" as const,
      text: input.utterance,
      createdAt: input.createdAt,
      intent: input.intent,
      workflowName: activeWorkflow,
      status: "final" as const
    }
  ].slice(-30);

  return {
    conversationId: input.previous?.conversationId ?? crypto.randomUUID(),
    turns,
    currentStatus: input.handoff?.triggered ? "handoff" : input.dialogueState === "awaiting_missing_info" ? "awaiting_user_input" : "processing",
    activeIntent: input.intent,
    pendingWorkflow,
    pendingQuestion: input.pendingQuestion,
    pendingSlots: pendingWorkflow?.missingSlots ?? [],
    collectedSlots,
    lastAssistantQuestion: input.previous?.lastAssistantQuestion,
    lastToolResult: input.toolResult ?? input.previous?.lastToolResult,
    lastHandoffState: input.handoff ?? input.previous?.lastHandoffState,
    fallbackState: input.previous?.fallbackState
  };
}
