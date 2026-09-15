# Sponsor / Brand Flow — v1

Sponsor/Brand v1 is a consent-respecting opportunity board, not a marketplace or direct
messaging tool.

1. A signed-in brand creates one Brand Profile at `/sponsor`.
2. The brand creates a public sponsorship opportunity. It names the sport, area, intended
   age range, benefit and optional deadline.
3. `/sponsorships` shows open opportunities publicly. It contains no athlete data.
4. An athlete who has deliberately made a public athlete profile may submit an interest
   from an opportunity. A public minor profile already requires recorded guardian consent.
5. The brand sees only the athlete's public identity and their opt-in message in its own
   dashboard. The app does not reveal email, phone, guardian data, private highlights or
   other private profile data.

Out of scope for v1: brand verification, direct messages, contracts, payment, automatic
shortlisting, outreach to athletes, and any offer acceptance. A human team must review
any real commercial contact involving a minor outside the app, with guardian involvement.

Apply `sql/27-sponsor-brand-opportunities-v1.sql` after SQL 26 before deploying this
flow. It must be applied only to Supabase project `hivedzrwrrcnjrlirhtv`.
