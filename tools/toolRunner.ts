import { DEFAULT_TOOL_CONFIGS, ToolConfigMap } from "@/tools/toolConfigs";
import { createToolRegistry } from "@/tools/registry";
import { resolveToolExecutionMode, RuntimeToolConfig } from "@/tools/runtimeToolConfig";
import { SessionState } from "@/types/session";
import { ToolExecutionMode, ToolExecutionRecord, ToolExecutionResult, ToolName, ToolRequestByName } from "@/tools/toolTypes";

export interface ToolRunnerOptions {
  forceFallback: boolean;
  modeOverride?: ToolExecutionMode;
  runtimeConfig?: RuntimeToolConfig;
  configs?: ToolConfigMap;
}

function toToolName(workflowName?: string): ToolName {
  if (workflowName === "diagnose_connectivity") return "diagnose_connectivity";
  if (workflowName === "check_outage_status") return "check_outage_status";
  if (workflowName === "fetch_notifications") return "fetch_notifications";
  if (workflowName === "fetch_service_status") return "fetch_service_status";
  if (workflowName === "reschedule_technician") return "reschedule_technician";
  return "create_support_ticket";
}

function buildRequest(state: SessionState, toolName: ToolName): ToolRequestByName[ToolName] {
  const entities = state.understanding?.entities ?? {};
  const slots = state.conversation?.collectedSlots ?? {};

  if (toolName === "diagnose_connectivity") {
    return {
      account_id: entities.accountId ?? slots.accountId,
      symptom: entities.symptom ?? slots.symptom ?? state.utterance,
      serviceName: entities.serviceNameOrRegion ?? slots.serviceNameOrRegion,
      device: entities.device ?? slots.device
    };
  }

  if (toolName === "check_outage_status") {
    return {
      serviceNameOrRegion: entities.serviceNameOrRegion ?? slots.serviceNameOrRegion ?? slots.postcode,
      active: true
    };
  }

  if (toolName === "fetch_service_status") {
    return { active: true };
  }

  if (toolName === "fetch_notifications") {
    return {
      active: true,
      from: entities.from,
      to: entities.to
    };
  }

  if (toolName === "reschedule_technician") {
    return {
      date: entities.date ?? entities.appointment_date ?? slots.date ?? ""
    };
  }

  return {
    summary: `${state.understanding?.intent ?? "unknown_intent"}: ${state.utterance}`
  };
}

function validateRequest(toolName: ToolName, request: ToolRequestByName[ToolName]): string | undefined {
  if (toolName === "check_outage_status" && !(request as ToolRequestByName["check_outage_status"]).serviceNameOrRegion) {
    return "Invalid parameters: serviceNameOrRegion is required";
  }
  if (toolName === "reschedule_technician" && !(request as ToolRequestByName["reschedule_technician"]).date) {
    return "Invalid parameters: date is required";
  }
  if (toolName === "create_support_ticket" && !(request as ToolRequestByName["create_support_ticket"]).summary) {
    return "Invalid parameters: summary is required";
  }

  return undefined;
}

function withForcedFailure(result: ToolExecutionResult, forceFallback: boolean): ToolExecutionResult {
  if (!forceFallback) return result;

  return {
    tool_name: result.tool_name,
    status: "failure",
    error: "Tool timeout while contacting endpoint",
    request: result.request,
    mode: result.mode,
    endpoint: result.endpoint,
    fallback_behavior: result.fallback_behavior,
    raw_response: result.raw_response
  };
}

export async function runToolExecution(state: SessionState, options: ToolRunnerOptions): Promise<{ toolResult: NonNullable<SessionState["toolResult"]>; record: ToolExecutionRecord }> {
  const selectedTool = toToolName(state.routing?.workflowName);
  const requestPayload = buildRequest(state, selectedTool);
  const configs = options.configs ?? DEFAULT_TOOL_CONFIGS;
  const resolvedMode = options.modeOverride ?? resolveToolExecutionMode(selectedTool, options.runtimeConfig);
  const config = {
    ...configs[selectedTool],
    mode: resolvedMode
  };

  const startedAt = Date.now();
  const validationError = validateRequest(selectedTool, requestPayload as never);

  let executionResult: ToolExecutionResult;

  if (validationError) {
    executionResult = {
      tool_name: selectedTool,
      status: "failure",
      error: validationError,
      request: requestPayload,
      mode: config.mode,
      endpoint: config.endpoint,
      fallback_behavior: config.fallbackBehavior
    };
  } else {
    const registry = createToolRegistry(configs);
    executionResult = await registry[selectedTool](requestPayload as never, config as never);
    executionResult = withForcedFailure(executionResult, options.forceFallback);
  }

  const executionTimeMs = Math.max(1, Date.now() - startedAt);
  const record: ToolExecutionRecord = {
    selectedTool,
    requestPayload,
    rawResponsePayload: executionResult.raw_response,
    normalizedResult: executionResult.status === "success" ? executionResult.result : undefined,
    executionStatus: executionResult.status,
    executionTimeMs,
    executionMode: config.mode,
    endpoint: config.endpoint,
    fallbackBehavior: config.fallbackBehavior,
    fallbackActivated: executionResult.status === "failure",
    errorMessage: executionResult.status === "failure" ? executionResult.error : undefined
  };

  const toolResult: NonNullable<SessionState["toolResult"]> = {
    provider: config.mode === "mock" ? "mock_local" : "api",
    toolName: executionResult.tool_name,
    status: executionResult.status,
    result: executionResult.status === "success" ? executionResult.result : executionResult.request,
    error: executionResult.status === "failure" ? executionResult.error : undefined
  };

  return { toolResult, record };
}
