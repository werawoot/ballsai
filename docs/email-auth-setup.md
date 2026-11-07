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
| Sender name | Production: `DOENSAI.com` · Staging: `DOENSAI Staging` |
| Host / Port / Username | **คัดลอกจากหน้า SMTP ในบัญชี Resend ของคุณ** (Resend → Settings → SMTP) |
| Password | API key จากขั้นที่ 1 ข้อ 5 |

บันทึก แล้วตรวจว่า Rate Limits → emails sent per hour เป็น 30 (ค่าเริ่มหลังตั้ง SMTP)

## ขั้นที่ 3 — template อีเมล (แก้ "6 หลัก" และ Confirm signup ที่ไม่มีรหัส)

ใช้ template แบรนด์ DOENSAI ([`docs/email/doensai-otp.html`](email/doensai-otp.html) และ `.txt`; หัวเรื่อง `รหัสเข้าสู่ DOENSAI: {{ .Token }}`; รายละเอียดใน [`docs/supabase-auth-email-otp.md`](supabase-auth-email-otp.md)):
ไม่ระบุจำนวนหลัก ไม่มีลิงก์ (ลิงก์อาจถูกระบบสแกนอีเมลเปิดก่อนจนรหัสใช้ไม่ได้) และใช้ `{{ .Token }}`

- ใส่ทั้ง **Magic Link** และ **Confirm signup** ในทั้งสองโปรเจกต์ (Staging ตอนนี้เขียน "6 หลัก";
  Confirm signup ของ Production ไม่มี `{{ .Token }}`)
- ไฟล์เดิม `supabase-auth-email-otp*.html` เป็นแบรนด์เก่า BallDoenSai เก็บไว้เป็นประวัติ ไม่ใช้แล้ว

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
| 7 พ.ย. 2569 | Staging | `no-reply@auth.doensai.com` (Resend, Verified) | ⚠️ เข้า Inbox 1 วินาที แต่ใช้อีเมลที่**เป็นสมาชิกทีม Supabase** จึงยังไม่พิสูจน์ว่าคนนอกทีมได้รับ | ⬜ ไม่ได้ทดสอบ (ไม่มีอีเมล) | ✅ PASS ทั้งสาม (ใน Gmail header) | ⬜ เข้าสำเร็จ 1 ครั้ง ยังไม่ครบ 5 | เจ้าของ (ผ่าน ChatGPT) |
| 7 พ.ย. 2569 | Staging | `no-reply@auth.doensai.com` | ✅ Inbox ทุกฉบับ 19–34 วินาที (template DOENSAI) ด้วย Gmail alias `+doensai1` ซึ่ง Supabase นับเป็นที่อยู่นอกทีมและเป็นผู้สมัครใหม่ | ⬜ ยังไม่ได้ทดสอบ | ✅ PASS ทั้งสาม (DKIM โดเมน auth.doensai.com) | ✅ 5/5 (รวมผู้สมัครใหม่ 1 ครั้ง และ "ส่งรหัสใหม่" หลัง 60 วินาที 1 ครั้ง) | เจ้าของ (ผ่าน Claude in Chrome) |

### บันทึก 7 พ.ย. 2569 (Staging)

- โดเมน `auth.doensai.com` เพิ่มใน Resend (ทีม `topkung72`, region Tokyo) และ Verified แล้ว
  DNS ที่ Vercel: TXT `resend._domainkey.auth`, CNAME `rsend.auth`, CNAME `send.auth` และ TXT `_dmarc`
  (`p=none`, รายงานไปอีเมลของเจ้าของ) ไม่มี `_dmarc` เดิม การเพิ่ม record ใต้ `auth`
  ทำให้ wildcard ของ doensai.com ไม่ครอบคลุม `auth.doensai.com` ซึ่งไม่มีหน้าเว็บ ไม่มีผลกับเว็บหลัก
- Staging เคยตั้ง SMTP ชี้ไป Mailtrap sandbox (ไม่ส่งถึงผู้รับจริง) เปลี่ยนเป็น Resend แล้ว:
  `smtp.resend.com` port 465 user `resend`, key `supabase-staging` (Sending access เฉพาะ `auth.doensai.com`)
  ผู้ส่ง `no-reply@auth.doensai.com` ชื่อ `DOENSAI Staging`, emails sent per hour = 30
- template ของ Staging ยังเป็นแบบเก่า (เขียน "6 หลัก" แต่รหัสจริง 8 หลัก หัวเรื่องภาษาอังกฤษ ชื่อ BallDoenSai)
  ต้องวาง `docs/email/doensai-otp.html` แทนทั้ง Magic Link และ Confirm signup
- Production (`hivedzrwrrcnjrlirhtv`) ยังไม่ได้แตะ ยังใช้ตัวส่งของ Supabase
- ยังค้าง: ทดสอบกับอีเมลที่ไม่ใช่สมาชิกทีม Supabase (Gmail และ Outlook), เข้าสู่ระบบ 5 ครั้ง, แล้วจึงทำ Production
- โดเมนเก่า `balldoensai.com` ใน Resend สถานะ Failed ยังอยู่ ค่อยลบหลัง T17 เสร็จ และตรวจว่า
  `RESEND_FROM_EMAIL` ใน Vercel (อีเมลแจ้งสถานะทีม `app/api/teams/[teamId]/status/route.ts`) ไม่ได้ใช้โดเมนนั้น

### บันทึก 7 พ.ย. 2569 (Staging รอบที่ 2)

- วาง `docs/email/doensai-otp.html` และหัวเรื่อง `รหัสเข้าสู่ DOENSAI: {{ .Token }}` ใน Magic Link และ
  Confirm signup ของ Staging แล้ว ตรวจซ้ำหลังโหลดหน้าใหม่ว่าตรงต้นฉบับ
- ทดสอบด้วย `topkung72+doensai1@gmail.com` (Gmail alias: กล่องเดียวกับเจ้าของ แต่เป็นที่อยู่ที่ไม่ใช่สมาชิกทีม
  Supabase และไม่เคยสมัคร) ได้รับครบทุกฉบับ จึงยืนยันว่าข้อจำกัด "ส่งได้เฉพาะสมาชิกทีม" หมดไปบน Staging
- ยังไม่พิสูจน์: ผู้ให้บริการอื่น (Outlook/Hotmail) ไม่คัดลง Spam — ให้คนนอก 1 คนทดสอบก่อนเปิด W1
- Staging มีบัญชีทดสอบ `topkung72+doensai1@gmail.com` เพิ่ม 1 บัญชี (ยอมรับข้อกำหนดและข้ามการตั้งค่าโปรไฟล์)
- Production ยังไม่ได้แตะ
