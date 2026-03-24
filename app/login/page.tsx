"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { Trophy, Mail, KeyRound, ArrowLeft, Lock, Shield } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [loginMode, setLoginMode] = useState<"otp" | "admin">("otp");
  const [password, setPassword] = useState("");

  const sendOtp = async () => {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: "http://localhost:3000/auth/callback" },
    });
    if (error) {
      setMessage("เกิดข้อผิดพลาด: " + error.message);
    } else {
      setStep("otp");
      setMessage("");
    }
    setLoading(false);
  };

  const verifyOtp = async () => {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });
    if (error) {
      setMessage("OTP ไม่ถูกต้อง: " + error.message);
    } else {
      window.location.href = "/";
    }
    setLoading(false);
  };

  const adminLogin = async () => {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setMessage("เข้าสู่ระบบ Admin ไม่สำเร็จ: " + error.message);
    } else {
      window.location.href = "/admin";
    }
    setLoading(false);
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f8f8f8",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "12px 16px",
          gap: 8,
        }}
      >
        <button
          onClick={() => {
            setLoginMode("otp");
            setStep("email");
            setMessage("");
          }}
          style={{
            padding: "8px 16px",
            fontSize: 12,
            fontWeight: 700,
            border: "none",
            borderRadius: 20,
            cursor: "pointer",
            background: loginMode === "otp" ? "#CC0001" : "#f0f0f0",
            color: loginMode === "otp" ? "white" : "#666",
            fontFamily: "var(--font-oswald)",
            letterSpacing: 0.5,
            transition: "all 0.2s",
          }}
        >
          OTP Login
        </button>
        <button
          onClick={() => {
            setLoginMode("admin");
            setStep("email");
            setMessage("");
          }}
          style={{
            padding: "8px 16px",
            fontSize: 12,
            fontWeight: 700,
            border: "none",
            borderRadius: 20,
            cursor: "pointer",
            background: loginMode === "admin" ? "#CC0001" : "#f0f0f0",
            color: loginMode === "admin" ? "white" : "#666",
            fontFamily: "var(--font-oswald)",
            letterSpacing: 0.5,
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Shield size={14} /> Admin
        </button>
      </div>

      {/* TOP RED SECTION */}
      <div
        style={{
          background: "#CC0001",
          padding: "48px 24px 64px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "repeating-linear-gradient(-45deg,transparent,transparent 20px,rgba(255,255,255,0.03) 20px,rgba(255,255,255,0.03) 21px)",
          }}
        />
        <div style={{ position: "relative", textAlign: "center" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: 12,
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.15)",
                border: "2px solid rgba(255,255,255,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Trophy size={28} color="white" strokeWidth={2} />
            </div>
          </div>
          <div
            style={{
              fontFamily: "var(--font-oswald)",
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: 3,
              color: "white",
            }}
          >
            BALLSAI
          </div>
          <div
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.7)",
              marginTop: 4,
            }}
          >
            แพลตฟอร์มกีฬาเด็กไทย
          </div>
        </div>
      </div>

      {/* Wave */}
      <svg
        viewBox="0 0 375 28"
        preserveAspectRatio="none"
        style={{
          display: "block",
          width: "100%",
          height: 28,
          marginTop: -1,
          background: "#f8f8f8",
        }}
      >
        <path d="M0,0 C100,28 275,0 375,20 L375,0 Z" fill="#CC0001" />
      </svg>

      {/* CARD */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "24px 20px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 400,
            background: "white",
            borderRadius: 16,
            border: "1.5px solid #e5e5e5",
            padding: "28px 24px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
          }}
        >
          {step === "email" ? (
            <>
              <div style={{ marginBottom: 24 }}>
                <h2
                  style={{
                    fontFamily: "var(--font-oswald)",
                    fontSize: 22,
                    fontWeight: 700,
                    color: "#111",
                    letterSpacing: 0.5,
                  }}
                >
                  เข้าสู่ระบบ
                </h2>
                <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
                  กรอก Email เพื่อรับ OTP
                </p>
              </div>

              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#555",
                  marginBottom: 6,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                Email
              </label>
              <div style={{ position: "relative", marginBottom: 20 }}>
                <Mail
                  size={16}
                  style={{
                    position: "absolute",
                    left: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#aaa",
                  }}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  style={{
                    width: "100%",
                    border: "1.5px solid #e5e5e5",
                    borderRadius: 10,
                    padding: "11px 14px 11px 40px",
                    fontSize: 14,
                    outline: "none",
                    fontFamily: "var(--font-sarabun)",
                    color: "#111",
                    background: "#fafafa",
                  }}
                />
              </div>

              <button
                onClick={sendOtp}
                disabled={loading || !email}
                style={{
                  width: "100%",
                  background: loading || !email ? "#eee" : "#CC0001",
                  color: loading || !email ? "#aaa" : "white",
                  border: "none",
                  borderRadius: 10,
                  padding: "13px",
                  fontSize: 15,
                  fontWeight: 800,
                  fontFamily: "var(--font-oswald)",
                  letterSpacing: 1,
                  cursor: loading || !email ? "default" : "pointer",
                  transition: "all 0.2s",
                }}
              >
                {loading ? "กำลังส่ง..." : "ส่ง OTP"}
              </button>

              <div
                style={{
                  marginTop: 24,
                  paddingTop: 20,
                  borderTop: "1px solid #f0f0f0",
                  textAlign: "center",
                }}
              >
                <p style={{ fontSize: 11, color: "#999", marginBottom: 12 }}>
                  หรือเข้าสู่ระบบในฐานะ Admin
                </p>
                <button
                  onClick={() => setLoginMode("admin")}
                  style={{
                    width: "100%",
                    background: "white",
                    color: "#CC0001",
                    border: "2px solid #CC0001",
                    borderRadius: 10,
                    padding: "12px",
                    fontSize: 14,
                    fontWeight: 800,
                    fontFamily: "var(--font-oswald)",
                    letterSpacing: 1,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <Shield size={18} /> LoginAdmin
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep("email")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "none",
                  border: "none",
                  color: "#CC0001",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  marginBottom: 20,
                  padding: 0,
                }}
              >
                <ArrowLeft size={16} /> กลับ
              </button>

              <div style={{ marginBottom: 24 }}>
                <h2
                  style={{
                    fontFamily: "var(--font-oswald)",
                    fontSize: 22,
                    fontWeight: 700,
                    color: "#111",
                    letterSpacing: 0.5,
                  }}
                >
                  ยืนยัน OTP
                </h2>
                <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
                  กรอกรหัส OTP ที่ส่งไปยัง{" "}
                  <span style={{ color: "#CC0001", fontWeight: 700 }}>
                    {email}
                  </span>
                </p>
              </div>

              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#555",
                  marginBottom: 6,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                OTP
              </label>
              <div style={{ position: "relative", marginBottom: 20 }}>
                <KeyRound
                  size={16}
                  style={{
                    position: "absolute",
                    left: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#aaa",
                  }}
                />
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="000000"
                  maxLength={8}
                  style={{
                    width: "100%",
                    border: "1.5px solid #e5e5e5",
                    borderRadius: 10,
                    padding: "11px 14px 11px 40px",
                    fontSize: 22,
                    fontWeight: 700,
                    letterSpacing: 8,
                    outline: "none",
                    textAlign: "center",
                    fontFamily: "var(--font-oswald)",
                    color: "#111",
                    background: "#fafafa",
                  }}
                />
              </div>

              <button
                onClick={verifyOtp}
                disabled={loading || otp.length < 6}
                style={{
                  width: "100%",
                  background: loading || otp.length < 6 ? "#eee" : "#CC0001",
                  color: loading || otp.length < 6 ? "#aaa" : "white",
                  border: "none",
                  borderRadius: 10,
                  padding: "13px",
                  fontSize: 15,
                  fontWeight: 800,
                  fontFamily: "var(--font-oswald)",
                  letterSpacing: 1,
                  cursor: loading || otp.length < 6 ? "default" : "pointer",
                }}
              >
                {loading ? "กำลังยืนยัน..." : "ยืนยัน OTP"}
              </button>
            </>
          )}

          {loginMode === "admin" && (
            <>
              <div style={{ marginBottom: 24 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <Shield size={24} style={{ color: "#CC0001" }} />
                  <h2
                    style={{
                      fontFamily: "var(--font-oswald)",
                      fontSize: 22,
                      fontWeight: 700,
                      color: "#111",
                      letterSpacing: 0.5,
                    }}
                  >
                    Admin Login
                  </h2>
                </div>
                <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
                  เข้าสู่ระบบสำหรับผู้ดูแลระบบ
                </p>
              </div>

              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#555",
                  marginBottom: 6,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                Admin Email
              </label>
              <div style={{ position: "relative", marginBottom: 20 }}>
                <Mail
                  size={16}
                  style={{
                    position: "absolute",
                    left: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#aaa",
                  }}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@ballsai.com"
                  style={{
                    width: "100%",
                    border: "1.5px solid #e5e5e5",
                    borderRadius: 10,
                    padding: "11px 14px 11px 40px",
                    fontSize: 14,
                    outline: "none",
                    fontFamily: "var(--font-sarabun)",
                    color: "#111",
                    background: "#fafafa",
                  }}
                />
              </div>

              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#555",
                  marginBottom: 6,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                Password
              </label>
              <div style={{ position: "relative", marginBottom: 24 }}>
                <Lock
                  size={16}
                  style={{
                    position: "absolute",
                    left: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#aaa",
                  }}
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{
                    width: "100%",
                    border: "1.5px solid #e5e5e5",
                    borderRadius: 10,
                    padding: "11px 14px 11px 40px",
                    fontSize: 14,
                    outline: "none",
                    fontFamily: "var(--font-sarabun)",
                    color: "#111",
                    background: "#fafafa",
                  }}
                />
              </div>

              <button
                onClick={adminLogin}
                disabled={loading || !email || !password}
                style={{
                  width: "100%",
                  background:
                    loading || !email || !password ? "#eee" : "#CC0001",
                  color: loading || !email || !password ? "#aaa" : "white",
                  border: "none",
                  borderRadius: 10,
                  padding: "13px",
                  fontSize: 15,
                  fontWeight: 800,
                  fontFamily: "var(--font-oswald)",
                  letterSpacing: 1,
                  cursor:
                    loading || !email || !password ? "default" : "pointer",
                  transition: "all 0.2s",
                }}
              >
                {loading ? "กำลังเข้าสู่ระบบ..." : "Login Admin"}
              </button>

              <div
                style={{
                  marginTop: 20,
                  paddingTop: 16,
                  borderTop: "1px solid #f0f0f0",
                  textAlign: "center",
                }}
              >
                <p style={{ fontSize: 11, color: "#999", marginBottom: 12 }}>
                  Admin Credentials:
                </p>
                <div
                  style={{
                    background: "#f8f8f8",
                    borderRadius: 8,
                    padding: "12px",
                    fontSize: 11,
                    color: "#666",
                    textAlign: "left",
                    lineHeight: 1.6,
                  }}
                >
                  <div>
                    <strong>Email:</strong> admin@ballsai.com
                  </div>
                  <div>
                    <strong>Password:</strong> Admin123!
                  </div>
                </div>
              </div>
            </>
          )}

          {message && (
            <p
              style={{
                marginTop: 16,
                textAlign: "center",
                fontSize: 13,
                color: "#CC0001",
                fontWeight: 600,
              }}
            >
              {message}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
