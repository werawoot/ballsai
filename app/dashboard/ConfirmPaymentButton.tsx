"use client";

import { useLoading } from "@/hooks/useLoading";
import { CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
      <button
        onClick={handleConfirm}
        disabled={loading}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: "10px",
          borderRadius: 10,
          border: "none",
          background: "#16a34a",
          color: "white",
          fontSize: 13,
          fontWeight: 800,
          cursor: loading ? "default" : "pointer",
          fontFamily: "var(--font-oswald)",
          letterSpacing: 0.5,
          opacity: loading ? 0.6 : 1,
        }}
      >
        <CheckCircle size={16} /> {loading ? "กำลังดำเนินการ..." : "ยืนยันการชำระเงิน"}
      </button>
      {message ? (
        <p style={{ marginTop: 6, fontSize: 11, color: "#CC0001", textAlign: "center" }}>{message}</p>
      ) : null}
      {LoadingModal}
    </div>
  );
}
