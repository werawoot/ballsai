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

| รายการ | ก่อน | หลัง |
| --- | --- | --- |
| secret ในประวัติ git (110 commit ที่ไม่ใช่ merge) | ไม่เคยสแกน | ไม่พบ |
| `ws` (ใช้โดย supabase-js) high: DoS | 8.19.0 | 8.22.0 (PR #58) |
| `postcss` ใน Next high: อ่านไฟล์ผ่าน sourceMappingURL | 8.4.31 | 8.5.28 ผ่าน `overrides` (PR #58; CSS ที่ build ออกมาเหมือนเดิมทุกไบต์) |
| `next` 8 high + 2 critical | 14.2.35 (หมดการดูแล) | 15.5.26 พร้อม React 19 |
| `npm audit` ทั้งโปรเจกต์ | 11 รายการ (1 critical, 7 high) | **0** |
| `security/audit-exceptions.json` | 10 รายการ | `[]` |

### การอัปเกรด Next.js 15 ตรวจอะไรไปแล้ว

- ใช้ codemod ทางการ `@next/codemod next-async-request-api` เปลี่ยน `params`, `searchParams`,
  `cookies()` เป็น async ใน 56 ไฟล์ แล้วตรวจทุกจุดที่ codemod ทำเครื่องหมายไว้: จุดเดียวที่ผิดคือ
  `app/api/venues/[venueId]/photos/[photoId]/route.ts` ซึ่งถ้าใช้ตามที่ codemod ทำ ทุกคำขอตั้งปก/ลบรูปสนาม
  จะได้ 400 — แก้มือแล้ว และเปลี่ยนชุดทดสอบ API ให้ส่ง `params` เป็น Promise เหมือน Next 15 จริง
  (ชุดทดสอบนี้ FAIL 5 ข้อกับผลของ codemod ตรง ๆ และผ่านทั้ง 16 ข้อหลังแก้)
- สถานะ HTTP ของ 18 หน้าหลักเหมือน Next 14 ทุกหน้า
- ภาพหน้าจอ `/`, `/ranking`, `/login`, `/venues` ทั้ง desktop และมือถือ **ต่างกัน 0 พิกเซล**
- ทั้ง 110 route เป็น dynamic เหมือนเดิม (next-intl อ่าน cookie ทุกคำขอ) การเปลี่ยนค่า cache ของ Next 15
  จึงไม่มีผล
- JS ที่โหลดครั้งแรกเพิ่มราว 9–14 kB ต่อหน้า (React 19)

T22 ถือว่าเสร็จ: อยู่ใน CI และไม่มีช่องโหว่ระดับ high ค้าง ต่อจากนี้ช่องโหว่ใหม่จะทำให้ CI FAIL เอง
