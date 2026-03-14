"use client";

import { useEffect } from "react";
import { VoiceTesterPage } from "@/components/tester/VoiceTesterPage";
import { useDashboardRuntimeConfig } from "@/state/useDashboardRuntimeConfig";

export function AgenticConsolePage() {
  const { setConfig } = useDashboardRuntimeConfig();

  useEffect(() => {
    setConfig((prev) => ({ ...prev, orchestrationApproach: "agentic", intentUnderstandingMode: "llm_assisted", postToolResponseMode: "llm_generated" }));
  }, [setConfig]);

  return <VoiceTesterPage />;
}
