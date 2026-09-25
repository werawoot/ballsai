# BallDoenSai Data Trust — Phase 0 audit

วันที่ตรวจ: 20 สิงหาคม 2026  
ขอบเขต: ตรวจโค้ด, migration, RPC, trigger, RLS และเอกสารแบบ read-only

## สรุปการตัดสินใจ

ระบบมีฐานสำหรับคำนวณ Rating/XP/Badge แล้ว แต่ยังไม่ควรอ้างว่า Ranking หรือข้อมูลนักกีฬามีหลักฐานตรวจสอบครบ เพราะยังไม่มี provenance/evidence ledger, explainability, dispute workflow และ anomaly controls แบบศูนย์กลาง

**สถานะ:** ยังไม่พร้อมรับรองข้อมูลเชิงมูลค่าในระดับ production / closed beta จนกว่าจะทำ Phase 1–3 และทดสอบด้วยบทบาทจริง

## สิ่งที่มีอยู่และตรวจพบ

- `athlete_profiles.verification_level` รองรับ `self`, `coach_verified`, `performance_verified` และมีการกันการแก้ระดับโดยผู้ใช้ทั่วไป
- `rating_events` เก็บ rating ก่อน/หลัง, ผลแข่ง, สถิติ, ผู้บันทึก และเวลา
- `record_match_result_safely` เป็นจุดเขียนผลหลักและคำนวณ rating ใน transaction
- trigger ของ Digital Identity สร้าง XP/Badge โดยอ้างอิง `source_rating_event`
- `void_match_result_safely` มี LIFO guard และคืนค่า rating จาก `rating_before`
- BDS Wallet V1 มี ledger และ idempotency ด้วย `(user_id, event_key)`

## ช่องว่างที่ต้องปิดก่อนเรียกข้อมูลว่า verified

1. **Provenance / Evidence:** ยังไม่มีตารางกลางที่ตอบได้ว่า “ข้อมูลนี้มาจากใคร, หลักฐานอะไร, ตรวจเมื่อไร, ตรวจด้วยวิธีใด”
2. **Explainable ranking:** ไม่มี snapshot หรือ breakdown ที่อธิบายว่า rating/rank ปัจจุบันเกิดจาก match/event ใดบ้าง
3. **Dispute:** ยังไม่มีการยื่นคัดค้าน, สถานะ, ผู้พิจารณา, เหตุผล และผลการพิจารณาแบบตรวจย้อนหลังได้
4. **Anomaly:** ยังไม่มี flag สำหรับคะแนนผิดปกติ, สถิติซ้ำ, การแก้ไขถี่ผิดปกติ หรือผู้บันทึกที่มี pattern เสี่ยง
5. **Audit:** การ void ยังไม่มี reason และ append-only audit record ที่ผูกกับ actor/role/request
6. **Visibility/RLS:** policy เดิมเปิดอ่าน `rating_events`, `match_results`, `match_player_performances` และ `player_ratings` กว้างถึง public; ต้องแยก public summary ออกจาก internal evidence
7. **BDS reversal:** `sql/30-bds-match-rewards-v1.sql` ยังไม่ apply และแบบปัจจุบันไม่มีความสัมพันธ์ที่ทำให้แต้มจาก rating event ถูก reverse เมื่อผลแข่งถูก void
8. **Runbook drift:** เอกสาร runbook ยังไม่สะท้อน SQL29/SQL30 อย่างครบถ้วน

## Blocker ที่ห้ามข้าม

- ห้าม apply SQL30 ฉบับปัจจุบันจนกว่าจะผูก reward กับ source rating event หรือมี reversal ledger ที่ชัดเจน
- ห้ามลดระดับ verification หรือแสดงค่า default เป็น performance
- ห้ามเปลี่ยน public RLS โดยไม่มี query review และ RLS test ด้วย JWT ของบทบาทจริง
- ห้ามให้ admin แก้หลักฐานเดิมทับค่าเดิม; การแก้ต้องเป็น event ใหม่พร้อมเหตุผล

## แผนถัดไปที่เสนอ

### Phase 1 — Trust foundation (migration ใหม่ ห้ามแก้ไฟล์ที่เคย apply)

เพิ่ม `data_provenance`, `verification_evidence`, `verification_events`, `data_disputes`, `data_anomaly_flags` และ append-only audit events พร้อม RLS และ RPC ที่ตรวจ role/ownership

### Phase 2 — Explainability

สร้าง rank explanation snapshot ที่ผูกกับ season/sport, rating event, evidence status และ confidence; UI ต้องแสดง “คะแนนนี้มาจากอะไร / verified ระดับไหน / ข้อมูลล่าสุดเมื่อไร”

### Phase 3 — Operations & safety

เพิ่ม admin queues สำหรับ dispute/anomaly, reason-required void/adjustment, BDS reversal, notification และ test matrix สำหรับ athlete/coach/organizer/admin/anonymous

## หลักฐานการตรวจ

- ตรวจไฟล์ rating, match-result void, digital identity, athlete profile, BDS wallet และ production hardening ใน `sql/`
- ตรวจเส้นทาง `/scout`, `/players/[id]`, `/career`, `/admin/operations` และ BDS wallet
- `npm run lint` ผ่านก่อนเริ่ม audit รอบนี้
- รอบนี้ไม่มีการอ่าน/แก้ secret, apply SQL, เปลี่ยน Supabase, ส่งอีเมล หรือ deploy
