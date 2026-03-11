import { PendingWorkflowState } from "@/types/session";

export interface WorkflowSlotConfig {
  requiredSlots: string[];
  prompts: Record<string, string>;
}

export const WORKFLOW_SLOT_CONFIG: Record<PendingWorkflowState["workflowName"], WorkflowSlotConfig> = {
  check_outage_status: {
    requiredSlots: ["serviceNameOrRegion"],
    prompts: {
      serviceNameOrRegion: "Sure — what city or region should I check?"
    }
  },
  diagnose_connectivity: {
    requiredSlots: ["serviceNameOrDevice"],
    prompts: {
      serviceNameOrDevice: "I can help with that — which service or device is affected?"
    }
  },
  reschedule_technician: {
    requiredSlots: ["date"],
    prompts: {
      date: "What date or time window would you like for the technician visit?"
    }
  },
  create_support_ticket: {
    requiredSlots: [],
    prompts: {}
  }
};
