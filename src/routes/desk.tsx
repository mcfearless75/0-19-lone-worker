import { createFileRoute } from "@tanstack/react-router";
import { LoneGate } from "@/components/lone/chrome";
import { DeskScreen } from "@/components/lone/desk-screen";

export const Route = createFileRoute("/desk")({
  component: Desk,
});

function Desk() {
  return (
    <LoneGate>
      <DeskScreen />
    </LoneGate>
  );
}
