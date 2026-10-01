import { useEffect, useState } from "react";
import { help } from "@/components/lone/help";
import { ActionButton, NavLink, StatusPill, TextField, TopBar } from "@/components/lone/chrome";
import { ageLabel, deviceId, freshCode, isLive, normalizeTeamCode, validTeamCode, type BoardPerson } from "@/lib/lone/board";
import { leaveBoard, publishPresence, readBoard, readVisits } from "@/lib/lone/board-api";
import { currentVisit } from "@/lib/lone/visit-sync";
import { visitLine, type VisitRecord } from "@/lib/lone/visits";
import { mapsHref } from "@/lib/lone/model";
import { useLone } from "@/lib/lone/store";

export function BoardScreen() {
  const teamCode = useLone((state) => state.profile.teamCode ?? "");
  const setProfile = useLone((state) => state.setProfile);
  const code = normalizeTeamCode(teamCode);
  const joined = validTeamCode(code);
  const [draft, setDraft] = useState("");
  const [people, setPeople] = useState<BoardPerson[]>([]);
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [problem, setProblem] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [self, setSelf] = useState("");

  useEffect(() => {
    setSelf(deviceId());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!joined) return;
    let live = true;
    const load = () => {
      const state = useLone.getState();
      const job = state.jobs.find((entry) => entry.status === "active");
      void publishPresence({
        data: {
          team: code,
          device: deviceId(),
          name: state.profile.workerName,
          job: job?.site ?? "",
          lat: state.lastFix?.lat ?? null,
          lng: state.lastFix?.lng ?? null,
          accuracy: state.lastFix?.accuracy ?? null,
          ...currentVisit(state.jobs, state.welfare),
        },
      })
        .then(() => Promise.all([readBoard({ data: { team: code } }), readVisits({ data: { team: code } })]))
        .then(([rows, history]) => {
          if (!live) return;
          setPeople(rows);
          setVisits(history);
          setProblem("");
        })
        .catch(() => {
          if (live) setProblem("The board could not be reached.");
        });
    };
    load();
    const id = window.setInterval(load, 15_000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [code, joined]);

  const stop = () => {
    const current = normalizeTeamCode(useLone.getState().profile.teamCode ?? "");
    if (validTeamCode(current)) {
      void leaveBoard({
        data: { team: current, device: deviceId(), name: "", job: "", lat: null, lng: null, accuracy: null },
      }).catch(() => undefined);
    }
    setProfile({ teamCode: "" });
    setPeople([]);
  };

  return (
    <div className="safe-pad mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 bg-bg">
      <TopBar title="Board" help={help.board}>
        <NavLink to="/">Field</NavLink>
        <NavLink to="/desk">Desk</NavLink>
        <NavLink to="/settings">Routes</NavLink>
      </TopBar>

      <p className="text-sm leading-relaxed text-muted">
        Same code on every phone. A red alert stays here even if that phone then locks.
        A quiet phone with no alert drops off after a few minutes. This is not a trail.
      </p>

      {joined ? (
        <>
          <section className="rounded-lg border border-border bg-surface p-4">
            <p className="text-sm text-muted">Board code</p>
            <p className="mt-1 font-mono text-3xl tracking-widest text-blue">{code}</p>
            <p className="mt-2 text-sm text-muted">Anyone with this code can see these pins.</p>
            <button type="button" className="mt-3 h-11 text-sm text-muted underline" onClick={stop}>
              Stop sharing
            </button>
          </section>
          {problem ? <p className="text-sm text-alert">{problem}</p> : null}
          {people.some((person) => person.device === self && person.name === "Unnamed") ? (
            <p className="text-sm text-muted">Set your name on the field screen so the others can tell who you are.</p>
          ) : null}
          {people.length === 0 ? (
            <p className="text-sm text-muted">Nobody is on this board yet. Open the app on a phone with this code.</p>
          ) : (
            <ul className="grid gap-3">
              {[...people]
                .sort(
                  (a, b) =>
                    Number(Boolean(b.alertKind)) - Number(Boolean(a.alertKind)) ||
                    Number(isLive(b.seenAt, now)) - Number(isLive(a.seenAt, now)) ||
                    a.name.localeCompare(b.name),
                )
                .map((person) => {
                const map = mapsHref(person.lat, person.lng);
                const trouble = person.alertKind === "red" || person.alertKind === "timer";
                const live = isLive(person.seenAt, now);
                return (
                  <li
                    key={person.device}
                    className={`rounded-lg border bg-surface p-4 ${trouble ? "border-alert" : "border-border"} ${
                      live || trouble ? "" : "opacity-60"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <h2 className="text-lg font-bold text-fg">{person.name}</h2>
                      <p className="shrink-0 text-sm text-muted">
                        {trouble
                          ? ageLabel(person.alertAt || person.seenAt, now)
                          : live
                            ? `Live · ${ageLabel(person.seenAt, now)}`
                            : `Last seen ${ageLabel(person.seenAt, now)}`}
                      </p>
                    </div>
                    {trouble ? (
                      <div className="mt-2">
                        <StatusPill tone={person.alertKind === "red" ? "alert" : "amber"}>
                          {person.alertKind === "red" ? "Red alert" : "Welfare missed"}
                        </StatusPill>
                      </div>
                    ) : null}
                    {(() => {
                      const line = visitLine(person, person.job, now);
                      const colour =
                        line.tone === "ok" ? "text-ok" : line.tone === "amber" ? "text-amber" : "text-muted";
                      return (
                        <p className={`mt-2 text-sm ${colour}`}>
                          {line.text}
                          {person.device === self ? " · this phone" : ""}
                        </p>
                      );
                    })()}
                    {person.alertNote ? <p className="mt-2 text-sm text-fg">{person.alertNote}</p> : null}
                    {map ? (
                      <a
                        className="mt-2 inline-flex h-11 items-center text-sm font-bold text-blue underline"
                        href={map}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open the map pin
                        {person.accuracy != null ? ` (±${Math.round(person.accuracy)} m)` : ""}
                      </a>
                    ) : (
                      <p className="mt-2 text-sm text-muted">No location yet. Allow location on that phone.</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <section className="mt-6">
            <h2 className="text-base font-bold text-fg">Visits in the last 24 hours</h2>
            {visits.length === 0 ? (
              <p className="mt-2 text-sm text-muted">None yet.</p>
            ) : (
              <ul className="mt-2 grid gap-2">
                {visits.map((visit) => {
                  const t = (iso: string | null) =>
                    iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
                  const status = visit.endedAt
                    ? `Ended ${t(visit.endedAt)}${visit.outcome ? ` · ${visit.outcome}` : ""}`
                    : visit.checkedInAt
                      ? `Checked in safe ${t(visit.checkedInAt)}`
                      : visit.dueAt && new Date(visit.dueAt).getTime() < now
                        ? `Overdue since ${t(visit.dueAt)}`
                        : visit.dueAt
                          ? `On a visit · due ${t(visit.dueAt)}`
                          : visit.arrivedAt
                            ? `On a visit since ${t(visit.arrivedAt)}`
                            : `Travelling since ${t(visit.startedAt)}`;
                  const tone = visit.endedAt
                    ? "text-muted"
                    : visit.checkedInAt
                      ? "text-ok"
                      : visit.dueAt && new Date(visit.dueAt).getTime() < now
                        ? "text-amber"
                        : "text-fg";
                  return (
                    <li key={visit.id} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                      <span className="font-bold text-fg">{visit.name}</span>
                      <span className="text-muted"> · {visit.site || "No site"} · started {t(visit.startedAt)}</span>
                      <span className={`block ${tone}`}>{status}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      ) : (
        <>
          <ActionButton
            tone="blue"
            onClick={() => {
              setProfile({ teamCode: freshCode() });
            }}
          >
            Make a code
          </ActionButton>
          <TextField
            label="Or join a code"
            value={draft}
            placeholder="ABCD"
            onChange={(value) => setDraft(normalizeTeamCode(value))}
          />
          <ActionButton
            disabled={!validTeamCode(normalizeTeamCode(draft))}
            onClick={() => setProfile({ teamCode: normalizeTeamCode(draft) })}
          >
            Join
          </ActionButton>
        </>
      )}
    </div>
  );
}
