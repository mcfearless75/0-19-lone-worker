import { createFileRoute } from "@tanstack/react-router";
import { LoneGate } from "@/components/lone/chrome";
import { SettingsScreen } from "@/components/lone/settings-screen";

export const Route = createFileRoute("/settings")({
  component: Settings,
});

function Settings() {
  return (
    <LoneGate>
      <SettingsScreen />
    </LoneGate>
  );
}
