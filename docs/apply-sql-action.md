# ลง SQL ผ่าน GitHub (Apply SQL)

ปุ่มเดียวบน GitHub ที่ลงไฟล์ SQL หนึ่งไฟล์ลง Staging หรือ Production พร้อมตรวจก่อนและหลัง
แทนการคัดลอกไฟล์ไปวางใน SQL Editor (ซึ่ง ChatGPT วางไม่ได้ และพิมพ์ไฟล์ยาวไม่ครบ)

- ไฟล์: [`.github/workflows/apply-sql.yml`](../.github/workflows/apply-sql.yml)
- ตัวตรวจ: [`scripts/sql-apply-guard.mjs`](../scripts/sql-apply-guard.mjs) (เทสต์: `tests/sql-apply-guard.test.ts`)

## ทำอะไร และกันอะไรไว้

1. รับเฉพาะไฟล์ migration ที่มีเลขกำกับ เช่น `sql/60-match-result-request-id-v1.sql`
   ไม่รับไฟล์ precheck/postcheck, ไฟล์ bundle, ไฟล์ไม่มีเลข, `sample-data.sql`,
   `supabase-rls-private-slips.sql` (AGENTS.md ข้อ 4) และ `66-...cleanup` (ลงด้วยมือไปแล้ว)
2. ตรวจว่ารหัสเชื่อมฐานข้อมูลเป็นของโปรเจกต์ที่เลือกจริง (Staging `vorpnkedpscsqhnrssrl`,
   Production `hivedzrwrrcnjrlirhtv`) ถ้าไม่ตรงหยุดทันที ก่อนส่งอะไรไปที่ฐานข้อมูล
3. Production ต้อง**พิมพ์ชื่อไฟล์ซ้ำ** และ**เจ้าของกดอนุมัติใน GitHub** ก่อนรัน
4. รัน precheck → ไฟล์หลัก → postcheck ด้วย `psql -v ON_ERROR_STOP=1` ขั้นไหน error หยุดทันที
   ไฟล์หลักทุกไฟล์มี `begin … commit` ถ้า error จะไม่มีอะไรเปลี่ยน
5. ผลทุกขั้นแสดงในหน้าสรุปของ run ให้คนตรวจเทียบกับ "ผลที่ควรได้" ในไฟล์ check
6. รันได้ทีละครั้งต่อโปรเจกต์ รหัสฐานข้อมูลอยู่ใน GitHub Secrets เท่านั้น
   GitHub ซ่อนค่าในบันทึกให้อัตโนมัติ

## ตั้งค่าครั้งเดียว (เจ้าของทำ)

**1. คัดลอกรหัสเชื่อมฐานข้อมูล ทำทีละโปรเจกต์**
Supabase Dashboard → เลือกโปรเจกต์ → ปุ่ม **Connect** → แท็บ **Session pooler** → คัดลอก URI
แล้วแทน `[YOUR-PASSWORD]` ด้วยรหัสผ่านฐานข้อมูลของโปรเจกต์นั้น
(ต้องเป็น *Session pooler* เพราะเครื่องของ GitHub ต่อแบบ Direct ซึ่งเป็น IPv6 ไม่ได้)
**ห้ามวางรหัสนี้ในแชทใด ๆ** วางใน GitHub เท่านั้น

**2. ใส่ใน GitHub**
repo `werawoot/ballsai` → Settings → Environments → New environment

| Environment | ตั้งค่า | Secret |
|---|---|---|
| `staging-db` | — | `SUPABASE_DB_URL` = URI ของ Staging |
| `production-db` | ติ๊ก **Required reviewers** ใส่ชื่อเจ้าของ | `SUPABASE_DB_URL` = URI ของ Production |

**3. merge PR ที่มีไฟล์นี้เข้า main** (ปุ่ม Run workflow จะขึ้นเมื่อไฟล์อยู่บน main)

## วิธีใช้

1. GitHub → แท็บ **Actions** → **Apply SQL** → **Run workflow**
2. ใส่ `file` (เช่น `sql/60-match-result-request-id-v1.sql`) เลือก `target`
3. Production: ช่อง `confirm` พิมพ์ชื่อไฟล์ซ้ำ (เช่น `60-match-result-request-id-v1.sql`)
   แล้วกด **Review deployments → Approve** ที่หน้า run
4. เปิด run ดูหน้าสรุป เทียบ precheck/postcheck กับผลที่ควรได้ในไฟล์ แล้วจดลง
   `docs/apply-round-2026-09.md` (ตาราง Staging/Production)

กติกาเดิมยังใช้ทุกข้อ: Staging ก่อนเสมอ, Production ต้องได้อนุมัติแยกจากเจ้าของ,
ไฟล์ที่ลงแล้วห้ามแก้ (ทำไฟล์ใหม่)

## ความเสี่ยงที่ต้องรู้

- รหัสฐานข้อมูลมีสิทธิ์เต็ม คนที่มีสิทธิ์เขียน repo สั่งรันได้ แต่ Production ต้องรอเจ้าของอนุมัติทุกครั้ง
- ถ้ารหัสรั่ว: เปลี่ยนรหัสผ่านฐานข้อมูลใน Supabase แล้วอัปเดต secret ทันที
- workflow ไม่ตัดสินแทนคนว่า precheck ผ่าน: precheck ส่วนใหญ่เป็นการอ่านค่าให้คนเทียบ
  ถ้าสงสัยให้รัน Staging ก่อนแล้วดูผล
