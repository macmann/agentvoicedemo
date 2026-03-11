"use client";

import { useEffect, useMemo, useState } from "react";
import { RuntimeToolConfig, sanitizeRuntimeToolConfig, TOOL_CONFIG_STORAGE_KEY, TOOL_NAMES } from "@/tools/runtimeToolConfig";
import { ToolExecutionMode, ToolName } from "@/tools/toolTypes";

const DEFAULT_RUNTIME_CONFIG: RuntimeToolConfig = {};

function withoutOverride(config: RuntimeToolConfig, toolName: ToolName): RuntimeToolConfig {
  const next = { ...(config.perToolMode ?? {}) };
  delete next[toolName];
  return {
    ...config,
    perToolMode: Object.keys(next).length ? next : undefined
  };
}

export function useRuntimeToolConfig() {
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeToolConfig>(DEFAULT_RUNTIME_CONFIG);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TOOL_CONFIG_STORAGE_KEY);
      if (!raw) return;
      setRuntimeConfig(sanitizeRuntimeToolConfig(JSON.parse(raw)));
    } catch {
      setRuntimeConfig(DEFAULT_RUNTIME_CONFIG);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(TOOL_CONFIG_STORAGE_KEY, JSON.stringify(runtimeConfig));
  }, [runtimeConfig]);

  const setGlobalMode = (mode: ToolExecutionMode | undefined) => {
    setRuntimeConfig((prev) => ({ ...prev, globalMode: mode }));
  };

  const setPerToolMode = (toolName: ToolName, mode: ToolExecutionMode | undefined) => {
    setRuntimeConfig((prev) => {
      if (!mode) return withoutOverride(prev, toolName);
      return {
        ...prev,
        perToolMode: {
          ...(prev.perToolMode ?? {}),
          [toolName]: mode
        }
      };
    });
  };

  const reset = () => setRuntimeConfig(DEFAULT_RUNTIME_CONFIG);

  const perToolOverrides = useMemo(
    () => TOOL_NAMES.map((toolName) => ({ toolName, mode: runtimeConfig.perToolMode?.[toolName] })),
    [runtimeConfig.perToolMode]
  );

  return {
    runtimeConfig,
    setGlobalMode,
    setPerToolMode,
    reset,
    perToolOverrides
  };
}
