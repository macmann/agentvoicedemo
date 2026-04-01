import { DashboardRuntimeConfig } from "@/state/useDashboardRuntimeConfig";

export const AGENT_PROFILES_STORAGE_KEY = "voiceai.agent.profiles.v1";
export const ACTIVE_AGENT_STORAGE_KEY = "voiceai.agent.active.id.v1";

export interface AgentProfile {
  id: string;
  name: string;
  description: string;
  config: DashboardRuntimeConfig;
}
