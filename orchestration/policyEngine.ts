import { parseScenarioSignals } from "@/orchestration/mockScenarios";
import { ROUTING_CONFIG } from "@/orchestration/routingConfig";
import { POLICY_THRESHOLDS } from "@/orchestration/thresholdConstants";
import { PolicyCounters } from "@/types/session";

export interface PolicyOptions {
  workflowMode: "auto" | "workflow" | "no_workflow";
}

export function runPolicyEngine(utterance: string, options: PolicyOptions, previousCounters?: PolicyCounters) {
  const signals = parseScenarioSignals(utterance);
  const route = ROUTING_CONFIG[signals.intent];

  const counters = {
    sttFailures: previousCounters?.sttFailures ?? 0,
    toolFailures: previousCounters?.toolFailures ?? 0,
    lowConfidence: previousCounters?.lowConfidence ?? 0
  };

  const workflowRequired =
    options.workflowMode === "workflow" ||
    (options.workflowMode === "auto" && route.decision === "workflow");

  const recommendedWorkflow = workflowRequired ? route.workflowName : undefined;

  let selectedRule = "default_support";
  let reason = route.reason;

  if (signals.explicitHumanRequest) {
    selectedRule = "explicit_human_request_always_handoff";
    reason = "User explicitly asked for a human; policy bypasses automation.";
  } else if (signals.discomfortDetected && signals.supportIntent) {
    selectedRule = "emotion_plus_task_ack_then_execute";
    reason = "User expressed discomfort and asked for help, so empathy must lead before task execution.";
  } else if (signals.emotionOnly) {
    selectedRule = "emotion_only_no_workflow";
    reason = "User only expressed emotion, so provide empathy without workflow actions.";
  }

  return {
    understanding: {
      intent: signals.intent,
      intentConfidence: signals.confidence,
      entities: signals.entities,
      sentiment: signals.sentiment,
      empathyNeeded: signals.empathyNeeded,
      workflowRequired,
      recommendedWorkflow,
      handoffRecommended: signals.explicitHumanRequest,
      reason
    },
    policy: {
      counters,
      thresholds: POLICY_THRESHOLDS,
      selectedRule,
      whyChosen: reason,
      confidenceThreshold: POLICY_THRESHOLDS.minIntentConfidence,
      handoffRule: "explicit_human_or_repeated_failures",
      routingConfig: route
    },
    sttFailureHint: signals.sttFailureHint
  };
}
