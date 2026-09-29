# Load test (T39)

เป้าแรกที่เจ้าของเลือก (29 ก.ย. 2026): **ผู้ใช้พร้อมกัน 200 คน นาน 10 นาที ผ่านเมื่อ p95 < 1.5 วินาที
และ error < 1%** สคริปต์: `npm run test:load` (`scripts/load-test.mjs`, ส่วนคำนวณใน `scripts/load-plan.mjs`)

## ผู้ใช้จำลองทำอะไร

| สัดส่วน | กลุ่ม | ทำอะไร |
| --- | --- | --- |
| 70% | คนทั่วไป | เปิด `/`, `/ranking` (หน้า 1–2, ดาวรุ่ง), `/athletes` (หน้า 1–2), `/tournaments`, `/hall-of-fame`, `/venues`, หน้านักกีฬาหนึ่งคน, `/api/health` |
| 25% | นักกีฬาที่ล็อกอิน | `/profile`, `/card`, `/career`, `/notifications` |
| 5% | ผู้จัด | คำนวณผลแข่ง (preview ไม่บันทึก) ไม่เกิน 3 ครั้ง/นาที เพื่อไม่ชนตัวจำกัดของ API; ที่เหลือเปิด `/dashboard/results` |

แต่ละคนรอ 1–3 วินาทีระหว่างหน้า ช่วงเพิ่มคน 60 วินาทีแรกไม่นับผล

## ความปลอดภัย: ห้ามยิง Production

ก่อนส่งโหลด สคริปต์อ่าน JavaScript ของเว็บเป้าหมายว่าคุยกับ Supabase โปรเจกต์ไหน
และ**ปฏิเสธ**ถ้าไม่ใช่ Staging (`vorpnkedpscsqhnrssrl`) หรือถ้าเป็นโดเมน Production
(Vercel Preview อาจตั้งให้ใช้ฐาน Production ได้ จึงเชื่อที่อยู่เว็บอย่างเดียวไม่ได้)

## ขั้นตอน

1. **เว็บที่ใช้ฐาน Staging:** Vercel → Settings → Environment Variables ต้องมีสภาพแวดล้อม (เช่น Preview)
   ที่ `NEXT_PUBLIC_SUPABASE_URL` ชี้ `https://vorpnkedpscsqhnrssrl.supabase.co` แล้วใช้ URL ของ deployment นั้น
2. **คุกกี้นักกีฬาทดสอบ** (ไม่บังคับ แต่ถ้าไม่มีผลจะเป็น PARTIAL): ล็อกอินเว็บ Staging ด้วยบัญชีทดสอบ →
   DevTools → Application → Cookies → คัดลอกทุกคุกกี้ที่ขึ้นต้นด้วย `sb-` เป็นรูป `ชื่อ=ค่า; ชื่อ2=ค่า2`
   (ค่านี้คือ session ห้ามแชร์ หมดอายุเมื่อ logout; สคริปต์ไม่พิมพ์และไม่เขียนลงรายงาน)
3. **ผู้จัดทดสอบ** (ไม่บังคับ): คุกกี้ของบัญชีผู้จัดแบบเดียวกัน และ id ของรายการแข่งทดสอบ ทีม A/B และ
   rank ของนักกีฬาทดสอบที่อยู่ในทีม A (หาได้จาก `/dashboard/results`)
4. รัน (ตัวอย่าง):

   ```bash
   LOAD_TEST_URL=https://<staging-deployment>.vercel.app \
   ALLOW_LOAD_TEST=true \
   SIGNED_IN_COOKIE='sb-...=...' \
   ORGANIZER_COOKIE='sb-...=...' RESULT_TOURNAMENT_ID=... RESULT_TEAM_A_ID=... RESULT_TEAM_B_ID=... RESULT_PLAYER_RANK_ID=... \
   npm run test:load
   ```

   ตั้ง `USERS`, `DURATION_SECONDS`, `RAMP_SECONDS` ได้ (ค่าเริ่ม 200 / 600 / 60) — แนะนำลอง `USERS=20 DURATION_SECONDS=60` ก่อน
5. ส่งไฟล์ `load-test-report-*.json` และผลในหน้าจอให้ Claude วิเคราะห์ และจดลงตารางข้างล่าง

ผล: **PASS** (exit 0), **FAIL** (exit 1 พร้อมเหตุผล), **PARTIAL** (exit 3: ผ่านเกณฑ์แต่มีกลุ่มที่ไม่ได้รัน ไม่นับเป็นผ่าน)
หน้า signed-in ที่เด้งไป `/login` นับเป็น error เพราะแปลว่าคุกกี้ใช้ไม่ได้

## ข้อควรรู้

- Vercel Hobby และ Supabase Free มีโควตา: 200 คน 10 นาทีประมาณ 50,000–80,000 คำขอ ดูหน้า Usage ก่อน/หลังรัน
- ยิงจากเครื่องเดียว ผลรวมเวลาเน็ตของเครื่องที่รันด้วย ใช้เน็ตที่นิ่ง
- ตัวจำกัดความถี่ของ API นับแยก (คอลัมน์ 429) ถ้าเกิน 1% ถือว่าไม่ผ่าน

## ตรวจสคริปต์แล้ว (29 ก.ย. 2026, Claude)

| ทดสอบ | ผล |
| --- | --- |
| ชี้เว็บที่ JavaScript ใช้ฐาน Production | ปฏิเสธ ไม่ส่งโหลด (อ่านแค่หน้าแรกและไฟล์ JS) |
| build จริง + Supabase จำลอง, 40 คน 30 วินาที, มีคุกกี้นักกีฬา ไม่มีผู้จัด | 570 คำขอ p95 361 ms error 0% → **PARTIAL** (exit 3) ตามที่ออกแบบ |
| คุกกี้ปลอม | `/profile` เด้ง login นับเป็น error 9% → **FAIL** |
| รายงานมีคุกกี้หรือไม่ | ไม่มี |

## ผลบน Staging

| วันที่ | ผู้ใช้ | เวลา | p95 | error | ผล | หมายเหตุ |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |
