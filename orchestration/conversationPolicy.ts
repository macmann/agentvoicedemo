import { PendingQuestionState } from "@/types/session";

export type TurnAct =
  | "greeting"
  | "small_talk"
  | "thanks"
  | "farewell"
  | "task_request"
  | "slot_answer"
  | "correction"
  | "objection"
  | "emotion"
  | "meta_question"
  | "handoff_request"
  | "unclear";

export type ResponseStrategy =
  | "greet_and_invite"
  | "small_talk_and_invite"
  | "acknowledge_thanks"
  | "farewell_close"
  | "continue_workflow"
  | "ask_clarification"
  | "repair_and_reset"
  | "empathy_then_continue"
  | "explain_and_continue"
  | "replace_workflow"
  | "handoff"
  | "bounded_redirect";

export type ResponseMode = "conversational_only" | "task_oriented";

export const CONVERSATIONAL_STRATEGIES: ResponseStrategy[] = [
  "greet_and_invite",
  "small_talk_and_invite",
  "acknowledge_thanks",
  "farewell_close",
  "repair_and_reset",
  "explain_and_continue",
  "bounded_redirect",
  "empathy_then_continue"
];

const GREETING_PATTERNS = [/^hi\b/, /^hello\b/, /^hey\b/, /hey there/];
const SMALL_TALK_PATTERNS = [/how are you/, /good morning/, /nice to meet you/, /good afternoon/, /good evening/];
const THANKS_PATTERNS = [/^thanks\b/, /^thank you\b/, /appreciate it/];
const FAREWELL_PATTERNS = [/^bye\b/, /talk later/, /that'?s all/, /see you/, /goodbye/];
const CORRECTION_PATTERNS = [/not what i meant/, /that's not what i meant/, /^no,?\b/, /i meant/, /actually/, /i haven[’']?t even said anything yet/];
const OBJECTION_PATTERNS = [/you('re| are) not listening/, /stop asking/, /that doesn't help/, /this isn't helping/];
const EMOTION_PATTERNS = [/frustrat/, /angry/, /upset/, /annoyed/, /this is ridiculous/, /not happy/];
const META_PATTERNS = [/what can you do/, /are you a bot/, /what are you/, /how does this work/, /why are you asking/];
const OFFTOPIC_PATTERNS = [/write (me )?a poem/, /favorite movie/, /tell me a joke/, /who won/, /weather/];
const HANDOFF_PATTERNS = [/talk to (a )?human/, /agent/, /representative/, /person please/];

const SLOT_NOISE_TURN_ACTS: TurnAct[] = ["greeting", "small_talk", "correction", "objection", "emotion", "meta_question", "farewell", "thanks"];

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function detectTurnAct(utterance: string, hasPendingQuestion: boolean): TurnAct {
  const text = utterance.toLowerCase().trim();
  if (!text) return "unclear";
  if (matchesAny(text, HANDOFF_PATTERNS)) return "handoff_request";
  if (matchesAny(text, GREETING_PATTERNS)) return "greeting";
  if (matchesAny(text, SMALL_TALK_PATTERNS)) return "small_talk";
  if (matchesAny(text, THANKS_PATTERNS)) return "thanks";
  if (matchesAny(text, FAREWELL_PATTERNS)) return "farewell";
  if (matchesAny(text, OBJECTION_PATTERNS)) return "objection";
  if (matchesAny(text, CORRECTION_PATTERNS)) return "correction";
  if (matchesAny(text, EMOTION_PATTERNS)) return "emotion";
  if (matchesAny(text, META_PATTERNS)) return "meta_question";
  if (matchesAny(text, OFFTOPIC_PATTERNS)) return "small_talk";
  if (hasPendingQuestion && text.length <= 40) return "slot_answer";
  if (/outage|internet|offline|announcement|notification|maintenance|notice|service status|service down|reschedule|technician|ticket|diagnostic/.test(text)) return "task_request";
  return "unclear";
}

export function isSlotNoiseTurnAct(turnAct: TurnAct): boolean {
  return SLOT_NOISE_TURN_ACTS.includes(turnAct);
}

export function shouldReplaceWorkflow(turnAct: TurnAct, utterance: string, pendingWorkflowName?: string): boolean {
  if (!pendingWorkflowName) return false;
  const text = utterance.toLowerCase();
  if (turnAct === "correction" && /want to check.*(outage|service status)|check.*(outage|service status)/.test(text) && pendingWorkflowName !== "fetch_service_status") return true;
  if (turnAct === "task_request" && /(outage|service status|service down)/.test(text) && pendingWorkflowName !== "fetch_service_status") return true;
  if (turnAct === "task_request" && /(announcement|notification|maintenance|notice)/.test(text) && pendingWorkflowName !== "fetch_notifications") return true;
  return false;
}

export function buildClarificationPrompt(expectedSlot: string, retryCount = 0): string {
  if (expectedSlot === "serviceNameOrDevice") {
    const variants = [
      "Is this affecting all devices, or just one?",
      "Is the issue happening across everything, or only on one device?",
      "Got it — is this all devices or just one?"
    ];
    return variants[Math.min(retryCount, variants.length - 1)];
  }

  if (expectedSlot === "serviceNameOrRegion") {
    const variants = [
      "Sure — what city or region should I check?",
      "I can check that. What location are you in?",
      "Which city or area should I look up?"
    ];
    return variants[Math.min(retryCount, variants.length - 1)];
  }

  if (expectedSlot === "date") {
    return retryCount > 0 ? "What date or time window works best for the technician visit?" : "What date or time window would you like for the technician visit?";
  }

  return "Could you share a bit more so I can continue?";
}

export function responseForStrategy(input: {
  strategy: ResponseStrategy;
  utterance: string;
  clarificationPrompt?: string;
  pendingQuestion?: PendingQuestionState;
  empathyNeeded?: boolean;
}): string | undefined {
  switch (input.strategy) {
    case "greet_and_invite":
      return "Hi — how can I help you today?";
    case "small_talk_and_invite":
      return "I’m doing well, thanks. What can I help you with today?";
    case "acknowledge_thanks":
      return "You’re welcome. Let me know if you’d like me to check anything else.";
    case "farewell_close":
      return "You’re all set. Take care.";
    case "repair_and_reset":
      return "You’re right — sorry about that. Tell me what you’d like me to check.";
    case "explain_and_continue":
      return "Good question — I ask that so I can narrow this down quickly. If you prefer, I can check outage status instead.";
    case "empathy_then_continue":
      return "I know this is frustrating. Let’s get this sorted.";
    case "bounded_redirect":
      return "Right now I can help with current service status and announcements. I can check either of those for you.";
    case "ask_clarification":
      return input.clarificationPrompt;
    default:
      return undefined;
  }
}
