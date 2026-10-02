/**
 * Safe PIN and duress PIN. When set, standing an alert down or checking in
 * safe asks for the PIN. The safe PIN does what it says. The duress PIN
 * looks identical on the phone but tells the team the worker is under threat.
 */
export type PinResult = "none" | "safe" | "duress" | "wrong";

export const PIN_RE = /^\d{4}$/;

export function pinsConfigured(profile: { safePin?: string; duressPin?: string }): boolean {
  return PIN_RE.test(profile.safePin ?? "");
}

export function classifyPin(entered: string, profile: { safePin?: string; duressPin?: string }): PinResult {
  if (!pinsConfigured(profile)) return "none";
  const code = entered.trim();
  if (code === profile.safePin) return "safe";
  if (PIN_RE.test(profile.duressPin ?? "") && code === profile.duressPin) return "duress";
  return "wrong";
}

/** Problem with a proposed pair of PINs, or null when they are fine. */
export function pinProblem(safePin: string, duressPin: string): string | null {
  if (!safePin && !duressPin) return null;
  if (!PIN_RE.test(safePin)) return "The safe PIN must be exactly 4 digits.";
  if (duressPin && !PIN_RE.test(duressPin)) return "The duress PIN must be exactly 4 digits.";
  if (duressPin && duressPin === safePin) return "The duress PIN must be different from the safe PIN.";
  return null;
}
