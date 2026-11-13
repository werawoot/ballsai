# เปิด CAPTCHA ก่อนขอรหัส OTP (T19)

โค้ดติดตั้ง Cloudflare Turnstile ไว้แล้ว แต่ **ปิดอยู่** จนกว่าจะตั้ง `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
ข้อเท็จจริงทั้งหมดอ้างอิงจาก `docs/research/supabase-captcha-turnstile-2026-09-29.md`

## ทำไม

Supabase จำกัดการขอรหัสต่ออีเมล แต่บอทเปลี่ยนอีเมลได้ไม่จำกัด ทำให้ส่งอีเมลออกจำนวนมาก
(เปลือง quota SMTP และทำให้โดเมนติด spam) CAPTCHA ทำให้ทุกการขอรหัสต้องผ่านการตรวจว่าเป็นคน

## อะไรเปลี่ยนเมื่อเปิด

| การกระทำ | ต้องผ่าน CAPTCHA |
| --- | --- |
| ส่งรหัสทางอีเมล / ส่งรหัสใหม่ | ✅ |
| ผู้ดูแลเข้าด้วยรหัสผ่าน (`/login?admin=1`) | ✅ |
| พิมพ์รหัส OTP, เข้าด้วย Google/Facebook, ต่ออายุ session | ❌ ไม่ต้อง |

## ขั้นตอน (ต้องทำตามลำดับนี้)

**ห้ามเปิด CAPTCHA ใน Supabase ก่อนตั้ง site key บน Vercel** — Supabase ไม่มีโหมดเตือนอย่างเดียว
เปิดแล้วจะปฏิเสธทุกคำขอที่ไม่มี token ทันที คนจะขอรหัสและผู้ดูแลจะล็อกอินไม่ได้

1. Cloudflare Dashboard → Turnstile → Add widget: hostname `doensai.com`, `www.doensai.com`,
   **`ballsai-staging.vercel.app` (โดเมนหลักของ Staging)** และโดเมน Preview ของ Staging ที่ใช้ทดสอบ
   (ผูกกับ branch: ถ้าทดสอบ branch อื่นต้องเพิ่มชื่อนั้นด้วย, สูงสุด 10 ชื่อ)
   (แก้ 7 พ.ย. 2569: เดิมเขียน `ballsai-teal.vercel.app` ซึ่งไม่ใช่โดเมนหลักแล้ว) โหมด **Managed** → ได้ **Site key** (เปิดเผยได้) และ **Secret key** (ห้ามเปิดเผย)
   โดเมนที่ไม่อยู่ในรายการ: กล่อง Cloudflare ขึ้นแถบดำ "ยืนยันไม่ได้" และปุ่มส่งรหัสกดไม่ได้ ล็อกอินไม่ได้เลย
2. Vercel → โปรเจกต์ **ballsai-staging** (ต่อกับ Supabase Staging) → Settings → Environment Variables:
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY` = Site key → Redeploy (ยังไม่ตั้งในโปรเจกต์ `ballsai` ที่ต่อกับ Production)
3. เปิดเว็บ Staging → `/login` → ใช้อีเมล: ต้องเห็นช่องยืนยันของ Cloudflare และปุ่ม "ส่งรหัสให้ฉัน"
   กดได้หลังช่องยืนยันผ่าน — ยังไม่ต้องเปิดอะไรใน Supabase
4. Supabase **Staging** (`vorpnkedpscsqhnrssrl`) → Authentication → Attack Protection
   (Bot and Abuse Protection) → Enable CAPTCHA protection → Provider: **Turnstile** → ใส่ **Secret key** → Save
5. ทดสอบบน Staging (เกณฑ์ผ่านของ T19):
   - ขอรหัสผ่านหน้าเว็บ 5 ครั้ง (รวม "ส่งรหัสใหม่") → ได้อีเมลและเข้าสู่ระบบได้ทุกครั้ง
   - ผู้ดูแลเข้า `/login?admin=1` ได้
   - คำขอที่ไม่มี token ถูกปฏิเสธ: รันใน Terminal (ใช้ anon key ของ Staging ซึ่งเป็นค่าสาธารณะ)
     `curl -s -X POST "https://vorpnkedpscsqhnrssrl.supabase.co/auth/v1/otp" -H "apikey: <anon key>" -H "content-type: application/json" -d '{"email":"bot-test@example.com"}'`
     ต้องได้ `captcha_failed` (HTTP 400) และไม่มีอีเมลส่งออก
6. ผ่านแล้วค่อยตั้ง `NEXT_PUBLIC_TURNSTILE_SITE_KEY` บน Production → Redeploy → ตรวจข้อ 3
7. สุดท้ายเปิด CAPTCHA ใน Supabase **Production** (`hivedzrwrrcnjrlirhtv`) — ต้องอนุมัติแยก

## ย้อนกลับ

ทำกลับลำดับ: **ปิด CAPTCHA ใน Supabase ก่อน** แล้วค่อยลบตัวแปรบน Vercel
(ถ้าลบตัวแปรก่อน ทุกคำขอรหัสจะถูกปฏิเสธ)

## ความเป็นส่วนตัว (PDPA) — ต้องให้นักกฎหมายดูก่อนเปิดบน Production

ผู้ใช้ส่วนใหญ่เป็นผู้เยาว์ Turnstile ทำงานใน browser ของผู้ใช้ และ Supabase ส่ง IP ของผู้ใช้ไปให้ Cloudflare
ตรวจ token ด้วย เอกสาร Turnstile Privacy Addendum ของ Cloudflare อ่านจากเครื่องมือของเราไม่ได้ จึงยังไม่ได้
ยืนยันว่าเก็บข้อมูลอะไรและนานเท่าไร — ให้ DPO/นักกฎหมายอ่านและเพิ่มในนโยบายความเป็นส่วนตัว (ห้ามแปลเอง)

## ถ้าเพิ่ม Content-Security-Policy ในอนาคต

ต้องอนุญาต `https://challenges.cloudflare.com` ทั้ง `script-src` และ `frame-src` (ตอนนี้ยังไม่มี CSP)

## ผลทดสอบ

### 7 พ.ย. 2569 — Staging (ผ่าน)

- Cloudflare Turnstile widget "DOENSAI login" โหมด Managed, Pre-clearance ปิด
  hostnames: `doensai.com`, `www.doensai.com`,
  `ballsai-staging-git-claude-beautiful-6535f5-werawoots-projects.vercel.app`
  ขาด `ballsai-staging.vercel.app`: พบ 13 พ.ย. 2569 ตอนรัน T21 (หน้า login ของ Staging ขึ้น
  "ยืนยันไม่ได้" ล็อกอินไม่ได้) เจ้าของต้องเพิ่มเองใน Cloudflare (agent ไม่แก้การตั้งค่าความปลอดภัย)
  Site key (สาธารณะ): `0x4AAAAAAF3lomq6WKKUFfWo`
- Vercel `ballsai-staging`: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` ทุก environment แล้ว redeploy
  (โปรเจกต์ `ballsai` ที่ต่อกับ Production ยังไม่ได้ตั้ง)
- Supabase Staging (`vorpnkedpscsqhnrssrl`): เปิด CAPTCHA, Turnstile, ใส่ Secret key
- คนจริง: หน้า `/login` เห็นกล่องยืนยัน ปุ่มส่งรหัสกดได้หลังผ่านเท่านั้น เข้าสู่ระบบ 5/5
  (รวม "ส่งรหัสใหม่" หลัง 60 วินาที) อีเมลถึง Inbox ไม่เกิน 15, 15, 15, 17, 16 วินาที
- บอท: POST `/auth/v1/otp` ไม่มี token → `HTTP 400`, `captcha_failed`,
  "captcha protection: request disallowed (no captcha_token found)" และ Resend ไม่มีอีเมลไป
  `bot-test@example.com` (ยิงจากเบราว์เซอร์ของเจ้าของ เพราะเครือข่ายของผู้ช่วย AI ที่ทดสอบตัด curl)
- **ต้องทำต่อ:** Secret key เคยแสดงบนหน้าจอที่ผู้ช่วย AI ถ่ายภาพไว้ (ไม่ได้คัดลอกลงแชต)
  ให้ Rotate Secret Key ใน Cloudflare แล้ววางค่าใหม่ใน Supabase Staging
  แล้วทดสอบเข้าสู่ระบบอีกครั้ง
- ยังไม่ได้ทดสอบ: ผู้ดูแลเข้า `/login?admin=1` (เกณฑ์ข้อ 5) — ทำพร้อมรอบ Rotate Secret Key
- Production: ยังปิด รอนักกฎหมายตรวจ PDPA ตามหัวข้อข้างบน
