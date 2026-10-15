# แหล่งอ้างอิง UI และ 3D: ข้อเท็จจริงก่อนออกแบบ (15 ต.ค. 2026)

> **งานวิจัย ไม่ใช่ข้อเสนอ** โน้ตนี้เก็บข้อเท็จจริงของแหล่งอ้างอิง 6 แหล่ง แพ็กเกจ 3D และสภาพโค้ดตอนนี้
> ข้อเสนอการออกแบบเขียนแยกต่างหาก ไม่มีการแก้โค้ดแอป ไม่แตะฐานข้อมูล
> โค้ดของ repo นี้อ่านที่ commit `01f7be4` (branch ที่ทำงานอยู่ วันที่ 15 ต.ค. 2026)

คำถาม: แหล่งอ้างอิง UI/3D ที่เจ้าของส่งมา 6 แหล่ง แต่ละแหล่งคืออะไร ใช้ license อะไร ใช้เชิงพาณิชย์ได้หรือไม่
เข้ากับ stack ของเราแค่ไหน และตอนนี้โค้ดของเรามีอะไรอยู่แล้ว (สไตล์ motion และ 3D)

## เข้าถึงแหล่งข้อมูลได้แค่ไหน

| แหล่ง | ผล |
| --- | --- |
| `threeui.com`, `dribbble.com`, `spline.design`, `docs.spline.design`, `developer.mozilla.org` | **เข้าไม่ได้** proxy ตอบ `CONNECT tunnel failed, response 403` และ WebFetch ตอบ `getaddrinfo ENOTFOUND` |
| `gh api repos/...` | **เข้าไม่ได้** ตอบ HTTP 403 "GitHub access to this repository is not enabled for this session" จึงไม่ได้ดาวหรือ fork หรือข้อมูล license จาก API |
| `git clone` repo สาธารณะบน GitHub | **ได้** clone แบบ `--depth 1` ทั้ง 4 repo แล้วอ่านไฟล์ตรง ๆ (อ่านอย่างเดียว ไม่ได้รันโค้ด) |
| `raw.githubusercontent.com` | **ได้** อ่านต้นฉบับเอกสาร MDN (`mdn/content`) และไฟล์ LICENSE/โค้ดของ three.js, R3F, drei |
| `registry.npmjs.org` (`npm view`, ดาวน์โหลด tarball) | **ได้** |
| WebSearch | ได้ แต่เป็นแหล่งรอง ใช้แค่หาที่อยู่ของแหล่งหลัก ไม่ได้ใช้ยืนยันข้อเท็จจริง |

ป้ายที่ใช้: **[ยืนยันแล้ว]** = อ่านจากแหล่งหลักเองในรอบนี้ (ไฟล์ใน repo, ไฟล์ LICENSE, package.json, tarball บน npm, ต้นฉบับเอกสาร)
**[ยังไม่ได้ยืนยัน]** = เข้าแหล่งหลักไม่ได้ หรือได้มาจากแหล่งรองเท่านั้น

## สรุปสั้น

- **ThreeUI** (แหล่ง 1): ส่วน Community เป็นโอเพนซอร์ส MIT ที่ `github.com/MengTo/threeui` และบน npm ชื่อ `@designcodeio/threeui` 1.2.0 (MIT) ส่วน Pro เป็นของเสียเงินและไม่เปิดซอร์ส แพ็กเกจ npm มีขนาดแตกไฟล์ 54.7 MB และพก three.js สองเวอร์ชันมาเอง (0.128 และ 0.165) [ยืนยันแล้ว]
- **footbookr** (แหล่ง 2): Next.js 16 + Prisma + better-auth สำหรับจองสนาม **ไม่มีไฟล์ LICENSE และ README ไม่พูดถึง license** จึงถือว่าสงวนลิขสิทธิ์ทั้งหมดตามค่าเริ่มต้น ห้ามนำโค้ดมาใช้ [ยืนยันแล้ว]
- **pitch-booking-website** (แหล่ง 3): README เขียนว่า "MIT License - see the LICENSE file" **แต่ไม่มีไฟล์ LICENSE อยู่ใน repo** สิทธิ์จึงไม่ชัด รหัสผ่านเก็บแบบ base64 และการจองเก็บใน `localStorage` จึงไม่ควรนำมาใช้เป็นแบบ [ยืนยันแล้ว]
- **Sportica** (แหล่ง 4): เป็นภาพบน Dribbble ที่เปิดไม่ได้ จากผลค้นหา น่าจะเป็น Figma UI kit ที่ขายบน Craftwork [ยังไม่ได้ยืนยัน]
- **ThreeJS-Kit-Customizer** (แหล่ง 5): โค้ดเป็น **MIT** (มีไฟล์ LICENSE) แต่ **โมเดล 3D แต่ละตัวมี license ของตัวเอง** และมีตัวหนึ่งเป็น **CC BY-NC 4.0 (ห้ามใช้เชิงพาณิชย์)** README บอกว่าเป็นงานแฟนเมด "for educational and personal use only" โฟลเดอร์ `public/` ใหญ่ 184 MB (มีไฟล์ `.glb` ตัวละ 12–63 MB) [ยืนยันแล้ว]
- **Spline** (แหล่ง 6): `@splinetool/react-spline` 4.1.0 ใช้ **MIT** (มี LICENSE ใน tarball) ส่วน `@splinetool/runtime` 2.0.82 **ไม่มี license field และไม่มีไฟล์ LICENSE** มีเพียงข้อความ "© 2026 Spline, Inc." ขนาดแตกไฟล์ 36.0 MB ส่วนเงื่อนไขของไฟล์ใน Community [ยังไม่ได้ยืนยัน] เพราะเข้าเว็บไม่ได้ [ยืนยันแล้วเฉพาะเรื่องแพ็กเกจ]
- **three / R3F / drei**: ทั้งสามเป็น MIT (`three` 0.186.1, `@react-three/fiber` 9.8.2, `@react-three/drei` 10.7.9) [ยืนยันแล้ว]
- **โค้ดของเรา**: `three` 0.169.0 อยู่ใน **devDependencies** ใช้แค่ render ภาพท่าฝึกแบบ offline เป็นไฟล์ `.webp` 38 ไฟล์ (รวม 508 KB) ตัวแอป**ไม่โหลด three.js** และตอนนี้ไม่มี 3D แบบ real-time เลย [ยืนยันแล้ว]

---

## A. แหล่งอ้างอิงทั้ง 6

### ตารางรวม

| # | แหล่ง | คืออะไร | เปิดซอร์สไหม | License (จากแหล่งหลัก) | ใช้เชิงพาณิชย์ | Stack | สถานะ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | ThreeUI | คลังคอมโพเนนต์/shader/landing ที่ทำด้วย three.js (Community ฟรี, Pro เสียเงิน) | Community: เปิด · Pro: ไม่เปิด | **MIT** (Community, `LICENSE`) · ฟอนต์ OFL 1.1 · ภาพตัวอย่างจาก threeui.com ไม่ครอบคลุม | Community: ได้ ภายใต้ MIT (ต้องคงประกาศลิขสิทธิ์) · Pro: ยังไม่ได้ยืนยัน | React + Vite + three (หลายเวอร์ชัน) | ยืนยันแล้ว (repo) · เว็บ threeui.com: ยังไม่ได้ยืนยัน |
| 2 | footbookr | เว็บจองสนามฟุตบอล + แผงแอดมิน | เปิดให้อ่าน | **ไม่มีไฟล์ license = สงวนสิทธิ์ทั้งหมดตามค่าเริ่มต้น** | ไม่ได้ (ไม่มีสิทธิ์ที่ให้ไว้) | Next.js 16.1.6, React 19.2.4, Prisma 7, better-auth, shadcn/Radix, Tailwind 4 | ยืนยันแล้ว |
| 3 | pitch-booking-website ("FieldPlay") | เว็บจองสนาม หลายบทบาท | เปิดให้อ่าน | README อ้าง MIT แต่ **ไม่มีไฟล์ LICENSE** = สิทธิ์ไม่ชัด | ไม่ควรถือว่าได้ | Next.js 13.5.1, React 18.2, Prisma 6, shadcn/Radix, Chakra UI, framer-motion, cobe | ยืนยันแล้ว |
| 4 | Sportica (Dribbble) | ภาพ UI kit แอปจองคอร์ต | ไม่ใช่โค้ด | ยังไม่ได้ยืนยัน | ยังไม่ได้ยืนยัน | (ผลค้นหา: Figma) | ยังไม่ได้ยืนยัน |
| 5 | ThreeJS-Kit-Customizer | เดโม 3D เปลี่ยนสีชุดฟุตบอล | เปิด | โค้ด **MIT** · โมเดลแยก license รวม **CC BY 4.0** และ **CC BY-NC 4.0** | โค้ด: ได้ · โมเดล: ไม่ทุกตัว (NC ห้าม) · README: "educational and personal use only" | Vite 6, React 18, R3F 8, drei 9, postprocessing, GSAP, valtio, Tailwind 4 | ยืนยันแล้ว |
| 6 | Spline community + runtime | เครื่องมือออกแบบ 3D บนเว็บ + runtime สำหรับฝังฉาก | runtime: ไม่มีไฟล์ license · react-spline: เปิด | react-spline: **MIT** · runtime: ไม่ระบุ ("© 2026 Spline, Inc.") · ไฟล์ Community: ยังไม่ได้ยืนยัน | react-spline: ได้ · runtime/ฉาก: ต้องอ่าน Terms (เข้าไม่ได้) | runtime: WebGPU และ fallback เป็น WebGL | ยืนยันแล้วเฉพาะแพ็กเกจ npm |

### 1. ThreeUI: `https://threeui.com/browse?sort=recent`

- **เว็บ** threeui.com เปิดไม่ได้ (403/ENOTFOUND) จึงไม่เห็นหน้า browse จริง [ยังไม่ได้ยืนยัน]
  ผลค้นหา (แหล่งรอง, 21st.dev และ blog) ชี้ไปที่ repo `MengTo/threeui` ผู้ทำคือ Meng To จึงไปอ่าน repo แทน
- **คืออะไร** README เขียนว่า "The open-source, login-free edition of ThreeUI" ใช้ shell, browse grid, search, theme และหน้า component เดียวกับโปรเจกต์หลัก "Pro and Beta components are removed" [ยืนยันแล้ว: `README.md` บรรทัด 1–7 ที่ commit `68802d5`]
- **ความสามารถที่ตรวจได้** มี "50 Community parent components", "111 Community routes", "164 browse results" และไม่มีระบบ auth หรือ checkout ส่วน `Get Pro` ลิงก์ไป `threeui.com/pricing` [ยืนยันแล้ว: `README.md` 25–32]
  ในโฟลเดอร์ `src/shaders/` มี 47 โฟลเดอร์ เช่น `globe`, `energy-orb`, `liquid-metal-button`, `lumen-cta`, `spark-badge`, `character-carousel`, `landing-pages` แต่**ไม่พบชื่อที่เกี่ยวกับฟุตบอล สนาม หรือกีฬา** [ยืนยันแล้ว: ดูรายชื่อโฟลเดอร์]
- **reduced motion** grep หา `prefers-reduced-motion|prefersReducedMotion|reducedMotion` แล้วพบใน 24 จาก 47 โฟลเดอร์ของ `src/shaders/` (เช่น `globe`, `warp-field` และ `landing-pages` ไม่พบ) ผลนี้มาจากการค้นข้อความเท่านั้น ยังไม่ได้รันเพื่อดูพฤติกรรมจริง [ยืนยันแล้วเฉพาะผล grep]
- **License** `LICENSE` = "MIT License, Copyright (c) 2026 Meng To" README เขียนว่า "Application code, Community component code, and ThreeUI-authored Community imagery are MIT licensed. Bundled open fonts remain under the SIL Open Font License 1.1 … Remote catalog thumbnails and previews loaded from `https://threeui.com` are not redistributed" (`README.md` 102–104)
  `ASSET-LICENSES.md` บอกว่า "Some Community HTML scenes also reference open-source browser libraries from public CDNs and ThreeUI-managed public image/video endpoints" [ยืนยันแล้ว]
  → ใช้เชิงพาณิชย์ได้เฉพาะส่วน Community ภายใต้ MIT ส่วน Pro ต้องเป็นสมาชิกและ license ของ Pro [ยังไม่ได้ยืนยัน]
- **Tech stack** npm `@designcodeio/threeui@1.2.0`: license `MIT`, `dist.unpackedSize` 54,726,125 bytes, peerDependencies `react >=18 <20`, `three >=0.149 <1`, dependencies `three128: npm:three@0.128.0` และ `three165: npm:three@0.165.0` [ยืนยันแล้ว: `npm view` และ `package.json` บรรทัด 2–5, 63–69 ใน repo]
- **เข้ากับ stack ของเรา** peer รองรับ React 19 และ three 0.169 ได้ตามตัวเลข [ยืนยันแล้ว: ตัวเลข peer] แต่การพก three สองเวอร์ชันมาด้วย และบางฉากโหลดไฟล์จาก CDN/endpoint ภายนอก ขัดกับแนวทางที่แอปไม่โหลด three.js และใช้ภาพที่เราผลิตเอง ยังไม่ได้วัดว่า bundle จริงจะใหญ่แค่ไหน [ยังไม่ได้ยืนยัน: ไม่ได้ build]
- **ข้อดี** MIT, มีตัวควบคุมสด, มี subpath import ต่อ component (`README.md` 66–70)
- **ข้อเสีย/ความเสี่ยง** แพ็กเกจใหญ่, พึ่ง asset ภายนอก, สไตล์เป็น tech/abstract ไม่ใช่ sport editorial, reduced motion ไม่ครบทุกชิ้น (ตามผล grep)
- **สิ่งที่นำมาใช้ได้ (แนวคิด)** หน้า browse ที่มีตัวควบคุมสดและแท็บดูซอร์ส ใช้เป็นแบบสำหรับ "ตัวอย่างการ์ด/ธีม" ได้, ปุ่ม CTA ที่มีแสงเงาเคลื่อนไหวเบา ๆ, แยก import ราย component เพื่อคุมขนาด

### 2. footbookr: `https://github.com/saidMounaim/footbookr`

- **คืออะไร** "The modern platform for booking football pitches." ผู้เล่นดูช่องว่าง กรองตาม 5/7 คน รับ "QR Code generation for seamless check-in" ส่วนแอดมินมี "revenue charts, occupancy heatmaps" [ยืนยันแล้ว: `README.md` 5–35 ที่ commit `86528e0`, 4 ก.พ. 2026]
- **License** ค้นทั้ง tree แล้วไม่มีไฟล์ `LICENSE`/`COPYING` และ README ไม่มีหัวข้อ license → **no license file = all rights reserved by default** นำโค้ดมาใช้ไม่ได้ ดูได้อย่างเดียว [ยืนยันแล้ว]
- **Tech stack** (`package.json`) `next` 16.1.6, `react` 19.2.4, `@prisma/client` ^7.0.1, `better-auth` ^1.4.3, Radix (shadcn: มี `components.json`), `react-qr-code`, `recharts`, `embla-carousel-react`, `tailwindcss` ^4 [ยืนยันแล้ว] (README มี badge "Tailwind_CSS-3.4" ซึ่งไม่ตรงกับ package.json)
- **การกันจองซ้ำ** `lib/actions/booking.actions.ts` 74–107 ใช้ `prisma.$transaction` เพื่อ `findFirst` หาการจองเดิม แล้วค่อย `create` ส่วน `model Booking` ใน `prisma/schema.prisma` 96–110 ไม่มี `@@unique` หรือ `@@index` [ยืนยันแล้ว]
  ถ้าสองคำขอมาพร้อมกัน อาจจองซ้ำได้ เพราะเป็นการตรวจแล้วค่อยเขียนโดยไม่มี unique constraint ข้อนี้เป็นการอนุมานจากโค้ด ยังไม่ได้ทดสอบ [ยังไม่ได้ยืนยัน]
- **เข้ากับ stack ของเรา** ใช้ Next/React เหมือนกัน แต่ใช้ Prisma + better-auth แทน Supabase + RLS และใช้ shadcn ซึ่งเราไม่ได้ใช้
- **ข้อดี** flow จองสั้นและชัด, ตั๋ว QR สำหรับเช็กอิน
- **ข้อเสีย/ความเสี่ยง** ไม่มี license, ไม่มี constraint กันจองซ้ำ
- **สิ่งที่นำมาใช้ได้ (แนวคิด)** หน้า "ตั๋ว" หลังจองที่มี QR, ตัวกรองขนาดสนาม (5/7 คน) อยู่บนสุดของหน้าเลือกเวลา, ตารางช่องเวลาที่บอกชัดว่าช่องไหนว่างหรือเต็ม

### 3. pitch-booking-website: `https://github.com/lengsenghong/pitch-booking-website`

- **คืออะไร** "FieldPlay - Football Pitch Booking Platform" มีสามบทบาท (Players, Pitch Owners, Admins), ค้นหาตามทำเล/ราคา/ขนาด, ปฏิทินจอง, "Payment Integration: cash in arrival or qr code", ส่วนรีวิวยังเป็น "(not yet)" [ยืนยันแล้ว: `README.md` 1–16, 103–120 ที่ commit `6a959a4`, 20 ก.ย. 2025]
- **License** README 249–251: "This project is licensed under the MIT License - see the [LICENSE](LICENSE) file" แต่ค้นทั้ง tree แล้ว**ไม่มีไฟล์ LICENSE** และ `package.json` ไม่มี field `license` → สิทธิ์ไม่ชัด ไม่ควรนำโค้ดมาใช้ [ยืนยันแล้ว]
- **Tech stack** `next` 13.5.1, `react` 18.2.0, `@prisma/client` ^6.15.0, Radix หลายตัว (shadcn: มี `components.json`), `@chakra-ui/react` ^3.27.0, `framer-motion`/`motion` ^12.23.16, `cobe` ^0.6.5 (globe), `magic-ui`, `tailwindcss` 3.3.3 [ยืนยันแล้ว: `package.json`]
- **ข้อเท็จจริงด้านความปลอดภัย** [ยืนยันแล้ว]
  - `lib/auth.ts` 5–16: `hashPassword` คือ `Buffer.from(password + "fieldplay_salt").toString("base64")` ซึ่งมีคอมเมนต์ในโค้ดเองว่า "In production, use bcrypt or similar"
  - `app/book/[id]/page.tsx` 65, 116, 153–166: อ่าน `currentUser` และเก็บการจองใน `localStorage`
  - มีไฟล์ชื่อ `npm` ขนาด 0 byte ค้างอยู่ใน root ของ repo
- **เข้ากับ stack ของเรา** น้อย เพราะ Next 13, React 18 และใช้ UI kit สองชุดปนกัน
- **ข้อดี** README อธิบายบทบาทเจ้าของสนามไว้ครบ (ตั้งเวลาว่าง, อนุมัติ/ปฏิเสธ, ดูรายได้)
- **ข้อเสีย/ความเสี่ยง** ไม่มีไฟล์ license, auth ไม่ปลอดภัย, state อยู่ฝั่ง client
- **สิ่งที่นำมาใช้ได้ (แนวคิด)** ใช้รายการงานของเจ้าของสนามเป็น checklist เทียบกับ `/venue` ของเรา, flow ขอยกเลิกที่มีขั้นอนุมัติ (`api/bookings/[id]/cancel/approve`, `cancellation-response`)

### 4. Sportica: `https://dribbble.com/shots/27351682-Sportica-Sport-center-court-Booking-App-UI-KIT`

- **หน้า Dribbble เปิดไม่ได้** (proxy 403 / ENOTFOUND) ไม่ได้เห็นภาพ ผู้ออกแบบ หรือคำอธิบาย [ยังไม่ได้ยืนยัน]
- จาก WebSearch (แหล่งรอง): มีหน้าสินค้า `craftwork.design/product/sportica-sport-center-court-booking-mobil` บอกว่าเป็น Figma mobile UI kit สำหรับ "sports centers and court booking", มี 200+ screens, 109+ components, light/dark, ฟอนต์ Google Fonts, ภาพ Unsplash [ยังไม่ได้ยืนยัน: เป็นสรุปของ search engine ยังไม่ได้เปิดหน้าสินค้า และยังไม่ได้ยืนยันว่าเป็นชิ้นเดียวกับภาพบน Dribbble]
- **License/การใช้เชิงพาณิชย์** ยังไม่ได้ยืนยัน ถ้าเป็นสินค้าขาย ต้องซื้อและอ่าน license ของร้านก่อน ห้ามคัดลอกหน้าจอจากภาพ Dribbble
- **Tech stack/ความเข้ากัน** ไม่ใช่โค้ด (ภาพหรือไฟล์ Figma)
- **สิ่งที่นำมาใช้ได้ (แนวคิด)** ดูได้แค่ระดับ pattern ทั่วไปของแอปจองคอร์ต (การ์ดสนาม, ตัวเลือกวัน/เวลา, สรุปก่อนจ่าย) โดยไม่คัดลอกภาพหรือ layout เฉพาะ

### 5. ThreeJS-Kit-Customizer: `https://github.com/Footprintarts/ThreeJS-Kit-Customizer`

- **คืออะไร** "Interactive 3D Football Kit Customization with Three.js" หมุน/ซูมกล้อง, เปลี่ยนสีชุด, สลับโมเดลนักเตะ, มีพร็อพ (บอล, ถ้วย, กรวย, แพะ) และเครื่องเล่นเพลง [ยืนยันแล้ว: `README.md` 7–43 ที่ commit `6f54021`, 10 มี.ค. 2025]
- **ข้อจำกัดความรับผิด** "This project is a fan-made demonstration and is not affiliated with or endorsed by any of the football clubs … This project is for educational and personal use only." (`README.md` 3–5) [ยืนยันแล้ว]
- **License**
  - โค้ด: `LICENSE` = "MIT License, Copyright (c) 2025 Footprint Arts" (`README.md` 95–97 ยืนยันเช่นกัน) [ยืนยันแล้ว]
  - โมเดล (`README.md` 13–23): Palestine 2022 jersey และ UCL trophy จาก CGTrader (ไม่ได้ระบุ license), "FIFA Club World Cup … licensed under Creative Commons Attribution (CC BY 4.0)", ลูกบอลและกรวยจาก BlenderKit (ไม่ได้ระบุ license), "CHINESE GOAT MODEL … licensed under Creative Commons Attribution-NonCommercial (CC BY-NC 4.0)" [ยืนยันแล้ว: ข้อความใน README · license จริงของ CGTrader/BlenderKit ยังไม่ได้ยืนยัน]
  - เพลงใน `public/music/sport1–5.mp3` (รวม 18 MB) ไม่มีที่มาหรือ license ระบุใน `src/components/songs.js` [ยืนยันแล้วว่าไม่มีการระบุ]
  - ชื่อไฟล์โมเดลเช่น `LaPulga.glb`, `Jude.glb` และชื่อถ้วยรางวัลอ้างถึงบุคคลหรือแบรนด์จริง [ยืนยันแล้ว: ชื่อไฟล์] สิทธิ์ภาพลักษณ์/เครื่องหมายการค้า [ยังไม่ได้ยืนยัน]
- **ขนาด asset** `public/` 184 MB, `.glb` ได้แก่ `Pose.glb` 63,252,488 B, `GOAT.glb` 35,288,464 B, ตัวละครแต่ละตัว ~12.6 MB, `ballLime.glb` 973,724 B [ยืนยันแล้ว: `ls -la`]
- **Tech stack** `react` ^18.3.1, `@react-three/fiber` ^8.18.0, `@react-three/drei` ^9.122.0, `@react-three/postprocessing`, `gsap`, `locomotive-scroll`, `valtio`, `vite` ^6 [ยืนยันแล้ว: `package.json`]
  `src/components/Scene.jsx` 59–63: `<Canvas shadows camera={{ … fov: isMobile ? 45 : 25 }} style={{ height: "100vh" }}>` ห่อด้วย `<Suspense>` ที่ไม่มี fallback ใน `src/` ไม่พบโค้ดตรวจ reduced motion, ตรวจ WebGL หรือปรับ DPR [ยืนยันแล้ว: grep]
- **เข้ากับ stack ของเรา** R3F 8 และ drei 9 ต้องใช้ React 18 ส่วนเราใช้ React 19.3.0 (R3F 9 ต้องใช้ React 19, ดูส่วน B) จึงใช้ตรง ๆ ไม่ได้ [ยืนยันแล้ว: peerDependencies]
- **ข้อดี** เป็นตัวอย่างโค้ดสั้นของการเปลี่ยนสีวัสดุและสลับโมเดลใน R3F
- **ข้อเสีย/ความเสี่ยง** asset ใหญ่มากสำหรับมือถือ, license ของ asset ปนกัน (มี NC), มีชื่อบุคคล/แบรนด์จริง, ไม่มี fallback
- **สิ่งที่นำมาใช้ได้ (แนวคิด)** "แต่งชุดทีมของฉัน" ด้วยการเลือกสีจาก palette แล้วเห็นผลทันที ใช้กับ Player Card ได้โดยใช้ภาพที่เราผลิตเอง (แบบเดียวกับหุ่นไม่มีหน้าใน `scripts/training-art/`) ไม่ใช้โมเดลของ repo นี้

### 6. Spline: `https://spline.design/community` + runtime

- **Spline Community** เว็บเข้าไม่ได้ จึงไม่ได้ค้น football/soccer ball/stadium และไม่ได้อ่านเงื่อนไขของไฟล์ Community [ยังไม่ได้ยืนยัน] WebSearch ก็ไม่พบหน้า license ของ Spline เอง
- **สิ่งที่ยืนยันได้จากเอกสารใน tarball ของ `@splinetool/runtime@2.0.82`** (`package/AGENTS.md` ซึ่งเขียนว่า "Everything here is checked against this package's source") [ยืนยันแล้ว]
  - "A **Spline Community scene has no `.splinecode` URL.** … the human remixes it, exports their copy as Code" ต้องกด Remix ในแอป Spline ก่อน จะใช้จากโค้ดตรง ๆ ไม่ได้
  - Attribution: "The Spline watermark is **baked into the scene data** by the publisher … you should never write code that tries to hide it" และแนะนำให้ใส่ลิงก์ "Made with Spline" กับ "scene by @creator" เมื่อฉากมาจาก Community
  - Renderer: "WebGPU where the browser grants an adapter, WebGL everywhere else, with a WebGL fallback on any WebGPU init failure"
  - `wasmPath`: "where to load the runtime's wasm from; CDN when unset" (ตั้งไว้ใน `Constructor options`)
  - Performance: แนะนำให้ preload ไฟล์ `.splinecode`, "Mount lazily … behind an `IntersectionObserver`", "`dispose()` on unmount, or you leak a WebGL/WebGPU context per mount"
  - "No plan or entitlement information … link to https://spline.design/pricing"
- **แพ็กเกจ** [ยืนยันแล้ว: `npm view` + เนื้อหา tarball]
  - `@splinetool/runtime` 2.0.82: **ไม่มี field `license`**, tarball มีแค่ `package.json`, `README.md`, `AGENTS.md`, `runtime.d.ts`, `build/` (**ไม่มีไฟล์ LICENSE**) และ `description` จบด้วย "© 2026 Spline, Inc." → ถือว่าสงวนสิทธิ์ ต้องอ่าน Terms ของ Spline ก่อนใช้ (เข้าไม่ได้) ขนาดแตกไฟล์ 36,031,457 B (`build/runtime.js` 131,110 B ส่วนที่เหลือเป็น module/wasm ย่อย) ยังไม่ได้วัดว่าหน้าเว็บโหลดจริงกี่ไบต์
  - `@splinetool/react-spline` 4.1.0: มี `LICENSE` = "MIT License, Copyright (c) 2022 Spline, Inc." (package.json ไม่มี field license), ขนาดแตกไฟล์ 26,806 B, peer `@splinetool/runtime: *`, `next >=14.2.0`
  - README ของ react-spline: import `@splinetool/react-spline/next` แล้ว "the server will render an autogenerated blurred placeholder", มีหัวข้อ "Lazy loading" ด้วย `React.lazy`, prop `renderOnDemand` "Default `true`"
- **เข้ากับ stack ของเรา** peer รองรับ Next ≥14.2 และ React ใดก็ได้ [ยืนยันแล้ว] แต่ฉากต้องโหลดจาก `prod.spline.design` และ wasm โหลดจาก CDN ของ Spline เป็นค่าเริ่มต้น ทำให้พึ่งบริการภายนอก [ยืนยันแล้ว: ตามเอกสาร]
- **ข้อดี** ออกแบบฉากด้วยเครื่องมือภาพ ไม่ต้องเขียนโค้ด 3D, มี placeholder ฝั่ง server สำหรับ Next
- **ข้อเสีย/ความเสี่ยง** runtime ไม่มี license เปิด, มี watermark ตามแพลน (แพลนไหนบ้าง: ยังไม่ได้ยืนยัน), พึ่ง CDN ภายนอก, ขนาดแพ็กเกจใหญ่
- **สิ่งที่นำมาใช้ได้ (แนวคิด)** ใช้ placeholder แบบเบลอก่อนฉาก 3D โหลด, mount เมื่อเลื่อนมาถึงเท่านั้น และเรนเดอร์เฉพาะเมื่อมีการเปลี่ยนแปลง ทั้งสามข้อใช้ได้แม้ไม่ได้ใช้ Spline

---

## B. แพ็กเกจ 3D

| แพ็กเกจ | เวอร์ชันล่าสุด (npm, 15 ต.ค. 2026) | License | unpackedSize (byte) | peerDependencies ที่สำคัญ | แหล่ง |
| --- | --- | --- | --- | --- | --- |
| `three` | 0.186.1 | MIT (`LICENSE`: "The MIT License, Copyright © 2010-2026 three.js authors") | 20,443,256 | ไม่มี | `npm view three`, `raw.githubusercontent.com/mrdoob/three.js/dev/LICENSE` |
| `@react-three/fiber` | 9.8.2 | MIT (`LICENSE`: "Copyright (c) 2019-2025 Poimandres") | 2,399,634 | `react >=19 <19.4`, `react-dom >=19 <19.4`, `three >=0.156` | `npm view`, `pmndrs/react-three-fiber/master/LICENSE` |
| `@react-three/drei` | 10.7.9 | MIT (`LICENSE`: "Copyright (c) 2020 react-spring") | 1,753,692 | `react ^19`, `three >=0.159`, `@react-three/fiber ^9.0.0` · dependencies รวม `detect-gpu`, `three-stdlib`, `troika-three-text`, `hls.js`, `@mediapipe/tasks-vision` | `npm view`, `pmndrs/drei/master/LICENSE` |
| `@splinetool/react-spline` | 4.1.0 | MIT (ไฟล์ `LICENSE` ใน tarball) | 26,806 | `@splinetool/runtime *`, `next >=14.2.0` | `npm view`, tarball |
| `@splinetool/runtime` | 2.0.82 | **ไม่ระบุ** (ไม่มี field และไม่มีไฟล์) | 36,031,457 | ไม่มี | `npm view`, tarball |
| `@designcodeio/threeui` | 1.2.0 | MIT | 54,726,125 | `react >=18 <20`, `three >=0.149 <1` · deps `three@0.128.0`, `three@0.165.0` (alias) | `npm view`, `package.json` ใน repo |

หมายเหตุ [ยืนยันแล้ว] `unpackedSize` คือขนาดไฟล์ทั้งหมดในแพ็กเกจ **ไม่ใช่**ขนาดที่ส่งให้เบราว์เซอร์หลัง tree-shaking ในรอบนี้ไม่ได้ build จึงไม่มีตัวเลข bundle จริง [ยังไม่ได้ยืนยัน]

ความเข้ากันกับ repo (เวอร์ชันที่ติดตั้งจริงใน `node_modules`): `react` 19.3.0, `three` 0.169.0, `next` 15.5.26
→ R3F 9.8.2 (`react >=19 <19.4`, `three >=0.156`) และ drei 10.7.9 ตรงตาม peer [ยืนยันแล้ว: ตัวเลข] แต่ยังไม่ได้ลองติดตั้งหรือ build [ยังไม่ได้ยืนยัน]

### เอกสารทางการ: reduced motion และ WebGL fallback

- **`prefers-reduced-motion`** (ต้นฉบับ MDN `files/en-us/web/css/reference/at-rules/@media/prefers-reduced-motion/index.md` ใน `mdn/content`) [ยืนยันแล้ว]
  - "used to detect if a user has enabled a setting on their device to minimize the amount of non-essential motion"
  - "Animations such as scaling or panning large objects can be vestibular motion triggers."
  - `reduce` "evaluates as true; therefore, `@media (prefers-reduced-motion)` is equivalent to `@media (prefers-reduced-motion: reduce)`"
  - ตั้งค่าได้ที่ "In Android 9+: Settings > Accessibility > Remove animations." และ "In iOS: Settings > Accessibility > Motion."
- **ตรวจ WebGL** (MDN `web/api/webgl_api/by_example/detect_webgl/index.md`) [ยืนยันแล้ว] สร้าง `canvas` ที่ไม่ใส่ในหน้า แล้ว `canvas.getContext("webgl")` ถ้าได้ `WebGLRenderingContext` ถือว่ารองรับ ถ้าไม่ได้ให้แสดง "Failed. Your browser or device may not support WebGL."
- **three.js** `examples/jsm/capabilities/WebGL.js` (branch `dev`) [ยืนยันแล้ว] `isWebGL2Available()` คือ `!!(window.WebGL2RenderingContext && canvas.getContext('webgl2'))` ใน `try/catch` และ import ได้จาก `three/addons/capabilities/WebGL.js`
- **Spline runtime** มี WebGL fallback ในตัวเมื่อ WebGPU ใช้ไม่ได้ (ดูข้อ 6) [ยืนยันแล้ว: ตาม AGENTS.md ของแพ็กเกจ]

---

## C. สภาพปัจจุบันของโค้ด (commit `01f7be4`)

ทุกข้อในส่วนนี้ [ยืนยันแล้ว] จากการอ่านไฟล์ใน repo

### Dependencies (`package.json`)

- dependencies: `@supabase/ssr`, `@supabase/supabase-js`, `@vercel/analytics`, `@vercel/speed-insights`, `lucide-react` ^0.577.0 (บรรทัด 26), `next` ^15.5.26 (27), `next-intl`, `react`/`react-dom` ^19.3.0 (29)
- devDependencies: `tailwindcss` ^4.3.3 (39) + `@tailwindcss/postcss`, **`three` 0.169.0 (40, ตรึงเวอร์ชัน)**, `vitest`, `eslint`, `typescript`
- **ไม่มี** library animation (framer-motion/GSAP), R3F, drei, Spline, shadcn/Radix

### สไตล์

- `postcss.config.mjs` ใช้ `@tailwindcss/postcss` ส่วน `app/globals.css` บรรทัด 1–3 เป็น `@tailwind base; @tailwind components; @tailwind utilities;`
- ชื่อ class เป็น CSS ที่เขียนเองพร้อม prefix ต่อหน้า (`home-`, `ui-`, `bds-`, `tn-`, `pf-`, `tr-`…) จากการ grep หา class แบบ utility (`flex`, `px-4`, `bg-red-500`…) ใน `className="…"` ไม่พบ utility ของ Tailwind (ที่ตรงเป็นแค่ชื่อ custom เช่น `tn-grid`, `pf-grid`) และไม่มี `components.json` → **ไม่ได้ใช้ shadcn** ส่วน Tailwind ติดตั้งไว้แต่แทบไม่ได้ใช้ utility (ยังไม่ได้ตรวจว่า directive แบบ `@tailwind` ทำงานอย่างไรกับ v4 [ยังไม่ได้ยืนยัน])
- inline `style={{` พบ 885 บรรทัดใน `app/` และ `components/` (เช่น `app/venues/page.tsx` บรรทัด 29, `app/guardian/GuardianLinksClient.tsx` บรรทัด 69)
- **Design tokens** `app/ui.css` บรรทัด 6–11: `--ui-red: #CC0001`, `--ui-red-hot: #e0171d`, `--ui-ink: #0b0f16`, `--ui-paper: #f6f3ee`, `--ui-gold: #f4b942`, `--ui-green`, `--ui-blue`, มุมโค้ง 10/14/20 px สรุปไว้ใน `docs/design-system.md` ("หลัก 6 ข้อ": สองพื้นผิว Stadium/Paper, หัวข้อไทยตัวทึบ Sarabun 800, ปุ่มหลักหนึ่งปุ่มต่อจอ, ทุกตัวเลขบอกที่มาด้วย `ui-chip`) ซึ่งเขียนว่าใช้ "ยกเว้นหน้าแรก (AGENTS.md กฎข้อ 7)"
- **หน้าแรกใช้ชุดสีของตัวเอง** `app/globals.css` บรรทัด 21: `.home-page { --ink: #111827; --red-hot: #d71920; --red-light: #f14e52; --pitch: #147a47; --gold: #f4b942; --paper: #f8f5ef; … }` และ `:root` บรรทัด 6–7 มี `--red: #d71920` แดงของหน้าแรกจึงเป็น `#d71920` ไม่ใช่ `#CC0001` (`#CC0001` ใช้ใน `ui.css`, bottom nav `--nav-red` บรรทัด 145 และ inline style หลายหน้า)
- CSS แยกต่อหน้า: `app/card/card.css`, `app/profile/profile.css`, `app/tournaments/tournaments.css`, `app/training/training.css`, `app/match-plan/match-plan.css`, `app/players/[id]/player.css`, `app/impact/impact.css`, `app/notifications/notifications.css`, `app/team-members/team-hub.css`, `app/venue/operations.module.css`, `components/fixture-board.css`

### ฟอนต์

`app/layout.tsx` บรรทัด 4: `import { Sarabun, Oswald, Barlow_Condensed } from 'next/font/google'`
Sarabun `subsets: ['thai','latin']` weight 300–800, Oswald 400–700, Barlow Condensed 600–900 (บรรทัด 12–25) และใช้เป็นตัวแปร `--font-sarabun`, `--font-oswald`, `--font-barlow`

### Motion และ animation

- `@keyframes` ที่หน้าแรก (`app/globals.css` บรรทัด 70): `riseIn`, `fadeIn`, `fieldDrift`, `spinOrbit`, `playerFloat`, `livePulse`, `scrollDown`, `marquee`, `ballBreathe`, `slideTextIn`, `infoFloat`, `infoSpin` และที่อื่น: `bds-nav-pending` (167), `bds-route-progress` (179), `bds-skel-sweep`/`bds-skel-rise` (207–208), `pc-spin`/`pc-rise` (`app/card/card.css` 119, 131), `pf-spin` (`profile.css` 189), `tn-pulse` (`tournaments.css` 27), keyframes ใน `<style>` ของ `components/LoadingModal.tsx` 31–39
- ตัวอย่าง: `.home-pitch-one { animation: fieldDrift 20s ease-in-out infinite alternate; }` (globals.css บรรทัด 40)
- **`prefers-reduced-motion`** มีอยู่ 15 จุด (CSS 14 จุด + JS 1 จุด): `app/globals.css` 72 (หน้าแรกทั้งหมด: `animation-duration: .01ms !important; … transition-duration: .01ms !important`) และ 210, `app/ui.css` 90, `card.css` 178, `impact.css` 141, `tournaments.css` 187, `notifications.css` 66, `training.css` 144, `match-plan.css` 87 และ 116, `player.css` 180, `profile.css` 53 และ 294, `team-hub.css` 55 (`no-preference` สำหรับ smooth scroll) และใน JS ที่ `app/card/PlayerCardBuilder.tsx` 92 (`window.matchMedia?.('(prefers-reduced-motion: reduce)')`)
- **Carousel หน้าแรก** `app/HomeHeroCarousel.tsx` 18: `window.setInterval(…, 7500)` เลื่อนสไลด์เองทุก 7.5 วินาที ไม่มีปุ่มหยุด และไม่มีการตรวจ reduced motion ใน JS (กฎ CSS บรรทัด 72 ทำให้ transition สั้นลง แต่ไม่หยุดการเลื่อนอัตโนมัติ)

### หน้าแรก

- `app/page.tsx`: server component อ่านอันดับและรายการแข่งจริงผ่าน `getPublicRankings({ sport: ACTIVE_SPORT, season: ACTIVE_SEASON })` และ `getPublicOpenTournaments()` (บรรทัด 27–31) ใช้ข้อมูลตัวอย่างเฉพาะเมื่อ `showDemoData` (33–34), header มีโลโก้, เมนู desktop (การแข่งขัน, Ranking, นักกีฬา, เรื่องของเรา), ปุ่มค้นหานักกีฬาและเข้าสู่ระบบ (39–57), จากนั้นเป็น `HomeHeroCarousel` และ `HomeHighlightsRail`
- `app/HomeHeroCarousel.tsx` (client): สไลด์ 3 ใบ, ปัดด้วยนิ้วเมื่อระยะเกิน 42 px, ลายสนาม/วงโคจร/เกรน วาดด้วย CSS ล้วน, "ผู้เล่น" เป็นเลข 10 กับไอคอน `Zap` ใน `aria-hidden` (ไม่มีรูปภาพหรือ 3D), มี `aria-roledescription="carousel"` และปุ่มก่อนหน้า/ถัดไป/จุด พร้อม `aria-label`
- `docs/ux-audit/status.md` ("รอบเข้าใจง่าย") บันทึกว่า "พบบั๊กสีที่หน้าแรก (ปุ่มที่สองอ่านไม่ออก) ส่งให้หัวหน้า ไม่ได้แตะหน้าแรก"

### Navigation

- `components/SiteNav.tsx` (172 บรรทัด) แถบล่างแบบ fixed: `.bds-nav` ใน `app/globals.css` 148 (`position:fixed; bottom:0; height: calc(70px + env(safe-area-inset-bottom))`, พื้นเข้ม, backdrop blur), ปุ่ม `min-height:52px` (149), active ใช้สีทอง (159), `:focus-visible` outline ทอง (161)
- รายการตามบทบาทอยู่ใน `lib/site-nav.ts` (เช่น home/discover/tournaments/notifications/profile, นักกีฬามี training/card/team, ผู้ปกครองมี kids, ผู้จัดมี manage/results) คอมเมนต์บรรทัด 6–7 ระบุว่าแถบเดิม 9 ช่องกว้างเกินจอ 375 px
- มีแถบ progress ระหว่างเปลี่ยนหน้า (`bds-route-progress`) และ `aria-live="polite"` (SiteNav 170)

### รูปภาพ

- `next/image` ใช้ใน 12 ไฟล์ (เช่น `app/training/drills/[drillId]/page.tsx` 22 ใช้ `fill priority sizes=… unoptimized`, `app/venues/[id]/VenueGallery.tsx`, `app/tournaments/[id]/PaymentStep.tsx`) และไม่พบแท็ก `<img` ดิบใน `app/` หรือ `components/`
- `public/`: `login-hero.jpg` (68,295 B), `public/training/drills/*.webp` 38 ไฟล์ รวม 508 KB (ไฟล์ใหญ่สุด `d6-shuttle.webp` 15,952 B)
- `components/VenuePitchCover.tsx`: สนามที่วาดด้วย SVG/CSS ใช้แทนเมื่อสนามไม่มีรูป ("no external URL, no stock image, nothing fetched"), `role="img"` + `aria-label`

### 3D ที่มีอยู่: "ภาพท่าฝึก 3D" เป็นภาพนิ่ง ไม่ใช่ 3D แบบ real-time

- `scripts/training-art/scene.js`: ฉาก three.js "a faceless training mannequin (no face, no real person: the users are minors) on a pitch, with cones, ball, wall and ground arrows. Rendered once, offline" ใช้ `WebGLRenderer`, เงา, ACES tone mapping, เสื้อสีแดงแบรนด์
- `scripts/training-art/poses.mjs`: 38 ฉาก (กลุ่ม A–D) กำหนดมุมข้อต่อ กล้อง กรวย ลูกบอล และลูกศร
- `scripts/training-art/render.mjs` 1–8: ใช้ Playwright + Chromium (SwiftShader) เรนเดอร์เป็น `public/training/drills/<drill>.webp` (คุณภาพ 0.82) และระบุชัดว่า "The images are committed; the app never loads three.js."
- `lib/training/content.ts` 26–27: "Every drill picture is our own 3D render (scripts/training-art), never a source's media." และ `drillImage = id => /training/drills/${id}.webp`
- เพิ่มเข้ามาใน commit `1ddd19a` ("Training feature V1: … 3D drill pictures, SQL63")
- `docs/agents/senior-ux.md` 50: mockup ห้ามใช้ภาพเด็กจริง ให้ใช้หุ่น 3D ไม่มีหน้า

### หน้าสนาม/การจอง

- ผู้ใช้: `app/venues/page.tsx` (รายการ + `Pagination`), `app/venues/[id]/page.tsx` + `VenueGallery.tsx`, `app/venues/BookingRequestClient.tsx`, `app/venues/bookings/page.tsx` + `BookingHistoryList.tsx`, `app/venues/bookings/[bookingId]/page.tsx` + `BookingCoordination.tsx`
- เจ้าของสนาม: `app/venue/page.tsx`, `VenueOwnerClient.tsx`, `VenueOperations.tsx`, `VenuePhotoManager.tsx`, `operations.module.css`
- แอดมิน: `app/admin/venue-photos/VenuePhotoModerationList.tsx`
- คอมโพเนนต์: `components/VenueCard.tsx`, `components/VenuePitchCover.tsx`

### รายงาน UX ที่มีอยู่ (`docs/ux-audit/`)

| ไฟล์ | หัวเรื่อง |
| --- | --- |
| report-1 | UX audit รอบที่ 1: 5 flow แบบผู้ใช้ครั้งแรก |
| report-2 | UX audit รอบที่ 2: mockup v2 มินิมอล และแตะให้น้อยที่สุด |
| report-3 | บันทึกผลแข่ง (mockup v2-3) สร้างจริงแล้ว |
| report-4 | flow 3 โค้ชสร้างทีมและเชิญนักกีฬา (6 ต.ค. 2026, local mock) |
| report-5 | flow 4 ผู้จัด: สร้างรายการ → รับสมัคร → สลิป → จับสลาก → บันทึกผล |
| report-6 | flow 5 นักกีฬาที่กลับมา: `/profile` → ฝึกซ้อม → การ์ดและอันดับ |
| report-7 | UX audit รอบ 7: ผู้ใช้ใหม่ถึง Player Card |
| report-8 | รอบ "เข้าใจง่าย" ทั้งเว็บ |
| report-9 | หน้าหลักตามบทบาท (audit + mockup) |
| report-10 | เข้ามาแล้วใช้ได้เลย เชิญทีหลัง (แบบร่าง, local mock) |

เรื่องที่ยังค้างจาก `status.md` (ปรับล่าสุด 6–8 ต.ค. 2026):
- mockup v3-A, v4-A/B/C, v5-A/B/C, v3-B/C "สร้างแล้ว รอหัวหน้า review", ส่วน v2-1, v2-2, v2-4, v2-5 "รอ (ติดเรื่องฐานข้อมูล/กฎหมาย/เลือก ก./ข.)"
- ยังไม่มีช่องทางขอสิทธิ์ผู้จัด, คำถามเรื่องอาการเจ็บ "รอผู้รู้ตรวจ"
- report-9: โค้ชกดทางลัดแดชบอร์ดแล้วเจอ "ยังไม่เปิดสิทธิ์ผู้จัด" (F2) และ persona มีค่าเดียว (F3)
- ระยะ 1 ลงโค้ดแล้ว (branch `claude/funny-bohr-aoffz9`) แต่ "ยังไม่ได้ทำ": คำเก่าที่ฝังในโค้ดนอก messages (`/career`, `/hall-of-fame`, `/scout`, `/players/[id]` "STARTER"…), ป้ายอังกฤษบนการ์ด (`SEASON`), ปุ่ม EN บน `/login`, **หน้าแรก (ไม่แตะ)**
- บั๊กสีปุ่มที่สองในหน้าแรก (ดูข้างบน)

### รูปแบบการเข้าถึงได้ (accessibility)

- เป้าหมายการกด 44 px: `docs/design-system.md` ("เป้ากดอย่างน้อย 44px"), `.ui-btn` `min-height: 54px` (`app/ui.css`), `min-height:44px` ใน `app/globals.css` 117, 127, 139, 182, 388 และ utility `.tap-44` (402), ปุ่ม nav 52 px (149)
- Focus: `.ui-btn:focus-visible, .ui-field:focus-within, .ui-option:focus-visible { outline: 3px solid var(--ui-gold); outline-offset: 2px; }` (`app/ui.css` 36) และ outline ทองใน header/nav/tabs/lang switch (`globals.css` 132, 141, 161, 185)
- ARIA: `aria-current="page"` และ `aria-busy` ใน nav, `aria-live` status, `aria-pressed` สำหรับตัวเลือก, `role="progressbar"` และ `role="alert"` (ตาม `docs/design-system.md`), `.sr-only` (`globals.css` 209), `role="img"` + `aria-label` ใน `VenuePitchCover`
- ข้อความแปลอยู่ใน `messages/*.json` (ADR-009 ตาม design-system.md)

---

## D. สิ่งที่ยังไม่ได้ยืนยัน

| เรื่อง | เหตุผล |
| --- | --- |
| หน้าเว็บ threeui.com (browse, ราคา Pro, license ของ Pro) | proxy 403 / DNS ENOTFOUND ยืนยันได้เฉพาะ repo Community บน GitHub |
| จำนวนดาว, fork, วันที่สร้างของทุก repo บน GitHub | `gh api` ตอบ 403 (session ไม่มีสิทธิ์ API ของ repo เหล่านี้) วันที่ที่ให้ไว้คือวันที่ commit ล่าสุดจาก `git log` |
| หน้า Sportica บน Dribbble: ผู้ออกแบบ, เนื้อหา, ราคา, license | dribbble.com เปิดไม่ได้ ข้อมูล Craftwork มาจากผลค้นหาเท่านั้น |
| เงื่อนไข license ของไฟล์ใน Spline Community, Terms of Service ของ Spline, แพลนที่มี/ไม่มี watermark | spline.design และ docs.spline.design เปิดไม่ได้ และ WebSearch ไม่พบหน้าทางการ |
| ฉาก football/soccer ball/stadium ใน Spline Community | เปิดหน้า community ไม่ได้ |
| license ของ `@splinetool/runtime` | แพ็กเกจไม่ระบุ ต้องอ่าน Terms ของ Spline |
| license จริงของโมเดลจาก CGTrader และ BlenderKit ใน Kit-Customizer และที่มาของเพลง | README ไม่ได้ระบุ และไม่ได้เปิดหน้าต้นทาง |
| footbookr จองซ้ำได้จริงเมื่อมีคำขอพร้อมกัน | อนุมานจากโค้ด (ไม่มี unique constraint) ยังไม่ได้ทดสอบ |
| ThreeUI ทุกชิ้นรองรับ reduced motion และ WebGL fallback หรือไม่ | ได้แค่ผล grep ไม่ได้รัน |
| ขนาด bundle จริงหลัง build ของ three/R3F/drei/Spline/ThreeUI ในแอปเรา และประสิทธิภาพบนมือถือรุ่นล่าง | ไม่ได้ติดตั้งหรือ build (งานนี้อ่านอย่างเดียว) ไม่มีตัวเลขวัดจริง |
| `@tailwind base/components/utilities` กับ Tailwind v4 ทำงานอย่างไรใน build ของเรา | ไม่ได้อ่านเอกสาร Tailwind v4 และไม่ได้ build |
| ข้อมูลเครื่องที่ผู้ใช้จริงใช้ (สัดส่วนมือถือรุ่นล่าง) | ยังไม่มีข้อมูลผู้ใช้จริง (AGENTS.md: ยังไม่มีผู้ใช้จริง) |

---

## แหล่งที่มา

**Repo ภายนอก** (clone แบบ `--depth 1` เมื่อ 15 ต.ค. 2026 อ่านอย่างเดียว)
- ThreeUI Community `68802d5428071ada5c20db8094b1649e6bb770ed`: https://github.com/MengTo/threeui/blob/68802d5428071ada5c20db8094b1649e6bb770ed/README.md · `/LICENSE` · `/ASSET-LICENSES.md` · `/package.json`
- footbookr `86528e047c108d373a7d668fa6071ae3a7e609f0`: https://github.com/saidMounaim/footbookr/blob/86528e047c108d373a7d668fa6071ae3a7e609f0/README.md · `/package.json` · `/prisma/schema.prisma` · `/lib/actions/booking.actions.ts`
- pitch-booking-website `6a959a4fb38afcd9053f5c3aedde609e440c9ec9`: https://github.com/lengsenghong/pitch-booking-website/blob/6a959a4fb38afcd9053f5c3aedde609e440c9ec9/README.md · `/package.json` · `/lib/auth.ts` · `/app/book/[id]/page.tsx`
- ThreeJS-Kit-Customizer `6f540216548c400eafe306eef6d06f24a9dcc8d4`: https://github.com/Footprintarts/ThreeJS-Kit-Customizer/blob/6f540216548c400eafe306eef6d06f24a9dcc8d4/LICENSE · `/README.md` · `/package.json` · `/src/components/Scene.jsx` · `/src/components/songs.js`

**npm registry** (`npm view <pkg> version license dist.unpackedSize peerDependencies dependencies`, 15 ต.ค. 2026)
- https://registry.npmjs.org/three · https://registry.npmjs.org/@react-three/fiber · https://registry.npmjs.org/@react-three/drei
- https://registry.npmjs.org/@splinetool/runtime/-/runtime-2.0.82.tgz (`package.json`, `README.md`, `AGENTS.md`)
- https://registry.npmjs.org/@splinetool/react-spline/-/react-spline-4.1.0.tgz (`LICENSE`, `README.md`, `package.json`)
- https://registry.npmjs.org/@designcodeio/threeui

**ไฟล์ license และเอกสารทางการ** (raw.githubusercontent.com)
- https://raw.githubusercontent.com/mrdoob/three.js/dev/LICENSE
- https://raw.githubusercontent.com/pmndrs/react-three-fiber/master/LICENSE
- https://raw.githubusercontent.com/pmndrs/drei/master/LICENSE
- https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/jsm/capabilities/WebGL.js
- MDN `prefers-reduced-motion`: https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/css/reference/at-rules/@media/prefers-reduced-motion/index.md (หน้าเว็บ https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion เปิดไม่ได้ 403)
- MDN Detect WebGL: https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/webgl_api/by_example/detect_webgl/index.md

**แหล่งที่เปิดไม่ได้** (403 / ENOTFOUND): https://threeui.com/browse?sort=recent · https://dribbble.com/shots/27351682-Sportica-Sport-center-court-Booking-App-UI-KIT · https://spline.design/community · https://docs.spline.design/

**แหล่งรอง** (ใช้หาที่อยู่เท่านั้น ไม่ได้ใช้ยืนยัน): https://21st.dev/@mengto/library/threeui · https://craftwork.design/product/sportica-sport-center-court-booking-mobil

**Repo นี้** (`01f7be4`): `package.json`, `postcss.config.mjs`, `app/globals.css`, `app/ui.css`, `app/layout.tsx`, `app/page.tsx`, `app/HomeHeroCarousel.tsx`, `components/SiteNav.tsx`, `lib/site-nav.ts`, `components/VenuePitchCover.tsx`, `app/venues/**`, `app/venue/**`, `scripts/training-art/{scene.js,poses.mjs,render.mjs}`, `lib/training/content.ts`, `docs/design-system.md`, `docs/ux-audit/status.md`, `docs/ux-audit/report-*.md`, `docs/agents/senior-ux.md`
