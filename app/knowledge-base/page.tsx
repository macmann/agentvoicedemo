import { KnowledgeBaseManagerPage } from "@/components/tester/KnowledgeBaseManagerPage";
import { DashboardRuntimeProvider } from "@/state/useDashboardRuntimeConfig";

export default function KnowledgeBasePage() {
  return (
    <DashboardRuntimeProvider>
      <KnowledgeBaseManagerPage />
    </DashboardRuntimeProvider>
  );
}
