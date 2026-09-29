# ตรวจ dependency และสแกน secret ใน CI (T22)

ทุก push และทุก PR รัน job **"Secret scan and dependency audit"** ใน `.github/workflows/ci.yml`
ไม่ต้องใช้ secret และไม่ต้องตั้งค่าอะไรเพิ่ม

## 1. สแกน secret (gitleaks)

- อ่าน **ประวัติ git ทั้งหมด** ไม่ใช่แค่ไฟล์ล่าสุด เพราะ key ที่ลบใน commit ถัดไปยังหลุดอยู่ใน commit เก่า
- ใช้กฎมาตรฐานของ gitleaks (JWT, key ของ cloud, private key, token) และกฎเพิ่มใน `.gitleaks.toml`
  สำหรับ key แบบใหม่ของ Supabase (`sb_secret_…`) ซึ่งข้าม RLS ได้
- ตัว gitleaks ล็อกเวอร์ชันไว้ (8.28.0) และตรวจ checksum ก่อนรัน
- ผลแสดงแบบ `--redact` ไม่พิมพ์ค่า secret ลง log

**ถ้า job นี้ FAIL เพราะเจอ secret:** ให้ **เปลี่ยน key ใน Supabase dashboard ก่อน** (Settings → API)
แล้วค่อยลบออกจากโค้ด การลบจากโค้ดอย่างเดียวไม่พอ เพราะ commit เก่ายังมีค่าเดิม และห้าม
`push --force` เพื่อลบประวัติ (AGENTS.md) ถ้าเป็นค่าทดสอบที่ไม่ใช่ secret จริง ให้เพิ่ม fingerprint ลงไฟล์
`.gitleaksignore` พร้อมเหตุผลใน PR

## 2. ตรวจช่องโหว่ของ dependency (`scripts/audit-gate.mjs`)

- รัน `npm audit` กับ dependency ที่ขึ้น Production (`--omit=dev`) จาก `package-lock.json`
- **FAIL** เมื่อมีช่องโหว่ระดับ high หรือ critical ที่ไม่มีข้อยกเว้น
- ระดับ moderate/low แสดงใน log แต่ไม่ FAIL
- ทางผ่านทางเดียวคือเพิ่มรายการใน `security/audit-exceptions.json` ซึ่งต้องมี `reason`, `plan`
  และ `expires` ไม่เกิน 30 วันข้างหน้า รายการที่หมดอายุ หรือที่ `npm audit` ไม่รายงานแล้ว ทำให้ FAIL
  เช่นกัน รายการจึงถูกล้างทันทีที่แก้เสร็จ
- ถ้า registry ของ npm ล่มจน audit ไม่ได้ job จะ FAIL (ไม่ผ่านแบบเงียบ) ให้รันใหม่ภายหลัง

รันเองในเครื่อง: `node scripts/audit-gate.mjs`

## 3. Dependabot (`.github/dependabot.yml`)

ทุกวันจันทร์ GitHub เปิด PR อัปเดต dependency รุ่น minor/patch รวมเป็น PR เดียว และ GitHub Actions
เดือนละครั้ง รุ่น major ไม่เปิดอัตโนมัติ เพราะต้องแก้โค้ด ทุก PR ยังต้อง CI ผ่านและต้องได้คำสั่ง merge
จากเจ้าของเหมือนเดิม

(ทางเลือกของเจ้าของ: เปิด Settings → Code security → Dependabot alerts, Secret scanning และ
Push protection ใน GitHub เพื่อให้ GitHub บล็อก secret ตั้งแต่ตอน push)

## สถานะ 29 ก.ย. 2026

| รายการ | ก่อน | หลัง PR นี้ |
| --- | --- | --- |
| secret ในประวัติ git (110 commit ที่ไม่ใช่ merge) | ไม่เคยสแกน | ไม่พบ |
| `ws` (ใช้โดย supabase-js) high: DoS | 8.19.0 | 8.22.0 แก้แล้ว |
| `postcss` ใน Next high: อ่านไฟล์ผ่าน sourceMappingURL | 8.4.31 | 8.5.28 ผ่าน `overrides` (CSS ที่ build ออกมาเหมือนเดิมทุกไบต์) |
| `next` 14.2.35: 8 high + 2 critical | — | ยังค้าง มีข้อยกเว้นถึง **13 ต.ค. 2026** |

Next.js 14 จบการดูแลแล้ว ทุกช่องโหว่แก้เฉพาะใน 15.5.24 ขึ้นไป งานถัดไปคือ **อัปเกรด Next.js เป็น 15**
(ต้องเปลี่ยน `params`, `searchParams`, `cookies()` เป็น async ราว 80 ไฟล์) ถ้าไม่เสร็จก่อน 13 ต.ค.
CI จะ FAIL ทุก branch โดยตั้งใจ T22 ถือว่าเสร็จเมื่อ `security/audit-exceptions.json` เป็น `[]`
