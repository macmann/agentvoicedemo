import { detectTurnAct } from "@/orchestration/conversationPolicy";
import { UnderstoodIntent } from "@/orchestration/routingConfig";

export interface ScenarioSignals {
  intent: UnderstoodIntent;
  supportIntent: boolean;
  emotionOnly: boolean;
  empathyNeeded: boolean;
  discomfortDetected: boolean;
  explicitHumanRequest: boolean;
  sentiment: "negative" | "neutral";
  confidence: number;
  entities: Record<string, string>;
  sttFailureHint: boolean;
}

function extractServiceOrRegion(text: string): string | undefined {
  if (text.includes("core internet")) return "Core Internet";
  if (text.includes("downtown")) return "Downtown";
  if (text.includes("mobile")) return "Mobile";
  return undefined;
}

export function parseScenarioSignals(utterance: string): ScenarioSignals {
  const text = utterance.toLowerCase();
  const turnAct = detectTurnAct(utterance, false);
  const explicitHumanRequest = text.includes("talk to a human") || text.includes("speak to a human") || turnAct === "handoff_request";
  const discomfortDetected = text.includes("sick") || text.includes("not feeling well") || text.includes("unwell");
  const frustration = text.includes("frustrating") || text.includes("upset") || text.includes("angry") || turnAct === "emotion" || turnAct === "objection";
  const outage = text.includes("outage") || text.includes("down");
  const announcements = text.includes("announcement") || text.includes("notification");
  const reschedule = text.includes("reschedule") || text.includes("technician");
  const routerIssue = text.includes("router") || text.includes("blinking red");
  const internetIssue = text.includes("internet") || text.includes("offline");
  const sttFailureHint = text.includes("[unclear]") || text.includes("mumble");
  const service = extractServiceOrRegion(text);

  if (explicitHumanRequest) {
    return { intent: "talk_to_human", supportIntent: true, emotionOnly: false, empathyNeeded: frustration, discomfortDetected, explicitHumanRequest, sentiment: frustration ? "negative" : "neutral", confidence: 0.98, entities: { request: "human_agent" }, sttFailureHint };
  }
  if (announcements) {
    return { intent: "announcement_check", supportIntent: true, emotionOnly: false, empathyNeeded: frustration, discomfortDetected, explicitHumanRequest, sentiment: frustration ? "negative" : "neutral", confidence: 0.9, entities: { active: "true", ...(service ? { serviceNameOrRegion: service } : {}) }, sttFailureHint };
  }
  if (reschedule) {
    return { intent: "reschedule_visit", supportIntent: true, emotionOnly: false, empathyNeeded: discomfortDetected || frustration, discomfortDetected, explicitHumanRequest, sentiment: discomfortDetected || frustration ? "negative" : "neutral", confidence: 0.9, entities: { issueType: "appointment", action: "reschedule" }, sttFailureHint };
  }
  if (outage) {
    return { intent: "outage_check", supportIntent: true, emotionOnly: false, empathyNeeded: frustration, discomfortDetected, explicitHumanRequest, sentiment: frustration ? "negative" : "neutral", confidence: 0.9, entities: { issueType: "connectivity", check: "outage", ...(service ? { serviceNameOrRegion: service } : {}) }, sttFailureHint };
  }
  if (routerIssue) {
    return { intent: "report_router_issue", supportIntent: true, emotionOnly: false, empathyNeeded: frustration, discomfortDetected, explicitHumanRequest, sentiment: frustration ? "negative" : "neutral", confidence: 0.64, entities: { issueType: "connectivity", symptom: "router_blinking_red" }, sttFailureHint };
  }
  if (internetIssue) {
    return { intent: "report_internet_issue", supportIntent: true, emotionOnly: false, empathyNeeded: frustration, discomfortDetected, explicitHumanRequest, sentiment: frustration ? "negative" : "neutral", confidence: 0.85, entities: { issueType: "connectivity", symptom: "internet_down", ...(service ? { serviceNameOrDevice: service } : {}) }, sttFailureHint };
  }
  if (discomfortDetected || frustration) {
    return { intent: "empathy_only", supportIntent: false, emotionOnly: true, empathyNeeded: true, discomfortDetected, explicitHumanRequest, sentiment: "negative", confidence: 0.88, entities: { context: discomfortDetected ? "health_discomfort" : "frustration" }, sttFailureHint };
  }
  return { intent: "unclear", supportIntent: false, emotionOnly: false, empathyNeeded: false, discomfortDetected, explicitHumanRequest, sentiment: "neutral", confidence: 0.58, entities: { issueType: "general_support" }, sttFailureHint };
}
