# ตั้งอีเมลเข้าสู่ระบบให้พร้อม W1 (T17, T16)

ทำทีละโปรเจกต์: **Staging (`vorpnkedpscsqhnrssrl`) ก่อน** แล้วจึง Production (`hivedzrwrrcnjrlirhtv`)
ทุกขั้นเป็นการตั้งค่าใน Dashboard ไม่มี SQL ไม่มีโค้ด

## ทำไมต้องทำก่อน W1

ข้อเท็จจริงจากเอกสาร Supabase (`apps/docs/content/guides/auth/auth-smtp.mdx` และ
`packages/shared-data/config.ts`, supabase/supabase commit `ad0ed2cd`, 30 ก.ย. 2026):

- ถ้าไม่ตั้ง custom SMTP ตัวส่งของ Supabase **ส่งได้เฉพาะอีเมลของสมาชิกทีมในองค์กร Supabase** ที่อยู่อื่นได้
  error "Email address not authorized" — ผู้ทดสอบ W1 ที่ไม่ได้อยู่ในทีมจะไม่ได้รับรหัสเลย
- ตัวส่งของ Supabase ส่งได้ **2 ฉบับต่อชั่วโมง** ทั้งโปรเจกต์ และไม่มี SLA — "not meant for production use"
- หลังตั้ง custom SMTP เพดานเริ่มที่ **30 ฉบับต่อชั่วโมง** ปรับได้ที่หน้า Rate Limits

สถานะ 30 ก.ย. (`docs/supabase-settings-2026-09-30.md`): Production **ไม่ได้ใช้ custom SMTP** (2 ฉบับ/ชม.),
Staging ใช้ custom SMTP แต่โดเมนผู้ส่งเป็น `example.com`

## ขั้นที่ 1 — โดเมนผู้ส่ง (Resend, ใช้อยู่แล้วใน `lib/email.ts`)

1. เลือกโดเมนย่อยสำหรับอีเมลยืนยันตัวตนโดยเฉพาะ เช่น `auth.<โดเมนของคุณ>` (Supabase แนะนำแยกจากอีเมลการตลาด)
2. Resend → Domains → Add domain → ใส่โดเมนย่อยนั้น → เพิ่ม DNS records ที่ Resend แสดง (SPF/DKIM) ที่ผู้ให้บริการ DNS
3. เพิ่ม DMARC: TXT record ชื่อ `_dmarc.<โดเมนหลัก>` ค่าเริ่มต้น `v=DMARC1; p=none; rua=mailto:<อีเมลที่อ่านรายงานได้>`
   (ค่อยเปลี่ยนเป็น `p=quarantine` เมื่อส่งได้ปกติสักระยะ)
4. รอจน Resend แสดงโดเมนเป็น **Verified**
5. Resend → API Keys → สร้าง key แบบ **Sending access** จำกัดเฉพาะโดเมนนี้ **แยก key ของ Staging และ Production**
   (ห้ามส่ง key ในแชต ห้าม commit — ใส่ใน Supabase โดยตรงเท่านั้น)

## ขั้นที่ 2 — ตั้ง SMTP ใน Supabase

Supabase → Authentication → Emails → **SMTP Settings** → Enable custom SMTP

| ช่อง | ค่า |
| --- | --- |
| Sender email | `no-reply@auth.<โดเมน>` (ต้องเป็นโดเมนที่ verified แล้ว) |
| Sender name | Production: `BallDoenSai.com` · Staging: `BallDoenSai Staging` |
| Host / Port / Username | **คัดลอกจากหน้า SMTP ในบัญชี Resend ของคุณ** (Resend → Settings → SMTP) |
| Password | API key จากขั้นที่ 1 ข้อ 5 |

บันทึก แล้วตรวจว่า Rate Limits → emails sent per hour เป็น 30 (ค่าเริ่มหลังตั้ง SMTP)

## ขั้นที่ 3 — template อีเมล (แก้ "6 หลัก" และ Confirm signup ที่ไม่มีรหัส)

ใช้ template ที่อยู่ใน repo แล้ว ([`docs/supabase-auth-email-otp.md`](supabase-auth-email-otp.md)):
ไม่ระบุจำนวนหลัก ไม่มีลิงก์ (ลิงก์อาจถูกระบบสแกนอีเมลเปิดก่อนจนรหัสใช้ไม่ได้) และใช้ `{{ .Token }}`

- ใส่ทั้ง **Magic Link** และ **Confirm signup** ในทั้งสองโปรเจกต์ (Staging ตอนนี้เขียน "6 หลัก";
  Confirm signup ของ Production ไม่มี `{{ .Token }}`)
- ภาษาไทยอย่างเดียว: `supabase-auth-email-otp.html` · สองภาษา: `supabase-auth-email-otp-bilingual.html`

## ขั้นที่ 4 — ทดสอบ (ปิด T16/T17)

1. ใช้อีเมลทดสอบ **ที่ไม่ใช่สมาชิกทีม Supabase** 2 ที่อยู่: Gmail และ Outlook/Hotmail
2. `/login` → ใช้อีเมลรับรหัส → อีเมลต้องเข้า **Inbox** (ไม่ใช่ Spam) ภายใน 1 นาที และผู้ส่งเป็นโดเมนของคุณ
3. ใน Gmail: เปิดอีเมล → ⋮ → Show original → SPF, DKIM, DMARC ต้องเป็น **PASS**
4. เข้าสู่ระบบสำเร็จ **5 ครั้งติด** (รวมการกด "ส่งรหัสใหม่" หลัง 60 วินาทีหนึ่งครั้ง) — ถ้าล้ม เปิด Auth logs ภายในชั่วโมงนั้น
5. จดผลในตารางข้างล่าง

## ขั้นที่ 5 — เพดานการส่งสำหรับ W1

- W1 (5 คน): 30 ฉบับ/ชม. พอ
- ก่อน W2/นำร่องจังหวัด: เปิด CAPTCHA ก่อน (`docs/captcha-setup.md`) แล้วค่อยยกเพดาน และแจ้ง Resend ล่วงหน้าถ้าคาดว่าจะมีผู้ใช้ใหม่จำนวนมากพร้อมกัน

## ย้อนกลับ

ปิด custom SMTP ใน Supabase จะกลับไปใช้ตัวส่งของ Supabase (ส่งได้เฉพาะสมาชิกทีม, 2 ฉบับ/ชม.) — ใช้เฉพาะตอนฉุกเฉิน

## ผลทดสอบ

| วันที่ | โปรเจกต์ | โดเมนผู้ส่ง | Gmail inbox | Outlook inbox | SPF/DKIM/DMARC | เข้าสู่ระบบ 5 ครั้ง | ผู้ทดสอบ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | |
