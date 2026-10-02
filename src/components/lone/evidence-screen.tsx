import { useEffect, useState } from "react";
import { help } from "@/components/lone/help";
import { ActionButton, NavLink, TopBar } from "@/components/lone/chrome";
import { deviceId, normalizeTeamCode } from "@/lib/lone/board";
import { evidenceLines, type EvidencePack } from "@/lib/lone/evidence";
import { emailEvidence, readEvidence } from "@/lib/lone/evidence-api";
import { useLone } from "@/lib/lone/store";

export function EvidenceScreen({ alertId }: { alertId: string }) {
  const team = useLone((state) => normalizeTeamCode(state.profile.teamCode ?? ""));
  const [pack, setPack] = useState<EvidencePack | null | "loading">("loading");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let live = true;
    setPack("loading");
    void readEvidence({ data: { alertId, team, device: deviceId() } })
      .then((p) => {
        if (live) setPack(p);
      })
      .catch(() => {
        if (live) setPack(null);
      });
    return () => {
      live = false;
    };
  }, [alertId, team]);

  const send = () => {
    setNotice("Sending…");
    void emailEvidence({ data: { alertId, team, device: deviceId() } })
      .then((r) => setNotice(r.sent > 0 ? `Emailed to ${r.sent} address${r.sent === 1 ? "" : "es"}.` : "No alert emails were set when this alert was raised, so nothing was sent."))
      .catch(() => setNotice("Could not send the pack."));
  };

  return (
    <div className="safe-pad mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-4 bg-bg print:max-w-none">
      <div className="print:hidden">
        <TopBar title="Evidence pack" help={help.evidence}>
          <NavLink to="/desk">Desk</NavLink>
          <NavLink to="/board">Board</NavLink>
        </TopBar>
      </div>
      {pack === "loading" ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : pack == null ? (
        <p className="text-sm text-muted">
          No pack for this alert. It may be from before packs were kept, or you need the same board code as the worker.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 print:hidden">
            <ActionButton onClick={() => window.print()}>Save as PDF / print</ActionButton>
            <ActionButton tone="surface" onClick={send}>
              Email to the alert emails
            </ActionButton>
          </div>
          {notice ? <p className="text-sm text-muted print:hidden">{notice}</p> : null}
          <article className="rounded-lg border border-border bg-surface p-4 print:border-0 print:p-0">
            {evidenceLines(pack).map((line, i) =>
              line.text === "" ? (
                <div key={i} className="h-3" />
              ) : (
                <p
                  key={i}
                  className={`${line.bold ? "font-bold text-fg" : "text-fg"} ${
                    line.size && line.size >= 16 ? "text-lg" : line.size && line.size >= 13 ? "mt-1 text-base" : "text-sm"
                  } break-words leading-relaxed`}
                >
                  {line.text}
                </p>
              ),
            )}
          </article>
        </>
      )}
    </div>
  );
}
