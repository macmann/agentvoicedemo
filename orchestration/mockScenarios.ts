import { detectTurnAct } from "@/orchestration/conversationPolicy";
import { UnderstoodIntent } from "@/orchestration/routingConfig";

export interface ScenarioSignals {
  intent: UnderstoodIntent;
  supportIntent: boolean;
  outOfScopeSupport: boolean;
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
  if (text.includes("ftth")) return "FTTH";
  if (text.includes("berlin")) return "Berlin";
  if (text.includes("munich")) return "Munich";
  if (text.includes("core internet")) return "Core Internet";
  if (text.includes("downtown")) return "Downtown";
  if (text.includes("mobile")) return "Mobile";

  const compactRegion = text.match(/^(?:no,?\s+|yeah,?\s+)?([a-z][a-z\s-]{1,30})$/i)?.[1]?.trim();
  if (compactRegion && compactRegion.split(/\s+/).length <= 3) {
    return compactRegion
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  return undefined;
}

export function parseScenarioSignals(utterance: string): ScenarioSignals {
  const text = utterance.toLowerCase();
  const turnAct = detectTurnAct(utterance, false);
  const explicitHumanRequest = text.includes("talk to a human") || text.includes("speak to a human") || turnAct === "handoff_request";
  const discomfortDetected = text.includes("sick") || text.includes("not feeling well") || text.includes("unwell");
  const frustration = text.includes("frustrating") || text.includes("upset") || text.includes("angry") || turnAct === "emotion" || turnAct === "objection";
  const outage = text.includes("outage") || text.includes("service down") || text.includes("internet is down") || text.includes("current status") || text.includes("service status") || text.includes("ftth") || text.includes("down?") || /^no,?\s+[a-z]/.test(text) || /service in [a-z]/.test(text) || /my home is in [a-z]/.test(text);
  const announcements = text.includes("announcement") || text.includes("notification") || text.includes("maintenance") || text.includes("notice");
  const unsupportedSupport = text.includes("reschedule") || text.includes("technician") || text.includes("support ticket") || text.includes("create a ticket") || text.includes("diagnostic") || text.includes("run diagnostics");
  const sttFailureHint = text.includes("[unclear]") || text.includes("mumble");
  const service = extractServiceOrRegion(text);

  if (explicitHumanRequest) {
    return { intent: "talk_to_human", supportIntent: false, outOfScopeSupport: false, emotionOnly: false, empathyNeeded: frustration, discomfortDetected, explicitHumanRequest, sentiment: frustration ? "negative" : "neutral", confidence: 0.98, entities: { request: "human_agent" }, sttFailureHint };
  }
  if (announcements) {
    return { intent: "announcements", supportIntent: true, outOfScopeSupport: false, emotionOnly: false, empathyNeeded: frustration, discomfortDetected, explicitHumanRequest, sentiment: frustration ? "negative" : "neutral", confidence: 0.92, entities: { active: "true", ...(service ? { serviceNameOrRegion: service } : {}) }, sttFailureHint };
  }
  if (outage) {
    return { intent: "service_status", supportIntent: true, outOfScopeSupport: false, emotionOnly: false, empathyNeeded: frustration, discomfortDetected, explicitHumanRequest, sentiment: frustration ? "negative" : "neutral", confidence: 0.92, entities: { issueType: "connectivity", check: "service_status", ...(service ? { serviceNameOrRegion: service } : {}) }, sttFailureHint };
  }
  if (unsupportedSupport) {
    return { intent: "unsupported_support", supportIntent: true, outOfScopeSupport: true, emotionOnly: false, empathyNeeded: discomfortDetected || frustration, discomfortDetected, explicitHumanRequest, sentiment: discomfortDetected || frustration ? "negative" : "neutral", confidence: 0.92, entities: { outOfScopeSupport: "true" }, sttFailureHint };
  }
  if (discomfortDetected || frustration) {
    return { intent: "unclear", supportIntent: false, outOfScopeSupport: false, emotionOnly: true, empathyNeeded: true, discomfortDetected, explicitHumanRequest, sentiment: "negative", confidence: 0.88, entities: { context: discomfortDetected ? "health_discomfort" : "frustration" }, sttFailureHint };
  }
  return { intent: "unclear", supportIntent: false, outOfScopeSupport: false, emotionOnly: false, empathyNeeded: false, discomfortDetected, explicitHumanRequest, sentiment: "neutral", confidence: 0.58, entities: { issueType: "general_support" }, sttFailureHint };
}
