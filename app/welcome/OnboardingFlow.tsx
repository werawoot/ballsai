"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronLeft, Compass, Sparkles, Trophy, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase";

type Persona = "athlete" | "guardian" | "coach_organizer";
type Goal = "player_card" | "find_competitions" | "follow_athlete" | "discover_talent";

const personas: Array<{ id: Persona; icon: typeof Trophy; title: string; description: string }> = [
  { id: "athlete", icon: Trophy, title: "นักกีฬา", description: "สร้างตัวตนและเก็บทุกผลงานของฉัน" },
  { id: "guardian", icon: UsersRound, title: "ผู้ปกครอง", description: "ติดตามและสนับสนุนเส้นทางของน้อง" },
  { id: "coach_organizer", icon: Compass, title: "โค้ช / ผู้จัด", description: "ค้นหา พัฒนา และจัดการแข่งขัน" },
];

const goals: Array<{ id: Goal; title: string; description: string; path: string }> = [
  { id: "player_card", title: "สร้าง Player Card", description: "ทำการ์ดนักเตะของฉัน", path: "/card" },
  { id: "find_competitions", title: "หารายการแข่ง", description: "ค้นหาสนามที่รอคุณอยู่", path: "/tournaments" },
  { id: "follow_athlete", title: "ติดตามนักกีฬา", description: "ดูเส้นทางและผลงาน", path: "/athletes" },
  { id: "discover_talent", title: "ค้นหานักกีฬา", description: "เจอดาวรุ่งที่น่าจับตา", path: "/athletes" },
];

export default function OnboardingFlow({ email, nextPath, userId }: { email: string; nextPath: string; userId: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [sport, setSport] = useState("football");
  const [goal, setGoal] = useState<Goal | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedGoal = useMemo(() => goals.find((item) => item.id === goal), [goal]);

  const finish = async (skip = false) => {
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        onboarding_completed_at: new Date().toISOString(),
        onboarding_persona: skip ? null : persona,
        onboarding_sport: skip ? null : sport,
        onboarding_goal: skip ? null : goal,
      })
      .eq("id", userId);

    if (profileError) {
      setError("บันทึกการตั้งค่าไม่สำเร็จ: " + profileError.message);
      setSaving(false);
      return;
    }

    if (!skip && persona === "athlete") {
      const { data: existing, error: lookupError } = await supabase
        .from("athlete_profiles")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (!lookupError && !existing) {
        const { error: athleteError } = await supabase.from("athlete_profiles").insert({
          user_id: userId,
          display_name: "",
          sport,
        });
        if (athleteError) {
          setError("บันทึกโปรไฟล์นักกีฬาไม่สำเร็จ: " + athleteError.message);
          setSaving(false);
          return;
        }
      }
    }

    router.replace(skip ? nextPath : (selectedGoal?.path ?? nextPath));
    router.refresh();
  };

  return (
    <main className="onboard-page">
      <div className="onboard-orbit onboard-orbit-one" />
      <div className="onboard-orbit onboard-orbit-two" />
      <section className="onboard-shell">
        <header className="onboard-header">
          <div className="onboard-brand"><Trophy size={20} /> BallDoenSai<span>.com</span></div>
          <button className="onboard-skip" disabled={saving} onClick={() => finish(true)} type="button">ข้ามไปดูก่อน <ArrowRight size={15} /></button>
        </header>

        <div className="onboard-progress" aria-label={`ขั้นตอน ${step + 1} จาก 3`}>
          {[0, 1, 2].map((item) => <i className={item <= step ? "is-active" : ""} key={item} />)}
        </div>

        <div className="onboard-content">
          <p className="onboard-kicker"><Sparkles size={14} /> WELCOME, {email.split("@")[0]?.toUpperCase() || "PLAYER"}</p>
          {step === 0 && <><h1>คุณเข้ามา<br /><em>ในฐานะอะไร?</em></h1><p>เลือกให้เราพาคุณไปยังจุดเริ่มต้นที่เหมาะที่สุด</p><div className="onboard-options">{personas.map(({ id, icon: Icon, title, description }) => <button className={persona === id ? "is-selected" : ""} key={id} onClick={() => setPersona(id)} type="button"><Icon size={24} /><span><b>{title}</b><small>{description}</small></span>{persona === id && <Check size={17} />}</button>)}</div></>}
          {step === 1 && <><h1>คุณสนใจ<br /><em>กีฬาอะไร?</em></h1><p>เริ่มต้นด้วยกีฬาที่คุณรัก และเพิ่มผลงานได้ในภายหลัง</p><div className="onboard-sports">{[{ id: "football", title: "ฟุตบอล", sub: "FOOTBALL" }, { id: "futsal", title: "ฟุตซอล", sub: "FUTSAL" }, { id: "other", title: "กีฬาอื่น", sub: "COMING SOON" }].map((item) => <button className={sport === item.id ? "is-selected" : ""} key={item.id} onClick={() => setSport(item.id)} type="button"><b>{item.title}</b><span>{item.sub}</span>{sport === item.id && <Check size={16} />}</button>)}</div></>}
          {step === 2 && <><h1>วันนี้อยาก<br /><em>เริ่มอะไร?</em></h1><p>เราจะพาคุณไปถึงจุดเริ่มต้นนั้นทันที</p><div className="onboard-goals">{goals.map((item) => <button className={goal === item.id ? "is-selected" : ""} key={item.id} onClick={() => setGoal(item.id)} type="button"><span><b>{item.title}</b><small>{item.description}</small></span>{goal === item.id && <Check size={17} />}</button>)}</div></>}

          {error && <p className="onboard-error">{error}</p>}
          <footer className="onboard-actions">
            {step > 0 ? <button className="onboard-back" onClick={() => setStep((value) => value - 1)} type="button"><ChevronLeft size={17} /> ย้อนกลับ</button> : <span />}
            {step < 2 ? <button className="onboard-next" disabled={(step === 0 && !persona) || saving} onClick={() => setStep((value) => value + 1)} type="button">ต่อไป <ArrowRight size={17} /></button> : <button className="onboard-next" disabled={!goal || saving} onClick={() => finish(false)} type="button">{saving ? "กำลังเริ่มต้น..." : "เริ่มเส้นทางของฉัน"} <ArrowRight size={17} /></button>}
          </footer>
        </div>
      </section>
    </main>
  );
}
