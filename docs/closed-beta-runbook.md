# BallDoenSai.com Closed Beta Runbook

Use this checklist before inviting real organizers and athletes. Closed beta runs on
real database data only — never on the demo fallback.

Document status: updated **11 August 2026**, verified against the SQL files and
route handlers in this repository.

Reading order: `README.md` first (vision, status, routes), then this runbook
(operations). Section 6 is the W1 pilot script and is written in Thai because the
testers read it directly.

---

## 1. Production Environment

Set these values in Vercel or the production host:

```bash
NEXT_PUBLIC_SUPABASE_URL=<production_supabase_url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<production_supabase_anon_key>
NEXT_PUBLIC_SHOW_DEMO_DATA=false
RESEND_API_KEY=<resend_api_key>
RESEND_FROM_EMAIL=BallDoenSai.com <verified-sender@your-domain.com>
UPSTASH_REDIS_REST_URL=<upstash_redis_rest_url>
UPSTASH_REDIS_REST_TOKEN=<upstash_redis_rest_token>

# Optional. Defaults to football / 2026.
NEXT_PUBLIC_ACTIVE_SPORT=football
NEXT_PUBLIC_ACTIVE_SEASON=2026
```

Notes:

- `NEXT_PUBLIC_ACTIVE_SPORT` and `NEXT_PUBLIC_ACTIVE_SEASON` define the competition
  window every ranking, result and card query uses (`lib/season.ts`). They are build-time
  public values, so rolling into a new season means setting the variable and
  redeploying. Leave them unset during W1 to keep the current window.

- Demo data appears **only** when `NEXT_PUBLIC_SHOW_DEMO_DATA` is exactly `true`
  (`lib/sample-data.ts`). Leaving it unset behaves like `false`. Setting it
  explicitly to `false` is still recommended so the intent is visible in Vercel.
- Without `RESEND_API_KEY` / `RESEND_FROM_EMAIL`, team confirm/reject email is
  skipped silently and logged as `team_status_email_failed`. The team status in the
  database still changes.
- Without the Upstash pair, rate limiting falls back to per-instance memory, which
  does not hold across Vercel instances. Acceptable for local development only.
- Google OAuth client ID/secret live in the Supabase Auth provider dashboard, never
  in these variables and never in the repository.
- `npm run verify:production` fails unless all six variables above are present and
  demo data is not `true`. Run it with the production values loaded in the shell.

---

## 2. Confirm The Target Supabase Project

Every SQL statement below must run against project ref **`hivedzrwrrcnjrlirhtv`**
(`Ballsai`). Before opening the SQL editor, confirm the project ref in the Supabase
URL matches, and that it matches `NEXT_PUBLIC_SUPABASE_URL` in production.

Do not apply any of these files to another project. Do not edit production rows by
hand in the dashboard — schema changes go into a new migration file in `sql/`.

---

## 3. Apply Supabase SQL

Apply in this exact order from the Supabase SQL editor. The order matters: the
identity triggers depend on tables created by earlier files, and
`production-hardening.sql` must run last because it tightens the storage policy that
the base RLS file leaves permissive.

| # | File | Purpose | Depends on |
| ---: | --- | --- | --- |
| 1 | `sql/check-duplicates-before-unique-indexes.sql` | Reports rows that would break the unique indexes | — |
| 2 | *(manual)* | Fix any duplicate rows the check reported | — |
| 3 | `sql/supabase-rls.sql` | Base RLS, `is_admin()` / `is_organizer()`, core indexes | — |
| 4 | `sql/fix-profile-auth-trigger.sql` | `handle_new_user()` trigger + backfill so every auth user has a `profiles` row | 3 |
| 5 | `sql/ballsai-rating-v1.sql` | `player_ratings`, `match_results`, `match_player_performances`, `rating_events` | 3 |
| 6 | `sql/athlete-profile-v2.sql` | `athlete_profiles`, videos, achievements, skill assessments, `athlete-avatars` bucket | 3 |
| 7 | `sql/link-player-ranks-to-profiles.sql` | `player_ranks.player_id` FK to `profiles` + unique index per player/sport/season | 3, 6 |
| 8 | `sql/digital-identity-v1.sql` | `athlete_progress`, `athlete_xp_events`, `athlete_badges`, XP/badge trigger on `rating_events`, one-time backfill | 5, 6 |
| 9 | `sql/digital-identity-v2-hall.sql` | `rookie` badge, badge→achievement sync, `hall_of_fame_entries` | 8 |
| 10 | `sql/athlete-highlight-uploads-v1.sql` | `athlete_highlights` + private `athlete-highlights` bucket and policies | 6 |
| 11 | `sql/onboarding-v1.sql` | `profiles.onboarding_persona / _sport / _goal / _completed_at` | 3 |
| 12 | `sql/production-hardening.sql` | Makes `slips` private, replaces the public slip read policy, adds `register_team_safely`, `confirm_payment_safely`, `record_match_result_safely`, discovery indexes | 3, 5 |
| 13 | `sql/match-result-void-v1.sql` | `void_match_result_safely()` so a mistyped result can be reversed together with its rating, XP and badges | 9, 12 |
| 14 | `sql/guardian-consent-enforcement-v1.sql` | Blocks a public athlete profile without a birth date, and a minor's public profile without guardian consent, at the database level | 6 |
| 15 | `sql/highlight-moderation-v1.sql` | Report queue, hide/unhide state for uploaded highlights, and storage reads that follow the hidden state | 10 |

Files that must **not** be applied during closed beta:

- `sql/supabase-rls-private-slips.sql` — a standalone alternative to
  `sql/supabase-rls.sql` for an install that stops at the base file. Step 12 already
  makes slips private with a newer version of the same policy. Applying this file
  after step 12 would overwrite the optimized `profiles` policies from step 4 with
  older equivalents. Skip it unless you are deliberately doing a base-only install.
- `sql/sample-data.sql` — demo rows. Closed beta runs on real data only.

After applying, confirm the identity chain is live:

```sql
select tgname from pg_trigger where tgname in (
  'on_auth_user_created',
  'rating_event_sync_athlete_identity',
  'athlete_badge_sync_achievement',
  'athlete_profile_create_rookie_identity'
);

select tgname from pg_trigger
where tgname = 'athlete_profiles_guardian_consent_guard';

select proname from pg_proc where proname in (
  'register_team_safely', 'confirm_payment_safely', 'record_match_result_safely',
  'void_match_result_safely'
);
```

Five triggers and four functions must come back.

---

## 4. Storage Buckets

| Bucket | Public | Limit | MIME | Created by |
| --- | --- | --- | --- | --- |
| `slips` | **private** | — | JPG/PNG/WEBP enforced in the API | **Create manually** in Storage; step 12 sets `public = false` |
| `athlete-avatars` | public | 5 MB | JPG, PNG, WEBP | `sql/athlete-profile-v2.sql` |
| `athlete-highlights` | **private** | 25 MB | JPG, PNG, WEBP, MP4, WEBM | `sql/athlete-highlight-uploads-v1.sql` |

No SQL file creates the `slips` bucket. Create it in the Supabase Storage UI before
the first slip upload, then re-run step 12 (or the single `update storage.buckets`
statement) so it is private.

### How slips are served

Payment evidence is never a public URL. `app/api/teams/[teamId]/payment/route.ts`
stores only the object path (`<user_id>_<team_id>_<timestamp>.<ext>`), and
`app/api/payments/[paymentId]/slip/route.ts` checks that the viewer is the uploader,
the tournament's organizer, or an admin, then redirects to a **60-second signed URL**.
Slip paths uploaded before this change may still be full public URLs; that route
redirects them as-is so old records stay viewable.

Verify after setup:

- The bucket shows as private in Storage.
- Opening a slip as the owning organizer works from `/dashboard`.
- Pasting the raw storage object URL while signed out returns an error.

---

## 5. Roles, Accounts, And RLS Coverage

### Roles

`profiles.role` accepts `user`, `organizer`, `admin`. There is **no UI to change a
role** — set it in the Supabase table editor or by SQL for each real organizer and
admin. Everyone signing up through `/login` starts as `user`.

### Confirm RLS is enabled on every table

- `profiles`
- `tournaments`
- `player_ranks`
- `teams`
- `payments`
- `player_ratings`
- `rating_events`
- `match_results`
- `match_player_performances`
- `athlete_profiles`
- `athlete_videos`
- `athlete_achievements`
- `athlete_skill_assessments`
- `athlete_progress`
- `athlete_xp_events`
- `athlete_badges`
- `athlete_highlights`
- `athlete_highlight_reports`
- `hall_of_fame_entries`
- `storage.objects`

---

## 6. W1 Pilot: 5 คนใช้งานให้จบครบหนึ่งรอบ

เป้าหมายของ W1 ไม่ใช่จำนวนผู้ใช้ แต่คือ **มีผลแข่งจริง 1 นัดที่ทำให้ XP / Badge /
Ranking ของเด็กจริงขยับได้ครบ** โดยไม่ต้องมีนักพัฒนาเข้าไปช่วยกลางทาง

### 6.1 ทีมทดสอบ 5 คน

| บทบาท | จำนวน | `profiles.role` | หน้าที่ในรอบทดสอบ |
| --- | ---: | --- | --- |
| ผู้จัดการแข่งขัน | 1 | `organizer` | สร้างรายการ, ตรวจสลิป, ยืนยันทีม, บันทึกผล |
| นักกีฬา | 3 | `user` | สมัคร, ทำ Card, สมัครแข่ง (1 คนเป็นคนส่งสลิปแทนทีม) |
| ผู้ปกครอง | 1 | `user` | ดูโปรไฟล์สาธารณะของน้อง, ทดสอบการแชร์บนมือถือ |
| แอดมิน | (คนในทีมงาน) | `admin` | สร้าง `player_ranks` ให้นักกีฬา 3 คน |

ต้องมีอย่างน้อย **2 ทีมในรายการเดียวกัน** เพราะการบันทึกผลต้องมีทีม A และทีม B ที่
`status = 'confirmed'` ทั้งคู่ ให้ผู้จัดหรือแอดมินสมัครทีมที่สองด้วยบัญชีอีกบัญชีหนึ่ง
(หนึ่งบัญชีสมัครได้หนึ่งทีมต่อหนึ่งรายการ)

### 6.2 ก่อนเชิญ (ทีมงานทำเอง)

1. เพิ่มอีเมลทั้ง 5 คนเป็น **Test user** ใน Google Cloud OAuth (ยังอยู่ Testing mode
   จึงรับได้ถึง 100 บัญชี — ยังไม่ต้อง publish)
2. ตรวจ ENV บน Vercel ครบ 7 ตัวตามข้อ 1 และ `NEXT_PUBLIC_SHOW_DEMO_DATA` ไม่ใช่ `true`
3. Apply SQL ครบตามข้อ 3 และเช็ค trigger/function ตามคำสั่ง SQL ท้ายข้อ 3
4. สร้าง bucket `slips` แบบ private ตามข้อ 4
5. ตั้ง `profiles.role = 'organizer'` ให้ผู้จัด และ `'admin'` ให้ทีมงาน
6. สร้างรายการแข่งจริง 1 รายการจาก `/dashboard/create` — ต้องมี `fee`, `promptpay`,
   จังหวัด, วันแข่ง และ `status = 'open'`
7. รัน `npm run verify:production` และ `BASE_URL=https://ballsai-teal.vercel.app npm run smoke:public`

### 6.3 Flow ที่ต้องผ่านทุกขั้น

| # | ขั้นตอน | ใคร | หน้า | ผลที่ต้องเห็น (ยืนยันได้) |
| ---: | --- | --- | --- | --- |
| 1 | เข้าสู่ระบบ | นักกีฬา | `/login` | ติ๊กยอมรับ Terms/PDPA แล้วเข้าได้ทั้ง Google และ Email OTP |
| 2 | Onboarding | นักกีฬา | `/welcome` | เลือกบทบาท/กีฬา/เป้าหมาย → `profiles.onboarding_completed_at` ถูกเซ็ต |
| 3 | Rookie identity | ระบบ | — | เลือกบทบาท "นักกีฬา" แล้วมีแถวใน `athlete_profiles` และได้ `athlete_progress.xp_total = 50` + badge `rookie` |
| 4 | สร้าง Card | นักกีฬา | `/card` | บันทึกได้, ดาวน์โหลดภาพได้, แชร์บนมือถือได้ |
| 5 | **สร้าง Ranking** | **แอดมิน** | `/admin/create` | เลือก athlete account แล้วสร้าง `player_ranks` (สเตปที่ยังต้องทำมือ — ดูข้อ 6.4) |
| 6 | สมัครแข่ง | นักกีฬา | `/tournaments/[id]` | กรอกชื่อทีม + รายชื่อสมาชิก → ได้ `teams` แถวใหม่ สถานะ `pending` |
| 7 | ส่งสลิป | นักกีฬา | หน้าเดิม ขั้น payment | อัปโหลด JPG/PNG/WEBP ไม่เกิน 5 MB จากมือถือได้, ส่งซ้ำต้องขึ้นข้อความว่ามีรายการชำระแล้ว |
| 8 | ตรวจสลิป | ผู้จัด | `/dashboard` | เปิดสลิปได้ (signed URL), กดยืนยันการชำระเงินสำเร็จ |
| 9 | ยืนยันทีม | ผู้จัด | `/dashboard` | ทีมเป็น `confirmed` และเจ้าของทีมได้อีเมลแจ้ง (ถ้าตั้ง Resend แล้ว) |
| 10 | Preview ผล | ผู้จัด | `/dashboard/results` | เลือกรายการ + 2 ทีม + นักกีฬา แล้วกดคำนวณ เห็น rating ก่อน/หลังของทุกคน |
| 11 | บันทึกผล | ผู้จัด | `/dashboard/results` | ยืนยันแล้วได้ `match_results` + `match_player_performances` + `rating_events` ครบในครั้งเดียว |
| 12 | XP / Badge | นักกีฬา | `/career`, `/profile` | XP เพิ่มขึ้นจากนัดนี้ (ลงเล่น 30, ชนะ +20, ประตู 10/ลูก, แอสซิสต์ 8/ครั้ง, คลีนชีต 15, MVP 35) และ badge ใหม่ขึ้นใน Passport |
| 13 | Ranking | ทุกคน | `/ranking` | Power Rating ใหม่ปรากฏ (API เรียก `revalidateTag('public-ranking')` หลังบันทึกผลสำเร็จ จึงไม่ต้อง deploy ใหม่) |
| 14 | แชร์ | ผู้ปกครอง | `/players/[id]` | เปิดลิงก์บนมือถือได้, มีภาพ Open Graph, ไม่มีเบอร์โทรโชว์ |

### 6.4 สิ่งที่ยังต้องทำมือใน W1 (รู้ไว้ก่อน อย่าตกใจ)

1. **`player_ranks` ต้องสร้างโดยแอดมินทีละคน** ที่ `/admin/create` โดยเลือกจาก athlete
   account ที่มีอยู่ ถ้านักกีฬาไม่มีแถวนี้ ผู้จัดจะไม่เห็นชื่อในหน้าบันทึกผล และ XP
   จากการแข่งจะไม่เกิดขึ้นเลย (ได้แค่ 50 XP กับ badge Rookie)
2. **รายชื่อสมาชิกทีมเป็นข้อความอิสระ** ยังไม่ผูกกับบัญชี ผู้จัดต้องเทียบชื่อเอง
   ตอนเลือกนักกีฬาในหน้าบันทึกผล
3. **`sport` และ `season` ถูก fix ไว้ที่ `football` / `2026`** ในหน้า ranking, results,
   admin, hall และ card — W1 ใช้ค่านี้เท่านั้น
4. Card ของนักกีฬาที่ยังไม่มี `player_ranks` จะแสดงสเตตค่าเริ่มต้น
   (OVR 65 / PAC 66 / SHO 62 / PAS 64 / DRI 65 / DEF 55) ซึ่งเป็นค่าตั้งต้น ไม่ใช่ผลงานจริง
   ให้บอกผู้ทดสอบตรง ๆ ว่าตัวเลขจะเป็นของจริงหลังแอดมินสร้าง ranking และมีผลแข่งเข้าระบบ

### 6.5 ช่องรับปัญหา

LINE group + Google Form 5 ช่อง: บทบาท / หน้าจอที่อยู่ / กดอะไร / เจออะไร / ภาพหน้าจอ
ตอบกลับภายใน 24 ชม. ปัญหาที่ทำให้ flow ตันต้องแก้ก่อนขยายกลุ่มถัดไป

### 6.6 เกณฑ์ผ่าน W1 ก่อนขยายเป็น 20 คน

- นักกีฬาทั้ง 3 คนทำ Card เสร็จเองโดยไม่ต้องถามแอดมิน
- มีผลแข่งจริง 1 นัดที่ทำให้ XP, Badge และ Ranking ขยับครบทั้งสามที่
- อัปโหลดสลิปจากมือถือสำเร็จ และเปิดดูได้เฉพาะเจ้าของ/ผู้จัด/แอดมิน
- ผู้ปกครองเปิดลิงก์โปรไฟล์สาธารณะบนมือถือได้ และไม่เห็นข้อมูลติดต่อของเด็ก
- ไม่มี error ระดับ blocker ค้างใน production logs

---

## 7. End-To-End Smoke Tests By Role

Run these once per environment, in addition to the W1 pilot.

### Player

- Sign up with email OTP, and separately with Google.
- Land on `/welcome`, finish the three steps, and confirm a second login skips it.
- Edit profile: athlete photo, birth date, height, weight, highlight, achievement.
- Confirm a minor cannot publish without guardian consent, in the form and by calling
  the API directly with the athlete's own session (both must refuse).
- Confirm the public athlete profile never shows a phone number.
- Open `/athletes` and filter by province and position.
- Open `/ranking`.
- Register a team for an open tournament.
- Upload a JPG/PNG/WEBP payment slip under 5 MB.
- Confirm a duplicate team registration shows a readable error.
- Confirm a duplicate slip upload does not create a second payment record.

### Organizer

- Log in.
- Create a tournament, then edit it.
- Close and reopen registration.
- Review registered teams and open an uploaded slip.
- Confirm payment.
- Approve or reject a team, and confirm the applicant receives email.
- Enter a match result in `/dashboard/results`, preview rating changes, confirm.
- Confirm only teams with `status = 'confirmed'` appear as selectable teams.
- Search an athlete by name or team in the performance rows.
- Void a recorded result from "ผลที่บันทึกไปแล้ว" and confirm Power Rating, XP and any
  badge earned from that match are reverted, and that `/ranking` reflects it.
- Confirm voiding a result that is no longer the athlete's newest match is refused
  with a readable message.

### Admin

- Log in.
- Create a `player_ranks` record linked to an athlete account.
- Edit and delete a player rank.
- Confirm only admin can change ranking data.
- Award a Hall of Fame entry at `/admin/hall` and see it on `/hall-of-fame`.
- Report a highlight from a public profile as another account, then open
  `/admin/moderation`, hide it, and confirm it disappears from the public profile while
  the owner still sees it marked as hidden.
- Unhide the same clip and confirm it returns, then confirm a permanent delete removes
  both the row and the stored file.
- Open `/admin/operations` and confirm the readiness rows.

The legacy `/api/ratings` endpoint is intentionally disabled. Rating must be recorded
through the match-result flow so the result, player performance, Power Rating, ranking
and rating event are committed together by `record_match_result_safely`.

---

## 8. RLS And API Security Tests

Use the safe-mode script with real JWTs taken from a live Supabase session:

```bash
npm run security:rls
```

Required environment variables: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `PLAYER_JWT`, `ORGANIZER_JWT`, `ADMIN_JWT`.
Optional target IDs: `PLAYER_B_PROFILE_ID`, `PLAYER_RANK_ID`,
`FOREIGN_TOURNAMENT_ID`, `OWNED_TOURNAMENT_ID`, `PLAYER_B_TEAM_ID`, `OWNED_TEAM_ID`.

Safe mode checks read access and skips all writes. Run write checks only against an
isolated beta tournament, with explicit confirmation:

```bash
ALLOW_RLS_WRITE_TESTS=true npm run security:rls
```

Minimum checks:

- Player A cannot update Player B's profile.
- Player cannot update `player_ranks`.
- Player cannot update another user's team.
- Organizer cannot update a tournament owned by another organizer.
- Organizer can update only teams/payments for tournaments they own.
- Admin can update ranking data.
- A signed-out request cannot read a `slips` object directly.

---

## 9. Monitoring Checks

The app writes structured JSON logs for high-risk server actions:

- `team_registered`
- `team_registration_failed`
- `team_status_email_failed`
- `payment_slip_uploaded`
- `payment_slip_upload_failed`
- `payment_record_create_failed`
- `match_result_confirmed`
- `match_result_create_failed`
- `match_result_voided`
- `match_result_void_failed`
- `highlight_reported`
- `highlight_report_failed`
- `highlight_moderated`
- `highlight_moderation_failed`
- `tournament_updated`
- `tournament_update_failed`
- `public_rankings_fetch_failed`, `public_identity_ranking_fetch_failed`,
  `public_ranking_provinces_fetch_failed`, `public_tournaments_fetch_failed`,
  `public_open_tournaments_fetch_failed`, `public_hall_of_fame_fetch_failed`

Rating and rating-event failures no longer have their own events: those writes happen
inside `record_match_result_safely`, so a failure surfaces as
`match_result_create_failed` with the Postgres error code. A `409` with
`RATING_CHANGED` means another result updated the same player first — recalculate and
save again.

Before beta, confirm these logs appear in the local terminal and in Vercel runtime
logs.

Open `/admin/operations` as an admin and confirm:

- Supabase database is ready.
- `slips` is private.
- Demo fallback is disabled.
- Email sender and distributed rate limiting show ready before a multi-instance
  deployment.

Recommended next setup: Sentry for error tracking, PostHog or Vercel Web Analytics
for product analytics, Vercel runtime logs for request visibility.

---

## 10. Ready To Invite The First Organizer

Invite the first organizer only when all of these are true:

- SQL steps 1–12 applied to project `hivedzrwrrcnjrlirhtv`, with the four triggers and
  three functions confirmed present.
- `slips` bucket exists and is private; a signed slip URL opens for the organizer and
  fails for a signed-out request.
- Demo fallback is not `true` in production.
- `npm run verify:production` and `npm run smoke:public` pass against the production
  URL.
- Three-role end-to-end tests pass.
- RLS smoke tests pass in safe mode.
- Slip upload works from a real phone.
- A match result changes Power Rating, XP, Badge and `/ranking`.
- No blocker errors in production logs.
