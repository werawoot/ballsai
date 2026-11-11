// Writes docs/training/coach-review-pack.md from content/training/programs.json and the app's
// own Thai labels (messages/th.json), so the pack a coach or physiotherapist signs off is exactly
// what the app shows (ADR-015 gate 1). renderPack is pure; tests compare its output with the file.
// Run: node scripts/coach-review-pack.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const BAND = { u10_u13: 'U10–U13 (อายุไม่เกิน 13 ปี)', u14_u17: 'U14–U17 (อายุ 14 ปีขึ้นไป)' }
const cell = text => String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
const formatDuration = seconds => seconds >= 60 ? `${Math.round(seconds / 6) / 10} นาที` : `${seconds} วินาที`

// The three self-tests the owner chose (10 Nov 2026). Their names and how-to come from the app
// (messages/th.json selfTests), so the coach reviews the words children see; only the open
// questions for the coach live here.
export const SELF_TEST_ASKS = {
  juggling: 'ให้ใช้ต้นขาด้วยไหม หรือเท้าอย่างเดียว ปล่อยบอลจากมือเริ่มได้ไหม',
  plank: 'ตอนนี้แอปหยุดที่ 2 นาที ควรใช้ค่านี้กับทุกอายุไหม',
  long_jump: 'ตอนนี้แอปเปิดให้เฉพาะอายุ 12 ปีขึ้นไป เด็กต่ำกว่า 12 ปีควรกระโดดที่บ้านไหม และพื้นแบบไหนปลอดภัย',
}

export function renderPack(data, th) {
const ACCESS = th.training.access
const out = []
out.push('# ชุดเอกสารให้โค้ชตรวจโปรแกรมฝึก DOENSAI')
out.push('')
out.push('> สร้างจาก `content/training/programs.json` ด้วย `node scripts/coach-review-pack.mjs` ห้ามแก้ไฟล์นี้ด้วยมือ')
out.push('> ถ้าโค้ชขอแก้ ให้แก้ที่ไฟล์ข้อมูลผ่าน pull request แล้วสร้างใหม่')
out.push('')
out.push('## ขอให้ช่วยตรวจอะไร')
out.push('')
out.push('DOENSAI เป็นแอปให้นักฟุตบอลเยาวชน (10–17 ปี) ฝึกเองที่บ้าน ตามโปรแกรมที่เลือกจากอายุ')
out.push('ก่อนเปิดให้เด็กใช้จริง เราขอให้โค้ชที่มีใบอนุญาตหรือนักกายภาพบำบัดตรวจ 4 เรื่อง:')
out.push('')
out.push('1. **ความปลอดภัย:** ท่าไหนไม่เหมาะให้เด็กทำคนเดียวโดยไม่มีผู้ใหญ่ดู')
out.push('2. **ปริมาณ:** เวลา จำนวนครั้ง และจำนวนวันต่อสัปดาห์เหมาะกับช่วงอายุหรือไม่')
out.push('3. **คำอธิบาย:** เด็กอ่านแล้วทำถูกไหม ควรเพิ่มคำเตือนตรงไหน')
out.push('4. **แบบทดสอบตัวเอง 3 แบบ** (ท้ายเอกสาร) ปลอดภัยและวัดได้จริงไหม')
out.push('')
out.push('สิ่งที่แอปทำอยู่แล้วทุกครั้งก่อนซ้อม: เตือนเรื่องอากาศร้อน และถามว่า "ตอนนี้เจ็บตรงไหนไหม" ถ้าตอบว่าเจ็บ แอปให้หยุดและบอกผู้ใหญ่')
out.push('แอปไม่เก็บคำตอบเรื่องอาการเจ็บไว้ในระบบ')
out.push('')
out.push(`สถานะเนื้อหาตอนนี้: **${data.review === 'draft' ? th.training.draft : 'ตรวจแล้ว'}**`)
out.push('')

for (const program of data.programs) {
  out.push(`## ${program.title.th} (${program.code})`)
  out.push('')
  out.push(`- กลุ่มอายุ: ${BAND[program.band] ?? program.band}${program.minAge ? ` (เริ่มได้ตั้งแต่ ${program.minAge} ปี)` : ''}`)
  out.push(`- ระยะเวลา: ${program.weeks} สัปดาห์ · ${program.perWeek} วันต่อสัปดาห์ · ครั้งละ ${program.minutes} นาที`)
  out.push(`- ใครทำได้: ${ACCESS[program.access] ?? program.access}`)
  out.push(`- เป้าหมาย: ${program.goal.th}`)
  out.push(`- ที่แอปบอกผู้ใช้เรื่องหลักฐาน: ${program.claim.th}`)
  out.push('')
  if (program.drills.length === 0) {
    out.push('_ยังไม่มีท่าฝึกในโปรแกรมนี้ (โปรแกรมที่ต้องมีโค้ชคุม ยังไม่เปิดให้เริ่มเอง)_')
    out.push('')
    continue
  }
  out.push('| # | ท่าฝึก | วิธีทำ (ข้อความที่เด็กเห็น) | ปริมาณ | ใครทำได้ | ตัวจับเวลาในแอป (ต่อรอบ) | อ้างอิง | ความเห็นโค้ช |')
  out.push('| ---: | --- | --- | --- | --- | --- | --- | --- |')
  program.drills.forEach((drill, index) => {
    const source = data.sources[drill.source]
    out.push(`| ${index + 1} | ${cell(drill.name.th)} | ${cell(drill.how.th)} | ${cell(drill.dose.th)} | ${ACCESS[drill.access] ?? drill.access} | ${formatDuration(drill.seconds)} | [${cell(drill.source)}](${source?.url ?? '#'}) | |`)
  })
  out.push('')
}

out.push('## แบบทดสอบตัวเอง (สร้างแล้วแต่ซ่อนไว้ รอโค้ชรับรองก่อนเปิดให้เด็กใช้)')
out.push('')
out.push('ทำทุก 4 สัปดาห์ หลังวอร์มอัพของโปรแกรม และผ่านคำถามเรื่องอาการเจ็บก่อนเสมอ')
out.push('ผลเป็นตัวเลขที่เด็กบันทึกเอง ติดป้ายว่าข้อมูลกรอกเอง ใช้เทียบกับครั้งก่อนของตัวเองเท่านั้น ไม่จัดอันดับกับเด็กคนอื่น')
out.push('ไม่แสดงบนการ์ดนักกีฬา และไม่นำไปคิดคะแนนฝีมือ รายละเอียดและแหล่งอ้างอิงอยู่ใน `docs/research/self-tests-2026-11-10.md`')
out.push('ค่าที่ตั้งไว้แบบระวังก่อนจนกว่าโค้ชจะตอบ: แพลงก์บันทึกได้ไม่เกิน 2 นาที และกระโดดไกลเฉพาะอายุ 12 ปีขึ้นไปที่มีวันเกิดในโปรไฟล์')
out.push('')
out.push('| แบบทดสอบ | วิธีทำ (ข้อความที่เด็กเห็น) | เป้าหมายที่เกี่ยว | คำถามถึงโค้ช | ความเห็นโค้ช |')
out.push('| --- | --- | --- | --- | --- |')
for (const [key, ask] of Object.entries(SELF_TEST_ASKS)) {
  const test = th.selfTests.tests[key]
  out.push(`| ${cell(test.name)} | ${cell([test.how1, test.how2, test.how3].map((step, index) => `${index + 1}. ${step}`).join(' '))} | ${cell(test.goal)} | ${cell(ask)} | |`)
}
out.push(`| (ทุกแบบ) | ${cell(th.selfTests.stopRule)} | | ข้อความเตือนนี้พอไหม | |`)
out.push('')
out.push('## แหล่งอ้างอิงทั้งหมด')
out.push('')
out.push('| รหัส | งานวิจัย | ผู้เขียน | สัญญาอนุญาต | ระดับหลักฐาน |')
out.push('| --- | --- | --- | --- | --- |')
for (const [key, source] of Object.entries(data.sources)) {
  out.push(`| ${key} | [${cell(source.title)}](${source.url}) | ${cell(source.author)} | ${cell(source.license)} | ${cell(source.evidenceLevel)} |`)
}
out.push('')
out.push('## การรับรอง')
out.push('')
out.push('| ชื่อผู้ตรวจ | วุฒิหรือใบอนุญาต | วันที่ | ผล (ผ่าน / ผ่านเมื่อแก้ / ไม่ผ่าน) | ลงชื่อ |')
out.push('| --- | --- | --- | --- | --- |')
out.push('| | | | | |')
out.push('')

return out.join('\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
  mkdirSync(new URL('../docs/training/', import.meta.url), { recursive: true })
  writeFileSync(new URL('../docs/training/coach-review-pack.md', import.meta.url), renderPack(read('../content/training/programs.json'), read('../messages/th.json')))
  console.log('wrote docs/training/coach-review-pack.md')
}
