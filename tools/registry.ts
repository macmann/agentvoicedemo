import { ToolConfigMap } from "@/tools/toolConfigs";
import {
  mockCheckOutageStatus,
  mockCreateSupportTicket,
  mockDiagnoseConnectivity,
  mockRescheduleTechnician
} from "@/tools/mockTools";
import { ToolExecutionResult, ToolName, ToolRequestByName } from "@/tools/toolTypes";
import { executeApiTool } from "@/tools/apiTools";

type ToolExecutor<TName extends ToolName> = (request: ToolRequestByName[TName], config: ToolConfigMap[TName]) => Promise<ToolExecutionResult>;

export type ToolRegistry = {
  [K in ToolName]: ToolExecutor<K>;
};

const mockExecutors = {
  diagnose_connectivity: (request: ToolRequestByName["diagnose_connectivity"]) => Promise.resolve(mockDiagnoseConnectivity(request)),
  check_outage_status: (request: ToolRequestByName["check_outage_status"]) => Promise.resolve(mockCheckOutageStatus(request)),
  reschedule_technician: (request: ToolRequestByName["reschedule_technician"]) => Promise.resolve(mockRescheduleTechnician(request)),
  create_support_ticket: (request: ToolRequestByName["create_support_ticket"]) => Promise.resolve(mockCreateSupportTicket(request))
};

export function createToolRegistry(configs: ToolConfigMap): ToolRegistry {
  return {
    diagnose_connectivity: async (request, config) =>
      config.mode === "api" ? executeApiTool("diagnose_connectivity", request, config) : mockExecutors.diagnose_connectivity(request),
    check_outage_status: async (request, config) =>
      config.mode === "api" ? executeApiTool("check_outage_status", request, config) : mockExecutors.check_outage_status(request),
    reschedule_technician: async (request, config) =>
      config.mode === "api" ? executeApiTool("reschedule_technician", request, config) : mockExecutors.reschedule_technician(request),
    create_support_ticket: async (request, config) =>
      config.mode === "api" ? executeApiTool("create_support_ticket", request, config) : mockExecutors.create_support_ticket(request)
  };
}
