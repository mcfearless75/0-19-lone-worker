import { useEffect, useRef, useState } from "react";
import { ActionButton, NavLink, StatusPill, TopBar, inputClass } from "@/components/lone/chrome";
import { loadClip } from "@/lib/lone/audio";
import { alertText, channelHref, launchChannel } from "@/lib/lone/launch";
import {
  channelLabel,
  formatRemain,
  formatWhen,
  mapsHref,
  readyChannels,
  type Alert,
  type AmberNote,
  type Job,
} from "@/lib/lone/model";
import { useLone } from "@/lib/lone/store";
import { standDownBoard } from "@/lib/lone/raise";

type Tab = "alerts" | "jobs" | "log";

const statusLabel: Record<Alert["status"], string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
  false_alarm: "False alarm",
};

export function DeskScreen() {
  const alerts = useLone((state) => state.alerts);
  const jobs = useLone((state) => state.jobs);
  const events = useLone((state) => state.events);
  const notes = useLone((state) => state.notes);
  const welfare = useLone((state) => state.welfare);
  const [tab, setTab] = useState<Tab>("alerts");
  const [now, setNow] = useState(() => Date.now());
  const [sound, setSound] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const openCount = alerts.filter((alert) => alert.status === "open" || alert.status === "acknowledged").length;
  const activeJobs = jobs.filter((job) => job.status === "active").length;
  const hasSample = jobs.some((job) => job.sample) || alerts.some((alert) => alert.sample);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!sound) return;
    let last = useLone
      .getState()
      .alerts.filter((alert) => alert.status === "open")
      .map((alert) => alert.id)
      .join();
    const id = window.setInterval(() => {
      const next = useLone
        .getState()
        .alerts.filter((alert) => alert.status === "open")
        .map((alert) => alert.id)
        .join();
      if (next !== last && next.length > last.length) beep(audio.current);
      last = next;
    }, 1000);
    return () => window.clearInterval(id);
  }, [sound]);

  return (
    <div className="safe-pad mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 bg-bg">
      <TopBar title="Control desk">
        <NavLink to="/">Field</NavLink>
        <NavLink to="/board">Board</NavLink>
        <NavLink to="/settings">Routes</NavLink>
      </TopBar>
      <p className="max-w-2xl text-sm leading-relaxed text-muted">
        Jobs, alerts, and notes from this phone. A red alert lands here the moment the hold completes.
        WhatsApp, email, and texts are sent only when someone taps a route — this desk is the record.
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Open alerts" value={String(openCount)} hot={openCount > 0} />
        <Metric label="Active jobs" value={String(activeJobs)} hot={false} />
        <Metric label="Log lines" value={String(events.length)} hot={false} />
      </div>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["alerts", "Alerts"],
            ["jobs", "Jobs"],
            ["log", "Log"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`h-11 rounded-lg px-4 text-sm font-bold ${tab === id ? "bg-blue text-white" : "border border-border text-muted"}`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            const context = audio.current ?? new AudioContext();
            audio.current = context;
            void context.resume();
            setSound((value) => !value);
          }}
          className="h-11 rounded-lg border border-border px-4 text-sm text-muted"
        >
          {sound ? "Sound on" : "Sound off"}
        </button>
        <button type="button" onClick={() => downloadCsv()} className="h-11 rounded-lg border border-border px-4 text-sm text-muted">
          Export
        </button>
      </div>

      {hasSample ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-4">
          <p className="text-sm text-muted">An example shift is mixed into this desk. Remove it before a real duty.</p>
          <button type="button" className="h-11 shrink-0 px-2 text-sm text-fg" onClick={() => useLone.getState().clearExample()}>
            Remove example
          </button>
        </div>
      ) : null}

      {tab === "alerts" ? (
        <div className="grid gap-3">
          {alerts.length === 0 ? (
            <Empty
              title="No alerts"
              body="A red-alert hold, or a welfare timer that runs out, shows up here."
            />
          ) : (
            alerts.map((alert) => <AlertCard key={alert.id} alert={alert} />)
          )}
        </div>
      ) : null}

      {tab === "jobs" ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {jobs.length === 0 ? (
            <Empty title="No jobs yet" body="Start a job on the field screen. It will show here with its timer and outcome." />
          ) : (
            jobs.map((job) => {
              const timer = welfare.find((item) => item.jobId === job.id && item.status === "running");
              const dueMs = timer ? new Date(timer.expiresAt).getTime() - now : null;
              return <JobCard key={job.id} job={job} dueMs={dueMs} />;
            })
          )}
        </div>
      ) : null}

      {tab === "log" ? (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-lg border border-border bg-surface">
            {events.length === 0 ? (
              <p className="p-4 text-sm text-muted">Nothing logged yet.</p>
            ) : (
              <ol>
                {events.map((entry) => (
                  <li key={entry.id} className="border-b border-border px-4 py-3 last:border-b-0">
                    <p className="font-mono text-xs text-faint">{formatWhen(entry.at)}</p>
                    <p className="text-sm text-fg">{entry.summary}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section className="grid content-start gap-3">
            <h2 className="text-sm font-medium text-muted">Amber notes</h2>
            {notes.length === 0 ? (
              <p className="text-sm text-muted">No notes.</p>
            ) : (
              notes.map((note) => <NoteCard key={note.id} note={note} job={jobs.find((job) => job.id === note.jobId) ?? null} />)
            )}
          </section>
        </div>
      ) : null}

      {jobs.length === 0 && alerts.length === 0 ? (
        <button type="button" className="h-11 self-start text-sm text-muted underline" onClick={() => useLone.getState().loadExample()}>
          Load an example shift
        </button>
      ) : !hasSample ? (
        <button type="button" className="h-11 self-start text-sm text-faint" onClick={() => useLone.getState().loadExample()}>
          Load an example shift
        </button>
      ) : null}
    </div>
  );
}

function Metric({ label, value, hot }: { label: string; value: string; hot: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 font-mono text-2xl tabular-nums ${hot ? "text-alert" : "text-fg"}`}>{value}</p>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="font-medium text-fg">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </div>
  );
}

function AlertCard({ alert }: { alert: Alert }) {
  const [note, setNote] = useState(alert.resolverNote);
  const profile = useLone((state) => state.profile);
  const map = mapsHref(alert.lat, alert.lng);
  const channels = readyChannels(profile);
  const closed = alert.status === "resolved" || alert.status === "false_alarm";
  const tone = alert.status === "open" ? "alert" : alert.status === "acknowledged" ? "amber" : alert.status === "false_alarm" ? "muted" : "ok";

  return (
    <article className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={alert.kind === "red" && alert.status === "open" ? "alert" : tone}>
          {alert.kind === "red" ? "Red alert" : "Welfare"}
        </StatusPill>
        <StatusPill tone="muted">{statusLabel[alert.status]}</StatusPill>
        {alert.sample ? <StatusPill tone="muted">Example</StatusPill> : null}
        <span className="font-mono text-xs text-faint">{formatWhen(alert.triggeredAt)}</span>
      </div>
      <h2 className="mt-3 text-lg font-medium text-fg">{alert.site || alert.workerName || "Unnamed worker"}</h2>
      <p className="text-sm text-muted">
        {[alert.workerName, alert.address].filter(Boolean).join(" · ") || "No site on this alert"}
      </p>
      {alert.note ? <p className="mt-2 text-sm text-fg">{alert.note}</p> : null}
      {map ? (
        <a className="mt-2 inline-flex h-11 items-center text-sm text-fg underline decoration-border underline-offset-4" href={map} target="_blank" rel="noreferrer">
          Map pin
        </a>
      ) : (
        <p className="mt-2 text-sm text-faint">No map pin</p>
      )}
      {alert.resolverNote ? <p className="mt-2 text-sm text-muted">Desk: {alert.resolverNote}</p> : null}
      {!closed ? (
        <div className="mt-3 grid gap-2">
          {channels.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {channels.map((channel) => (
                <ActionButton
                  key={channel}
                  tone="surface"
                  onClick={() => {
                    const text = alertText(profile, alert);
                    const href = channelHref(profile, channel, text, alert.kind);
                    if (!href) return;
                    launchChannel(href, channel, text);
                    useLone.getState().recordSend(alert.id, channelLabel(channel));
                  }}
                >
                  {channel === "group" ? "WhatsApp group" : channelLabel(channel)}
                </ActionButton>
              ))}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            {alert.status === "open" ? (
              <ActionButton onClick={() => useLone.getState().acknowledge(alert.id)}>Acknowledge</ActionButton>
            ) : (
              <span />
            )}
            <ActionButton tone="ok" onClick={() => {
              useLone.getState().resolveAlert(alert.id, note);
              void standDownBoard();
            }}>
              Resolve
            </ActionButton>
          </div>
          <input
            className={`${inputClass} h-12`}
            value={note}
            placeholder="Resolver note"
            onChange={(event) => setNote(event.target.value)}
          />
          <ActionButton tone="ghost" onClick={() => {
            useLone.getState().falseAlarm(alert.id, note || "Stood down from the desk");
            void standDownBoard();
          }}>
            False alarm
          </ActionButton>
        </div>
      ) : null}
    </article>
  );
}

function JobCard({ job, dueMs }: { job: Job; dueMs: number | null }) {
  const map = mapsHref(job.lat, job.lng);
  return (
    <article className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-xs tracking-widest text-muted">{job.ref}</p>
        <StatusPill tone={job.status === "active" ? "ok" : "muted"}>
          {job.sample ? "Example" : job.status === "active" ? "Active" : "Complete"}
        </StatusPill>
      </div>
      <h2 className="mt-2 text-lg font-medium text-fg">{job.site}</h2>
      <p className="text-sm text-muted">{[job.workerName || "Unnamed", job.address, job.client].filter(Boolean).join(" · ")}</p>
      <p className="mt-2 text-sm text-muted">
        Started {formatWhen(job.startedAt)}
        {job.endedAt ? ` · Ended ${formatWhen(job.endedAt)}` : ""}
      </p>
      {dueMs != null ? (
        <p className={`mt-2 font-mono text-2xl tabular-nums ${dueMs < 0 ? "text-amber" : "text-fg"}`}>{formatRemain(dueMs)}</p>
      ) : null}
      {job.note ? <p className="mt-2 text-sm text-fg">{job.note}</p> : null}
      {job.outcome ? <p className="mt-2 text-sm text-muted">Outcome: {job.outcome}</p> : null}
      {map ? (
        <a className="mt-2 inline-flex h-11 items-center text-sm underline decoration-border underline-offset-4" href={map} target="_blank" rel="noreferrer">
          Map pin
        </a>
      ) : null}
      {job.status === "active" ? (
        <div className="mt-3">
          <ActionButton onClick={() => useLone.getState().endJob(job.id, "Closed from the desk")}>End job</ActionButton>
        </div>
      ) : null}
    </article>
  );
}

function NoteCard({ note, job }: { note: AmberNote; job: Job | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!note.audioId) return;
    let objectUrl = "";
    let live = true;
    void loadClip(note.audioId).then((blob) => {
      if (!live || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [note.audioId]);

  return (
    <article className="rounded-lg border border-border bg-surface p-4">
      <p className="font-mono text-xs text-faint">
        {formatWhen(note.createdAt)}
        {job ? ` · ${job.ref}` : ""}
        {note.sample ? " · Example" : ""}
      </p>
      <p className="mt-2 text-sm text-fg">{note.text || "Voice note only"}</p>
      {note.audioId ? (
        url ? <audio className="mt-3 w-full" controls src={url} /> : <p className="mt-2 text-sm text-faint">Voice note is on the phone that recorded it.</p>
      ) : null}
    </article>
  );
}

function downloadCsv() {
  const { jobs, alerts, events } = useLone.getState();
  const rows = [
    ["type", "when", "ref", "status", "detail"],
    ...jobs.map((job) => ["job", job.startedAt, job.ref, job.status, `${job.site} ${job.outcome}`.trim()]),
    ...alerts.map((alert) => ["alert", alert.triggeredAt, alert.kind, alert.status, alert.note]),
    ...events.map((entry) => ["event", entry.at, entry.kind, "", entry.summary]),
  ];
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "lone-worker-log.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function beep(context: AudioContext | null) {
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 880;
  oscillator.connect(gain);
  gain.connect(context.destination);
  gain.gain.setValueAtTime(0.04, context.currentTime);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.12);
}
