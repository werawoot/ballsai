import type { ReactNode } from "react";
import { Check } from "lucide-react";

type LoginConsentProps = {
  accepted: boolean;
  children: ReactNode;
  missing: boolean;
  missingText: string;
  onChange: (accepted: boolean) => void;
};

// The terms and PDPA consent row. Every screen that can sign someone in shows it, so the
// box can be ticked where the sign-in button is (owner, 18 Oct 2026). The wording comes
// from LoginPanel as children and is never reworded.
export function LoginConsent({ accepted, children, missing, missingText, onChange }: LoginConsentProps) {
  const showMissing = missing && !accepted;
  return (
    <>
      <label className={`lg-consent${accepted ? " is-checked" : ""}${showMissing ? " is-missing" : ""}`}>
        <input aria-describedby="login-consent-help" aria-invalid={showMissing} checked={accepted} id="login-consent" onChange={(event) => onChange(event.target.checked)} type="checkbox" />
        <i aria-hidden="true">{accepted && <Check size={14} strokeWidth={3.5} />}</i>
        <span>{children}</span>
      </label>
      <p className="lg-consent-help" id="login-consent-help" role={showMissing ? "alert" : undefined}>{showMissing ? missingText : ""}</p>
    </>
  );
}
