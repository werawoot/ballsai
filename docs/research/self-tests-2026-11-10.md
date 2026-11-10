# Self-tests for the athlete MVP (ADR-015 "To build" item 2), 10 Nov 2026

**Question.** Which three or four before-and-after tests can a child aged about 10–17 do
safely at home, alone or with a family member, with a phone and a tape measure, so the
Progress page can show real improvement for each training goal (ADR-015, owner 8 Nov 2026)?

**Method.** Web search for primary studies and test batteries (10 Nov 2026). Abstracts and
publisher or index pages were read; full texts were not, so exact coefficients are quoted only
where the abstract or index page states them. Nothing here is medical advice: a licensed coach or
physiotherapist reviews the tests together with the programmes before children use them.

## Candidates

| Test | Goal it serves | Evidence | Verdict |
| --- | --- | --- | --- |
| **Preferred-foot juggling**: count of touches before the ball drops, best of 3 tries | Better ball control | In 52 U-14 boys tested a week apart, right-foot juggling met the criteria for satisfactory relative and absolute reliability; left-foot and chest-head-foot juggling did not ([Padrón-Cabo et al. 2019, *Perceptual and Motor Skills* 126(5), PMID 31362581](https://www.pubmed.gov/31362581/)). Juggling scores showed little relation to match ability in U12 and university players ([Football Science 11, J-STAGE](https://www.jstage.jst.go.jp/article/jssfenfs/11/0/11_18/_article/-char/en)). | **Use**, labelled as a skill count, never as "how good a player you are". Preferred foot only. |
| **Forearm plank hold**: seconds held with a straight body, one try | Stronger, fewer injuries | Used in the US National Youth Fitness Survey 2012 for ages 6–15 ([CDC NCHS Data Brief 139](https://www.cdc.gov/nchs/data/databriefs/db139.pdf); [Pediatrics 2014, PMID 25157016](https://pubmed.ncbi.nlm.nih.gov/25157016/)). Acceptable reliability in 8–12-year-olds (test-retest ICC 0.63, intrarater 0.83; [Boyer et al. 2013, record](https://rawdatalibrary.net/rdl/publication/feasibility-validity-and-reliability-of-the-plank-isometric-hold-as-a-field-based-assessment-of-torso-muscular-endurance-for-children-812-years-of-age)), and highly reliable in 6–16-year-olds (ICC about 0.62–0.90; [Lemes et al. 2023, Sport Sciences for Health](https://link.springer.com/article/10.1007/s11332-023-01136-x)). Almost every child scores above zero. | **Use**. Stop at the first loss of form or any pain. |
| **Standing long jump**: distance from the toe line to the back of the nearer heel, best of 2 | Faster and more agile (leg power) | Part of the ALPHA health-related fitness battery for children and adolescents, judged valid, reliable, feasible and safe ([Ruiz et al. 2011, *Br J Sports Med*, ALPHA battery](https://ipv6.topendsports.com/testing/alpha.htm)). Strongly related to other lower-body power tests in 6–17-year-olds, proposed as a general index of muscular fitness ([Castro-Piñero et al. 2010, *J Strength Cond Res*](https://investigadores.anid.cl//es/public_search/work?id=440514)). PE teachers measuring twice a week apart found a small average shift between trials (3.8 ± 12.7 cm; [España-Romero et al., feasibility and reliability](https://idus.us.es/bitstream/11441/99513/1/feasibility_reliability_disabilities.pdf)). | **Use**, named honestly as leg power ("พลังขา"), not speed. Soft, non-slip landing surface only. |
| Sprint 10–20 m, timed by hand or phone | Faster | Hand timing tracks electronic timing only with experienced raters, and needs about a 5% change to exceed error; the one validated phone app was tested in five adults, and no youth study at 20 m was found ([PMC4972912](https://pmc.ncbi.nlm.nih.gov/articles/PMC4972912); [Photo Finish app, *Sensors* 2024](https://doaj.org/article/99ee6b865bac4e5bb51a446d7c4c15f0)). | **Not now.** A child alone cannot time it, and the error is larger than a month's improvement. |
| Flamingo (one-leg) balance | Fewer injuries | Mixed: poor reproducibility in 5–7-year-olds and unsatisfactory in some pre-adolescent samples; a modified version scored well ([PMC7432309](https://pmc.ncbi.nlm.nih.gov/articles/PMC7432309)). | **Not now.** |
| — | Train regularly | No test needed: the share of planned sessions done is already recorded (SQL63). | Use the existing count. |

## Chosen set (owner, 10 Nov 2026: "ใช้ 3 แบบนี้เลย"), pending the coach review

1. **Juggling**, preferred foot, best of 3, every 4 weeks.
2. **Plank hold**, one try, every 4 weeks.
3. **Standing long jump**, best of 2, every 4 weeks.
4. Train regularly: sessions done ÷ sessions planned, shown already on `/progress`.

All three are done after the programme's own warm-up, behind the same pain question as a
session ("Any pain right now?" → stop), with a one-screen illustrated how-to. Results are the
athlete's own numbers, compared only with their own last result, labelled "บันทึกเอง", never
ranked against other children, never on the card, and never feeding Power Rating (AGENTS.md
rule 8, ADR-015).

## What a build would need

- A new SQL file for `athlete_self_tests` (test key, value, unit, date), owner-only like SQL63,
  one result per test per day, stored as entered, no free text.
- Our own Thai instructions and 3D pictures, as for drills (no copied test manuals or media).
- Coach or physiotherapist sign-off on the three protocols and the safety wording before release.

## Open questions for the reviewing coach

- Plank: a time cap (for example 2 minutes) for younger children?
- Long jump: should under-12s jump at all at home, and on which surfaces?
- Juggling: allow the thigh, or feet only?
