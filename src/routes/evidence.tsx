import { createFileRoute } from "@tanstack/react-router";
import { LoneGate } from "@/components/lone/chrome";
import { EvidenceScreen } from "@/components/lone/evidence-screen";

export const Route = createFileRoute("/evidence")({
  validateSearch: (search: Record<string, unknown>) => ({ alert: String(search.alert ?? "") }),
  component: Evidence,
});

function Evidence() {
  const { alert } = Route.useSearch();
  return (
    <LoneGate>
      <EvidenceScreen alertId={alert} />
    </LoneGate>
  );
}
