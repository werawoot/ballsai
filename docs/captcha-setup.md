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

1. Cloudflare Dashboard → Turnstile → Add widget: ใส่โดเมน `ballsai-teal.vercel.app` (และโดเมน Preview
   ถ้าต้องการทดสอบบน Preview) โหมด **Managed** → ได้ **Site key** (เปิดเผยได้) และ **Secret key** (ห้ามเปิดเผย)
2. Vercel → Settings → Environment Variables: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` = Site key
   (Preview ก่อน) → Redeploy
3. เปิดเว็บ Preview → `/login` → ใช้อีเมล: ต้องเห็นช่องยืนยันของ Cloudflare และปุ่ม "ส่งรหัสให้ฉัน"
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
