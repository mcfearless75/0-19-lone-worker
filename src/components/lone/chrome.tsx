import { Link } from "@tanstack/react-router";
import { useEffect, type ReactNode, useState } from "react";
import { deviceId, normalizeTeamCode, validTeamCode } from "@/lib/lone/board";
import { publishPresence } from "@/lib/lone/board-api";
import { defaultProfile, productName } from "@/lib/lone/model";
import { pushAlert } from "@/lib/lone/raise";
import { migrateLoneStorage, useLone } from "@/lib/lone/store";
import { startWelfareSync } from "@/lib/lone/welfare-sync";
import { currentVisit, startVisitSync } from "@/lib/lone/visit-sync";

export function LoneGate({ children }: { children: ReactNode }) {
  const hydrated = useLone((state) => state.hydrated);
  const organisation = useLone((state) => state.profile.organisation);
  const teamCode = useLone((state) => state.profile.teamCode);
  const workerName = useLone((state) => state.profile.workerName);
  const jobSite = useLone((state) => state.jobs.find((job) => job.status === "active")?.site ?? "");
  const visitKey = useLone((state) => {
    const v = currentVisit(state.jobs, state.welfare);
    return `${v.visitState}|${v.dueAt ?? ""}|${v.checkedInAt ?? ""}`;
  });

  useEffect(() => {
    let live = true;
    migrateLoneStorage();
    const done = () => {
      if (!live) return;
      const profile = useLone.getState().profile;
      if (
        typeof profile.organisation !== "string" ||
        typeof profile.teamCode !== "string" ||
        typeof profile.alertPhones !== "string"
      ) {
        useLone.setState({
          profile: {
            ...defaultProfile,
            ...profile,
            organisation: typeof profile.organisation === "string" ? profile.organisation : "",
            teamCode: typeof profile.teamCode === "string" ? profile.teamCode : "",
            alertPhones: typeof profile.alertPhones === "string" ? profile.alertPhones : "",
          },
        });
      }
      useLone.setState({ hydrated: true });
      useLone.getState().sweep();
    };
    const pending = useLone.persist.rehydrate();
    if (pending instanceof Promise) {
      void pending.then(done, done);
    } else {
      done();
    }
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const seen = new Set(
      useLone
        .getState()
        .alerts.filter((alert) => alert.status === "open")
        .map((alert) => alert.id),
    );
    const id = window.setInterval(() => {
      useLone.getState().sweep();
      const open = useLone.getState().alerts.filter((alert) => alert.status === "open");
      for (const alert of open) {
        if (seen.has(alert.id) || alert.sample) continue;
        seen.add(alert.id);
        if (alert.kind !== "timer") continue;
        // The server fires timers it holds (and messages everyone itself);
        // the phone only sends when the server never got the timer.
        const held = useLone.getState().welfare.find((item) => item.id === alert.welfareId)?.onServer;
        if (!held) void pushAlert(alert);
        if (document.hidden && Notification.permission === "granted") {
          try {
            new Notification("Welfare check missed", {
              body: alert.site || "The lone worker timer ran out.",
            });
          } catch {
            /* notification blocked */
          }
        } else if (!document.hidden) {
          navigator.vibrate?.(80);
        }
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [hydrated]);

  useEffect(() => {
    const mark = organisation?.trim();
    document.title = mark ? `${mark} · ${productName}` : productName;
  }, [organisation]);

  useEffect(() => {
    if (!hydrated) return;
    return startWelfareSync();
  }, [hydrated]);

  // Keep the screen awake while a job is open, so the timer, the board pin
  // and the Red alert button stay live. Re-acquired whenever the app returns
  // to the foreground (the lock is released by the browser when it leaves).
  useEffect(() => {
    if (!hydrated || !jobSite || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let live = true;
    const acquire = () => {
      if (!live || document.visibilityState !== "visible") return;
      navigator.wakeLock
        .request("screen")
        .then((sentinel) => {
          if (!live) {
            void sentinel.release();
            return;
          }
          lock = sentinel;
        })
        .catch(() => undefined);
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release();
    };
  }, [hydrated, jobSite]);

  useEffect(() => {
    if (!hydrated || !navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        useLone.getState().setFix({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
          at: new Date().toISOString(),
        });
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 12000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const team = normalizeTeamCode(teamCode ?? "");
    if (!validTeamCode(team)) return;
    let live = true;
    const send = () => {
      if (!live) return;
      const state = useLone.getState();
      const code = normalizeTeamCode(state.profile.teamCode ?? "");
      if (!validTeamCode(code)) return;
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
      }).catch(() => undefined);
    };
    send();
    const id = window.setInterval(send, 45_000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [hydrated, teamCode, workerName, jobSite, visitKey]);

  useEffect(() => {
    if (!hydrated) return;
    return startVisitSync();
  }, [hydrated]);

  if (!hydrated) {
    return (
      <div className="safe-pad grid min-h-dvh place-items-center bg-bg">
        <BrandMark />
      </div>
    );
  }

  return children;
}

/** Bluewater "B" mark, as on bluewaterassociates.co.uk. */
export function BrandMark({ className = "h-12" }: { className?: string }) {
  return (
    <img
      src="/bluewater-mark.svg"
      alt="Bluewater"
      width={180}
      height={180}
      className={`${className} w-auto rounded-xl`}
    />
  );
}

export function TopBar({
  title,
  children,
  help,
}: {
  title: string;
  children?: ReactNode;
  /** Paragraphs shown behind the ? button. */
  help?: readonly string[];
}) {
  const organisation = useLone((state) => state.profile.organisation);
  const mark = organisation?.trim();
  const [showHelp, setShowHelp] = useState(false);
  return (
    <header className="flex flex-col gap-6">
      <BrandMark />
      <div className="flex min-w-0 items-end justify-between gap-3">
        <div className="min-w-0">
          {mark ? <p className="truncate text-sm text-muted">{mark}</p> : null}
          <h1 className="truncate text-2xl font-bold tracking-tight text-blue">{title}</h1>
        </div>
        {help ? (
          <button
            type="button"
            aria-label={showHelp ? "Hide help" : "Help for this screen"}
            aria-expanded={showHelp}
            onClick={() => setShowHelp((open) => !open)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-blue text-lg font-bold text-blue"
          >
            {showHelp ? "×" : "?"}
          </button>
        ) : null}
      </div>
      {help && showHelp ? (
        <section className="rounded-lg border border-border bg-surface p-4 text-sm leading-relaxed text-fg">
          {help.map((line) => (
            <p key={line} className="mt-2 first:mt-0">
              {line}
            </p>
          ))}
        </section>
      ) : null}
      {children ? <nav className="flex flex-wrap gap-x-3 gap-y-1">{children}</nav> : null}
    </header>
  );
}

export function NavLink({ to, children }: { to: "/" | "/desk" | "/board" | "/settings"; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex h-11 items-center rounded-sm px-2 text-sm font-bold text-blue underline decoration-2 underline-offset-4"
    >
      {children}
    </Link>
  );
}

export const inputClass =
  "w-full rounded-lg border border-border bg-bg px-3 text-base text-fg outline-none placeholder:text-faint focus-visible:border-muted";

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-muted">{label}</span>
      <input
        className={`${inputClass} h-12`}
        value={value}
        type={type}
        autoComplete={autoComplete}
        inputMode={type === "tel" ? "tel" : type === "email" ? "email" : undefined}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function ActionButton({
  children,
  onClick,
  tone = "surface",
  type = "button",
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "surface" | "alert" | "amber" | "ok" | "ghost" | "blue";
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const tones: Record<string, string> = {
    surface: "border border-border bg-surface text-fg hover:bg-surface-2",
    alert: "bg-alert text-white hover:bg-alert-hot",
    amber: "bg-amber text-amber-ink",
    ok: "bg-ok text-white",
    blue: "bg-blue text-white",
    ghost: "bg-transparent text-muted hover:text-fg",
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-12 w-full items-center justify-center rounded-lg px-4 text-base font-medium transition-[background-color,color] duration-150 disabled:opacity-50 motion-reduce:transition-none ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

export function StatusPill({ children, tone }: { children: ReactNode; tone: "alert" | "amber" | "ok" | "muted" }) {
  const tones = {
    alert: "bg-alert text-white",
    amber: "bg-amber text-amber-ink",
    ok: "bg-ok text-white",
    muted: "bg-surface-2 text-muted",
  };
  return (
    <span className={`inline-flex h-6 items-center rounded-md px-2 font-mono text-xs tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}
