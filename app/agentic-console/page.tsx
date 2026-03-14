import { AgenticConsolePage } from "@/components/agentic/AgenticConsolePage";
import { DashboardRuntimeProvider } from "@/state/useDashboardRuntimeConfig";

export default function AgenticConsoleRoute() {
  return (
    <DashboardRuntimeProvider>
      <AgenticConsolePage />
    </DashboardRuntimeProvider>
  );
}
