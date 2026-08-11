# BallDoenSai.com

> **เปลี่ยนทุกการแข่งขันให้เป็นตัวตน ความทรงจำ และความก้าวหน้าที่นักกีฬาเยาวชนภูมิใจจะเก็บและแชร์**

BallDoenSai.com คือแพลตฟอร์มสำหรับนักกีฬาฟุตบอลเยาวชนไทย ผู้ปกครอง โค้ช และผู้จัดการแข่งขัน ไม่ได้ตั้งใจเป็นเพียงเว็บลงแข่งหรือเว็บจัดอันดับ แต่สร้าง **Digital Sports Identity** ให้เด็กคนหนึ่งมี “เส้นทางนักกีฬา” ของตัวเองที่เติบโตตามผลงานจริง

ชื่อธุรกิจและผลิตภัณฑ์: **BallDoenSai.com**

ชื่อ repository เดิม: `ballsai`

สถานะเอกสาร: อัปเดตล่าสุด **11 สิงหาคม 2026**

Production: [ballsai-teal.vercel.app](https://ballsai-teal.vercel.app/)
GitHub: [werawoot/ballsai](https://github.com/werawoot/ballsai)

---

## 1. วิสัยทัศน์: เรากำลังสร้างอะไร

หัวใจของ BallDoenSai คือทำให้เด็กที่ลงสนามรู้สึกว่า:

> “ฉันกำลังเติบโต ฉันมีผลงาน และนี่คือเส้นทางนักกีฬาของฉัน”

การแข่งขันหนึ่งนัดไม่ควรหายไปหลังเสียงนกหวีดจบ แต่ควรกลายเป็นหลักฐานของความพยายาม เช่น การ์ดนักเตะ, XP, Badge, ผลงาน, Highlight, อันดับ และความทรงจำที่ส่งต่อให้เพื่อนหรือครอบครัวดูได้

### เป้าหมายระยะยาว

1. เป็น Digital Identity ของนักฟุตบอลเยาวชนไทย
2. ให้เด็กสร้าง Player Card ในแบบนักเตะอาชีพ และอยากแชร์ลง TikTok, IG Story และ Facebook
3. ทำให้ผู้จัดการแข่งขันบันทึกผลที่น่าเชื่อถือ และเปลี่ยนผลนั้นเป็น Rating, XP, Badge และ Career Timeline อัตโนมัติ
4. ทำให้โค้ช/สเกาต์/ผู้ปกครองค้นหานักกีฬาและผลงานได้อย่างมีบริบท
5. สร้างเครือข่ายรายการแข่งและผู้จัดทั่วไทย โดยเริ่มจาก Closed Beta ที่ควบคุมคุณภาพได้

### ผู้ใช้หลัก

| กลุ่ม | สิ่งที่ได้จากระบบ |
| --- | --- |
| นักกีฬาเยาวชน | Card, Passport, Level, Badge, Highlight, ประวัติและลิงก์แชร์ |
| ผู้ปกครอง | เห็นเส้นทางและผลงานของน้อง ช่วยดูแลโปรไฟล์/การสมัครแข่ง |
| โค้ช / สเกาต์ | ค้นหานักกีฬา ดู Rating, ผลงาน, วิดีโอ และความสม่ำเสมอ |
| ผู้จัดการแข่งขัน | สร้างรายการ, รับทีม, ตรวจสลิป, ยืนยันทีม, บันทึกผล |
| ผู้ดูแลระบบ | ดูแลข้อมูล, นักกีฬา, Hall of Fame, การดำเนินงาน และความปลอดภัย |

---

## 2. สถานะปัจจุบันโดยรวม

### ตัวเลขที่ควรใช้สื่อสารอย่างตรงไปตรงมา

| มุมที่วัด | ความพร้อมโดยประมาณ | ความหมาย |
| --- | ---: | --- |
| Digital Sports Identity (Card / XP / Badge / Passport / Hall / Highlight) | **90%** | ฟังก์ชันหลักเขียนและเชื่อมฐานข้อมูลแล้ว เหลือพิสูจน์กับข้อมูลและผู้ใช้จริง |
| แพลตฟอร์ม Closed Beta | **65–70%** | มีระบบหลักและโครงสร้างปลอดภัย แต่ยังต้องใส่ข้อมูลจริง ทดสอบ flow จริง และเก็บ feedback |
| การเปิดสาธารณะระดับ Production 100% | **ยังไม่ถึง** | ต้องผ่าน Closed Beta, ข้อมูลจริง, การดูแลผู้เยาว์, Monitoring และโดเมนจริงก่อน |

**ข้อสำคัญ:** “100%” ไม่ได้หมายถึงเขียนโค้ดครบอย่างเดียว แต่หมายถึงเด็ก ผู้ปกครอง และผู้จัดใช้งานจริงได้โดยไม่เจอ flow หลักพัง และทีมดูแลตอบสนองปัญหาได้

---

## 3. สิ่งที่ทำเสร็จแล้ว

### A. ประสบการณ์นักกีฬา: Digital Sports Identity

| ระบบ | สถานะ | ทำอะไรได้แล้ว |
| --- | --- | --- |
| 🃏 Player Card | พร้อมใช้งาน Beta | สร้างการ์ดจากข้อมูลนักกีฬา/รูป/ตำแหน่ง/ทีม, บันทึก, ดาวน์โหลดภาพ และเปิดการแชร์ผ่านระบบของอุปกรณ์/ลิงก์ |
| ⭐ Level / XP | โครงหลักพร้อม | มี `athlete_progress`, XP events, level 1–99 และ progress calculation จากผลงานการแข่งขันที่ยืนยันแล้ว |
| 🏆 Achievement / Badge | โครงหลักพร้อม | มี Badge Road: Rookie, First Kick, Winner, Goal Hunter, Playmaker, The Wall, MVP, Road Warrior, Rising Star และสร้าง Achievement ให้สัมพันธ์กับ Badge |
| 📖 Career Timeline / Athlete Passport | พร้อมใช้งาน Beta | รวมข้อมูลโปรไฟล์, ทีม, ผลแข่ง, Rating, Achievement และ Highlight เป็นประวัติของนักกีฬา |
| 🏛️ Hall of Fame | พร้อมใช้งาน Beta | มีหน้า Hall จริง, filter ฤดูกาล/รุ่นอายุ/จังหวัด/หมวดรางวัล และหน้า admin สำหรับมอบรางวัล |
| 🎬 Highlight Moments | พร้อมใช้งาน Beta | เพิ่มรูป/วิดีโอหรือ URL ของ YouTube/TikTok, แสดงใน Passport/โปรไฟล์สาธารณะ และจัดเก็บผ่าน Supabase Storage |
| โปรไฟล์สาธารณะ | พร้อมใช้งาน Beta | หน้า `/players/[id]` พร้อม Open Graph image เพื่อให้ลิงก์ที่แชร์มีภาพประกอบ |

**นิยามที่ต้องรักษาไว้ในการพัฒนาต่อ:**

- `Ranking` = ลำดับเชิงตัวเลขและผลงานปัจจุบัน เช่น Power Rating หรือกำลังมาแรง
- `Hall of Fame` = พื้นที่เชิดชูความสำเร็จที่คัดเลือก/มอบรางวัลตามจังหวัด รุ่นอายุ ฤดูกาล หรือประเภท ไม่ใช่แค่ตารางอันดับอีกชุด

### B. การแข่งขันและ Rating

- รายการแข่งสาธารณะ: `/tournaments` และหน้ารายละเอียดรายการ
- สมัครแข่งเป็นทีม, ส่งสลิป, ติดตามสถานะการสมัคร
- Dashboard ผู้จัด: สร้าง/แก้ไขรายการ, เปิด/ปิดรับสมัคร, ตรวจสลิป, ยืนยันหรือปฏิเสธทีม
- บันทึกผลการแข่งขัน: `/dashboard/results`
- **BALLSAI Rating V1**: Power Rating แบบ Elo-style พร้อม performance modifiers และ audit trail
- ผลที่ยืนยันแล้วบันทึกลง `match_results`, `match_player_performances`, `rating_events` และเป็นต้นทางของ XP/Badge ที่เกี่ยวข้อง

### C. หน้าเว็บและ UX

- หน้าแรกธีมกีฬาสไตล์ BallDoenSai: Hero carousel, motion, พื้นที่ Highlight, Ranking rail และ navigation หลัก
- หน้า Athlete discovery `/athletes`
- Ranking `/ranking`
- Hall of Fame `/hall-of-fame`
- หน้า impact `/impact`, career `/career`, profile `/profile`, card `/card`
- หน้า Terms และ Privacy/PDPA พร้อม checkbox ยอมรับก่อนเข้าสู่ระบบ
- Error และ Not Found pages

### D. Login และ First-visit Onboarding

- Email OTP ผ่าน Supabase Auth (ไม่บังคับให้เด็กสร้างรหัสผ่าน)
- Google Login ผ่าน Supabase Auth **เปิดใช้งานแล้ว**
- Login มี flow “เข้ามาดูก่อน แล้วค่อยตั้งค่า” เพื่อลดแรงเสียดทาน
- หลัง login ครั้งแรก ระบบพาเข้า `/welcome` เพื่อเก็บข้อมูลแบบสั้น 3 ขั้น:
  1. บทบาท: นักกีฬา / ผู้ปกครอง / โค้ชหรือผู้จัด
  2. ชนิดกีฬา
  3. เป้าหมาย: สร้าง Card / หารายการ / ติดตามนักกีฬา / ค้นหาดาวรุ่ง
- ข้อมูล onboarding เก็บใน `profiles` และสร้าง `athlete_profiles` ให้ผู้เลือกบทบาทนักกีฬาเมื่อจำเป็น

### E. ความปลอดภัยและโครงสร้างสำหรับใช้งานจริง

- Supabase RLS สำหรับ tables และ Storage
- Payment slips ใช้ private bucket + signed URLs ใน production design
- ระบบรายงานเนื้อหา Highlight + คิวตรวจของแอดมินที่ `/admin/moderation` ซ่อนได้ทันทีและกู้คืนได้ โดยไม่ต้องลบไฟล์ของเด็ก
- กฎความยินยอมผู้ปกครองก่อนเผยแพร่โปรไฟล์ผู้เยาว์ บังคับทั้งในฟอร์มและ trigger ระดับฐานข้อมูล
- สิทธิ์ลบข้อมูลตาม PDPA ที่ `/profile` ลบข้อมูลนักกีฬาและไฟล์ทันที ตัดชื่อออกจากตาราง ranking แต่เก็บตัวเลขที่ทีมอื่นถูกวัดด้วยไว้ แล้วส่งคำขอปิดบัญชีให้แอดมินที่ `/admin/operations`
- Route/API validation สำหรับ upload, สถานะทีม, การยืนยันเงิน และบันทึกผล
- Shared rate limit รองรับ Upstash Redis; local development มี in-memory fallback เท่านั้น
- Structured server logs สำหรับ payment upload, match result/rating และ tournament update
- Vercel Analytics และ Speed Insights อยู่ในแอป
- มี scripts สำหรับตรวจ production config, public smoke test และ RLS smoke test

---

## 4. Google Login: สถานะล่าสุด

Google Login ถูกตั้งค่าด้วยบัญชีเจ้าของ `topkung72@gmail.com` แล้ว

| รายการ | สถานะ |
| --- | --- |
| Google Cloud project | สร้างแล้ว: `BallDoenSai` |
| Google Auth branding | สร้างแล้ว: `BallDoenSai.com` |
| OAuth Client | สร้างแล้ว: `BallDoenSai Web` |
| Authorized JavaScript origin | `https://ballsai-teal.vercel.app` |
| Google → Supabase callback | `https://hivedzrwrrcnjrlirhtv.supabase.co/auth/v1/callback` |
| Supabase Google provider | **Enabled** |
| OAuth publishing | **Testing mode** |

### ข้อจำกัดปัจจุบันของ Google Login

ขณะที่ Google Auth อยู่ใน **Testing mode** จะเข้าได้เฉพาะ owner และบัญชีที่เพิ่มเป็น Test user ใน Google Cloud เท่านั้น เหมาะสำหรับ Closed Beta ระยะแรก

ก่อนเปิดให้คนทั่วไปใช้ ต้อง:

1. เพิ่ม test users สำหรับกลุ่มทดลอง 10–20 คน หรือ
2. ปรับ OAuth Audience เป็น production และทำตามขั้นตอน verification ของ Google หากระบบร้องขอ
3. เมื่อได้โดเมน `balldoensai.com` แล้ว ให้เพิ่ม origin/โดเมนใหม่ใน Google Cloud และ Supabase URL configuration

**ห้าม commit หรือวาง Client Secret / API key ลง GitHub, README หรือไฟล์ฝั่ง client**

---

## 5. สถาปัตยกรรม

```text
ผู้ใช้ (Browser)
        │
        ▼
Next.js 14 App Router on Vercel
        │  ├─ Public pages / Server Components / Cached public data
        │  ├─ Route handlers: teams, payments, results, highlights
        │  └─ Login + onboarding flows
        ▼
Supabase
        ├─ Auth (Email OTP + Google OAuth)
        ├─ Postgres + RLS
        ├─ Storage (slips, athlete-highlights)
        └─ Rating / XP / Badge / Hall database functions
        │
        ├─ Resend: transactional mail (when domain is verified)
        └─ Upstash Redis: shared rate limiting (when env is configured)
```

### Tech stack

- Next.js 14 App Router, React 18, TypeScript
- Supabase Auth, Postgres, Storage, RLS
- Vercel deployment, Analytics, Speed Insights
- Resend for transactional email
- Upstash Redis for distributed rate limiting
- Lucide icons, Tailwind/PostCSS and component-level CSS

---

## 6. สำคัญมาก: ข้อมูลและฐานข้อมูล

### Supabase project ที่แอปใช้จริง

ใช้ Supabase project ref: **`hivedzrwrrcnjrlirhtv`** (`Ballsai`)

ห้ามนำ SQL ไป apply ใน Supabase project เก่า/คนละ project โดยไม่ตรวจ URL และ project ref ก่อน เพราะในอดีตเคยมีความเสี่ยงของการทำงานผิด project

### SQL migrations ที่มีใน repository

ลำดับการ apply แบบเต็มพร้อมเหตุผลและ dependency อยู่ใน [`docs/closed-beta-runbook.md`](docs/closed-beta-runbook.md) §3 — ตารางนี้เป็นสารบัญว่าแต่ละไฟล์ทำอะไร

| ไฟล์ | หน้าที่ | ลำดับ |
| --- | --- | ---: |
| `sql/check-duplicates-before-unique-indexes.sql` | ตรวจ duplicate ก่อนเพิ่ม unique indexes | 1 |
| `sql/supabase-rls.sql` | RLS โครงหลัก + `is_admin()` / `is_organizer()` | 2 |
| `sql/fix-profile-auth-trigger.sql` | trigger สร้าง `profiles` ให้ทุกบัญชี Auth + backfill บัญชีเก่า | 3 |
| `sql/ballsai-rating-v1.sql` | Power Rating, match result, rating events | 4 |
| `sql/athlete-profile-v2.sql` | Athlete profile, video, achievement, skill assessment + bucket `athlete-avatars` | 5 |
| `sql/link-player-ranks-to-profiles.sql` | ผูก `player_ranks.player_id` กับบัญชีจริง + unique index ต่อ season | 6 |
| `sql/digital-identity-v1.sql` | XP, Level, Badge และ triggers จาก rating events | 7 |
| `sql/digital-identity-v2-hall.sql` | Rookie badge, Achievement sync, Hall of Fame | 8 |
| `sql/athlete-highlight-uploads-v1.sql` | Athlete highlights + bucket `athlete-highlights` (private) | 9 |
| `sql/onboarding-v1.sql` | ข้อมูล first-visit onboarding | 10 |
| `sql/production-hardening.sql` | ทำให้ `slips` เป็น private, RPC `register_team_safely` / `confirm_payment_safely` / `record_match_result_safely`, indexes | 11 |
| `sql/match-result-void-v1.sql` | RPC `void_match_result_safely()` ยกเลิกผลแข่งพร้อมคืน Rating/XP/Badge | 12 |
| `sql/guardian-consent-enforcement-v1.sql` | บังคับกฎความยินยอมผู้ปกครองก่อนเผยแพร่โปรไฟล์ผู้เยาว์ในระดับฐานข้อมูล | 13 |
| `sql/highlight-moderation-v1.sql` | คิวรายงานเนื้อหา, ซ่อน/แสดง Highlight และ storage policy ที่ตามสถานะการซ่อน | 14 |
| `sql/data-deletion-v1.sql` | สิทธิ์ลบข้อมูลตาม PDPA + คิวคำขอปิดบัญชีสำหรับแอดมิน | 15 |

ไฟล์ที่ **ไม่ต้อง apply**:

- `sql/supabase-rls-private-slips.sql` — เป็นทางเลือกแทน `sql/supabase-rls.sql` สำหรับการติดตั้งที่หยุดแค่ไฟล์ base เท่านั้น เพราะลำดับ 11 ทำให้ `slips` เป็น private ด้วย policy เวอร์ชันใหม่อยู่แล้ว ถ้า apply ไฟล์นี้ทับจะเขียน policy `profiles` ของลำดับ 3 กลับไปเป็นเวอร์ชันเก่า
- `sql/sample-data.sql` — ข้อมูลตัวอย่างสำหรับ demo เท่านั้น Closed Beta ใช้ข้อมูลจริงล้วน

หมายเหตุ: ไม่มีไฟล์ SQL ไหนสร้าง bucket `slips` ต้องสร้างเองใน Supabase Storage แบบ private แล้วรันลำดับ 11 ซ้ำ

Migrations ด้านบนถูก apply ใน project ที่ถูกต้องแล้วสำหรับระบบปัจจุบัน การแก้ schema ต่อไปควรทำเป็นไฟล์ migration ใหม่ แทนการแก้ข้อมูลจริงแบบ ad-hoc ใน dashboard

---

## 7. Routes สำคัญ

| Route | หน้าที่ | กลุ่มผู้ใช้ |
| --- | --- | --- |
| `/` | หน้าแรกและจุดเริ่มต้น | ทุกคน |
| `/login` | Google Login / Email OTP | ทุกคน |
| `/welcome` | onboarding หลัง login ครั้งแรก | ผู้ใช้ใหม่ |
| `/card` | Player Card Builder | นักกีฬา |
| `/profile` | แก้ไข Athlete Identity | นักกีฬา |
| `/career` | Athlete Passport / Career Timeline | นักกีฬา |
| `/players/[id]` | โปรไฟล์สาธารณะ/ลิงก์แชร์ | ทุกคน |
| `/athletes` | ค้นหานักกีฬา | โค้ช, สเกาต์, ทุกคน |
| `/ranking` | ตารางคะแนน/กำลังมาแรง | ทุกคน |
| `/hall-of-fame` | Hall of Fame จริง | ทุกคน |
| `/tournaments` | รายการแข่ง | ทุกคน |
| `/dashboard` | ผู้จัดการแข่งขัน | organizer |
| `/dashboard/results` | บันทึกผล + Preview rating changes | organizer |
| `/admin/hall` | มอบ Hall of Fame | admin / organizer ที่มีสิทธิ์ |
| `/admin` | ดูแลนักกีฬา/operations/infrastructure | admin |

---

## 8. งานที่เหลือ: ลำดับที่ควรทำต่อ

### Phase 1 — ทำให้ Closed Beta ใช้ได้จริง (สำคัญที่สุด)

1. ใส่ข้อมูลจริงอย่างน้อย:
   - ผู้จัด 3–5 ราย
   - รายการแข่งขันจริงอย่างน้อย 3 รายการ
   - นักกีฬาทดสอบ 20–50 คน
   - ผลแข่งจริงและ Highlight บางส่วน
2. เพิ่ม Google test users หรือเตรียม publish OAuth ก่อนเชิญผู้ทดลอง
3. ให้กลุ่มทดลองทำ flow เต็ม:
   `สมัคร → onboarding → สร้าง profile → สร้าง Card → สมัครแข่ง → ส่งสลิป → ผู้จัดยืนยัน → บันทึกผล → XP/Badge/Ranking เปลี่ยน → แชร์`
4. เก็บ bug และ feedback จากนักกีฬา/ผู้ปกครอง/ผู้จัด แล้วแก้ก่อนขยาย

### Phase 2 — Production readiness

1. ซื้อและผูก `balldoensai.com` กับ Vercel
2. ยืนยันโดเมนใน Resend และกำหนด `RESEND_FROM_EMAIL`
3. เพิ่มโดเมนจริงใน:
   - Supabase Auth → URL Configuration
   - Google Cloud OAuth → Authorized JavaScript origins / authorized domains
4. ตั้ง Monitoring จริง: Vercel logs, uptime, error alerts, backup/restore drill
5. ทดสอบ RLS ด้วย JWT ของ role จริง และทำ rate-limit/load testing
6. จัดทำนโยบายดูแลข้อมูลผู้เยาว์, ขั้นตอนรายงานเนื้อหา, ทีมตรวจสลิป/ผลแข่ง

### Phase 3 — Product depth หลัง Closed Beta

1. ทำ Achievement UI ให้เป็น collection/animation ที่ชัดขึ้น
2. ทำ Card templates และ export ขนาด 9:16 สำหรับ IG Story/TikTok
3. ทำ sharing landing page ที่ใส่ Open Graph/Call to Action ดีขึ้น
4. เพิ่มระบบ moderation สำหรับ Highlight ที่อัปโหลด
5. เพิ่มระบบ notification สำหรับ Badge, Hall, ผลแข่ง และรายการแข่งใหม่
6. เพิ่ม search/filter สำหรับโค้ชและสเกาต์ พร้อมสิทธิ์และ privacy ที่เหมาะกับผู้เยาว์

---

## 9. ความจริงเรื่องการแชร์ TikTok / IG / Facebook

ระบบปัจจุบันรองรับ **ดาวน์โหลด Card เป็นภาพ** และเรียก native share / share link ซึ่งผู้ใช้สามารถนำไปโพสต์ใน TikTok, IG Story หรือ Facebook ได้

สิ่งที่ยังไม่ใช่ และไม่ควรสื่อสารเกินจริง:

- ยังไม่มี deep integration ที่โพสต์เข้า TikTok หรือ Instagram โดยตรงจากเว็บ เพราะแพลตฟอร์มเหล่านี้มีข้อจำกัด API/permission
- แนวทางที่เหมาะที่สุดตอนนี้คือ export ภาพสวย, ขนาด 9:16, caption/copy link และให้ระบบมือถือเปิด share sheet

---

## 10. Environment variables

สร้าง `.env.local` สำหรับ local development:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL="BallDoenSai.com <verified-sender@your-domain.com>"

UPSTASH_REDIS_REST_URL=your_upstash_redis_rest_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_rest_token

NEXT_PUBLIC_SHOW_DEMO_DATA=false

NEXT_PUBLIC_ACTIVE_SPORT=football
NEXT_PUBLIC_ACTIVE_SEASON=2026
```

หมายเหตุ:

- `NEXT_PUBLIC_ACTIVE_SPORT` / `NEXT_PUBLIC_ACTIVE_SEASON` คือช่วงการแข่งขันที่ระบบใช้อยู่ (Ranking, Hall of Fame, บันทึกผล, Player Card, admin) ไม่ตั้งก็ได้ ค่า default คือ `football` / `2026` ตามที่ [`lib/season.ts`](lib/season.ts) กำหนด การเปลี่ยนฤดูกาลต้อง redeploy เพราะเป็นค่าระดับ build time

- Google OAuth Client ID/Secret ตั้งใน **Supabase Auth provider dashboard** ไม่ใช่ `.env.local` ของ client
- `RESEND_API_KEY` จำเป็นเมื่อเปิดส่งอีเมลแจ้งสถานะทีม
- ไม่มี Upstash ใน environment จะ fallback เป็น in-memory rate limit ซึ่งเหมาะกับ local เท่านั้น
- production/closed beta ควรใช้ `NEXT_PUBLIC_SHOW_DEMO_DATA=false`

---

## 11. Development และตรวจสอบก่อน deploy

```bash
npm install
npm run dev
```

เปิด `http://localhost:3000`

ตรวจสอบก่อน deploy:

```bash
npm run lint
npm run build
npm run smoke:public
npm run verify:production
```

ทดสอบ deployment ระยะไกล:

```bash
BASE_URL=https://your-deployment-url npm run smoke:public
```

เอกสารทดสอบ Closed Beta เพิ่มเติม: [`docs/closed-beta-runbook.md`](docs/closed-beta-runbook.md)

---

## 12. Handoff สำหรับแชท/นักพัฒนาคนถัดไป

เมื่อเริ่มทำงานต่อ ให้อ่านส่วนนี้ก่อน แล้วทำตามลำดับ:

1. ตรวจ branch และ worktree ก่อนแก้ไฟล์
   ```bash
   git status -sb
   git log --oneline -5
   ```
2. ยืนยันว่า target database คือ Supabase ref `hivedzrwrrcnjrlirhtv`
3. อย่าทำลายหรือ reset งานที่มีอยู่ และอย่า commit secret
4. หากแก้ UI ให้รักษาภาษาภาพของหน้าแรก: dark sport editorial, red accent, dynamic motion, ความภูมิใจของนักกีฬา
5. หากแก้ feature นักกีฬา ให้ถามเสมอว่า “ข้อมูลนี้มาจากไหนและตรวจสอบระดับไหน”:
   - self-reported
   - coach verified
   - performance verified
6. ทดสอบ `npm run lint && npm run build` ทุกครั้งเมื่อมีการเปลี่ยน TypeScript/Next.js สำคัญ
7. อย่าเรียกทุกอย่างว่า 100% จนกว่าจะผ่าน closed-beta flow ด้วยข้อมูลจริง

### ความสำเร็จที่ควรวัดใน Closed Beta

- ผู้ใช้ใหม่สร้าง Card สำเร็จโดยไม่ต้องถามแอดมิน
- ผู้จัดบันทึกผลแล้ว Rating/XP/Badge อัปเดตได้ถูกต้อง
- ผู้ใช้แชร์ Card/โปรไฟล์ได้จริงบนมือถือ
- ไม่มีการเข้าถึงสลิปหรือข้อมูลส่วนตัวข้ามสิทธิ์
- ทีมดูแลตรวจพบและแก้ error สำคัญได้รวดเร็ว
- เด็กบอกว่า “อยากกลับมาใช้ต่อ” ไม่ใช่แค่ “เว็บใช้งานได้”

---

## 13. สรุปสั้นที่สุด

BallDoenSai ไม่ใช่เว็บจัดอันดับฟุตบอลธรรมดา

มันคือแพลตฟอร์มที่จะทำให้ **ทุกเกมกลายเป็นความทรงจำ ทุกผลงานกลายเป็นหลักฐาน และทุกเด็กเห็นเส้นทางการเติบโตของตัวเอง**.
