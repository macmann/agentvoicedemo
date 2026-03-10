export const POLICY_THRESHOLDS = {
  minIntentConfidence: 0.72,
  lowConfidenceEscalationCount: 2,
  toolFailureEscalationCount: 2,
  sttFailureEscalationCount: 2
} as const;

export type PolicyThresholds = typeof POLICY_THRESHOLDS;
