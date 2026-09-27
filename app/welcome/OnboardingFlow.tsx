"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, Building2, Check, ChevronLeft, Compass, Handshake, Sparkles, Trophy, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase";
import LanguageSwitch from "@/components/LanguageSwitch";
import { ACTIVE_SPORT } from "@/lib/season";

type Persona = "athlete" | "guardian" | "coach_organizer" | "venue_owner" | "sponsor_brand";
type Goal = "player_card" | "find_competitions" | "follow_athlete" | "discover_talent" | "manage_venue" | "support_athletes";

// Titles and descriptions live in messages/*.json under onboarding.personas / .goals.
const personas: Array<{ id: Persona; icon: typeof Trophy }> = [
  { id: "athlete", icon: Trophy },
  { id: "guardian", icon: UsersRound },
  { id: "coach_organizer", icon: Compass },
  { id: "venue_owner", icon: Building2 },
  { id: "sponsor_brand", icon: Handshake },
];

const goals: Array<{ id: Goal; path: string }> = [
  { id: "player_card", path: "/card" },
  { id: "find_competitions", path: "/tournaments" },
  { id: "follow_athlete", path: "/athletes" },
  { id: "discover_talent", path: "/athletes" },
  { id: "manage_venue", path: "/venue" },
  { id: "support_athletes", path: "/sponsor" },
];

const sports = [
  { id: "football", sub: "FOOTBALL" },
  { id: "futsal", sub: "FUTSAL" },
  { id: "other", sub: "COMING SOON" },
] as const;

export default function OnboardingFlow({ email, nextPath, userId }: { email: string; nextPath: string; userId: string }) {
  const router = useRouter();
  const t = useTranslations("onboarding");
  const [step, setStep] = useState(0);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [sport, setSport] = useState(ACTIVE_SPORT);
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
      setError(t("saveSettingsFailed", { message: profileError.message }));
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
          setError(t("saveAthleteFailed", { message: athleteError.message }));
          setSaving(false);
          return;
        }
      }
    }

    const destination = persona === 'guardian' && goal === 'follow_athlete'
      ? '/guardian'
      : (selectedGoal?.path ?? nextPath)
    router.replace(skip ? nextPath : destination);
    router.refresh();
  };

  return (
    <main className="onboard-page">
      <div className="onboard-orbit onboard-orbit-one" />
      <div className="onboard-orbit onboard-orbit-two" />
      <section className="onboard-shell">
        <header className="onboard-header">
          <div className="onboard-brand"><Trophy size={20} /> BallDoenSai<span>.com</span></div>
          {/* The first screen after sign-up: someone who cannot read Thai must be able to switch here. */}
          <div className="onboard-header-end">
            <LanguageSwitch />
            <button className="onboard-skip" disabled={saving} onClick={() => finish(true)} type="button">{t("skip")} <ArrowRight size={15} /></button>
          </div>
        </header>

        <div className="onboard-progress" aria-label={t("progress", { step: step + 1, total: 3 })}>
          {[0, 1, 2].map((item) => <i className={item <= step ? "is-active" : ""} key={item} />)}
        </div>

        <div className="onboard-content">
          <p className="onboard-kicker"><Sparkles size={14} /> WELCOME, {email.split("@")[0]?.toUpperCase() || "PLAYER"}</p>
          {step === 0 && <><h1>{t("persona.titleTop")}<br /><em>{t("persona.titleBottom")}</em></h1><p>{t("persona.intro")}</p><div className="onboard-options">{personas.map(({ id, icon: Icon }) => <button className={persona === id ? "is-selected" : ""} key={id} onClick={() => setPersona(id)} type="button"><Icon size={24} /><span><b>{t(`personas.${id}.title`)}</b><small>{t(`personas.${id}.description`)}</small></span>{persona === id && <Check size={17} />}</button>)}</div></>}
          {step === 1 && <><h1>{t("sport.titleTop")}<br /><em>{t("sport.titleBottom")}</em></h1><p>{t("sport.intro")}</p><div className="onboard-sports">{sports.map((item) => <button className={sport === item.id ? "is-selected" : ""} key={item.id} onClick={() => setSport(item.id)} type="button"><b>{t(`sports.${item.id}`)}</b><span>{item.sub}</span>{sport === item.id && <Check size={16} />}</button>)}</div></>}
          {step === 2 && <><h1>{t("goal.titleTop")}<br /><em>{t("goal.titleBottom")}</em></h1><p>{t("goal.intro")}</p><div className="onboard-goals">{goals.map((item) => <button className={goal === item.id ? "is-selected" : ""} key={item.id} onClick={() => setGoal(item.id)} type="button"><span><b>{t(`goals.${item.id}.title`)}</b><small>{t(`goals.${item.id}.description`)}</small></span>{goal === item.id && <Check size={17} />}</button>)}</div></>}

          {error && <p className="onboard-error">{error}</p>}
          <footer className="onboard-actions">
            {step > 0 ? <button className="onboard-back" onClick={() => setStep((value) => value - 1)} type="button"><ChevronLeft size={17} /> {t("back")}</button> : <span />}
            {step < 2 ? <button className="onboard-next" disabled={(step === 0 && !persona) || saving} onClick={() => setStep((value) => value + 1)} type="button">{t("next")} <ArrowRight size={17} /></button> : <button className="onboard-next" disabled={!goal || saving} onClick={() => finish(false)} type="button">{saving ? t("starting") : t("finish")} <ArrowRight size={17} /></button>}
          </footer>
        </div>
      </section>
    </main>
  );
}
