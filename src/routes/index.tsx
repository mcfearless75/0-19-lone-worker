import { createFileRoute } from "@tanstack/react-router";
import { LoneGate } from "@/components/lone/chrome";
import { FieldScreen } from "@/components/lone/field-screen";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <LoneGate>
      <FieldScreen />
    </LoneGate>
  );
}
