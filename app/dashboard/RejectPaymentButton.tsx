"use client";

import { XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useApiErrorText, type ApiErrorBody } from "@/lib/use-api-error-text";

// Reject a waiting slip with a short reason the coach will see (owner, 25 Nov 2026; sql/105).
// The team keeps waiting and the coach sends a new slip; rejecting the whole team is the other
// button, and it is final.
const MAX_REASON = 200;

export default function RejectPaymentButton({ paymentId }: { paymentId: string }) {
  const t = useTranslations("approval");
  const router = useRouter();
  const errorText = useApiErrorText();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async () => {
    if (saving || !reason.trim()) return;
    setSaving(true);
    setMessage("");
    const response = await fetch(`/api/payments/${encodeURIComponent(paymentId)}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    }).catch(() => null);
    if (!response?.ok) {
      const data = (await response?.json().catch(() => null)) as ApiErrorBody;
      setMessage(errorText(data, t("rejectFailed")));
      setSaving(false);
      return;
    }
    router.refresh();
  };

  if (!open) {
    return (
      <button className="ui-btn ui-btn-ghost" onClick={() => setOpen(true)} type="button">
        <XCircle size={18} aria-hidden="true" /> {t("rejectSlip")}
      </button>
    );
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ui-mute)" }}>
        {t("rejectReasonLabel")}
        <textarea
          maxLength={MAX_REASON}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t("rejectReasonPlaceholder")}
          rows={2}
          style={{ display: "block", width: "100%", marginTop: 4, padding: 8, borderRadius: 10, border: "1.5px solid var(--ui-line)", background: "var(--ui-card)", color: "var(--ui-text)", fontSize: 14 }}
          value={reason}
        />
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <button className="ui-btn ui-btn-ghost" disabled={saving} onClick={() => { setOpen(false); setMessage(""); }} type="button">{t("cancel")}</button>
        <button className="ui-btn ui-btn-primary" disabled={saving || !reason.trim()} onClick={submit} type="button">{saving ? t("working") : t("rejectSubmit")}</button>
      </div>
      {message ? <p role="alert" style={{ fontSize: 11, color: "var(--ui-red-text)", textAlign: "center" }}>{message}</p> : null}
    </div>
  );
}
