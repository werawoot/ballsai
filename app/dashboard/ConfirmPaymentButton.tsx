"use client";

import { useLoading } from "@/hooks/useLoading";
import { CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

// One tap confirms the payment and the team together (confirm_payment_safely).
export default function ConfirmPaymentButton({ paymentId }: { paymentId: string }) {
  const t = useTranslations("approval");
  const [message, setMessage] = useState("");
  const { loading, execute, LoadingModal } = useLoading({
    showLoadingModal: true,
    loadingMessage: t("confirmingTitle"),
    loadingSubMessage: t("confirmingSub"),
  });
  const router = useRouter();

  const handleConfirm = async () => {
    setMessage("");

    await execute(async () => {
      const response = await fetch(`/api/payments/${paymentId}/confirm`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage(data?.error ?? t("paymentFailed"));
        return;
      }

      router.refresh();
    });
  };

  return (
    <div>
      <button className="ui-btn ui-btn-primary" onClick={handleConfirm} disabled={loading} type="button">
        <CheckCircle size={18} aria-hidden="true" /> {loading ? t("working") : t("confirmTeamAndPayment")}
      </button>
      {message ? (
        <p style={{ marginTop: 6, fontSize: 11, color: "#CC0001", textAlign: "center" }}>{message}</p>
      ) : null}
      {LoadingModal}
    </div>
  );
}
