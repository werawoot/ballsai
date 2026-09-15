# BallDoenSai.com — Handoff / To-do สำหรับ Claude

อัปเดต: 23 สิงหาคม 2026  
เป้าหมายถัดไป: เปิด **Closed Beta 5 คน** อย่างปลอดภัย ไม่ใช่ประกาศว่า Production 100%

## อ่านก่อนเริ่ม

1. อ่าน [`AGENTS.md`](../AGENTS.md), [`README.md`](../README.md) และ
   [`docs/closed-beta-runbook.md`](closed-beta-runbook.md) ทั้งหมด
2. Project Supabase ที่ถูกต้องมีเพียง `hivedzrwrrcnjrlirhtv` (Ballsai)
3. ห้ามอ่าน/พิมพ์/commit `.env.local` หรือ secret ใด ๆ
4. ห้ามแก้ SQL migration ที่ apply แล้ว; ถ้าต้องแก้ schema ให้สร้างเลขใหม่ใน `sql/`
5. ห้าม apply `sql/supabase-rls-private-slips.sql` และห้ามใช้ `sql/sample-data.sql` ใน production
6. Payment slip เป็นข้อมูล private: ใช้ object path + signed URL 60 วินาทีเท่านั้น ห้ามทำ public URL
7. มีผู้เยาว์ในระบบ: ห้ามอ่อนกฎ birth date + guardian consent สำหรับ public profile
8. ก่อน handoff ทุกครั้งรัน `npm run lint`, `npm run build`, `git diff --check`
9. Worktree มีการแก้ไขที่ยังไม่ commit หลายส่วนจากงานก่อนหน้า ห้าม reset, checkout หรือ deploy ทั้ง worktree โดยไม่แยกและ review release files

## สถานะที่ยืนยันแล้ว

| เรื่อง | สถานะ | หลักฐาน |
| --- | --- | --- |
| SQL31 Data Trust | **Applied 23 Aug 2026** | มี 6 ตาราง, 3 RPC และ `data_disputes` RLS; ตรวจด้วย read-only query แล้ว |
| SQL35 Admin Audit | **Applied 23 Aug 2026** | มี `admin_audit_logs`, RLS และ audited RPC สำหรับ Ranking/Hall/Trust; ตรวจแบบ read-only แล้ว |
| SQL36 PDPA deletion hardening | **ยังไม่ apply** | อยู่ที่ `sql/36-data-deletion-search-path-hardening-v1.sql` |
| SQL30 / SQL32 BDS match reward | **ห้าม apply ตอนนี้** | ต้องตกลงกติกา reward/void reversal และทดสอบก่อน |
| SQL37 legacy payment slip URLs | **Applied 23 Aug 2026** | กัก URL-format legacy 4 รายการแล้ว; หลังตรวจเหลือ 0 URL-format rows |
| private slip viewer | deploy แล้ว | legacy URL ได้ HTTP 410; ยังต้องทดสอบ slip ใหม่แบบหลายบัญชี |
| public production smoke | ผ่าน | `/`, `/athletes`, `/ranking`, `/tournaments`, `/privacy`, `/terms` = 200 และ unknown route = 404 |
| lint / build | ผ่าน | build ใน workspace อาจมี `ENOTFOUND` จาก DNS local ตอน static tournament query; production smoke ผ่าน จึงไม่ใช่ outage ที่ reproduce ได้ |

## ลำดับงานที่ Claude ควรทำ

### P0 — ปิด security gate ที่เหลือก่อนเชิญ tester

#### 1. Review และขออนุมัติ apply SQL36

- ไฟล์: `sql/36-data-deletion-search-path-hardening-v1.sql`
- หน้าที่: ตั้ง empty `search_path` ให้ `delete_my_athlete_data()` และยืนยันว่า execute ได้เฉพาะ `authenticated`
- ก่อน apply: ตรวจว่า target เป็น `hivedzrwrrcnjrlirhtv`, review SQL และอธิบายผลกระทบให้ owner
- ต้องได้รับข้อความอนุมัติชัดเจนก่อน:  
  `อนุมัติให้ apply SQL36 PDPA hardening ไปยัง Ballsai production`
- หลัง apply: run read-only query ยืนยัน function exists, `search_path=''`, anon/service_role ไม่มี execute และ authenticated มี execute
- ห้ามแก้ `sql/data-deletion-v1.sql` หรือ `sql/33-...` ที่ apply ไปแล้ว

#### 2. ทำ RLS test ด้วย JWT จริง 3 บทบาท

- ต้องมี session JWT ของ athlete A, athlete B, organizer และ admin; **ห้ามพิมพ์ JWT ใน chat/log**
- ใช้ `npm run security:rls` ใน safe mode ก่อน; write mode ใช้เฉพาะ disposable tournament และต้องขออนุมัติใหม่
- Script รองรับ optional IDs สำหรับ Data Trust แล้ว:
  - `PLAYER_OWN_DISPUTE_ID`, `PLAYER_FOREIGN_DISPUTE_ID`
  - `PLAYER_OWN_VERIFICATION_EVENT_ID`, `PLAYER_FOREIGN_VERIFICATION_EVENT_ID`
- ต้องพิสูจน์อย่างน้อย:
  - Athlete A อ่าน/แก้ profile ของ Athlete B ไม่ได้
  - Athlete อ่าน dispute และ verification event ของตนเองได้ แต่ของ Athlete B ไม่ได้
  - Organizer แก้ tournament/ทีมของคนอื่นไม่ได้
  - Admin เห็น Trust queue และ Audit Log ได้
  - signed-out user อ่าน `slips` object โดยตรงไม่ได้

#### 3. ทำ private payment-slip test จริงแบบ disposable

- ใช้บัญชี/รายการทดสอบเท่านั้นและต้องขออนุมัติก่อน upload slip หรือสร้างบัญชี/ส่ง OTP
- ทดสอบจากมือถือ: upload JPG/PNG/WEBP ≤ 5MB → organizer เจ้าของรายการเปิดได้ → บัญชีอื่นเปิดไม่ได้ → signed URL หมดอายุแล้วเปิดไม่ได้
- ห้ามเปิดหรือย้ายหลักฐานการชำระเงินจริงของผู้ใช้

### P1 — Pilot 5 คน แบบ end-to-end

ใช้เอกสาร `docs/closed-beta-test-accounts.csv` และ `docs/closed-beta-pilot-script.md` เป็น template แต่ต้องให้ owner ระบุอีเมลจริงและอนุมัติการส่ง OTP ก่อนสร้าง/เชิญบัญชี

บทบาทขั้นต่ำ: admin 1, organizer/coach 1, athlete 3, guardian 1

Flow ที่ต้องผ่าน:

```text
Login → onboarding → Player Card
Organizer สร้างทีม → เชิญ athlete → athlete รับ/ปฏิเสธ
สร้างรายการทดสอบ → team สมัคร → upload slip → organizer ยืนยัน
Match Plan เลือกเฉพาะ accepted roster
บันทึกผล → Rating / XP / Badge / Career / Ranking / Notification
void ผลแยกหนึ่งเคส → ตรวจผลกลับตามกติกา
report highlight → admin moderation
account deletion request → admin operations
```

เก็บแต่ละ case เป็น Pass / Fail / Blocked พร้อม screenshot ที่ไม่เผย PII หรือ URL หลักฐาน private

### P2 — External production configuration (owner ทำใน dashboard)

- Rotate Resend/Vercel credentials ที่เคยปรากฏใน screenshot/chat
- ยืนยัน `NEXT_PUBLIC_SHOW_DEMO_DATA` ไม่ใช่ `true` ใน production
- ยืนยัน Supabase Site URL + redirect URLs
- เพิ่ม Google OAuth test users / ทดสอบ Google, Facebook, Email OTP
- ใช้ verified custom sender สำหรับอีเมล
- ตั้ง Upstash Redis สำหรับ distributed rate limiting
- ยืนยัน backup/PITR, runtime error monitoring และ rollback deployment

## งานที่ “ห้าม” ทำเองโดยไม่มีอนุมัติ owner

- apply SQL production, deploy, เปลี่ยน Vercel/Supabase/Auth/OAuth configuration
- ส่งอีเมล/OTP, สร้าง user จริง, เชิญสมาชิกจริง
- upload/open/delete payment evidence
- เปลี่ยน RLS, Storage policy, role ของผู้ใช้ หรือข้อมูล production

## เกณฑ์ Go / No-go

**Go สำหรับ 5 คน** ได้เมื่อทุกข้อเป็นจริง:

- [ ] SQL36 apply + verify แล้ว
- [ ] RLS test ต่างบทบาทผ่าน ไม่มี cross-account access
- [ ] Private slip test ผ่าน 3 สถานะ: owner / unauthorized / expired
- [ ] Login (Google, Facebook, Email OTP) ผ่านกับบัญชีทดสอบ
- [ ] Flow tournament-to-identity ผ่านโดยไม่ต้องให้ developer แก้ฐานข้อมูลกลางทาง
- [ ] Admin ตรวจ dispute/moderation/audit/void/deletion request ได้
- [ ] มีคนรับผิดชอบ support และ PDPA ชัดเจน
- [ ] ไม่มี P1/P2 security/product defect ค้างอย่างน้อย 48 ชั่วโมง

## Prompt เริ่มต้นสำหรับ Claude

```text
คุณทำงานใน repo BallDoenSai.com (ballsai) เพื่อเตรียม Closed Beta 5 คนอย่างปลอดภัย

อ่าน AGENTS.md, README.md, docs/closed-beta-runbook.md และ docs/claude-handoff-next-steps.md ก่อนเริ่ม

ข้อห้าม: ห้ามอ่าน/พิมพ์ secret หรือ .env.local; target Supabase ที่ถูกต้องคือ hivedzrwrrcnjrlirhtv เท่านั้น; ห้าม deploy/apply SQL/send email/create users/change dashboard config โดยไม่มีข้อความอนุมัติชัดเจนจาก owner; ห้ามแก้ migration ที่ apply แล้ว; ห้าม apply sql/supabase-rls-private-slips.sql หรือ sample-data.sql ใน production

เริ่มแบบ read-only: ตรวจ git status, runbook และ SQL36 จากนั้นรายงานผลกระทบ/แผนทดสอบให้ owner ก่อนขออนุมัติ apply SQL36 เพียงรายการเดียว เมื่อ owner อนุมัติ ให้ apply SQL36, ตรวจ post-check แบบ read-only, อัปเดต runbook/checklist และรัน npm run lint, npm run build, git diff --check

หลัง SQL36 ให้หยุดเมื่อจำเป็นต้องมี JWT/อีเมล/การ upload จริง แล้วแจ้ง blocker ที่ต้องให้ owner จัดเตรียมอย่างชัดเจน
```

## เมื่อปิดแต่ละงาน

รายงานสั้น ๆ เสมอ:

1. ทำอะไรและไฟล์ใดเปลี่ยน
2. หลักฐานการตรวจ (command/result แบบไม่เผย secret)
3. มี production change หรือไม่
4. สิ่งที่ยัง blocked และ action ถัดไปที่ต้องขออนุมัติ
