"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Building2, Check, ChevronLeft, ClipboardList, Compass, Handshake, Trophy, UsersRound, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase";
import LanguageSwitch from "@/components/LanguageSwitch";
import BrandMark from "@/components/BrandMark";
import GuardianSteps from "@/components/GuardianSteps";
import { guardianStepsApply } from "@/lib/guardian-steps";
import { CHOICES, destinationFor, goalFor, personaOf, savedAnswers, type Choice } from "@/lib/onboarding";
import { ACTIVE_SPORT } from "@/lib/season";
import "./welcome.css";

// Two screens (UX report 8, mockups 1-2): who you are, which sport. Tapping a role goes straight
// on; the last button names where it leads. Titles and descriptions live in messages/*.json
// under onboarding.*; what is saved and where it leads is in lib/onboarding.ts.
const icons: Record<Choice, LucideIcon> = {
  athlete: Trophy,
  guardian: UsersRound,
  coach: Compass,
  organizer: ClipboardList,
  venue_owner: Building2,
  sponsor_brand: Handshake,
};

const sports = ["football", "futsal", "other"] as const;
const TOTAL = 2;

export default function OnboardingFlow({ nextPath, userId }: { email: string; nextPath: string; userId: string }) {
  const router = useRouter();
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const [step, setStep] = useState(0);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [sport, setSport] = useState<string>(ACTIVE_SPORT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const finish = async (skip = false) => {
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ onboarding_completed_at: new Date().toISOString(), ...savedAnswers(choice, sport, skip) })
      .eq("id", userId);

    if (profileError) {
      setError(t("saveSettingsFailed", { message: profileError.message }));
      setSaving(false);
      return;
    }

    if (!skip && choice && personaOf(choice) === "athlete") {
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

    router.replace(skip || !choice ? nextPath : destinationFor(choice));
    router.refresh();
  };

  const pick = (next: Choice) => {
    setChoice(next);
    setStep(1);
  };
  const sportTitle = choice === "athlete" ? "athlete" : choice === "guardian" ? "guardian" : "other";

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

        <div className="ui-progress wb-progress" role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL} aria-valuenow={step + 1} aria-label={t("progress", { step: step + 1, total: TOTAL })}>
          {[0, 1].map((item) => <i className={item <= step ? "is-on" : ""} key={item} />)}
        </div>

        <div className="wb-body">
          <p className="ui-eyebrow">{t("progress", { step: step + 1, total: TOTAL })}</p>
          {step === 0 && <>
            {/* Thai runs the two halves together; English needs the space. */}
            <h1 className="ui-h1">{[t("persona.titleTop"), t("persona.titleBottom")].join(locale === "th" ? "" : " ")}</h1>
            <p className="wb-intro">{t("persona.intro")}</p>
            <div className="wb-options">
              {CHOICES.map((id) => {
                const Icon = icons[id];
                return <button aria-pressed={choice === id} className={`ui-option${choice === id ? " is-selected" : ""}`} key={id} onClick={() => pick(id)} type="button">
                  <span className="ui-option-icon"><Icon size={22} /></span>
                  <span className="ui-option-text"><b>{t(`personas.${id}.title`)}</b><small>{t(`personas.${id}.description`)}</small></span>
                  <span className="ui-option-tick">{choice === id && <Check size={14} strokeWidth={3.5} />}</span>
                </button>;
              })}
            </div>
            <p className="wb-hint">{t("persona.hint")}</p>
          </>}

          {step === 1 && choice && <>
            <h1 className="ui-h1">{t(`sport.titleFor.${sportTitle}`)}</h1>
            <p className="wb-intro">{t("sport.intro")}</p>
            <div className="wb-options">
              {sports.map((item) => <button aria-pressed={sport === item} className={`ui-option${sport === item ? " is-selected" : ""}`} key={item} onClick={() => setSport(item)} type="button">
                <span className="ui-option-text"><b>{t(`sports.${item}`)}</b>{item === "other" && <small>{t("sports.soon")}</small>}</span>
                <span className="ui-option-tick">{sport === item && <Check size={14} strokeWidth={3.5} />}</span>
              </button>)}
            </div>
            {/* The goal that sends a parent to /guardian: say what they will need first. */}
            {guardianStepsApply(personaOf(choice), goalFor(choice)) && <div style={{ marginTop: 16 }}><GuardianSteps tone="dark" /></div>}
          </>}

          {error && <p className="wb-error" role="alert">{error}</p>}
        </div>

        {step === 1 && choice && <footer className="wb-footer">
          <button className="ui-btn ui-btn-primary" disabled={saving} onClick={() => finish(false)} type="button">{saving ? t("starting") : t(`finish.${choice}`)} <ArrowRight size={18} /></button>
          <p className="wb-next-note">{t(`nextNote.${choice}`)}</p>
        </footer>}
      </div>
    </main>
  );
}
