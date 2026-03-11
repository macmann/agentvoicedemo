import { DEFAULT_TOOL_CONFIGS } from "@/tools/toolConfigs";
import { ToolExecutionMode, ToolName } from "@/tools/toolTypes";

export interface RuntimeToolConfig {
  globalMode?: ToolExecutionMode;
  perToolMode?: Partial<Record<ToolName, ToolExecutionMode>>;
}

export const TOOL_CONFIG_STORAGE_KEY = "voice-demo.runtime-tool-config.v1";

export const TOOL_NAMES: ToolName[] = [
  "fetch_service_status",
  "fetch_notifications",
  "check_outage_status",
  "diagnose_connectivity",
  "reschedule_technician",
  "create_support_ticket"
];

export function getDefaultGlobalToolMode(): ToolExecutionMode | undefined {
  const modes = new Set(Object.values(DEFAULT_TOOL_CONFIGS).map((cfg) => cfg.mode));
  if (modes.size === 1) return Array.from(modes)[0];
  return undefined;
}

export function resolveToolExecutionMode(toolName: ToolName, runtimeConfig?: RuntimeToolConfig): ToolExecutionMode {
  const perTool = runtimeConfig?.perToolMode?.[toolName];
  if (perTool) return perTool;

  const globalMode = runtimeConfig?.globalMode;
  if (globalMode) return globalMode;

  return DEFAULT_TOOL_CONFIGS[toolName].mode;
}

export function sanitizeRuntimeToolConfig(value: unknown): RuntimeToolConfig {
  if (!value || typeof value !== "object") return {};

  const payload = value as RuntimeToolConfig;
  const globalMode = payload.globalMode === "mock" || payload.globalMode === "api" ? payload.globalMode : undefined;

  const perToolMode = TOOL_NAMES.reduce<Partial<Record<ToolName, ToolExecutionMode>>>((acc, toolName) => {
    const mode = payload.perToolMode?.[toolName];
    if (mode === "mock" || mode === "api") acc[toolName] = mode;
    return acc;
  }, {});

  return {
    globalMode,
    perToolMode: Object.keys(perToolMode).length ? perToolMode : undefined
  };
}
