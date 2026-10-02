import { useEffect, useState } from "react";
import { pinProblem } from "@/lib/lone/pin";
import { help } from "@/components/lone/help";
import { NavLink, TextField, TopBar } from "@/components/lone/chrome";
import { whatsappReady } from "@/lib/lone/board-api";
import { channelHref, isIos, launchChannel, launchDuty } from "@/lib/lone/launch";
import {
  buildMessage,
  channelLabel,
  readyChannels,
  type ChannelId,
  type Profile,
} from "@/lib/lone/model";
import { useLone } from "@/lib/lone/store";

const primaries: Array<{ id: Profile["primary"]; label: string }> = [
  { id: "whatsapp", label: "WhatsApp person" },
  { id: "group", label: "WhatsApp group" },
  { id: "email", label: "Email" },
  { id: "sms", label: "Text" },
  { id: "call", label: "Call" },
  { id: "desk", label: "Desk only" },
];

export function SettingsScreen() {
  const profile = useLone((state) => state.profile);
  const setProfile = useLone((state) => state.setProfile);
  const [notice, setNotice] = useState("");
  const [whatsapp, setWhatsapp] = useState<"unknown" | "ready" | "off">("unknown");
  const [emailLive, setEmailLive] = useState<"unknown" | "ready" | "off">("unknown");
  const ready = readyChannels(profile);

  useEffect(() => {
    let live = true;
    void whatsappReady()
      .then((result) => {
        if (!live) return;
        setWhatsapp(result.ready ? "ready" : "off");
        setEmailLive(result.email ? "ready" : "off");
      })
      .catch(() => {
        if (!live) return;
        setWhatsapp("off");
        setEmailLive("off");
      });
    return () => {
      live = false;
    };
  }, []);

  const testDuty = () => {
    const text = buildMessage({
      kind: "test",
      organisation: profile.organisation,
      workerName: profile.workerName,
      site: "",
      address: "",
      note: "Channel check from settings. Please ignore.",
      at: new Date().toISOString(),
      lat: null,
      lng: null,
      accuracy: null,
    });
    const opened = launchDuty(profile, text, "test");
    if (opened.includes("group") && opened.includes("email")) {
      setNotice("Group opened and the test is copied. Email draft opened. Paste into the group, then send the email.");
      return;
    }
    if (opened.includes("group")) {
      setNotice("Group opened and the test is copied. Add at least one alert email.");
      return;
    }
    if (opened.includes("email")) {
      setNotice("Email draft opened. Add the WhatsApp group link as well.");
      return;
    }
    setNotice("Add the WhatsApp group link and at least one alert email.");
  };

  const test = (channel: ChannelId) => {
    const text = buildMessage({
      kind: "test",
      organisation: profile.organisation,
      workerName: profile.workerName,
      site: "",
      address: "",
      note: "Channel check from settings. Please ignore.",
      at: new Date().toISOString(),
      lat: null,
      lng: null,
      accuracy: null,
    });
    const href = channelHref(profile, channel, text, "test");
    if (!href) {
      setNotice(`Add a ${channelLabel(channel).toLowerCase()} destination first.`);
      return;
    }
    launchChannel(href, channel, text);
    setNotice(
      channel === "group"
        ? "Test copied. Paste it into the group."
        : `Opened ${channelLabel(channel)} with a test message.`,
    );
  };

  return (
    <div className="safe-pad mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 bg-bg">
      <TopBar title="Where alerts go" help={help.routes}>
        <NavLink to="/">Field</NavLink>
        <NavLink to="/desk">Desk</NavLink>
        <NavLink to="/board">Board</NavLink>
      </TopBar>

      <TextField
        label="Organisation name"
        value={profile.organisation ?? ""}
        placeholder="Optional"
        onChange={(organisation) => setProfile({ organisation })}
      />
      <p className="-mt-3 text-sm text-muted">
        Leave this blank and messages say 0-19 Lone Worker. A name here replaces that on the phone and in alerts.
      </p>

      <section className="rounded-lg border border-border bg-surface p-4 text-sm leading-relaxed text-muted">
        <p>
          Hold Red alert for one and a half seconds, then release. The alert goes on the board
          by itself. Nobody has to paste it into a chat.
        </p>
        <p className="mt-3">
          WhatsApp will not let this page post into an existing group. The mobiles below get a
          direct WhatsApp instead, and only when a WhatsApp Business number is connected.
          {whatsapp === "ready" ? " It is connected." : whatsapp === "off" ? " It is not connected yet, so the board is what the others see." : ""}
        </p>
        <p className="mt-3">
          The alert emails below are sent automatically at the same moment, up to 8 addresses.
          {emailLive === "ready" ? " Email sending is connected." : emailLive === "off" ? " Email sending is not connected yet." : ""}
        </p>
      </section>

      <TextField
        label="Worker name"
        value={profile.workerName}
        placeholder="Name on the log and in messages"
        onChange={(workerName) => setProfile({ workerName })}
      />

      <TextField
        label="WhatsApp number"
        value={profile.whatsappNumber}
        type="tel"
        placeholder="07… or +44…"
        onChange={(whatsappNumber) => setProfile({ whatsappNumber })}
      />
      <TestLink onClick={() => test("whatsapp")} label="Send a WhatsApp test" />

      <TextField
        label="Duty mobiles"
        value={profile.alertPhones ?? ""}
        placeholder="07…, 07…"
        onChange={(alertPhones) => setProfile({ alertPhones })}
      />
      <p className="-mt-3 text-sm text-muted">
        Up to 8. These people get a WhatsApp when the button is released. The number above is included. This does not post into the group.
      </p>

      <TextField
        label="WhatsApp group link"
        value={profile.whatsappGroupUrl}
        placeholder="https://chat.whatsapp.com/…"
        onChange={(whatsappGroupUrl) => setProfile({ whatsappGroupUrl })}
      />
      <p className="-mt-3 text-sm text-muted">
        The old group link can still open the chat if someone is able to use the phone afterwards. It is not how the alert goes out.
      </p>

      <TextField
        label="Alert emails"
        value={profile.email}
        placeholder="one@nhs.net, two@nhs.net"
        onChange={(email) => setProfile({ email })}
      />
      <p className="-mt-3 text-sm text-muted">
        Up to 8. Each one is emailed automatically when the button is released. Separate them with commas.
      </p>
      <TestLink onClick={() => testDuty()} label="Test the group and the emails" />

      <TextField
        label="Text number"
        value={profile.smsNumber}
        type="tel"
        placeholder="07… or +44…"
        onChange={(smsNumber) => setProfile({ smsNumber })}
      />
      <TestLink onClick={() => test("sms")} label="Open a text test" />

      <TextField
        label="Call number"
        value={profile.callNumber}
        type="tel"
        placeholder="Duty phone"
        onChange={(callNumber) => setProfile({ callNumber })}
      />
      <TestLink onClick={() => test("call")} label="Dial the duty phone" />

      <div>
        <p className="mb-2 text-sm text-muted">Backup, if you can still use the phone</p>
        <div className="grid grid-cols-2 gap-2">
          {primaries.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setProfile({ primary: item.id })}
              className={`h-12 rounded-lg border px-3 text-sm ${
                profile.primary === item.id ? "border-fg text-fg" : "border-border text-muted"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-sm font-bold text-fg">Safe PIN and duress PIN</p>
        <p className="mt-1 text-sm text-muted">
          Optional. With a safe PIN set, I'm safe and False alarm ask for it, so nobody can stand your alert
          down for you. The duress PIN looks exactly the same on this phone, but tells the team you are under
          threat and not to phone you.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <TextField
            label="Safe PIN"
            value={profile.safePin ?? ""}
            type="password"
            placeholder="4 digits"
            onChange={(safePin) => setProfile({ safePin: safePin.replace(/\D/g, "").slice(0, 4) })}
          />
          <TextField
            label="Duress PIN"
            value={profile.duressPin ?? ""}
            type="password"
            placeholder="4 digits"
            onChange={(duressPin) => setProfile({ duressPin: duressPin.replace(/\D/g, "").slice(0, 4) })}
          />
        </div>
        {pinProblem(profile.safePin ?? "", profile.duressPin ?? "") ? (
          <p className="mt-2 text-sm text-alert">{pinProblem(profile.safePin ?? "", profile.duressPin ?? "")}</p>
        ) : null}
      </div>

      <Toggle
        on={profile.notifyOnCheckIn ?? false}
        label="WhatsApp the duty mobiles when I check in safe"
        detail="Off by default: the Board already shows every check-in. Turn on if your team wants a message for each one."
        onChange={(notifyOnCheckIn) => setProfile({ notifyOnCheckIn })}
      />

      <Toggle
        on={profile.discreet}
        label="Discreet screen after a red alert"
        detail="Shows a clock instead of the alert. Hold the clock to reach send and stand-down. The desk still gets the alert."
        onChange={(discreet) => setProfile({ discreet })}
      />

      <label className="block">
        <span className="mb-1.5 block text-sm text-muted">Warn this many minutes before a timer ends</span>
        <input
          className="h-12 w-full rounded-lg border border-border bg-bg px-3 text-base text-fg"
          type="number"
          min={1}
          max={30}
          value={profile.warnMinutes}
          onChange={(event) => setProfile({ warnMinutes: Math.min(30, Math.max(1, Number(event.target.value) || 5)) })}
        />
      </label>

      {notice ? <p className="text-sm text-ok">{notice}</p> : null}
      <p className="text-sm text-muted">
        Ready now: {ready.length ? ready.map(channelLabel).join(", ") : "desk only"}.
        {isIos() ? " Texts on iPhone use the Messages app." : ""}
      </p>

      <section className="rounded-lg border border-border bg-surface p-4 text-sm leading-relaxed text-muted">
        <p className="font-medium text-fg">Put it on the home screen</p>
        <p className="mt-2">
          On iPhone, open this page in Safari, tap Share, then Add to Home Screen. On Android, use the
          browser menu and choose Install app or Add to Home screen. It then opens full screen, without
          the App Store.
        </p>
        <p className="mt-2">
          Keep the field screen open during a welfare timer. A sleeping phone cannot be trusted to shout
          on its own. The missed check-in is raised as soon as the app is opened again.
        </p>
      </section>
    </div>
  );
}

function TestLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="-mt-3 h-11 self-start text-left text-sm text-muted underline decoration-border underline-offset-4">
      {label}
    </button>
  );
}

function Toggle({
  on,
  label,
  detail,
  onChange,
}: {
  on: boolean;
  label: string;
  detail: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="rounded-lg border border-border bg-surface p-4 text-left"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-fg">{label}</span>
        <span className={`h-7 shrink-0 rounded-md px-2 font-mono text-xs leading-7 ${on ? "bg-ok text-ok-ink" : "bg-surface-2 text-muted"}`}>
          {on ? "ON" : "OFF"}
        </span>
      </span>
      <span className="mt-2 block text-sm leading-relaxed text-muted">{detail}</span>
    </button>
  );
}

