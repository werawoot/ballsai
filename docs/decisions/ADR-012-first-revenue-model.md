# ADR-012 - First Revenue Model: Organizers Pay per Tournament

**Status:** Proposed. The owner agreed every answer below in a design interview on
20 Oct 2026 (the `grilling` skill, 20 questions over four rounds, each "ใช่ทั้งหมด ตามที่แนะนำ").
It becomes Accepted when the owner confirms the summary ("ยืนยัน ADR-012").
**Builds on:** `docs/research/revenue-options-2026-10.md` (facts from search extracts of the
owners' pages; not opened in full; not legal, tax or financial advice).

## Context

The platform earns nothing today. The sponsor board is free (`docs/sponsor-brand-flow-v1.md`),
the BDS Wallet has no money value (`sql/29-bds-wallet-v1.sql`), and team registration slips
are paid straight to organizers. Most users are minors. The owner operates as an individual;
no company is registered yet.

## Decision

### Who pays, and what never costs money (Q1, Q2, Q4, Q9)

- The first paying customer is the **tournament organizer** (association, school, league).
- **No display advertising** (AdSense or any targeted ads). Google's child-directed treatment
  turns off interest-based ads, revenue would be low, and tracking a minor needs guardian
  consent under PDPA s. 19–20 (research note, Q1).
- Athletes and guardians never pay for the athlete identity: card, Power Rating, playing
  history, Hall of Fame, join links, notifications.
- Every tournament size gets the same features. Anything that reaches an athlete (roster
  verification, result recording, Power Rating, notifications) is never behind a payment.

### Price shape (Q7, Q8, Q13)

- A **one-off fee per tournament, by size band**. Not per team, not a subscription for now;
  a yearly plan for associations may come later.
- A tournament of **up to 8 teams is free, always**. Every organizer who joins during the
  test period uses the platform free for the **2026 season**.
- Prices are set **after asking real W1 organizers** (a short questionnaire, `to-questionnaire`).
  Starting points to ask about, invented by the agent and not sourced: up to 16 teams
  490 THB, up to 32 teams 990 THB, over 32 teams 1,990 THB, per tournament.

### Money flow (Q3, Q11, Q12, Q14, Q17)

- The company **never holds money for anyone else**. Team entry fees keep going straight to
  organizers; the company charges its own fee separately. Collecting and passing on other
  people's money may need a Bank of Thailand licence (research note, Q2; to be confirmed by a
  lawyer).
- For the same reason there is **no commission on venue bookings**. Charging venue owners, if
  ever, would be a monthly service fee, decided later.
- Payment goes through **Opn Payments (Omise)**, PromptPay QR or card, **confirmed
  automatically** by the provider's webhook. No person checks a slip by hand (nationwide
  question 4). Published price to re-check before signing up: card 3.65%, PromptPay 1.65%,
  plus VAT.
- The fee is paid **before registration opens beyond 8 teams**. Unpaid, the tournament stays
  capped at 8 teams. Nothing an athlete has (results, Power Rating, card, history) is ever
  deleted or hidden because of a payment.
- **Refund**: in full if the tournament is cancelled before its first match; none after that.
  Provider fees already paid are the company's cost.

### Order of revenue streams (Q15, Q16)

1. Organizer fee (this ADR).
2. Paid sponsorship (tournament sponsor, logo on the Hall of Fame), only once organizer
   payments run smoothly. Brands receive no data about any child.
3. Family items (printed card, certificate), later still. Only a guardian buys; no buy
   prompt appears on a child's pages (a minor's purchase without consent is voidable, Civil
   and Commercial Code s. 21, research note Q4).

### Prerequisites (Q5, Q10, Q18, Q19)

No payment code is written until all of these hold:

1. Closed beta W1 has ended and a real organizer has run a whole tournament on the platform.
2. **Organizer role request and admin approval in the app** is built (today `profiles.role`
   is set by hand in the SQL Editor, a manual step that grows with organizers).
3. The owner has registered a **limited company** (บริษัทจำกัด) (organizations expect a
   receipt from a juristic person; Omise asks for a DBD certificate).
4. A Thai lawyer has answered the Bank of Thailand licence question in the research note.
5. A Thai accountant has advised on VAT (registration at 1.8M THB a year) and receipts.
6. The owner has re-checked Omise's live pricing page and opened an account.

The agent can prepare step-by-step scripts for 3–6 with the `wizard` skill.

## Consequences

- Revenue starts only after W1 and the company exists; until then, the work is the organizer
  role flow (needed anyway before W1 grows past 5 testers) and the price questionnaire.
- Free tiers keep small schools and community tournaments nationwide on the platform.
- The money flow avoids holding third-party funds, avoids selling to children, and keeps
  minors' data out of every paid product.
- Open for later decisions: yearly plans for associations; venue-owner fee; how sponsorship
  is priced; who in an organizer's team may pay.
