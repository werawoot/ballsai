"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Check, ChevronRight, KeyRound, Mail, Shield, Sparkles, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase";

type LoginStep = "start" | "email" | "otp" | "admin";

export default function LoginPanel({ adminEntry, nextPath }: { adminEntry: boolean; nextPath: string }) {
  const [step, setStep] = useState<LoginStep>(adminEntry ? "admin" : "start");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

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

  const sendOtp = async () => {
    if (!acceptedTerms) {
      setMessage("กรุณายอมรับข้อกำหนดและนโยบายความเป็นส่วนตัวก่อน");
      return;
    }
    setLoading(true);
    setMessage("");
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl() },
    });
    if (error) {
      setMessage("ส่งรหัสไม่สำเร็จ: " + error.message);
    } else {
      setStep("otp");
    }
    setLoading(false);
  };

  const verifyOtp = async () => {
    setLoading(true);
    setMessage("");
    const { error } = await createClient().auth.verifyOtp({ email, token: otp, type: "email" });
    if (error) {
      setMessage("OTP ไม่ถูกต้อง: " + error.message);
      setLoading(false);
      return;
    }
    window.location.assign(`/welcome?next=${encodeURIComponent(nextPath)}`);
  };

  const adminLogin = async () => {
    setLoading(true);
    setMessage("");
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) {
      setMessage("เข้าสู่ระบบผู้ดูแลไม่สำเร็จ: " + error.message);
      setLoading(false);
      return;
    }
    window.location.assign("/admin");
  };

  const go = (nextStep: LoginStep) => {
    setStep(nextStep);
    setMessage("");
  };

  return (
    <main className="auth-v2">
      <section className="auth-v2-stage">
        <div className="auth-v2-geometry auth-v2-geometry-one" />
        <div className="auth-v2-geometry auth-v2-geometry-two" />
        <Link className="auth-v2-brand" href="/">
          <span><Trophy size={19} /></span>
          BallDoenSai<span>.com</span>
        </Link>

        <div className="auth-v2-copy">
          <p className="auth-v2-kicker"><Sparkles size={14} /> YOUR GAME · YOUR STORY</p>
          <h1>ทุกก้าวในสนาม<br /><em>มีความหมาย</em></h1>
          <p>สร้างตัวตน เก็บผลงาน และแชร์เส้นทางนักบอลของคุณให้โลกเห็น</p>
          <div className="auth-v2-points">
            <span><Check size={14} /> สร้าง Player Card</span>
            <span><Check size={14} /> เก็บทุก Highlight</span>
            <span><Check size={14} /> เติบโตจากทุกนัด</span>
          </div>
        </div>

        <div className="auth-v2-panel">
          {step === "start" && (
            <>
              <p className="auth-v2-eyebrow">WELCOME TO THE PITCH</p>
              <h2>เริ่มเส้นทางของคุณ</h2>
              <p className="auth-v2-subtitle">เข้ามาดูก่อนก็ได้ แล้วค่อยตั้งค่าโปรไฟล์ของคุณภายใน</p>

              <label className="auth-v2-consent">
                <input checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} type="checkbox" />
                <span>ฉันยอมรับ <Link href="/terms">ข้อกำหนดการใช้งาน</Link> และ <Link href="/privacy">นโยบายความเป็นส่วนตัว/PDPA</Link></span>
              </label>

              <button className="auth-v2-google" disabled={loading} onClick={signInWithGoogle} type="button">
                <span className="auth-v2-google-mark">G</span>
                {loading ? "กำลังพาไป Google..." : "ดำเนินการต่อด้วย Google"}
              </button>
              <button className="auth-v2-email" onClick={() => go("email")} type="button">
                <Mail size={17} /> ใช้อีเมลรับรหัส <ChevronRight size={17} />
              </button>
              <p className="auth-v2-note">ไม่มีการสร้างรหัสผ่านสำหรับนักกีฬา · เข้าใช้ง่ายและปลอดภัย</p>
            </>
          )}

          {step === "email" && (
            <>
              <button className="auth-v2-back" onClick={() => go("start")} type="button"><ArrowLeft size={16} /> กลับ</button>
              <p className="auth-v2-eyebrow">EMAIL ACCESS</p>
              <h2>รับรหัสทางอีเมล</h2>
              <p className="auth-v2-subtitle">เราจะส่งรหัส 6 หลักให้คุณ ไม่ต้องจำรหัสผ่าน</p>
              <label className="auth-v2-label" htmlFor="email">อีเมล</label>
              <div className="auth-v2-input"><Mail size={17} /><input autoComplete="email" id="email" onChange={(event) => setEmail(event.target.value)} placeholder="you@email.com" type="email" value={email} /></div>
              <button className="auth-v2-primary" disabled={loading || !email} onClick={sendOtp} type="button">{loading ? "กำลังส่ง..." : "ส่งรหัสให้ฉัน"}<ChevronRight size={17} /></button>
            </>
          )}

          {step === "otp" && (
            <>
              <button className="auth-v2-back" onClick={() => go("email")} type="button"><ArrowLeft size={16} /> เปลี่ยนอีเมล</button>
              <p className="auth-v2-eyebrow">VERIFY YOUR EMAIL</p>
              <h2>ใส่รหัส 6 หลัก</h2>
              <p className="auth-v2-subtitle">ส่งไปที่ <b>{email}</b></p>
              <label className="auth-v2-label" htmlFor="otp">OTP CODE</label>
              <div className="auth-v2-input auth-v2-otp"><KeyRound size={17} /><input autoComplete="one-time-code" id="otp" inputMode="numeric" maxLength={8} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} placeholder="000000" value={otp} /></div>
              <button className="auth-v2-primary" disabled={loading || otp.length < 6} onClick={verifyOtp} type="button">{loading ? "กำลังตรวจสอบ..." : "เข้าสู่ BallDoenSai"}<ChevronRight size={17} /></button>
            </>
          )}

          {step === "admin" && adminEntry && (
            <>
              <Link className="auth-v2-back" href="/login"><ArrowLeft size={16} /> กลับหน้าเข้าสู่ระบบ</Link>
              <p className="auth-v2-eyebrow">PRIVATE ACCESS</p>
              <h2>เข้าสู่ระบบผู้ดูแล</h2>
              <label className="auth-v2-label" htmlFor="admin-email">อีเมลผู้ดูแล</label>
              <div className="auth-v2-input"><Mail size={17} /><input autoComplete="email" id="admin-email" onChange={(event) => setEmail(event.target.value)} type="email" value={email} /></div>
              <label className="auth-v2-label" htmlFor="admin-password">รหัสผ่าน</label>
              <div className="auth-v2-input"><Shield size={17} /><input autoComplete="current-password" id="admin-password" onChange={(event) => setPassword(event.target.value)} type="password" value={password} /></div>
              <button className="auth-v2-primary" disabled={loading || !email || !password} onClick={adminLogin} type="button">{loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ Dashboard"}<ChevronRight size={17} /></button>
            </>
          )}

          {message && <p className="auth-v2-message" role="alert">{message}</p>}
        </div>
      </section>
    </main>
  );
}
