"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Building2, Check, ChevronLeft, Compass, Handshake, IdCard, Search, Trophy, UsersRound, Warehouse, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase";
import LanguageSwitch from "@/components/LanguageSwitch";
import BrandMark from "@/components/BrandMark";
import GuardianSteps from "@/components/GuardianSteps";
import { guardianStepsApply } from "@/lib/guardian-steps";
import { ACTIVE_SPORT } from "@/lib/season";
import "./welcome.css";

type Persona = "athlete" | "guardian" | "coach_organizer" | "venue_owner" | "sponsor_brand";
type Goal = "player_card" | "find_competitions" | "follow_athlete" | "discover_talent" | "manage_venue" | "support_athletes";

// Titles and descriptions live in messages/*.json under onboarding.personas / .goals.
const personas: Array<{ id: Persona; icon: LucideIcon }> = [
  { id: "athlete", icon: Trophy },
  { id: "guardian", icon: UsersRound },
  { id: "coach_organizer", icon: Compass },
  { id: "venue_owner", icon: Building2 },
  { id: "sponsor_brand", icon: Handshake },
];

const goals: Record<Goal, { path: string; icon: LucideIcon }> = {
  player_card: { path: "/card", icon: IdCard },
  find_competitions: { path: "/tournaments", icon: Trophy },
  follow_athlete: { path: "/athletes", icon: UsersRound },
  discover_talent: { path: "/athletes", icon: Search },
  manage_venue: { path: "/venue", icon: Warehouse },
  support_athletes: { path: "/sponsor", icon: Handshake },
};

// The goals that make sense for each role, the first one recommended. Every goal stays
// reachable from somewhere else in the app; this only keeps the first choice short.
const goalsFor: Record<Persona, Goal[]> = {
  athlete: ["player_card", "find_competitions", "discover_talent"],
  guardian: ["follow_athlete", "find_competitions"],
  coach_organizer: ["find_competitions", "discover_talent"],
  venue_owner: ["manage_venue", "find_competitions"],
  sponsor_brand: ["support_athletes", "discover_talent"],
};

const sports = [
  { id: "football", sub: "FOOTBALL" },
  { id: "futsal", sub: "FUTSAL" },
  { id: "other", sub: "COMING SOON" },
] as const;

const destinationOf = (persona: Persona | null, goal: Goal) => persona === "guardian" && goal === "follow_athlete" ? "/guardian" : goals[goal].path;

export default function OnboardingFlow({ email, nextPath, userId }: { email: string; nextPath: string; userId: string }) {
  const router = useRouter();
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const [step, setStep] = useState(0);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [sport, setSport] = useState<string>(ACTIVE_SPORT);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const name = email.split("@")[0] ?? "";
  const choices = persona ? goalsFor[persona] : [];

  const choosePersona = (id: Persona) => {
    setPersona(id);
    // The recommended first step for this role, so "next" never lands on an empty choice.
    setGoal(goalsFor[id][0]);
  };

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

    router.replace(skip || !goal ? nextPath : destinationOf(persona, goal));
    router.refresh();
  };

  // Thai runs the two halves together; English needs the space.
  const title = (key: "persona" | "sport" | "goal") => [t(`${key}.titleTop`), t(`${key}.titleBottom`)].join(locale === "th" ? "" : " ");

  return (
    <main className="wb ui-dark">
      <div className="wb-shell">
        <header className="wb-header">
          {step === 0
            ? <Link className="ui-brand" href="/" aria-label="BallDoenSai.com"><BrandMark size={24} /><span className="wb-brand-text">BallDoenSai.com</span></Link>
            : <button className="wb-back" onClick={() => setStep((value) => value - 1)} type="button" aria-label={t("back")}><ChevronLeft size={22} /></button>}
          <div className="wb-header-end">
            {/* The first screen after sign-up: someone who cannot read Thai must be able to switch here. */}
            <LanguageSwitch />
            <button className="wb-skip" disabled={saving} onClick={() => finish(true)} type="button">{t("skip")}</button>
          </div>
        </header>

        <div className="ui-progress wb-progress" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step + 1} aria-label={t("progress", { step: step + 1, total: 3 })}>
          {[0, 1, 2].map((item) => <i className={item <= step ? "is-on" : ""} key={item} />)}
        </div>

        <div className="wb-body">
          <p className="ui-eyebrow">{step === 0 ? (name ? t("hello", { name }) : t("helloNoName")) : t("progress", { step: step + 1, total: 3 })}</p>
          {step === 0 && <>
            <h1 className="ui-h1">{title("persona")}</h1>
            <p className="wb-intro">{t("persona.intro")}</p>
            <div className="wb-options">
              {personas.map(({ id, icon: Icon }) => <button aria-pressed={persona === id} className={`ui-option${persona === id ? " is-selected" : ""}`} key={id} onClick={() => choosePersona(id)} type="button">
                <span className="ui-option-icon"><Icon size={22} /></span>
                <span className="ui-option-text"><b>{t(`personas.${id}.title`)}</b><small>{t(`personas.${id}.description`)}</small></span>
                <span className="ui-option-tick">{persona === id && <Check size={14} strokeWidth={3.5} />}</span>
              </button>)}
            </div>
          </>}

          {step === 1 && <>
            <h1 className="ui-h1">{title("sport")}</h1>
            <p className="wb-intro">{t("sport.intro")}</p>
            <div className="wb-options">
              {sports.map((item) => <button aria-pressed={sport === item.id} className={`ui-option${sport === item.id ? " is-selected" : ""}`} key={item.id} onClick={() => setSport(item.id)} type="button">
                <span className="ui-option-text"><b>{t(`sports.${item.id}`)}</b><small className="wb-sub">{item.sub}</small></span>
                <span className="ui-option-tick">{sport === item.id && <Check size={14} strokeWidth={3.5} />}</span>
              </button>)}
            </div>
          </>}

          {step === 2 && <>
            <h1 className="ui-h1">{title("goal")}</h1>
            <p className="wb-intro">{t("goal.intro")}</p>
            <div className="wb-options">
              {choices.map((id, index) => {
                const Icon = goals[id].icon;
                const destination = persona === "guardian" && id === "follow_athlete" ? "follow_athlete_guardian" : id;
                return <button aria-pressed={goal === id} className={`ui-option${goal === id ? " is-selected" : ""}`} key={id} onClick={() => setGoal(id)} type="button">
                  <span className="ui-option-icon"><Icon size={22} /></span>
                  <span className="ui-option-text"><b>{t(`goals.${id}.title`)}</b><small>{t(`goals.${id}.description`)}</small><span className="wb-dest">→ {t(`destinations.${destination}`)}{index === 0 ? ` · ${t("recommended")}` : ""}</span></span>
                  <span className="ui-option-tick">{goal === id && <Check size={14} strokeWidth={3.5} />}</span>
                </button>;
              })}
            </div>
            {/* The goal that sends a parent to /guardian: say what they will need first. */}
            {guardianStepsApply(persona, goal) && <div style={{ marginTop: 16 }}><GuardianSteps tone="dark" /></div>}
          </>}

          {error && <p className="wb-error" role="alert">{error}</p>}
        </div>

        <footer className="wb-footer">
          {step < 2
            ? <button className="ui-btn ui-btn-primary" disabled={(step === 0 && !persona) || saving} onClick={() => setStep((value) => value + 1)} type="button">{t("next")} <ArrowRight size={18} /></button>
            : <button className="ui-btn ui-btn-primary" disabled={!goal || saving} onClick={() => finish(false)} type="button">{saving ? t("starting") : t("finish")} <ArrowRight size={18} /></button>}
        </footer>
      </div>
    </main>
  );
}
