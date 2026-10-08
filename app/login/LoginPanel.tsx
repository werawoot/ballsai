"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Check, ChevronRight, Facebook, Mail, Shield } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { OTP_MAX_LENGTH, canSubmitOtp, normalizeEmail, normalizeOtp, otpErrorKey, resendWaitSeconds } from "@/lib/otp";
import { captchaSiteKey, withCaptcha } from "@/lib/captcha";
import TurnstileWidget from "@/components/TurnstileWidget";
import BrandMark from "@/components/BrandMark";
import "./login.css";

type LoginStep = "start" | "email" | "otp" | "admin";

export default function LoginPanel({ adminEntry, nextPath }: { adminEntry: boolean; nextPath: string }) {
  const [step, setStep] = useState<LoginStep>(adminEntry ? "admin" : "start");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const t = useTranslations("loginOtp");
  const tp = useTranslations("loginPage");
  const locale = useLocale();
  // T19: with a Turnstile site key set, each request that sends a code or checks a password
  // carries a fresh single-use token; the widget is reset after every such request.
  const siteKey = captchaSiteKey();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const captchaMissing = siteKey !== null && !captchaToken;
  const captcha = siteKey && (
    <TurnstileWidget label={t("captchaLabel")} language={locale} onToken={setCaptchaToken} resetSignal={captchaReset} siteKey={siteKey} />
  );
  // When the last code was requested, for the resend countdown; the clock ticks each second.
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [sentFor, setSentFor] = useState("");
  const [resent, setResent] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (sentAt === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sentAt]);
  // Supabase limits requests per address, so the wait applies to the address it was sent to.
  const waitFor = (address: string, at: number) => (normalizeEmail(address) === sentFor ? resendWaitSeconds(sentAt, at) : 0);
  const resendWait = waitFor(email, now);

  const callbackUrl = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;

  const signInWithGoogle = async () => {
    if (!acceptedTerms) {
      setMessage("กรุณายอมรับข้อกำหนดและนโยบายความเป็นส่วนตัวก่อน");
      return;
    }

    setLoading(true);
    setMessage("");
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) {
      setMessage("ยังไม่สามารถเข้าสู่ระบบด้วย Google ได้: " + error.message);
      setLoading(false);
    }
  };

  const signInWithFacebook = async () => {
    if (!acceptedTerms) {
      setMessage("กรุณายอมรับข้อกำหนดและนโยบายความเป็นส่วนตัวก่อน");
      return;
    }

    setLoading(true);
    setMessage("");
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "facebook",
      options: { redirectTo: callbackUrl() },
    });
    if (error) {
      setMessage("ยังไม่สามารถเข้าสู่ระบบด้วย Facebook ได้: " + error.message);
      setLoading(false);
    }
  };

  // Each request replaces the previous code (Supabase keeps one per address), so a
  // resend is offered only after the wait and says the old code no longer works.
  const sendOtp = async (resend = false) => {
    if (!acceptedTerms) {
      setMessage("กรุณายอมรับข้อกำหนดและนโยบายความเป็นส่วนตัวก่อน");
      return;
    }
    if (loading) return;
    const wait = waitFor(email, Date.now());
    if (wait > 0) {
      // The code just sent to this address is still the valid one: go back to it rather
      // than ask for another that would cancel it.
      if (resend) setMessage(t("resendIn", { seconds: wait }));
      else setStep("otp");
      return;
    }
    if (captchaMissing) {
      setMessage(t("captchaNeeded"));
      return;
    }
    setLoading(true);
    setMessage("");
    const { error } = await createClient().auth.signInWithOtp({
      email: normalizeEmail(email),
      options: withCaptcha({ emailRedirectTo: callbackUrl() }, captchaToken),
    });
    // The token is spent whatever the answer, even when the address is rate limited.
    setCaptchaReset((n) => n + 1);
    if (error) {
      const key = otpErrorKey(error);
      setMessage(key === "rateLimited" ? t("errors.rateLimited") : key === "captcha" ? t("errors.captcha") : t("errors.sendFailed"));
    } else {
      setSentAt(Date.now());
      setSentFor(normalizeEmail(email));
      setNow(Date.now());
      setOtp("");
      setResent(resend);
      setStep("otp");
    }
    setLoading(false);
  };

  const verifyOtp = async () => {
    setLoading(true);
    setMessage("");
    const { error } = await createClient().auth.verifyOtp({ email: normalizeEmail(email), token: otp, type: "email" });
    if (error) {
      setMessage(t(`errors.${otpErrorKey(error)}`));
      setLoading(false);
      return;
    }
    window.location.assign(`/welcome?next=${encodeURIComponent(nextPath)}`);
  };

  const adminLogin = async () => {
    if (captchaMissing) {
      setMessage(t("captchaNeeded"));
      return;
    }
    setLoading(true);
    setMessage("");
    const { error } = await createClient().auth.signInWithPassword({ email, password, options: withCaptcha(undefined, captchaToken) });
    setCaptchaReset((n) => n + 1);
    if (error) {
      setMessage(otpErrorKey(error) === "captcha" ? t("errors.captcha") : "เข้าสู่ระบบผู้ดูแลไม่สำเร็จ: " + error.message);
      setLoading(false);
      return;
    }
    window.location.assign("/admin");
  };

  const go = (nextStep: LoginStep) => {
    setStep(nextStep);
    setMessage("");
  };

  const otpSlots = Math.min(OTP_MAX_LENGTH, Math.max(8, otp.length + (otp.length < OTP_MAX_LENGTH ? 1 : 0)));

  return (
    <main className="lg ui-dark">
      <div className="lg-shell">
        <section className="lg-hero">
          <Link className="ui-brand" href="/" aria-label="BallDoenSai.com"><BrandMark size={26} />BallDoenSai.com</Link>
          {/* The slogan is for the wide layout; on a phone the page opens on what it is and what to press.
              No example card: it carried numbers that belong to no one (AGENTS.md rule 8). */}
          <div className="lg-hero-copy">
            <p className="ui-hero">ทุกนัดที่เล่น<br />กลายเป็น<em>ตัวตน</em><br />ของคุณ</p>
            <p className="lg-lead">{tp("lead")}</p>
          </div>
        </section>

        <section className="lg-panel">
          {step === "start" && (
            <>
              <h1 className="ui-h1 lg-title">{tp("title")}</h1>
              <p className="lg-sub">{tp("sub")}</p>
              <label className={`lg-consent${acceptedTerms ? " is-checked" : ""}`}>
                <input checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} type="checkbox" />
                <i aria-hidden="true">{acceptedTerms && <Check size={14} strokeWidth={3.5} />}</i>
                <span>ฉันยอมรับ <Link href="/terms">ข้อกำหนดการใช้งาน</Link> และ <Link href="/privacy">นโยบายความเป็นส่วนตัว (PDPA)</Link></span>
              </label>
              <button className="ui-btn ui-btn-white" disabled={loading} onClick={signInWithGoogle} type="button">
                <span className="lg-google" aria-hidden="true" />
                {loading ? tp("googleLoading") : tp("google")}
              </button>
              <p className="lg-or"><span>หรือ</span></p>
              <button className="ui-btn ui-btn-ghost-d" onClick={() => go("email")} type="button">
                <Mail size={18} /> {tp("email")}
              </button>
              <button className="ui-btn ui-btn-ghost-d lg-quiet" disabled={loading} onClick={signInWithFacebook} type="button">
                <Facebook size={16} fill="currentColor" /> {loading ? tp("facebookLoading") : tp("facebook")}
              </button>
              <p className="lg-next">{tp("next")}</p>
              <p className="lg-trust"><Shield size={15} /> ข้อมูลเด็กเปิดเผยได้เมื่อผู้ปกครองยินยอมเท่านั้น · ไม่ต้องตั้งรหัสผ่าน</p>
            </>
          )}

          {step === "email" && (
            <>
              <button className="lg-back" onClick={() => go("start")} type="button"><ArrowLeft size={18} /> กลับ</button>
              <p className="ui-eyebrow">ขั้นตอน 1 จาก 2</p>
              <h2 className="ui-h1 lg-title">รับรหัสทางอีเมล</h2>
              <p className="lg-sub">{t("emailSubtitle")}</p>
              <label className="ui-field" htmlFor="email">
                <span>อีเมล</span>
                <input autoComplete="email" id="email" inputMode="email" onChange={(event) => setEmail(event.target.value)} placeholder="you@email.com" type="email" value={email} />
              </label>
              {captcha}
              <button className="ui-btn ui-btn-primary" disabled={loading || !email || captchaMissing} onClick={() => sendOtp()} type="button">{loading ? "กำลังส่ง..." : "ส่งรหัสให้ฉัน"}<ChevronRight size={18} /></button>
            </>
          )}

          {step === "otp" && (
            <>
              <button className="lg-back" onClick={() => go("email")} type="button"><ArrowLeft size={18} /> เปลี่ยนอีเมล</button>
              <p className="ui-eyebrow">ขั้นตอน 2 จาก 2</p>
              <h2 className="ui-h1 lg-title">{t("title")}</h2>
              <p className="lg-sub">{t("sentTo")} <b>{normalizeEmail(email)}</b></p>
              <label className="lg-otp" htmlFor="otp">
                <span className="lg-sr">OTP</span>
                <input autoComplete="one-time-code" autoFocus id="otp" inputMode="numeric" maxLength={OTP_MAX_LENGTH} onChange={(event) => setOtp(normalizeOtp(event.target.value))} value={otp} />
                <span className="lg-otp-boxes" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${otpSlots}, minmax(0, 1fr))` }}>
                  {Array.from({ length: otpSlots }, (_, index) => <i key={index} className={index === otp.length ? "is-next" : otp[index] ? "is-filled" : ""}>{otp[index] ?? ""}</i>)}
                </span>
              </label>
              <button className="ui-btn ui-btn-primary" disabled={loading || !canSubmitOtp(otp)} onClick={verifyOtp} type="button">{loading ? "กำลังตรวจสอบ..." : "เข้าสู่ BallDoenSai"}<ChevronRight size={18} /></button>
              {resendWait === 0 && captcha}
              <button className="lg-resend" disabled={loading || resendWait > 0 || captchaMissing} onClick={() => sendOtp(true)} type="button">{resendWait > 0 ? t("resendIn", { seconds: resendWait }) : t("resend")}</button>
              <p className="lg-note" role="status">{resent ? t("resent") : t("onlyLatest")}</p>
            </>
          )}

          {step === "admin" && adminEntry && (
            <>
              <Link className="lg-back" href="/login"><ArrowLeft size={18} /> กลับหน้าเข้าสู่ระบบ</Link>
              <p className="ui-eyebrow">{tp("adminEyebrow")}</p>
              <h2 className="ui-h1 lg-title">เข้าสู่ระบบผู้ดูแล</h2>
              <label className="ui-field" htmlFor="admin-email"><span>อีเมลผู้ดูแล</span><input autoComplete="email" id="admin-email" onChange={(event) => setEmail(event.target.value)} type="email" value={email} /></label>
              <label className="ui-field" htmlFor="admin-password"><span>รหัสผ่าน</span><input autoComplete="current-password" id="admin-password" onChange={(event) => setPassword(event.target.value)} type="password" value={password} /></label>
              {captcha}
              <button className="ui-btn ui-btn-primary" disabled={loading || !email || !password || captchaMissing} onClick={adminLogin} type="button">{loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ Dashboard"}<ChevronRight size={18} /></button>
            </>
          )}

          {message && <p className="lg-message" role="alert">{message}</p>}
        </section>
      </div>
    </main>
  );
}
