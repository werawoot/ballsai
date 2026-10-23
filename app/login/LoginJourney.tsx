import { useTranslations } from "next-intl";
import { Kaushan_Script } from "next/font/google";
import { BadgeCheck, CirclePlus, ChartColumn, CircleDot, Feather, Flag, Footprints, Goal, HandFist, IdCard, MapPin, Target, TrendingUp, Trophy, Users, Volleyball, Waves, type LucideIcon } from "lucide-react";
import { LOGIN_ART } from "@/lib/stock-photos";
import type { LoginStat } from "@/lib/home-stats";

// The photo half of /login says what the site does with a match (owner, 23 Oct 2026). On a
// wide screen, as in the owner's design: the owner's athletes picture beside the line, the
// real-count stats bar and the sport tiles. On a phone: five steps from playing to the Hall
// of Fame, lit one after another. Every number is a real count (lib/home-stats loginStats);
// only football and futsal can be played on the site today, so they are marked open, the rest
// "soon", with a line that says so (AGENTS.md rules 7 and 8).
type Step = "play" | "verified" | "card" | "rank" | "hall";
type Sport = "football" | "futsal" | "basketball" | "volleyball" | "tennis" | "badminton" | "athletics" | "swimming" | "boxing";
const STEPS: [Step, LucideIcon][] = [["play", Flag], ["verified", BadgeCheck], ["card", IdCard], ["rank", TrendingUp], ["hall", Trophy]];
const SPORTS: [Sport, LucideIcon, boolean][] = [
  ["football", Goal, true], ["futsal", Goal, true], ["basketball", CircleDot, false], ["volleyball", Volleyball, false], ["tennis", Target, false],
  ["badminton", Feather, false], ["athletics", Footprints, false], ["swimming", Waves, false], ["boxing", HandFist, false],
];
// The handwritten "More Than a Game" of the design; loaded on /login only.
const script = Kaushan_Script({ weight: "400", subsets: ["latin"], display: "swap" });
const STAT_ICONS: Record<LoginStat["key"], LucideIcon> = { athletes: Users, tournaments: Trophy, results: ChartColumn, provinces: MapPin };

export function LoginJourney({ stats }: { stats: LoginStat[] }) {
  const t = useTranslations("loginPage.journey");
  const ts = useTranslations("loginPage.sports");
  const tn = useTranslations("loginPage.stats");
  return (
    <div className="lg-story">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="lg-art" src={LOGIN_ART.src} alt="" width={1400} height={1120} fetchPriority="high" />
      <p className={`lg-tagline ${script.className}`} lang="en">More Than a Game</p>
      <ol className="lg-journey" aria-label={t("label")}>
        {STEPS.map(([key, Icon], index) => (
          <li key={key} style={{ "--i": index } as React.CSSProperties}>
            <span className="lg-journey-icon" aria-hidden="true"><Icon size={20} /></span>
            <span className="lg-journey-text">{t(key)}</span>
          </li>
        ))}
      </ol>
      <dl className="lg-stats">
        {stats.map(({ key, value }) => {
          const Icon = STAT_ICONS[key];
          return <div key={key}><Icon size={26} aria-hidden="true" /><dt>{tn(key)}</dt><dd className="gl-num">{value.toLocaleString("en-US")}</dd></div>;
        })}
      </dl>
      <ul className="lg-sports" aria-label={ts("label")}>
        {SPORTS.map(([key, Icon, open]) => (
          <li key={key} className={open ? "is-open" : undefined}>
            <Icon size={26} aria-hidden="true" /><span>{ts(key)}</span>{open ? <small>{ts("open")}</small> : <small>{ts("soon")}</small>}
          </li>
        ))}
        <li className="is-more"><CirclePlus size={26} aria-hidden="true" /><span>{ts("more")}</span></li>
      </ul>
      <p className="lg-sports-note">{ts("note")}</p>
    </div>
  );
}
