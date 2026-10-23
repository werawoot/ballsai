import { useTranslations } from "next-intl";
import { BadgeCheck, Bike, CircleDot, Flag, Footprints, Goal, IdCard, Target, TrendingUp, Trophy, Volleyball, Waves, type LucideIcon } from "lucide-react";

// The photo half of /login says what the site does with a match (owner, 23 Oct 2026): five
// steps from playing to the Hall of Fame, lit one after another, and the sports around them.
// No number and no person: nothing here belongs to anyone (AGENTS.md rules 7 and 8). Only
// football and futsal can be played on the site today, so they are marked open and the rest
// "soon", with a line that says so.
type Step = "play" | "verified" | "card" | "rank" | "hall";
type Sport = "football" | "futsal" | "basketball" | "volleyball" | "athletics" | "swimming" | "badminton" | "cycling";
const STEPS: [Step, LucideIcon][] = [["play", Flag], ["verified", BadgeCheck], ["card", IdCard], ["rank", TrendingUp], ["hall", Trophy]];
const SPORTS: [Sport, LucideIcon, boolean][] = [
  ["football", Goal, true], ["futsal", Goal, true], ["basketball", CircleDot, false], ["volleyball", Volleyball, false],
  ["athletics", Footprints, false], ["swimming", Waves, false], ["badminton", Target, false], ["cycling", Bike, false],
];

export function LoginJourney() {
  const t = useTranslations("loginPage.journey");
  const ts = useTranslations("loginPage.sports");
  return (
    <div className="lg-story">
      <ol className="lg-journey" aria-label={t("label")}>
        {STEPS.map(([key, Icon], index) => (
          <li key={key} style={{ "--i": index } as React.CSSProperties}>
            <span className="lg-journey-icon" aria-hidden="true"><Icon size={20} /></span>
            <span className="lg-journey-text">{t(key)}</span>
          </li>
        ))}
      </ol>
      <ul className="lg-sports" aria-label={ts("label")}>
        {SPORTS.map(([key, Icon, open], index) => (
          <li key={key} className={open ? "is-open" : undefined} style={{ "--i": index } as React.CSSProperties}>
            <Icon size={16} aria-hidden="true" />{ts(key)}{!open && <span className="lg-sr"> ({ts("soon")})</span>}
          </li>
        ))}
      </ul>
      <p className="lg-sports-note">{ts("note")}</p>
    </div>
  );
}
