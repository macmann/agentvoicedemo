import { WORKFLOW_SLOT_CONFIG } from "@/orchestration/workflowSlots";
import { PendingWorkflowState, SessionState } from "@/types/session";

const REGION_OR_SERVICE_HINTS = ["internet", "mobile", "fiber", "core", "downtown", "uptown", "east", "west", "north", "south", "region"];
const POSTCODE_REGEX = /\b([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}|\d{5})\b/i;
const ISO_DATE_REGEX = /\b(\d{4}-\d{2}-\d{2})\b/;
const AMBIGUOUS_SLOT_ANSWERS = ["not sure", "whatever", "anything", "idk", "don't know", "frustrating", "this is frustrating"];


function toKnownWorkflowName(name?: string): PendingWorkflowState["workflowName"] | undefined {
  if (name === "diagnose_connectivity") return name;
  if (name === "check_outage_status") return name;
  if (name === "reschedule_technician") return name;
  if (name === "create_support_ticket") return name;
  return undefined;
}

export function extractConversationSlots(utterance: string, pendingSlot?: string): Record<string, string> {
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

  const isAmbiguousPendingAnswer = AMBIGUOUS_SLOT_ANSWERS.some((phrase) => lowered.includes(phrase));

  if (pendingSlot === "serviceNameOrRegion" && lowered.length <= 40 && !isAmbiguousPendingAnswer) {
    slots.serviceNameOrRegion = utterance.trim();
  }

  if (!isAmbiguousPendingAnswer && REGION_OR_SERVICE_HINTS.some((token) => lowered.includes(token))) {
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
}): NonNullable<SessionState["conversation"]> {
  const workflowHint = input.workflowName === null ? undefined : input.workflowName ?? input.previous?.pendingWorkflow?.workflowName;
  const activeWorkflow = toKnownWorkflowName(workflowHint);
  const pendingSlot = input.previous?.pendingWorkflow?.missingSlots?.[0];
  const extracted = extractConversationSlots(input.utterance, pendingSlot);
  const collectedSlots = {
    ...(input.previous?.collectedSlots ?? {}),
    ...extracted
  };

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
        attempts: (input.previous?.pendingWorkflow?.attempts ?? 0) + (missingSlots.length > 0 ? 1 : 0)
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
    pendingSlots: pendingWorkflow?.missingSlots ?? [],
    collectedSlots,
    lastAssistantQuestion: input.previous?.lastAssistantQuestion,
    lastToolResult: input.toolResult ?? input.previous?.lastToolResult,
    lastHandoffState: input.handoff ?? input.previous?.lastHandoffState,
    fallbackState: input.previous?.fallbackState
  };
}
