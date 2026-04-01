import { AgentSettingsPage } from "@/components/settings/AgentSettingsPage";
import { DashboardRuntimeProvider } from "@/state/useDashboardRuntimeConfig";

export default function SettingsPage() {
  return (
    <DashboardRuntimeProvider>
      <AgentSettingsPage />
    </DashboardRuntimeProvider>
  );
}
