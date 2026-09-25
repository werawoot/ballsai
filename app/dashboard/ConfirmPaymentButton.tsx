"use client";

import { useLoading } from "@/hooks/useLoading";
import { CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { requestErrorText, requestJson, shouldStartAction } from "@/lib/pending-action";
import { useRef, useState } from "react";

export default function ConfirmPaymentButton({ paymentId }: { paymentId: string }) {
  const [message, setMessage] = useState("");
  const { loading, execute, LoadingModal } = useLoading({
    showLoadingModal: true,
    loadingMessage: "กำลังยืนยันการชำระเงิน",
    loadingSubMessage: "กรุณารอสักครู่ อาจใช้เวลา 2-3 วินาที",
  });
  const router = useRouter();
  // `useLoading` clears its own loading state in a finally, but it re-throws, so the
  // rejection still needs handling here or the failure is silent. This ref also refuses
  // a second click that lands before React re-renders.
  const inFlight = useRef(false);

  const handleConfirm = async () => {
    if (!shouldStartAction(inFlight.current ? "confirm" : null)) return;
    inFlight.current = true;
    setMessage("");

    try {
      await execute(async () => {
        const outcome = await requestJson(`/api/payments/${paymentId}/confirm`, {
          method: "POST",
        });

        if (!outcome.ok) {
          setMessage(requestErrorText(outcome, { fallback: "ยืนยันการชำระเงินไม่สำเร็จ", mutating: true }));
          // The confirmation may have been applied with only the response lost, so show
          // the server's current state instead of inviting a second confirm.
          if (outcome.kind === "network") router.refresh();
          return;
        }

        router.refresh();
      });
    } catch {
      // `execute` re-throws after running its finally. Nothing is left pending, but the
      // user still needs to be told something went wrong.
      setMessage("ยืนยันการชำระเงินไม่สำเร็จ กรุณาโหลดหน้าใหม่เพื่อตรวจสถานะ");
    } finally {
      inFlight.current = false;
    }
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
