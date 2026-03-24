"use client";

import { useLoading } from "@/hooks/useLoading";
import { createClient } from "@/lib/supabase";
import { CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ConfirmPaymentButton({
  paymentId,
  teamId,
}: {
  paymentId: string;
  teamId: string;
}) {
  const { loading, execute, LoadingModal } = useLoading({
    showLoadingModal: true,
    loadingMessage: "กำลังยืนยันการชำระเงิน",
    loadingSubMessage: "กรุณารอสักครู่ อาจใช้เวลา 2-3 วินาที",
  });
  const router = useRouter();

  const handleConfirm = async () => {
    await execute(async () => {
      const supabase = createClient();
      await supabase
        .from("payments")
        .update({ status: "confirmed" })
        .eq("id", paymentId);
      await supabase
        .from("teams")
        .update({ status: "confirmed" })
        .eq("id", teamId);
      router.refresh();
    });
  };

  return (
    <>
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
        <CheckCircle size={16} />{" "}
        {loading ? "กำลังดำเนินการ..." : "ยืนยันการชำระเงิน"}
      </button>
      {LoadingModal}
    </>
  );
}
