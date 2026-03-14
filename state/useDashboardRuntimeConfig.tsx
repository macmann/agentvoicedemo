"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { RuntimeToolConfig, sanitizeRuntimeToolConfig, TOOL_CONFIG_STORAGE_KEY, TOOL_NAMES } from "@/tools/runtimeToolConfig";
import { ToolExecutionMode, ToolName } from "@/tools/toolTypes";

export type DebugVerbosity = "basic" | "detailed";
export type UnderstandingMode = "mock" | "live" | "mixed";
export type TtsProviderMode = "mock_browser" | "openai";
export type IntentUnderstandingMode = "deterministic" | "llm_assisted";
export type PostToolResponseMode = "deterministic" | "llm_generated";
export type OrchestrationApproach = "hybrid" | "agentic";

export interface UploadedTroubleshootingKbFile {
  name: string;
  markdown: string;
}

export interface DashboardRuntimeConfig {
  toolConfig: RuntimeToolConfig;
  understandingMode: UnderstandingMode;
  orchestrationApproach: OrchestrationApproach;
  intentUnderstandingMode: IntentUnderstandingMode;
  postToolResponseMode: PostToolResponseMode;
  understandingModel: string;
  mockFallbackEnabled: boolean;
  voiceModeEnabled: boolean;
  ttsProviderMode: TtsProviderMode;
  ttsVoiceStyle: string;
  fillerEnabled: boolean;
  responseMode: "auto" | "conversational_only" | "task_oriented";
  stepThroughMode: boolean;
  streamingTranscript: boolean;
  silenceTimeoutMs: number;
  debugVerbosity: DebugVerbosity;
  troubleshootingKbMode: "off" | "on";
  troubleshootingKbSource: string;
  uploadedTroubleshootingKbs: UploadedTroubleshootingKbFile[];
}

export const DASHBOARD_RUNTIME_STORAGE_KEY = "voiceai.dashboard.runtime.config.v1";

const DEFAULT_CONFIG: DashboardRuntimeConfig = {
  toolConfig: {},
  understandingMode: "mixed",
  orchestrationApproach: "hybrid",
  intentUnderstandingMode: "deterministic",
  postToolResponseMode: "deterministic",
  understandingModel: "gpt-5-mini",
  mockFallbackEnabled: true,
  voiceModeEnabled: true,
  ttsProviderMode: "openai",
  ttsVoiceStyle: "calm-neutral",
  fillerEnabled: true,
  responseMode: "auto",
  stepThroughMode: false,
  streamingTranscript: true,
  silenceTimeoutMs: 1000,
  debugVerbosity: "detailed",
  troubleshootingKbMode: "on",
  troubleshootingKbSource: "/public/kb/troubleshooting.md",
  uploadedTroubleshootingKbs: []
};

export type DemoPresetKey = "stable_mock_demo" | "live_outage_api_demo" | "mixed_mode_demo" | "fast_latency_demo" | "clarification_handoff_demo";

interface RuntimeContextValue {
  config: DashboardRuntimeConfig;
  setConfig: (updater: DashboardRuntimeConfig | ((prev: DashboardRuntimeConfig) => DashboardRuntimeConfig)) => void;
  setGlobalToolMode: (mode: ToolExecutionMode | undefined) => void;
  setPerToolMode: (toolName: ToolName, mode: ToolExecutionMode | undefined) => void;
  resetToolSettings: () => void;
  resetAll: () => void;
  setVoiceModeEnabled: (value: boolean | ((prev: boolean) => boolean)) => void;
  perToolOverrides: Array<{ toolName: ToolName; mode?: ToolExecutionMode }>;
  loadPreset: (key: DemoPresetKey) => void;
}

const RuntimeContext = createContext<RuntimeContextValue | undefined>(undefined);

function sanitizeConfig(raw: unknown): DashboardRuntimeConfig {
  const candidate = (raw ?? {}) as Partial<DashboardRuntimeConfig>;
  const orchestrationApproach = candidate.orchestrationApproach === "agentic" ? "agentic" : "hybrid";
  const intentUnderstandingMode = candidate.intentUnderstandingMode === "llm_assisted" ? "llm_assisted" : "deterministic";
  const postToolResponseMode = candidate.postToolResponseMode === "llm_generated" ? "llm_generated" : "deterministic";
  const troubleshootingKbMode = candidate.troubleshootingKbMode === "off" ? "off" : "on";
  return {
    ...DEFAULT_CONFIG,
    ...candidate,
    orchestrationApproach,
    intentUnderstandingMode,
    postToolResponseMode,
    troubleshootingKbMode,
    troubleshootingKbSource: typeof candidate.troubleshootingKbSource === "string" && candidate.troubleshootingKbSource.trim() ? candidate.troubleshootingKbSource : DEFAULT_CONFIG.troubleshootingKbSource,
    uploadedTroubleshootingKbs: Array.isArray(candidate.uploadedTroubleshootingKbs)
      ? candidate.uploadedTroubleshootingKbs
          .map((file) => ({
            name: typeof file?.name === "string" ? file.name : "",
            markdown: typeof file?.markdown === "string" ? file.markdown : ""
          }))
          .filter((file) => file.name.trim() && file.markdown.trim())
      : DEFAULT_CONFIG.uploadedTroubleshootingKbs,
    ttsVoiceStyle: typeof candidate.ttsVoiceStyle === "string" && candidate.ttsVoiceStyle.trim() ? candidate.ttsVoiceStyle : DEFAULT_CONFIG.ttsVoiceStyle,
    toolConfig: sanitizeRuntimeToolConfig(candidate.toolConfig ?? {})
  };
}

const PRESETS: Record<DemoPresetKey, Partial<DashboardRuntimeConfig>> = {
  stable_mock_demo: { toolConfig: { globalMode: "mock" }, understandingMode: "mock", intentUnderstandingMode: "deterministic", ttsProviderMode: "mock_browser", fillerEnabled: true, voiceModeEnabled: true, silenceTimeoutMs: 1100, debugVerbosity: "detailed" },
  live_outage_api_demo: { toolConfig: { globalMode: "api", perToolMode: { check_outage_status: "api" } }, understandingMode: "live", intentUnderstandingMode: "llm_assisted", postToolResponseMode: "llm_generated", ttsProviderMode: "openai", fillerEnabled: false, silenceTimeoutMs: 900 },
  mixed_mode_demo: { toolConfig: { globalMode: "mock", perToolMode: { check_outage_status: "api", diagnose_connectivity: "mock" } }, understandingMode: "mixed", intentUnderstandingMode: "llm_assisted", postToolResponseMode: "llm_generated", ttsProviderMode: "openai" },
  fast_latency_demo: { toolConfig: { globalMode: "mock" }, understandingMode: "mock", intentUnderstandingMode: "deterministic", ttsProviderMode: "mock_browser", fillerEnabled: false, silenceTimeoutMs: 450, streamingTranscript: true },
  clarification_handoff_demo: { toolConfig: { globalMode: "mock" }, understandingMode: "mixed", intentUnderstandingMode: "llm_assisted", postToolResponseMode: "llm_generated", fillerEnabled: true, stepThroughMode: true, debugVerbosity: "detailed", silenceTimeoutMs: 1200 }
};

export function DashboardRuntimeProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<DashboardRuntimeConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    try {
      const oldToolConfig = window.localStorage.getItem(TOOL_CONFIG_STORAGE_KEY);
      const stored = window.localStorage.getItem(DASHBOARD_RUNTIME_STORAGE_KEY);
      if (stored) {
        setConfig(sanitizeConfig(JSON.parse(stored)));
        return;
      }
      if (oldToolConfig) {
        setConfig((prev) => ({ ...prev, toolConfig: sanitizeRuntimeToolConfig(JSON.parse(oldToolConfig)) }));
      }
    } catch {
      setConfig(DEFAULT_CONFIG);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(DASHBOARD_RUNTIME_STORAGE_KEY, JSON.stringify(config));
    window.localStorage.setItem(TOOL_CONFIG_STORAGE_KEY, JSON.stringify(config.toolConfig));
  }, [config]);

  const setGlobalToolMode = (mode: ToolExecutionMode | undefined) => setConfig((prev) => ({ ...prev, toolConfig: { ...prev.toolConfig, globalMode: mode } }));

  const setPerToolMode = (toolName: ToolName, mode: ToolExecutionMode | undefined) => {
    setConfig((prev) => {
      const overrides = { ...(prev.toolConfig.perToolMode ?? {}) };
      if (!mode) delete overrides[toolName]; else overrides[toolName] = mode;
      return {
        ...prev,
        toolConfig: {
          ...prev.toolConfig,
          perToolMode: Object.keys(overrides).length ? overrides : undefined
        }
      };
    });
  };

  const value = useMemo<RuntimeContextValue>(() => ({
    config,
    setConfig,
    setGlobalToolMode,
    setPerToolMode,
    resetToolSettings: () => setConfig((prev) => ({ ...prev, toolConfig: {} })),
    resetAll: () => setConfig(DEFAULT_CONFIG),
    setVoiceModeEnabled: (next) => setConfig((prev) => ({ ...prev, voiceModeEnabled: typeof next === "function" ? next(prev.voiceModeEnabled) : next })),
    perToolOverrides: TOOL_NAMES.map((toolName) => ({ toolName, mode: config.toolConfig.perToolMode?.[toolName] })),
    loadPreset: (key) => setConfig((prev) => sanitizeConfig({ ...prev, ...PRESETS[key], toolConfig: sanitizeRuntimeToolConfig(PRESETS[key].toolConfig ?? prev.toolConfig) }))
  }), [config]);

  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

export function useDashboardRuntimeConfig() {
  const context = useContext(RuntimeContext);
  if (!context) throw new Error("useDashboardRuntimeConfig must be used within DashboardRuntimeProvider");
  return context;
}
