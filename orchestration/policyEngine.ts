import { CONVERSATIONAL_STRATEGIES, detectTurnAct, isSlotNoiseTurnAct, ResponseMode, ResponseStrategy, shouldReplaceWorkflow, TurnAct } from "@/orchestration/conversationPolicy";
import { parseScenarioSignals } from "@/orchestration/mockScenarios";
import { ROUTING_CONFIG, UnderstoodIntent } from "@/orchestration/routingConfig";
import { POLICY_THRESHOLDS } from "@/orchestration/thresholdConstants";
import { PendingQuestionState, PolicyCounters, SessionState } from "@/types/session";

export interface PolicyOptions {
  workflowMode: "auto" | "workflow" | "no_workflow";
  pendingQuestion?: PendingQuestionState;
  pendingWorkflowName?: string;
}

function toKnownIntent(intent?: string): UnderstoodIntent {
  if (!intent) return "unclear";
  return (Object.prototype.hasOwnProperty.call(ROUTING_CONFIG, intent) ? intent : "unclear") as UnderstoodIntent;
}

function strategyForTurnAct(turnAct: TurnAct, inferredIntent: UnderstoodIntent, hasActiveTask: boolean): ResponseStrategy {
  if (turnAct === "greeting") return "greet_and_invite";
  if (turnAct === "small_talk") return "small_talk_and_invite";
  if (turnAct === "thanks") return "acknowledge_thanks";
  if (turnAct === "farewell") return "farewell_close";
  if (turnAct === "meta_question") return "explain_and_continue";
  if (turnAct === "objection") return hasActiveTask ? "explain_and_continue" : "repair_and_reset";
  if (turnAct === "correction") return "repair_and_reset";
  if (turnAct === "emotion") return hasActiveTask ? "empathy_then_continue" : "repair_and_reset";
  if (turnAct === "handoff_request") return "handoff";
  if (inferredIntent === "unclear") return "ask_clarification";
  return "continue_workflow";
}

function responseModeForStrategy(strategy: ResponseStrategy): ResponseMode {
  return CONVERSATIONAL_STRATEGIES.includes(strategy) ? "conversational_only" : "task_oriented";
}

export function runPolicyEngine(
  utterance: string,
  options: PolicyOptions,
  previousCounters?: PolicyCounters,
  providerResult?: SessionState["understandingProviderResult"]
) {
  const fallbackSignals = parseScenarioSignals(utterance);
  const providerIntent = toKnownIntent(providerResult?.understanding.intent);
  const providerConfidence = providerResult?.understanding.intentConfidence ?? 0;
  const useFallbackIntent =
    providerIntent === "unclear" ||
    (providerConfidence < POLICY_THRESHOLDS.minIntentConfidence && fallbackSignals.intent !== "unclear");
  const inferredIntent = useFallbackIntent ? fallbackSignals.intent : providerIntent;
  const route = ROUTING_CONFIG[inferredIntent] ?? ROUTING_CONFIG.unclear;
  const turnAct = detectTurnAct(utterance, Boolean(options.pendingQuestion));

  const counters = {
    sttFailures: previousCounters?.sttFailures ?? 0,
    toolFailures: previousCounters?.toolFailures ?? 0,
    lowConfidence: previousCounters?.lowConfidence ?? 0
  };

  const hasActiveTask = Boolean(options.pendingQuestion) || Boolean(options.pendingWorkflowName);
  const workflowRequired = options.workflowMode === "workflow" || (options.workflowMode === "auto" && route.decision === "workflow");
  const recommendedWorkflow = workflowRequired ? providerResult?.understanding.recommendedWorkflow ?? route.workflowName : undefined;

  let selectedRule = "default_support";
  let reason = providerResult?.understanding.reason ?? route.reason;

  const explicitHumanRequest = inferredIntent === "talk_to_human" || providerResult?.understanding.handoffRecommended || fallbackSignals.explicitHumanRequest;
  const demoOutOfScopeSupport = inferredIntent === "unsupported_support";
  const empathyNeeded = providerResult?.understanding.empathyNeeded ?? fallbackSignals.empathyNeeded;

  const offTopic = /poem|favorite movie|joke|stock price|politics/.test(utterance.toLowerCase());
  const refersToPendingQuestion = Boolean(options.pendingQuestion) && turnAct === "slot_answer" && !isSlotNoiseTurnAct(turnAct);
  const resetPendingQuestion = Boolean(options.pendingQuestion) && isSlotNoiseTurnAct(turnAct);
  const replacePendingWorkflow = shouldReplaceWorkflow(turnAct, utterance, options.pendingWorkflowName);

  let responseStrategy = strategyForTurnAct(turnAct, inferredIntent, hasActiveTask);
  const isSupportIntent = inferredIntent === "service_status" || inferredIntent === "announcements";
  let requestType: NonNullable<SessionState["understanding"]>["requestType"] =
    hasActiveTask && turnAct === "slot_answer"
      ? "answer_to_pending_question"
      : isSupportIntent && turnAct === "task_request"
        ? "support_task"
        : "conversational_or_meta";

  if (offTopic || demoOutOfScopeSupport) {
    responseStrategy = "bounded_redirect";
    selectedRule = demoOutOfScopeSupport ? "demo_scope_out_of_scope_redirect" : "bounded_support_scope";
    reason = demoOutOfScopeSupport
      ? "Request is a support task outside this demo scope; redirect to supported intents."
      : "Request is outside support scope; politely redirect to support tasks.";
  } else if (explicitHumanRequest) {
    selectedRule = "explicit_human_request_always_handoff";
    reason = "User explicitly asked for a human; policy bypasses automation.";
    responseStrategy = "handoff";
  } else if (replacePendingWorkflow) {
    selectedRule = "replace_pending_workflow_on_user_redirect";
    reason = "User redirected to a different support workflow.";
    responseStrategy = "replace_workflow";
  } else if (empathyNeeded && workflowRequired) {
    selectedRule = "emotion_plus_task_ack_then_execute";
    reason = "User expressed frustration and still needs support action.";
    responseStrategy = "empathy_then_continue";
  } else if (route.decision === "clarify" && turnAct === "task_request") {
    responseStrategy = "ask_clarification";
  }

  if (isSupportIntent && turnAct === "correction") requestType = "support_task_correction";
  if (isSupportIntent && turnAct === "slot_answer") requestType = "support_task_continuation";

  const responseMode = responseModeForStrategy(responseStrategy);

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
      turnAct,
      responseStrategy,
      responseMode,
      refersToPendingQuestion,
      resetPendingQuestion,
      replacePendingWorkflow,
      requestType,
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
