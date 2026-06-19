import Link from 'next/link'
import { ArrowLeft, Shield, Trophy } from 'lucide-react'

export default function PrivacyPage() {
  return (
    <main style={{ background: '#f8f8f8', minHeight: '100vh', paddingBottom: 40 }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', height: 54, background: '#CC0001', boxShadow: '0 2px 12px rgba(204,0,1,0.3)' }}>
        <Link href="/" style={{ fontFamily: 'var(--font-oswald)', fontSize: 24, fontWeight: 800, letterSpacing: 2, color: 'white', display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <Trophy size={22} strokeWidth={2.5} /> BALLSAI
        </Link>
        <Link href="/login" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          <ArrowLeft size={16} /> กลับ
        </Link>
      </header>

      <div style={{ padding: 20, maxWidth: 760, margin: '0 auto' }}>
        <div style={{ background: 'white', borderRadius: 16, border: '1.5px solid #e5e5e5', padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#CC0001', fontFamily: 'var(--font-oswald)', fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
            <Shield size={22} /> Privacy Policy / PDPA
          </div>
          <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>ฉบับ Closed Beta สำหรับ BALLSAI</p>

          {[
            ['ข้อมูลที่เราเก็บ', 'อีเมล, ข้อมูลโปรไฟล์นักกีฬา, รายชื่อทีม, หลักฐานการชำระเงิน, ผลการแข่งขัน, performance และข้อมูลการใช้งานที่จำเป็นต่อการดูแลระบบ'],
            ['เราใช้ข้อมูลเพื่ออะไร', 'ใช้เพื่อเข้าสู่ระบบ, สมัครแข่งขัน, ยืนยันการชำระเงิน, คำนวณ Power Rating, แสดง Ranking, ติดต่อผู้ใช้ และป้องกันการใช้งานที่ผิดเงื่อนไข'],
            ['การเปิดเผยข้อมูล', 'ข้อมูล Ranking และรายการแข่งขันบางส่วนอาจแสดงต่อสาธารณะ ข้อมูลส่วนตัวและหลักฐานการชำระเงินจำกัดเฉพาะเจ้าของข้อมูล ผู้จัดรายการที่เกี่ยวข้อง และผู้ดูแลระบบ'],
            ['การเก็บรักษาและความปลอดภัย', 'ระบบใช้ Supabase Auth, RLS และ Storage policy เพื่อลดความเสี่ยงในการเข้าถึงข้อมูลโดยไม่ได้รับอนุญาต'],
            ['สิทธิของเจ้าของข้อมูล', 'ผู้ใช้สามารถขอแก้ไขหรือลบข้อมูลส่วนตัวได้ โดยติดต่อผู้ดูแลระบบ BALLSAI ระหว่างช่วง Closed Beta'],
            ['Consent', 'การใช้งานระบบถือว่าผู้ใช้รับทราบและยินยอมให้ประมวลผลข้อมูลตามนโยบายนี้เท่าที่จำเป็นสำหรับการให้บริการ'],
          ].map(([title, body]) => (
            <section key={title} style={{ borderTop: '1px solid #f0f0f0', paddingTop: 14, marginTop: 14 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: '#111', marginBottom: 6 }}>{title}</h2>
              <p style={{ fontSize: 14, color: '#555', lineHeight: 1.8 }}>{body}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
