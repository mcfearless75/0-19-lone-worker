import { createFileRoute } from "@tanstack/react-router";
import { BoardScreen } from "@/components/lone/board-screen";
import { LoneGate } from "@/components/lone/chrome";

export const Route = createFileRoute("/board")({
  component: Board,
});

function Board() {
  return (
    <LoneGate>
      <BoardScreen />
    </LoneGate>
  );
}
