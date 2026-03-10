import { PendingWorkflowState, SessionState } from "@/types/session";

const POSTCODE_REGEX = /\b([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}|\d{5})\b/i;
const ISO_DATE_REGEX = /\b(\d{4}-\d{2}-\d{2})\b/;
const ACCOUNT_REGEX = /\b(?:acct|account)[-_\s:]*(\w{4,})\b/i;

function toKnownWorkflowName(name?: string): PendingWorkflowState["workflowName"] | undefined {
  if (name === "diagnose_connectivity") return name;
  if (name === "check_outage_status") return name;
  if (name === "reschedule_technician") return name;
  if (name === "create_support_ticket") return name;
  return undefined;
}

export function extractConversationSlots(utterance: string): Record<string, string> {
  const slots: Record<string, string> = {};
  const postcode = utterance.match(POSTCODE_REGEX)?.[1];
  const isoDate = utterance.match(ISO_DATE_REGEX)?.[1];
  const accountId = utterance.match(ACCOUNT_REGEX)?.[1];
  const lowered = utterance.toLowerCase();

  if (postcode) slots.postcode = postcode.toUpperCase().replace(/\s+/g, "");
  if (isoDate) slots.date = isoDate;
  if (lowered.includes("today")) slots.date = "today";
  if (lowered.includes("tomorrow")) slots.date = "tomorrow";
  if (accountId) slots.accountId = accountId;
  if (lowered.includes("router") || lowered.includes("internet") || lowered.includes("offline")) slots.symptom = utterance;

  return slots;
}

export function requiredSlotsForWorkflow(workflowName?: string): string[] {
  if (workflowName === "check_outage_status") return ["postcode"];
  if (workflowName === "reschedule_technician") return ["date"];
  return [];
}

function clarificationPromptForSlot(slot: string): string {
  if (slot === "postcode") return "Sure — what postcode should I use to check the outage status?";
  if (slot === "date") return "Got it — what date would you like to move the technician visit to?";
  return `Please provide ${slot} so I can continue.`;
}

export function deriveConversationState(input: {
  previous?: SessionState["conversation"];
  utterance: string;
  createdAt: string;
  workflowName?: string;
}): NonNullable<SessionState["conversation"]> {
  const extracted = extractConversationSlots(input.utterance);
  const history = [...(input.previous?.history ?? []), { role: "user" as const, text: input.utterance, createdAt: input.createdAt }].slice(-12);
  const slots = {
    ...(input.previous?.slots ?? {}),
    ...extracted
  };

  const activeWorkflow = toKnownWorkflowName(input.workflowName ?? input.previous?.pendingWorkflow?.workflowName);
  const requiredSlots = requiredSlotsForWorkflow(activeWorkflow);
  const missingSlots = requiredSlots.filter((slot) => !slots[slot]);

  const pendingWorkflow = activeWorkflow
    ? {
        workflowName: activeWorkflow,
        requiredSlots,
        missingSlots,
        collectedSlots: slots,
        clarificationPrompt: missingSlots.length ? clarificationPromptForSlot(missingSlots[0]) : undefined
      }
    : undefined;

  return {
    turnIndex: (input.previous?.turnIndex ?? 0) + 1,
    slots,
    pendingWorkflow,
    history
  };
}
