import { useEffect, useState, type ReactNode } from "react";
import { pinProblem } from "@/lib/lone/pin";
import { help } from "@/components/lone/help";
import { NavLink, TextField, TopBar } from "@/components/lone/chrome";
import { deviceId } from "@/lib/lone/board";
import { whatsappReady } from "@/lib/lone/board-api";
import { sendTestAlert } from "@/lib/lone/test-api";
import { channelHref, isIos, launchChannel } from "@/lib/lone/launch";
import { buildMessage, channelLabel, type ChannelId, type Profile } from "@/lib/lone/model";
import { useLone } from "@/lib/lone/store";

const backups: Array<{ id: Profile["primary"]; label: string }> = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "email", label: "Email" },
  { id: "sms", label: "Text" },
  { id: "call", label: "Call" },
  { id: "desk", label: "Nothing extra" },
];

/**
 * A setting with a ? bubble. Tap ? and the explanation opens under the
 * label; tap again to close. Every element on this screen uses it, because
 * "what does this do?" is the question staff ask most.
 */
function Field({ label, tip, children }: { label: string; tip: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-fg">{label}</span>
        <button
          type="button"
          aria-label={open ? `Hide help for ${label}` : `Help for ${label}`}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${
            open ? "border-blue bg-blue text-white" : "border-blue text-blue"
          }`}
        >
          {open ? "×" : "?"}
        </button>
      </div>
      {open ? <p className="mb-2 rounded-lg border border-border bg-surface p-3 text-sm leading-relaxed text-fg">{tip}</p> : null}
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-4">
      <h2 className="text-base font-bold text-fg">{title}</h2>
      {children}
    </section>
  );
}

function Chip({ ok, label }: { ok: boolean | null; label: string }) {
  const tone = ok == null ? "bg-surface-2 text-muted" : ok ? "bg-ok text-ok-ink" : "bg-amber text-amber-ink";
  return <span className={`rounded-md px-2 py-1 text-xs font-bold ${tone}`}>{label}</span>;
}

export function SettingsScreen() {
  const profile = useLone((state) => state.profile);
  const setProfile = useLone((state) => state.setProfile);
  const [notice, setNotice] = useState("");
  const [testing, setTesting] = useState(false);
  const [whatsapp, setWhatsapp] = useState<boolean | null>(null);
  const [emailLive, setEmailLive] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    void whatsappReady()
      .then((result) => {
        if (!live) return;
        setWhatsapp(result.ready);
        setEmailLive(result.email);
      })
      .catch(() => {
        if (!live) return;
        setWhatsapp(false);
        setEmailLive(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const phones = [profile.whatsappNumber, profile.alertPhones ?? ""].filter(Boolean).join(",");

  const sendTest = () => {
    if (testing) return;
    setTesting(true);
    setNotice("");
    void sendTestAlert({
      data: { device: deviceId(), name: profile.workerName, org: profile.organisation ?? "", phones, emails: profile.email },
    })
      .then((r) => {
        const parts: string[] = [];
        if (r.phones) parts.push(r.whatsapp < 0 ? "WhatsApp is not connected on the server yet" : `WhatsApp sent to ${r.whatsapp} of ${r.phones} number${r.phones === 1 ? "" : "s"}`);
        if (r.emails) parts.push(r.email < 0 ? "email is not connected on the server yet" : `email sent to ${r.email} of ${r.emails} address${r.emails === 1 ? "" : "es"}`);
        setNotice(`Test sent: ${parts.join("; ")}. Ask them to check their phone.`);
      })
      .catch((err: unknown) => setNotice(err instanceof Error ? err.message : "The test could not be sent."))
      .finally(() => setTesting(false));
  };

  const openBackup = (channel: ChannelId) => {
    const text = buildMessage({
      kind: "test",
      organisation: profile.organisation,
      workerName: profile.workerName,
      site: "",
      address: "",
      note: "Channel check from Routes. Please ignore.",
      at: new Date().toISOString(),
      lat: null,
      lng: null,
      accuracy: null,
    });
    const href = channelHref(profile, channel, text, "test");
    if (!href) {
      setNotice(`Add a ${channelLabel(channel).toLowerCase()} number first.`);
      return;
    }
    launchChannel(href, channel, text);
    setNotice(`Opened ${channelLabel(channel)} on this phone with a test message.`);
  };

  const pinIssue = pinProblem(profile.safePin ?? "", profile.duressPin ?? "");

  return (
    <div className="safe-pad mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-7 bg-bg">
      <TopBar title="Where alerts go" help={help.routes}>
        <NavLink to="/">Field</NavLink>
        <NavLink to="/desk">Desk</NavLink>
        <NavLink to="/board">Board</NavLink>
      </TopBar>

      <Section title="You">
        <Field label="Your name" tip="Shown on the Board, in the Desk log and at the top of every alert message, e.g. 'RED ALERT: Sam Jones'. Use the name your team knows you by.">
          <TextField label="" value={profile.workerName} placeholder="e.g. Sam Jones" onChange={(workerName) => setProfile({ workerName })} />
        </Field>
        <Field label="Organisation or team name" tip="Optional. Goes in the subject line and first line of alerts so recipients know who it is from, e.g. 'RED ALERT — Wirral 0-19 Service'. Leave blank and it says 0-19 Lone Worker.">
          <TextField label="" value={profile.organisation ?? ""} placeholder="e.g. Wirral 0-19 Service" onChange={(organisation) => setProfile({ organisation })} />
        </Field>
      </Section>

      <Section title="Who gets your alerts">
        <div className="flex flex-wrap gap-2">
          <Chip ok={whatsapp} label={whatsapp == null ? "Checking WhatsApp…" : whatsapp ? "WhatsApp connected" : "WhatsApp not connected"} />
          <Chip ok={emailLive} label={emailLive == null ? "Checking email…" : emailLive ? "Email connected" : "Email not connected"} />
        </div>
        <Field
          label="Primary duty mobile"
          tip="The first person messaged on every alert, and the number the WhatsApp backup button on the alert screen opens. Usually your line manager or the duty desk. UK numbers in any format: 07…, +44…"
        >
          <TextField label="" value={profile.whatsappNumber} type="tel" placeholder="07… or +44…" onChange={(whatsappNumber) => setProfile({ whatsappNumber })} />
        </Field>
        <Field
          label="Other duty mobiles"
          tip="Up to 8 numbers in total, separated by commas. The moment you raise an alert, every number gets a WhatsApp with your name, location, map link and the nearest postcode. If a WhatsApp cannot be delivered, that number gets a text instead. WhatsApp does not allow apps to post into groups, so each person is messaged directly; that also means it works for people who are not in any group."
        >
          <TextField label="" value={profile.alertPhones ?? ""} type="tel" placeholder="07…, 07…, 07…" onChange={(alertPhones) => setProfile({ alertPhones })} />
        </Field>
        <Field
          label="Alert emails"
          tip="Up to 8 addresses, separated by commas. Each gets an email at the same moment as the WhatsApps, with any voice notes you recorded attached. Good for a shared team inbox or a manager who does not use WhatsApp."
        >
          <TextField label="" value={profile.email} type="email" placeholder="team@nhs.net, manager@nhs.net" onChange={(email) => setProfile({ email })} />
        </Field>
        <Field
          label="Send a test to everyone"
          tip="Sends a message clearly marked TEST to every duty mobile and alert email above, exactly the way a real alert goes. Nothing appears on the Board. Do this when you set up, and again whenever you change the numbers. Limited to 5 an hour."
        >
          <button
            type="button"
            onClick={sendTest}
            disabled={testing}
            className="h-12 w-full rounded-lg border border-blue text-sm font-bold text-blue disabled:opacity-50"
          >
            {testing ? "Sending…" : "Send a test to everyone"}
          </button>
        </Field>
        {notice ? <p className="text-sm text-ok">{notice}</p> : null}
      </Section>

      <Section title="Backup from this phone">
        <p className="-mt-2 text-sm text-muted">
          Only matters if you can still use the phone after an alert. The automatic messages above always go first.
        </p>
        <Field
          label="Text number"
          tip="Used by the Text backup button on the alert screen: it opens your phone's Messages app with the alert written out, ready to send to this number. Useful where there is phone signal but no data."
        >
          <TextField label="" value={profile.smsNumber} type="tel" placeholder="07… or +44…" onChange={(smsNumber) => setProfile({ smsNumber })} />
          <button type="button" onClick={() => openBackup("sms")} className="mt-1 h-10 text-sm text-muted underline">
            Try the text backup
          </button>
        </Field>
        <Field label="Call number" tip="Used by the Call backup button on the alert screen: one tap dials this number. Usually the duty desk or your manager.">
          <TextField label="" value={profile.callNumber} type="tel" placeholder="Duty phone" onChange={(callNumber) => setProfile({ callNumber })} />
          <button type="button" onClick={() => openBackup("call")} className="mt-1 h-10 text-sm text-muted underline">
            Try the call backup
          </button>
        </Field>
        <Field
          label="Backup button to show first"
          tip="After an alert goes out, the alert screen offers backup buttons. Pick which one is biggest and first: WhatsApp (opens a chat with your primary duty mobile), Email, Text, Call, or nothing extra."
        >
          <div className="grid grid-cols-2 gap-2">
            {backups.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setProfile({ primary: item.id })}
                className={`h-12 rounded-lg border px-3 text-sm ${profile.primary === item.id ? "border-fg text-fg" : "border-border text-muted"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </Field>
      </Section>

      <Section title="Safety settings">
        <Field
          label="Warn me before a timer ends (minutes)"
          tip="How long before your welfare timer runs out the phone first buzzes to ask 'Still OK?'. It buzzes again at 2 minutes. If you do nothing, the alert goes out when the timer reaches zero. 5 minutes suits most visits."
        >
          <input
            className="h-12 w-full rounded-lg border border-border bg-bg px-3 text-base text-fg"
            type="number"
            min={1}
            max={30}
            value={profile.warnMinutes}
            onChange={(event) => setProfile({ warnMinutes: Math.min(30, Math.max(1, Number(event.target.value) || 5)) })}
          />
        </Field>
        <Field
          label="Safe PIN"
          tip="Optional, 4 digits. Once set, I'm safe and False alarm ask for it, so nobody else can stand your alert down or check you in. Choose something you can type under pressure."
        >
          <TextField label="" value={profile.safePin ?? ""} type="password" placeholder="4 digits" onChange={(safePin) => setProfile({ safePin: safePin.replace(/\D/g, "").slice(0, 4) })} />
        </Field>
        <Field
          label="Duress PIN"
          tip="Optional, 4 digits, different from the safe PIN. If someone makes you 'prove you're fine', enter this instead. The phone behaves exactly as if you were safe. Behind the scenes the Board goes red and every duty mobile and alert email is told you may be under threat and NOT to phone you. Your timer also keeps running on the server and will fire."
        >
          <TextField label="" value={profile.duressPin ?? ""} type="password" placeholder="4 digits" onChange={(duressPin) => setProfile({ duressPin: duressPin.replace(/\D/g, "").slice(0, 4) })} />
          {pinIssue ? <p className="mt-2 text-sm text-alert">{pinIssue}</p> : null}
        </Field>
        <Field
          label="Discreet screen after a red alert"
          tip="On: after you raise a red alert the phone shows a plain clock, so anyone looking at your screen cannot see an alert went out. Hold the clock to get back to the alert screen. Off: the alert screen stays visible."
        >
          <Switch on={profile.discreet} onChange={(discreet) => setProfile({ discreet })} />
        </Field>
        <Field
          label="WhatsApp the duty mobiles when I check in safe"
          tip="Off by default: the Board already shows 'Checked in safe' with the time, and a message for every visit soon gets ignored. Turn on only if your team wants a WhatsApp each time you check in."
        >
          <Switch on={profile.notifyOnCheckIn ?? false} onChange={(notifyOnCheckIn) => setProfile({ notifyOnCheckIn })} />
        </Field>
      </Section>

      <Section title="On your phone">
        <Field
          label="Put it on the home screen"
          tip="On iPhone: open this page in Safari, tap Share, then Add to Home Screen. On Android: browser menu, then Install app or Add to Home screen. It then opens full screen like an app, with no app store needed."
        >
          <p className="text-sm text-muted">
            Keep the app open during a visit; the screen stays awake for you. If the phone does lock, your welfare
            timer still fires from the server.{isIos() ? " Texts on iPhone use the Messages app." : ""}
          </p>
        </Field>
      </Section>
    </div>
  );
}

function Switch({ on, onChange }: { on: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex h-12 w-full items-center justify-between rounded-lg border border-border bg-surface px-4 text-left"
    >
      <span className="text-sm text-fg">{on ? "On" : "Off"}</span>
      <span className={`h-7 rounded-md px-2 font-mono text-xs leading-7 ${on ? "bg-ok text-ok-ink" : "bg-surface-2 text-muted"}`}>
        {on ? "ON" : "OFF"}
      </span>
    </button>
  );
}
