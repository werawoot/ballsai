"use client";

import { useLoading } from "@/hooks/useLoading";
import { CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

// One tap confirms the payment and the team together (confirm_payment_safely).
export default function ConfirmPaymentButton({ paymentId }: { paymentId: string }) {
  const [message, setMessage] = useState("");
  const { loading, execute, LoadingModal } = useLoading({
    showLoadingModal: true,
    loadingMessage: "กำลังยืนยันการชำระเงิน",
    loadingSubMessage: "กรุณารอสักครู่ อาจใช้เวลา 2-3 วินาที",
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
        setMessage(data?.error ?? "ยืนยันการชำระเงินไม่สำเร็จ");
        return;
      }

      router.refresh();
    });
  };

  return (
    <div>
      <button className="ui-btn ui-btn-primary" onClick={handleConfirm} disabled={loading} type="button">
        <CheckCircle size={18} aria-hidden="true" /> {loading ? "กำลังดำเนินการ..." : "ยืนยันทีมและการชำระ"}
      </button>
      {message ? (
        <p style={{ marginTop: 6, fontSize: 11, color: "#CC0001", textAlign: "center" }}>{message}</p>
      ) : null}
      {LoadingModal}
    </div>
  );
}
