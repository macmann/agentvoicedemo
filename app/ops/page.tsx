import { OpsQaDashboard } from "@/components/ops/OpsQaDashboard";
import { DashboardRuntimeProvider } from "@/state/useDashboardRuntimeConfig";

export default function OpsPage() {
  return (
    <DashboardRuntimeProvider>
      <OpsQaDashboard />
    </DashboardRuntimeProvider>
  );
}
