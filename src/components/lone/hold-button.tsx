import { useRef, useState } from "react";

const HOLD_MS = 1500;

export function HoldButton({
  label,
  hint,
  onTrigger,
  disabled = false,
  quiet = false,
}: {
  label: string;
  hint: string;
  onTrigger: () => void;
  disabled?: boolean;
  quiet?: boolean;
}) {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const frame = useRef(0);
  const start = useRef(0);
  const armed = useRef(false);

  const stop = () => {
    cancelAnimationFrame(frame.current);
  };

  const reset = () => {
    stop();
    armed.current = false;
    progressRef.current = 0;
    setProgress(0);
  };

  const tick = (time: number) => {
    const ratio = Math.min(1, (time - start.current) / HOLD_MS);
    progressRef.current = ratio;
    setProgress(ratio);
    if (ratio >= 1) {
      armed.current = true;
      navigator.vibrate?.(30);
      return;
    }
    frame.current = requestAnimationFrame(tick);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    armed.current = false;
    start.current = performance.now();
    navigator.vibrate?.(12);
    stop();
    frame.current = requestAnimationFrame(tick);
  };

  const onPointerUp = () => {
    if (armed.current) {
      navigator.vibrate?.(40);
      reset();
      onTrigger();
      return;
    }
    reset();
  };

  const size = quiet ? 280 : 232;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const ready = progress >= 1;
  const ring = quiet ? "var(--color-muted)" : ready ? "var(--color-alert-hot)" : "var(--color-alert)";

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={`${label}. Press and hold for one and a half seconds, then release.`}
      className="hold-surface relative mx-auto grid place-items-center disabled:opacity-50"
      style={{ width: size, height: size }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={reset}
      onContextMenu={(event) => event.preventDefault()}
    >
      <svg width={size} height={size} className="absolute inset-0" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="var(--color-surface)"
          stroke="var(--color-border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ring}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={circ * (1 - progress)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="relative px-6 text-center">
        <span
          className={`block font-medium leading-none tracking-tight ${
            quiet ? "font-mono text-5xl text-fg tabular-nums" : "text-3xl text-alert"
          }`}
        >
          {label}
        </span>
        <span className="mt-3 block font-mono text-xs tracking-widest text-muted">
          {ready ? "RELEASE" : hint}
        </span>
      </span>
    </button>
  );
}
