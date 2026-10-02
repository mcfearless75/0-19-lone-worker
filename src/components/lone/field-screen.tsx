import { useEffect, useRef, useState } from "react";
import { help } from "@/components/lone/help";
import { ActionButton, NavLink, StatusPill, TextField, TopBar, inputClass } from "@/components/lone/chrome";
import { HoldButton } from "@/components/lone/hold-button";
import { lookupAddress } from "@/lib/lone/address-api";
import { type AddressHit } from "@/lib/lone/address";
import { saveClip } from "@/lib/lone/audio";
import { saveNoteOnline } from "@/lib/lone/notes-api";
import {
  formatRemain,
  mapsHref,
  productName,
  uid,
  type Alert,
} from "@/lib/lone/model";
import { deviceId, normalizeTeamCode, raisedLabel, validTeamCode } from "@/lib/lone/board";
import { pushAlert, pushDuress, standDownBoard } from "@/lib/lone/raise";
import { classifyPin, pinsConfigured } from "@/lib/lone/pin";
import { useLone } from "@/lib/lone/store";

type PinAsk = { onDone: (duress: boolean) => void } | null;

/**
 * Asks for the safe PIN before a stand-down or check-in. The duress PIN is
 * accepted exactly like the safe one on screen; the caller gets duress=true
 * and quietly raises the alarm. A wrong PIN just shakes.
 */
function PinSheet({ ask, onCancel }: { ask: PinAsk; onCancel: () => void }) {
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState(false);
  const profile = useLone((state) => state.profile);
  if (!ask) return null;
  const submit = () => {
    const result = classifyPin(code, profile);
    if (result === "safe" || result === "none") return ask.onDone(false);
    if (result === "duress") return ask.onDone(true);
    setWrong(true);
    setCode("");
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-lg bg-bg p-4">
        <p className="text-base font-bold text-fg">Enter your PIN</p>
        <input
          className={`${inputClass} mt-3 text-center font-mono text-2xl tracking-[0.5em]`}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          autoFocus
          value={code}
          onChange={(event) => {
            setWrong(false);
            setCode(event.target.value.replace(/\D/g, "").slice(0, 4));
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && code.length === 4) submit();
          }}
        />
        {wrong ? <p className="mt-2 text-sm text-alert">That is not your PIN.</p> : null}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <ActionButton tone="ghost" onClick={onCancel}>
            Cancel
          </ActionButton>
          <ActionButton disabled={code.length !== 4} onClick={submit}>
            Confirm
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

/** Run `go` straight away when no PIN is set, otherwise after the PIN sheet. */
function guarded(
  profile: { safePin?: string; duressPin?: string },
  setAsk: (ask: PinAsk) => void,
  go: (duress: boolean) => void,
): void {
  if (!pinsConfigured(profile)) return go(false);
  setAsk({ onDone: (duress) => { setAsk(null); go(duress); } });
}

type View =
  | { name: "home" }
  | { name: "start" }
  | { name: "note" }
  | { name: "send"; alertId: string; dutyNote?: string }
  | { name: "discreet"; alertId: string };

export function FieldScreen() {
  const profile = useLone((state) => state.profile);
  const jobs = useLone((state) => state.jobs);
  const alerts = useLone((state) => state.alerts);
  const welfare = useLone((state) => state.welfare);
  const setProfile = useLone((state) => state.setProfile);
  const [view, setView] = useState<View>({ name: "home" });
  const [now, setNow] = useState(() => Date.now());
  const [pinAsk, setPinAsk] = useState<PinAsk>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const job = jobs.find((entry) => entry.status === "active") ?? null;
  const timer =
    job ? (welfare.find((item) => item.jobId === job.id && item.status === "running") ?? null) : null;
  const checkedIn = job
    ? welfare.some((item) => item.jobId === job.id && item.status === "checked_in")
    : false;
  const openRed = alerts.find(
    (alert) => alert.kind === "red" && (alert.status === "open" || alert.status === "acknowledged"),
  );
  const openTimer = alerts.find((alert) => alert.kind === "timer" && alert.status === "open");

  const raise = () => {
    const existing = useLone
      .getState()
      .alerts.find(
        (alert) => alert.kind === "red" && (alert.status === "open" || alert.status === "acknowledged"),
      );
    if (existing) {
      setView(
        profile.discreet
          ? { name: "discreet", alertId: existing.id }
          : { name: "send", alertId: existing.id },
      );
      return;
    }
    const alert = useLone.getState().triggerRed();
    const pending = pushAlert(alert);
    if (profile.discreet) {
      setView({ name: "discreet", alertId: alert.id });
      return;
    }
    void pending.then((result) => {
      setView({ name: "send", alertId: alert.id, dutyNote: raisedLabel(result) });
    });
  };

  if (view.name === "discreet") {
    return <Discreet now={now} onReveal={() => setView({ name: "send", alertId: view.alertId })} />;
  }
  if (view.name === "send") {
    const alert = alerts.find((entry) => entry.id === view.alertId);
    if (!alert) {
      return (
        <div className="safe-pad mx-auto max-w-lg bg-bg">
          <p className="text-sm text-muted">That alert is no longer open.</p>
          <button type="button" className="mt-3 h-11 text-sm text-fg" onClick={() => setView({ name: "home" })}>
            Back
          </button>
        </div>
      );
    }
    return (
      <SendSheet
        alert={alert}
        dutyNote={view.dutyNote}
        onClose={() => setView({ name: "home" })}
      />
    );
  }
  if (view.name === "start") {
    return <StartJob onClose={() => setView({ name: "home" })} onStarted={() => setView({ name: "home" })} />;
  }
  if (view.name === "note") {
    return <NoteSheet jobRef={job?.ref ?? null} onClose={() => setView({ name: "home" })} />;
  }

  const dueMs = timer ? new Date(timer.expiresAt).getTime() - now : null;
  const warning = timer != null && dueMs != null && dueMs > 0 && dueMs <= profile.warnMinutes * 60_000;

  return (
    <div className="safe-pad mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-4 bg-bg">
      <PinSheet ask={pinAsk} onCancel={() => setPinAsk(null)} />
      <TopBar title={productName} help={help.home}>
        <NavLink to="/desk">Desk</NavLink>
        <NavLink to="/board">Board</NavLink>
        <NavLink to="/settings">Routes</NavLink>
      </TopBar>

      <TextField
        label="Your name on the log"
        value={profile.workerName}
        placeholder="Name the desk will see"
        onChange={(workerName) => setProfile({ workerName })}
      />
      {validTeamCode(normalizeTeamCode(profile.teamCode ?? "")) ? (
        <p className="text-sm text-muted">
          Sharing your last pin to board {normalizeTeamCode(profile.teamCode ?? "")}.
        </p>
      ) : null}

      {openRed ? (
        <button
          type="button"
          onClick={() =>
            setView(
              profile.discreet ? { name: "discreet", alertId: openRed.id } : { name: "send", alertId: openRed.id },
            )
          }
          className="rounded-lg border border-alert bg-surface p-4 text-left"
        >
          <StatusPill tone="alert">Red alert open</StatusPill>
          <p className="mt-2 text-sm text-fg">Logged on the desk. Send it on, or stand it down.</p>
        </button>
      ) : null}

      {openTimer && !openRed ? (
        <div className="rounded-lg border border-amber bg-surface p-4">
          <StatusPill tone="amber">Welfare missed</StatusPill>
          <p className="mt-2 text-sm text-fg">The timer ran out. Send it, or mark yourself safe.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <ActionButton tone="amber" onClick={() => setView({ name: "send", alertId: openTimer.id })}>
              Send
            </ActionButton>
            <ActionButton
              tone="ok"
              onClick={() =>
                guarded(profile, setPinAsk, (duress) => {
                  if (duress) {
                    const site = job?.site ?? "";
                    useLone.getState().checkIn(openTimer.jobId ?? "", true);
                    useLone.getState().resolveAlert(openTimer.id, "Worker checked in safe");
                    void pushDuress(site);
                    return;
                  }
                  useLone.getState().markSafe(openTimer.id);
                  void standDownBoard();
                })
              }
            >
              I'm safe
            </ActionButton>
          </div>
        </div>
      ) : null}

      {job ? (
        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-xs tracking-widest text-muted">{job.ref}</p>
            <StatusPill tone={warning || (dueMs != null && dueMs < 0) ? "amber" : "ok"}>
              {checkedIn && !timer ? "Checked in" : dueMs != null && dueMs < 0 ? "Overdue" : "On job"}
            </StatusPill>
          </div>
          <h2 className="mt-2 text-lg font-medium text-fg">{job.site}</h2>
          <p className="text-sm text-muted">
            {[job.address, job.client].filter(Boolean).join(" · ") || "No address"}
          </p>
          {job.arrivedAt === null ? (
            <p className="mt-3 text-sm text-muted">
              Travelling. Press Arrived when you get there
              {job.timerMinutes ? ` to start the ${job.timerMinutes} min timer` : ""}.
            </p>
          ) : timer && dueMs != null ? (
            <>
              <p className={`mt-3 font-mono text-3xl tabular-nums ${dueMs < 0 ? "text-amber" : "text-fg"}`}>
                {formatRemain(dueMs)}
              </p>
              {warning ? (
                <p className="mt-1 text-sm font-bold text-amber">
                  Still OK? Tap I'm safe, or +15 min if you need longer. The team is alerted when it reaches zero.
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-3 text-sm text-muted">
              {checkedIn ? "Checked in safe. The team can see it. End the job when you leave." : "No welfare timer on this job."}
            </p>
          )}
          {job.arrivedAt === null ? (
            <div className="mt-3">
              <ActionButton tone="amber" onClick={() => useLone.getState().arrive(job.id)}>
                Arrived
              </ActionButton>
            </div>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {timer ? (
              <ActionButton
                tone="ok"
                onClick={() =>
                  guarded(profile, setPinAsk, (duress) => {
                    useLone.getState().checkIn(job.id, duress);
                    if (duress) void pushDuress(job.site);
                  })
                }
              >
                I'm safe
              </ActionButton>
            ) : (
              <ActionButton tone="surface" onClick={() => setView({ name: "note" })}>
                Amber note
              </ActionButton>
            )}
            {timer ? (
              <ActionButton onClick={() => useLone.getState().extendWelfare(job.id, 15)}>+15 min</ActionButton>
            ) : (
              <ActionButton onClick={() => useLone.getState().endJob(job.id, "Completed")}>End job</ActionButton>
            )}
          </div>
          {timer ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <ActionButton tone="surface" onClick={() => setView({ name: "note" })}>
                Amber note
              </ActionButton>
              <ActionButton tone="ghost" onClick={() => useLone.getState().endJob(job.id, "Completed")}>
                End job
              </ActionButton>
            </div>
          ) : null}
        </section>
      ) : (
        <ActionButton tone="amber" onClick={() => setView({ name: "start" })}>
          Start a job
        </ActionButton>
      )}

      <div className="flex flex-1 items-center py-2">
        <HoldButton label="Red alert" hint="HOLD" onTrigger={raise} />
      </div>

      <p className="text-center text-sm leading-relaxed text-muted">
        {holdHint(validTeamCode(normalizeTeamCode(profile.teamCode ?? "")))}
      </p>

      {job ? (
        <button type="button" className="h-11 text-sm text-muted" onClick={() => setView({ name: "start" })}>
          Start another job
        </button>
      ) : (
        <ActionButton onClick={() => setView({ name: "note" })}>Amber note</ActionButton>
      )}
    </div>
  );
}

function holdHint(joined: boolean): string {
  if (joined) {
    return "Hold for 1.5 seconds, then release. It goes on the board by itself. You do not paste anything.";
  }
  return "Hold for 1.5 seconds, then release. Set a board code so the others see it without a paste.";
}

function SendSheet({
  alert,
  onClose,
  dutyNote = "",
}: {
  alert: Alert;
  onClose: () => void;
  dutyNote?: string;
}) {
  const profile = useLone((state) => state.profile);
  const [pinAsk, setPinAsk] = useState<PinAsk>(null);
  const updateAlertNote = useLone((state) => state.updateAlertNote);
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState(dutyNote);
  const fresh = useLone((state) => state.alerts.find((entry) => entry.id === alert.id)) ?? alert;
  const map = mapsHref(fresh.lat, fresh.lng);

  return (
    <div className="safe-pad mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-4 bg-bg">
      <TopBar title={fresh.kind === "red" ? "Red alert" : "Welfare alert"} help={help.alert}>
        <button type="button" className="h-11 px-2 text-sm text-muted" onClick={onClose}>
          Close
        </button>
      </TopBar>
      <section className="rounded-lg border border-border bg-surface p-4">
        <StatusPill tone={fresh.kind === "red" ? "alert" : "amber"}>On the desk</StatusPill>
        <p className="mt-3 text-sm leading-relaxed text-muted">{dutyNote || "Sending it to the board."}</p>
        <p className="mt-2 text-sm text-fg">
          {[fresh.site, fresh.address].filter(Boolean).join(", ") || "No address on this alert."}
        </p>
        <p className="mt-2 text-sm text-fg">
          {map ? (
            <a className="underline decoration-border underline-offset-4" href={map} target="_blank" rel="noreferrer">
              Map pin
            </a>
          ) : (
            "No map pin yet. Allow location, then hold Red alert again."
          )}
        </p>
      </section>
      <label className="block">
        <span className="mb-1.5 block text-sm text-muted">Detail to include</span>
        <textarea
          className={`${inputClass} min-h-24 py-3`}
          value={fresh.note}
          placeholder="What should the message say?"
          onChange={(event) => updateAlertNote(fresh.id, event.target.value)}
        />
      </label>
      {sent ? <p className="text-sm text-ok">{sent}</p> : null}
      <div className="mt-auto grid gap-2">
        <p className="text-sm text-muted">False alarm</p>
        <div className="grid grid-cols-3 gap-2">
          {["Pocket press", "Test", "Safe now"].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setReason(item)}
              className={`h-11 rounded-lg border text-sm ${reason === item ? "border-fg text-fg" : "border-border text-muted"}`}
            >
              {item}
            </button>
          ))}
        </div>
        <ActionButton
          tone="ghost"
          disabled={!reason}
          onClick={() =>
            guarded(profile, setPinAsk, (duress) => {
              useLone.getState().falseAlarm(fresh.id, reason);
              if (duress) void pushDuress(fresh.site);
              else void standDownBoard();
              onClose();
            })
          }
        >
          Log false alarm
        </ActionButton>
      </div>
      <PinSheet ask={pinAsk} onCancel={() => setPinAsk(null)} />
    </div>
  );
}

function Discreet({ now, onReveal }: { now: number; onReveal: () => void }) {
  const time = new Date(now).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const mark = useLone((state) => state.profile.organisation)?.trim();
  return (
    <div className="safe-pad grid min-h-dvh place-items-center bg-bg">
      <div className="w-full max-w-sm">
        <HoldButton quiet label={time} hint="HOLD" onTrigger={onReveal} />
        {mark ? (
          <p className="mt-6 truncate text-center font-mono text-xs tracking-widest text-faint uppercase">
            {mark}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function StartJob({ onClose, onStarted }: { onClose: () => void; onStarted: () => void }) {
  const [site, setSite] = useState("");
  const [address, setAddress] = useState("");
  const [client, setClient] = useState("");
  const [note, setNote] = useState("");
  const [minutes, setMinutes] = useState<number | null>(30);
  const [onArrival, setOnArrival] = useState(true);
  const [hits, setHits] = useState<AddressHit[]>([]);
  const [checked, setChecked] = useState("");
  const [badPostcode, setBadPostcode] = useState("");
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const choices = [15, 30, 45, 60, 90];

  useEffect(() => {
    const query = address.trim();
    if (query.length < 3) {
      setHits([]);
      setChecked("");
      setBadPostcode("");
      return;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      void lookupAddress({ data: { q: query } })
        .then((result) => {
          if (!live) return;
          setHits(result.hits);
          setChecked(result.postcode?.code ?? "");
          setBadPostcode(result.invalidPostcode ?? "");
          if (result.postcode) setPin({ lat: result.postcode.lat, lng: result.postcode.lng });
        })
        .catch(() => {
          if (!live) return;
          setHits([]);
          setChecked("");
          setBadPostcode("");
        });
    }, 400);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [address]);

  return (
    <form
      className="safe-pad mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-4 bg-bg"
      onSubmit={(event) => {
        event.preventDefault();
        if (!site.trim()) return;
        useLone.getState().startJob({
          site,
          address,
          client,
          note,
          minutes,
          onArrival,
          lat: pin?.lat,
          lng: pin?.lng,
        });
        if (minutes) void Notification.requestPermission().catch(() => undefined);
        onStarted();
      }}
    >
      <TopBar title="Start a job" help={help.startJob}>
        <button type="button" className="h-11 px-2 text-sm text-muted" onClick={onClose}>
          Close
        </button>
      </TopBar>
      <TextField label="Site" value={site} onChange={setSite} placeholder="Riverside Surgery" />
      <div>
        <TextField
          label="Address"
          value={address}
          onChange={(value) => {
            setAddress(value);
            setPin(null);
            setChecked("");
          }}
          placeholder="Start typing a street or postcode"
          autoComplete="off"
        />
        {checked ? (
          <p className="mt-2 text-sm text-ok">✓ {checked} is a real postcode. The job is pinned there.</p>
        ) : null}
        {badPostcode ? (
          <p className="mt-2 text-sm text-alert">
            {badPostcode} is not a real postcode. Check it before you start, so help goes to the right place.
          </p>
        ) : null}
        {hits.length ? (
          <ul className="mt-2 overflow-hidden rounded-lg border border-border bg-surface">
            {hits.map((hit) => (
              <li key={`${hit.lat},${hit.lng}`}>
                <button
                  type="button"
                  className="block min-h-11 w-full px-3 py-2 text-left text-sm text-fg"
                  onClick={() => {
                    setAddress(hit.label);
                    setPin({ lat: hit.lat, lng: hit.lng });
                    setHits([]);
                    if (!site.trim() && hit.site) setSite(hit.site);
                  }}
                >
                  {hit.label}
                  {hit.postcode ? null : (
                    <span className="block text-xs text-muted">Postcode not confirmed. Add it after picking.</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <TextField label="Client or task" value={client} onChange={setClient} placeholder="Lock-up" />
      <label className="block">
        <span className="mb-1.5 block text-sm text-muted">Note for the desk</span>
        <textarea
          className={`${inputClass} min-h-24 py-3`}
          value={note}
          placeholder="Entering alone. Alarm panel in reception."
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <div>
        <p className="mb-2 text-sm text-muted">Welfare timer</p>
        <div className="grid grid-cols-3 gap-2">
          {choices.map((choice) => (
            <button
              key={choice}
              type="button"
              onClick={() => setMinutes(choice)}
              className={`h-11 rounded-lg border text-sm ${
                minutes === choice ? "border-amber bg-amber text-amber-ink" : "border-border text-fg"
              }`}
            >
              {choice} min
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMinutes(null)}
            className={`h-11 rounded-lg border text-sm ${
              minutes === null ? "border-fg text-fg" : "border-border text-muted"
            }`}
          >
            None
          </button>
        </div>
        {minutes ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setOnArrival(true)}
              className={`h-11 rounded-lg border text-sm ${onArrival ? "border-fg text-fg" : "border-border text-muted"}`}
            >
              Timer starts when I arrive
            </button>
            <button
              type="button"
              onClick={() => setOnArrival(false)}
              className={`h-11 rounded-lg border text-sm ${!onArrival ? "border-fg text-fg" : "border-border text-muted"}`}
            >
              Timer starts now
            </button>
          </div>
        ) : null}
        <div>
        </div>
      </div>
      <p className="text-sm text-muted">
        The timer is watched while this app is open. If the phone sleeps, the missed check-in is raised
        as soon as the app is opened again. Keep it on screen during the job.
      </p>
      <div className="mt-auto">
        <ActionButton type="submit" tone="amber" disabled={!site.trim()}>
          Start and log it
        </ActionButton>
      </div>
    </form>
  );
}

function NoteSheet({ jobRef, onClose }: { jobRef: string | null; onClose: () => void }) {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [hasAudio, setHasAudio] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [offline, setOffline] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [recording]);

  const stopRecording = () =>
    new Promise<void>((resolve) => {
      const media = recorder.current;
      if (!media || media.state === "inactive") {
        resolve();
        return;
      }
      media.onstop = () => {
        media.stream.getTracks().forEach((track) => track.stop());
        setHasAudio(chunks.current.some((chunk) => chunk.size > 0));
        setRecording(false);
        resolve();
      };
      media.stop();
    });

  const toggle = async () => {
    if (recording) {
      await stopRecording();
      return;
    }
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const media = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      media.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      recorder.current = media;
      media.start();
      setSeconds(0);
      setRecording(true);
    } catch {
      setError("Microphone is blocked. The written note can still be saved.");
    }
  };

  return (
    <form
      className="safe-pad mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-4 bg-bg"
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          if (saving) return;
          if (recording) await stopRecording();
          const hasClip = chunks.current.some((chunk) => chunk.size > 0);
          if (!text.trim() && !hasClip) return;
          setSaving(true);
          setError("");
          const blob = hasClip
            ? new Blob(chunks.current, { type: chunks.current[0]?.type || "audio/webm" })
            : null;
          // Send to the server first, so the note can go out with any alert that follows.
          // After a failure, "Save on this phone only" is offered as a separate button.
          try {
            const state = useLone.getState();
            await saveNoteOnline({
              data: {
                device: deviceId(),
                name: state.profile.workerName,
                job: state.jobs.find((entry) => entry.status === "active")?.site ?? "",
                note: text,
                lat: state.lastFix?.lat ?? null,
                lng: state.lastFix?.lng ?? null,
                audioBase64: blob ? await toBase64(blob) : "",
                mime: blob?.type ?? "",
              },
            });
          } catch {
            setSaving(false);
            setOffline(true);
            setError("Could not reach the server. Try again when you have signal, or save on this phone only.");
            return;
          }
          let audioId: string | null = null;
          if (blob) {
            audioId = uid();
            await saveClip(audioId, blob);
          }
          useLone.getState().addNote({ text, audioId });
          onClose();
        })();
      }}
    >
      <TopBar title="Amber note" help={help.amberNote}>
        <button type="button" className="h-11 px-2 text-sm text-muted" onClick={onClose}>
          Close
        </button>
      </TopBar>
      <p className="text-sm text-muted">
        Say or write what you are walking into. Nobody is messaged now. If you raise an alert in the
        next 12 hours, this note and the recording go with it to your alert emails
        {jobRef ? `, filed against ${jobRef}` : ""}.
      </p>
      <textarea
        className={`${inputClass} min-h-32 py-3`}
        value={text}
        placeholder="Side gate was open. Closed it."
        onChange={(event) => setText(event.target.value)}
      />
      <ActionButton type="button" tone={recording ? "alert" : "surface"} onClick={() => void toggle()}>
        {recording ? `Stop voice note · ${seconds}s` : hasAudio ? "Record again" : "Record a voice note"}
      </ActionButton>
      {error ? <p className="text-sm text-amber">{error}</p> : null}
      {hasAudio && !recording ? (
        <p className="text-sm text-ok">Voice note ready. Press Save to send it to the server.</p>
      ) : null}
      <div className="mt-auto">
        <ActionButton type="submit" tone="amber">
          {saving ? "Saving…" : offline ? "Try again" : "Save"}
        </ActionButton>
        {offline ? (
          <button
            type="button"
            className="mt-2 h-11 w-full text-sm text-muted"
            onClick={() => {
              void (async () => {
                let audioId: string | null = null;
                if (chunks.current.some((chunk) => chunk.size > 0)) {
                  audioId = uid();
                  await saveClip(audioId, new Blob(chunks.current, { type: chunks.current[0]?.type || "audio/webm" }));
                }
                useLone.getState().addNote({ text, audioId });
                onClose();
              })();
            }}
          >
            Save on this phone only (it will not go with an alert)
          </button>
        ) : null}
      </div>
    </form>
  );
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
