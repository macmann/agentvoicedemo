import { parseScenarioSignals } from "@/orchestration/mockScenarios";
import { ROUTING_CONFIG, UnderstoodIntent } from "@/orchestration/routingConfig";
import { POLICY_THRESHOLDS } from "@/orchestration/thresholdConstants";
import { PolicyCounters, SessionState } from "@/types/session";

export interface PolicyOptions {
  workflowMode: "auto" | "workflow" | "no_workflow";
}


function toKnownIntent(intent?: string): UnderstoodIntent {
  if (!intent) return "unclear";
  return (Object.prototype.hasOwnProperty.call(ROUTING_CONFIG, intent) ? intent : "unclear") as UnderstoodIntent;
}

export function runPolicyEngine(
  utterance: string,
  options: PolicyOptions,
  previousCounters?: PolicyCounters,
  providerResult?: SessionState["understandingProviderResult"]
) {
  const fallbackSignals = parseScenarioSignals(utterance);
  const inferredIntent = toKnownIntent(providerResult?.understanding.intent ?? fallbackSignals.intent);
  const route = ROUTING_CONFIG[inferredIntent] ?? ROUTING_CONFIG.unclear;

  const counters = {
    sttFailures: previousCounters?.sttFailures ?? 0,
    toolFailures: previousCounters?.toolFailures ?? 0,
    lowConfidence: previousCounters?.lowConfidence ?? 0
  };

  const workflowRequired =
    options.workflowMode === "workflow" ||
    (options.workflowMode === "auto" && route.decision === "workflow");

  const recommendedWorkflow = workflowRequired ? providerResult?.understanding.recommendedWorkflow ?? route.workflowName : undefined;

  let selectedRule = "default_support";
  let reason = providerResult?.understanding.reason ?? route.reason;

  const explicitHumanRequest =
    inferredIntent === "talk_to_human" ||
    providerResult?.understanding.handoffRecommended ||
    fallbackSignals.explicitHumanRequest;

  const empathyNeeded = providerResult?.understanding.empathyNeeded ?? fallbackSignals.empathyNeeded;
  const supportIntent = ["report_internet_issue", "report_router_issue", "outage_check", "reschedule_visit", "announcement_check", "talk_to_human"].includes(inferredIntent);
  const emotionOnly = inferredIntent === "empathy_only";

  if (explicitHumanRequest) {
    selectedRule = "explicit_human_request_always_handoff";
    reason = "User explicitly asked for a human; policy bypasses automation.";
  } else if (empathyNeeded && supportIntent) {
    selectedRule = "emotion_plus_task_ack_then_execute";
    reason = "User expressed discomfort and asked for help, so empathy must lead before task execution.";
  } else if (emotionOnly) {
    selectedRule = "emotion_only_no_workflow";
    reason = "User only expressed emotion, so provide empathy without workflow actions.";
  }

  return {
    understanding: {
      intent: inferredIntent,
      intentConfidence: providerResult?.understanding.intentConfidence ?? fallbackSignals.confidence,
      entities: providerResult?.understanding.entities ?? fallbackSignals.entities,
      sentiment: providerResult?.understanding.sentiment ?? fallbackSignals.sentiment,
      empathyNeeded,
      workflowRequired,
      recommendedWorkflow,
      handoffRecommended: providerResult?.understanding.handoffRecommended ?? fallbackSignals.explicitHumanRequest,
      reason
    },
    understandingDiagnostics: providerResult?.diagnostics,
    policy: {
      counters,
      thresholds: POLICY_THRESHOLDS,
      selectedRule,
      whyChosen: reason,
      confidenceThreshold: POLICY_THRESHOLDS.minIntentConfidence,
      handoffRule: "explicit_human_or_repeated_failures",
      routingConfig: route
    },
    sttFailureHint: fallbackSignals.sttFailureHint
  };
}
