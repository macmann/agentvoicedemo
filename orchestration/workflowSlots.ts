import { PendingWorkflowState } from "@/types/session";

export interface WorkflowSlotConfig {
  requiredSlots: string[];
  prompts: Record<string, string>;
}

export const WORKFLOW_SLOT_CONFIG: Record<PendingWorkflowState["workflowName"], WorkflowSlotConfig> = {
  check_outage_status: {
    requiredSlots: ["serviceNameOrRegion"],
    prompts: {
      serviceNameOrRegion: "Can I know the service or region you're asking about?"
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
