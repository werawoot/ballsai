"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, ChevronRight, Eye, EyeOff, Facebook, Mail, MailCheck, Shield } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { OTP_MAX_LENGTH, canSubmitOtp, otpSlotCount, normalizeEmail, normalizeOtp, otpErrorKey, resendWaitSeconds } from "@/lib/otp";
import { captchaSiteKey, withCaptcha } from "@/lib/captcha";
import { OtpHelp } from "./OtpHelp";
import { LoginConsent } from "./LoginConsent";
import { LoginJourney } from "./LoginJourney";
import TurnstileWidget from "@/components/TurnstileWidget";
import BrandMark from "@/components/BrandMark";
import LanguageSwitch from "@/components/LanguageSwitch";
import GoogleLogo from "@/components/GoogleLogo";
import { PAGE_PHOTOS } from "@/lib/stock-photos";
import "../glass.css";
import "./login.css";

// The first screen holds both ways in, as in the owner's design (23 Oct 2026): the email
// field with its send button, then Google and Facebook. Sign in and sign up are one flow (a
// new address or Google account gets an account), so the two tabs only change the wording.
type LoginStep = "start" | "otp" | "admin";

const consentText = <>ฉันยอมรับ <Link href="/terms">ข้อกำหนดการใช้งาน</Link> และ <Link href="/privacy">นโยบายความเป็นส่วนตัว (PDPA)</Link></>;

export default function LoginPanel({ adminEntry, nextPath }: { adminEntry: boolean; nextPath: string }) {
  const [step, setStep] = useState<LoginStep>(adminEntry ? "admin" : "start");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  // Pressing a way in before ticking consent points at the consent row itself, right where
  // the eye is, instead of a message at the bottom of the panel.
  const [consentMissing, setConsentMissing] = useState(false);
  const askConsent = () => {
    setConsentMissing(true);
    setMessage("");
    document.getElementById("login-consent")?.focus();
  };
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
      askConsent();
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
      askConsent();
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
      askConsent();
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

  const otpSlots = otpSlotCount(otp.length);

  return (
    <main className="lg gl" style={{ "--gl-stadium-photo": `url(${PAGE_PHOTOS.login.src})` } as React.CSSProperties}>
      <div className="lg-shell">
        <section className="lg-hero">
          <div className="lg-hero-bar"><LanguageSwitch /></div>
          <Link className="ui-brand lg-brand" href="/" aria-label="BallDoenSai.com"><BrandMark size={30} /><span>BallDoenSai.com</span></Link>
          {/* No example card: it carried numbers that belong to no one (AGENTS.md rule 8). */}
          <div className="lg-hero-copy">
            <p className="ui-hero">{tp("slogan1")}<br /><em>{tp("slogan2")}</em><br />{tp("slogan3")}</p>
            <p className="lg-lead">{tp("lead")}</p>
            <LoginJourney />
          </div>
        </section>

        <section className="lg-panel gl-panel">
          {step === "start" && (
            <>
              <div className="lg-tabs" role="group" aria-label={tp("title")}>
                <button aria-pressed={mode === "signin"} className={mode === "signin" ? "is-on" : undefined} onClick={() => setMode("signin")} type="button">{tp("tabSignIn")}</button>
                <button aria-pressed={mode === "signup"} className={mode === "signup" ? "is-on" : undefined} onClick={() => setMode("signup")} type="button">{tp("tabSignUp")}</button>
              </div>
              <h1 className="lg-sr">{tp("title")}</h1>
              <p className="lg-sub">{mode === "signup" ? tp("signUpSub") : tp("sub")}</p>
              <label className="lg-input" htmlFor="email">
                <Mail aria-hidden="true" size={19} />
                <span className="lg-sr">{tp("emailLabel")}</span>
                <input autoComplete="email" id="email" inputMode="email" onChange={(event) => setEmail(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing && email) sendOtp(); }} placeholder={tp("emailPlaceholder")} type="email" value={email} />
              </label>
              <LoginConsent accepted={acceptedTerms} missing={consentMissing} missingText={tp("consentNeeded")} onChange={(accepted) => { setAcceptedTerms(accepted); if (accepted) setConsentMissing(false); }}>{consentText}</LoginConsent>
              {captcha}
              <button className="ui-btn ui-btn-primary" disabled={loading || !email || captchaMissing} onClick={() => sendOtp()} type="button">{loading ? tp("sending") : tp("email")}<ChevronRight size={18} /></button>
              <p className="lg-or"><span>{mode === "signup" ? tp("orSignUpWith") : tp("orWith")}</span></p>
              <button className="ui-btn ui-btn-white" disabled={loading} onClick={signInWithGoogle} type="button">
                <GoogleLogo className="lg-google" />
                {loading ? tp("googleLoading") : tp("google")}
              </button>
              <button className="ui-btn ui-btn-white lg-facebook" disabled={loading} onClick={signInWithFacebook} type="button">
                <Facebook size={18} fill="currentColor" aria-hidden="true" /> {loading ? tp("facebookLoading") : tp("facebook")}
              </button>
              <p className="lg-next">{tp("next")}</p>
              <p className="lg-trust"><Shield size={15} /> ข้อมูลเด็กเปิดเผยได้เมื่อผู้ปกครองยินยอมเท่านั้น · ไม่ต้องตั้งรหัสผ่าน</p>
            </>
          )}

          {step === "otp" && (
            <>
              <button className="lg-back" onClick={() => go("start")} type="button"><ArrowLeft size={18} /> เปลี่ยนอีเมล</button>
              <span className="lg-otp-icon" aria-hidden="true"><MailCheck size={40} /></span>
              <h2 className="ui-h1 lg-title lg-center">{t("title")}</h2>
              <p className="lg-sub lg-center">{t("sentTo")} <b>{normalizeEmail(email)}</b></p>
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
              <OtpHelp onUseGoogle={() => go("start")} />
            </>
          )}

          {step === "admin" && adminEntry && (
            <>
              <Link className="lg-back" href="/login"><ArrowLeft size={18} /> กลับหน้าเข้าสู่ระบบ</Link>
              <p className="ui-eyebrow">{tp("adminEyebrow")}</p>
              <h2 className="ui-h1 lg-title">เข้าสู่ระบบผู้ดูแล</h2>
              <label className="ui-field" htmlFor="admin-email"><span>อีเมลผู้ดูแล</span><input autoComplete="email" id="admin-email" onChange={(event) => setEmail(event.target.value)} type="email" value={email} /></label>
              <label className="ui-field" htmlFor="admin-password"><span>รหัสผ่าน</span><span className="lg-password"><input autoComplete="current-password" id="admin-password" onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} value={password} /><button aria-controls="admin-password" aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"} aria-pressed={showPassword} className="lg-password-toggle" onClick={() => setShowPassword((shown) => !shown)} type="button">{showPassword ? <EyeOff aria-hidden="true" size={20} /> : <Eye aria-hidden="true" size={20} />}</button></span></label>
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
