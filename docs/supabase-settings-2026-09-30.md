# ค่าตั้ง Supabase ที่ตรวจแล้ว — Staging, 30 ก.ย. 2026

ตรวจแบบอ่านอย่างเดียวผ่าน Dashboard (ChatGPT computer use, เจ้าของส่งผลมา) ค่าที่แก้ภายหลังตามคำสั่งเจ้าของ: ข้อความ template OTP บน Staging และ Redirect URLs บน Production (ระบุไว้ในแต่ละแถว)
Staging `vorpnkedpscsqhnrssrl` และ Production `hivedzrwrrcnjrlirhtv` (ส่วนท้าย)

| หัวข้อ | ค่าบน Staging | ผลต่อระบบ | ต้องทำ |
| --- | --- | --- | --- |
| Email OTP | 8 หลัก, หมดอายุ 3,600 วินาที, Confirm email เปิด | หน้า login รับ 6–10 หลักแล้ว (T16) | — |
| ข้อความใน template | ✅ แก้แล้ว 30 ก.ย.: Magic Link "ใช้รหัสนี้เพื่อเข้าสู่ระบบ:" และ Confirm signup "ใช้รหัสนี้เพื่อยืนยันอีเมลและเข้าสู่ระบบ:" ไม่ระบุจำนวนหลัก; `{{ .Token }}` อยู่ครั้งเดียวในแต่ละ template; หัวเรื่องไม่เปลี่ยน | เดิมเขียน "6 หลัก" ขณะส่ง 8 หลัก | 👤 ทดสอบเข้าสู่ระบบ 5 ครั้งติด (T16) |
| SMTP | ใช้ custom SMTP ชื่อผู้ส่ง `BallDoenSai Staging` **โดเมนผู้ส่ง `example.com`** | `example.com` เป็นโดเมนตัวอย่าง ยืนยัน SPF/DKIM ไม่ได้ อีเมล OTP มีโอกาสตก spam หรือถูกปฏิเสธ — **สาเหตุที่เป็นไปได้ของ "ไม่ได้รับรหัส"** | 👤 T17: ใช้โดเมนจริงที่ยืนยันกับผู้ให้บริการ SMTP แล้ว (SPF/DKIM/DMARC) แล้วส่งอีเมลทดสอบ |
| Rate limit อีเมล | 30 ฉบับ/ชั่วโมง ทั้งโปรเจกต์ | พอสำหรับ W1 (5 คน) ไม่พอระดับจังหวัดขึ้นไป (ผู้ใช้ใหม่ 31 คนใน 1 ชม. จะขอรหัสไม่ได้) | 👤 ยกเพดานหลัง SMTP จริงพร้อม; ใส่ CAPTCHA (T19) ก่อนยก |
| Rate limit ตรวจ OTP | 30 ครั้ง/5 นาที ต่อ IP | โรงเรียนหรือสนามที่หลายคนใช้เน็ตเดียวกัน (IP เดียว) อาจชนเพดาน | เฝ้าดูในช่วง W1/W2 |
| CAPTCHA | ไม่ได้ตรวจ (ห้ามเปิดหน้า) | โค้ด T19 พร้อมแล้ว ปิดอยู่ | ทำตาม `docs/captcha-setup.md` เมื่อพร้อม |
| Auth logs | Free plan เก็บ log สั้น ช่วง 7 วันเลือกไม่ได้; ช่วงที่ดูได้ไม่มีรายการ OTP | ยังพิสูจน์สาเหตุ T15 จาก log ไม่ได้ | 👤 ทดสอบเข้าสู่ระบบ 5 ครั้ง แล้วเปิด Auth logs **ภายในชั่วโมงนั้น** |
| Region | Southeast Asia (Singapore) `ap-southeast-1` | ข้อมูลผู้เยาว์ไทยเก็บนอกประเทศ = การส่งข้อมูลข้ามแดนตาม PDPA มาตรา 28–29 | 👤 T26: ให้นักกฎหมายยืนยันฐานทางกฎหมายและเขียนในนโยบายความเป็นส่วนตัว (ห้ามแปลเอง) |
| Max rows (Data API) | 1,000 | query ที่ไม่แบ่งหน้าจะถูกตัดเงียบที่ 1,000 แถว — รายการสาธารณะแบ่งหน้าหมดแล้ว (T45–T49, T46) | — |
| Backup / PITR | **Free plan: ไม่มี daily backup, ไม่มี PITR** | Staging ยอมรับได้ แต่ถ้า Production เป็น Free ด้วย ข้อมูลจริงหายแล้วกู้ไม่ได้ | 👤 T29: **ตรวจแพ็กเกจ Production** ก่อน W1; ควรเป็น Pro (daily backup 7 วัน) และพิจารณา PITR |

## T15: สาเหตุที่น่าจะเป็น

หน้า login เดิม (ก่อน PR #53) รับได้ 6 หลักและข้อความใน template ก็เขียน 6 หลัก ขณะที่ Staging ส่งรหัส 8 หลัก
รหัสที่พิมพ์ได้ไม่ครบจึงถูกปฏิเสธเป็น "Token has expired or is invalid" — ตรงกับอาการที่เจอ
หน้า login ตอนนี้รับ 6–10 หลักแล้ว สิ่งที่เหลือ: แก้ข้อความใน template และทดสอบเข้าสู่ระบบ 5 ครั้งติด
(ถ้ายังล้ม ให้เปิด Auth logs ภายในชั่วโมงนั้น เพราะ Free plan เก็บ log ไม่นาน)

## Production `hivedzrwrrcnjrlirhtv` — 30 ก.ย. 2026

### 🔴 ต้องแก้ก่อน W1 (มีข้อมูลจริงของผู้เยาว์)

| หัวข้อ | ค่า | ทำไมต้องแก้ | ทำอะไร |
| --- | --- | --- | --- |
| แพ็กเกจ / backup | **Free**: ไม่มี daily backup, ไม่มี PITR | ข้อมูลผลแข่ง โปรไฟล์ และความยินยอมผู้ปกครองหายแล้วกู้ไม่ได้; โปรเจกต์ Free ถูกพักอัตโนมัติเมื่อไม่มีการใช้งานนานพอ ทำให้เว็บล่ม | 👤 อัปเป็น **Pro** (daily backup เก็บ 7 วัน) ก่อนเชิญผู้ทดสอบ W1; พิจารณา PITR เมื่อผู้ใช้โต; แล้วซ้อมกู้ (T29) |
| ส่งอีเมล | **ไม่ใช้ custom SMTP, เพดาน 2 ฉบับ/ชั่วโมงทั้งโปรเจกต์** | ทั้งเว็บขอรหัส OTP ได้แค่ 2 ครั้งต่อชั่วโมง ผู้ทดสอบคนที่ 3 จะเจอ "ขอรหัสถี่เกินไป" — น่าจะเป็นอาการ OTP ที่เคยเจอบน Production | 👤 T17: ตั้ง custom SMTP ด้วยโดเมนจริงที่ยืนยันแล้ว (SPF/DKIM/DMARC) แล้วค่อยยกเพดาน |

### 🟡 ควรแก้ / ต้องรู้

| หัวข้อ | Production | Staging | หมายเหตุ |
| --- | --- | --- | --- |
| Email OTP | 8 หลัก, 3,600 วินาที | 8 หลัก, 3,600 วินาที | ตรงกัน; หน้า login รับ 6–10 หลัก |
| Confirm email | **ปิด** | เปิด | ต่างกัน: ผู้ใช้ใหม่บน Production ได้อีเมลจาก template Magic Link (มี `{{ .Token }}`) ส่วน Staging ได้จาก Confirm signup |
| Template Confirm signup | **ไม่มี `{{ .Token }}`** | มี, ไม่ระบุจำนวนหลัก (แก้ 30 ก.ย.) | ถ้าวันหนึ่งเปิด Confirm email บน Production ผู้ใช้ใหม่จะไม่มีรหัสให้พิมพ์ — ควรเพิ่ม `{{ .Token }}` ไว้ก่อน |
| Template Magic Link | มี `{{ .Token }}`, ไม่ระบุจำนวนหลัก | มี, ไม่ระบุจำนวนหลัก (แก้ 30 ก.ย.) | ตรงกันแล้ว |
| Google / Facebook | เปิดทั้งคู่ | — | T18: Google OAuth ต้อง publish/verify; Facebook app ต้องอยู่ใน Live mode ไม่อย่างนั้นคนทั่วไปเข้าไม่ได้ |
| ตรวจ OTP | 30 ครั้ง/5 นาที | 30 ครั้ง/5 นาที ต่อ IP | ตรงกัน |
| CAPTCHA | ตรวจไม่ได้ (หน้าเมนู 404) | ไม่ได้ตรวจ | โค้ด T19 ยังปิด CAPTCHA อยู่ ถ้าเปิดใน Supabase โดยไม่มี key บน Vercel จะล็อกอินไม่ได้ |
| Region | Singapore `ap-southeast-1` | Singapore | T26 ส่งข้อมูลข้ามแดน รอนักกฎหมาย |
| Compute | `t4g.nano` | — | พอสำหรับ W1; ประเมินใหม่ตามผล load test (T39) |
| Max rows | 1,000 | 1,000 | รายการแบ่งหน้าหมดแล้ว |
| Usage (DB size, storage, MAU, egress) | **ตรวจไม่ได้** (หน้า usage ไม่แสดงค่า) | — | T38: ดูจาก Organization → Usage/Billing ภายหลัง |

### Storage buckets (อ่านอย่างเดียว, 30 ก.ย.)

| Bucket | สถานะ | ตามที่ออกแบบ | หมายเหตุ |
| --- | --- | --- | --- |
| `slips` | Private | ✅ | สลิปใช้ signed URL 60 วินาทีหลังตรวจสิทธิ์ (กฎข้อ 6 ใน `AGENTS.md`) |
| `venue-photos` | Private | ✅ | |
| `athlete-highlights` | Private | ✅ | |
| `athlete-avatars` | **Public** | ✅ ตาม `sql/athlete-profile-v2.sql` และ runbook §storage; โค้ดใช้ `getPublicUrl` | 🟡 รูปของโปรไฟล์ที่ไม่สาธารณะ (ผู้เยาว์ที่ยังไม่มีความยินยอมผู้ปกครอง หรือปิดโปรไฟล์) ยังเปิดได้โดยไม่ล็อกอินถ้ารู้ URL — งาน T51; ห้ามเปลี่ยนเป็น Private ใน Dashboard ตรง ๆ เพราะรูปโปรไฟล์ทุกหน้าจะหาย |

### Auth URL Configuration (แก้แล้ว 30 ก.ย.)

| | ก่อน | หลัง |
| --- | --- | --- |
| Site URL | `https://ballsai-teal.vercel.app` | ไม่เปลี่ยน |
| Redirect URLs | `https://ballsai-teal.vercel.app/auth/callback`, `http://localhost:3000/auth/callback`, `http://localhost:3000/**`, `ballsai://auth/callback` | `https://ballsai-teal.vercel.app/auth/callback` เท่านั้น |

- ลบ localhost ทั้งสองรายการ: ใครก็ตามที่รันเว็บบนเครื่องตัวเองที่พอร์ต 3000 เคยรับ session ของ Production ได้
- ลบ `ballsai://auth/callback`: ใน repo ไม่มีแอปมือถือหรือโค้ดที่ใช้ scheme นี้ (เจ้าของยืนยัน) และแอปใดก็จดทะเบียน scheme เดียวกันได้
- ผล: เว็บบนเครื่อง (`localhost`) และ Vercel Preview ล็อกอินเข้า Production ไม่ได้แล้ว — ตั้งใจ; งานพัฒนาใช้ Staging `vorpnkedpscsqhnrssrl`
- 👤 ยังต้องยืนยัน: ล็อกอินที่ `https://ballsai-teal.vercel.app/login` ด้วย Google และ OTP อย่างละครั้ง (ถ้า OTP ไม่มา ดู T17 ก่อน — เพดาน 2 ฉบับ/ชม.)

**เมื่อย้ายไปโดเมนจริง** (เช่น `www.balldoensai.com`): เพิ่ม `https://<โดเมน>/auth/callback` ใน Redirect URLs **ก่อน** ย้าย แล้วเปลี่ยน Site URL เป็นโดเมนใหม่ในรอบเดียวกับที่ Vercel ชี้โดเมน; เก็บ callback ของ `ballsai-teal.vercel.app` ไว้จนกว่าจะไม่มีใครใช้ แล้วค่อยลบ ถ้าลืมเพิ่มก่อน ทุกคนจะล็อกอินไม่ได้
ถ้าวันหนึ่งมีแอปมือถือ ใช้ Android App Links / iOS Universal Links บนโดเมนที่ยืนยันแล้ว แทน custom scheme
