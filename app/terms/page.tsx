import Link from 'next/link'
import { ArrowLeft, FileText, Trophy } from 'lucide-react'

export default function TermsPage() {
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
            <FileText size={22} /> Terms of Service
          </div>
          <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>ฉบับ Closed Beta สำหรับ BALLSAI</p>

          {[
            ['การใช้งานระบบ', 'BALLSAI เป็นแพลตฟอร์มสำหรับจัดการแข่งขัน สมัครทีม อัปโหลดหลักฐานการชำระเงิน และจัดอันดับนักกีฬาในช่วงทดสอบ Closed Beta'],
            ['บัญชีผู้ใช้', 'ผู้ใช้ต้องใช้อีเมลที่ตนมีสิทธิ์ใช้งาน และรับผิดชอบข้อมูลที่กรอกในระบบ'],
            ['ข้อมูลการแข่งขันและ Ranking', 'Power Rating และ Ranking เป็นผลจากข้อมูลการแข่งขันที่ผู้จัดหรือผู้ดูแลระบบบันทึก อาจมีการแก้ไขเมื่อพบข้อมูลผิดพลาด'],
            ['การชำระเงิน', 'BALLSAI ช่วยจัดเก็บหลักฐานการชำระเงิน การคืนเงินหรือข้อพิพาทให้เป็นไปตามเงื่อนไขของผู้จัดแต่ละรายการ'],
            ['ข้อห้าม', 'ห้ามปลอมแปลงข้อมูล, อัปโหลดไฟล์ไม่เหมาะสม, พยายามเข้าถึงข้อมูลผู้อื่น หรือโจมตีระบบ'],
            ['ช่วง Closed Beta', 'ระบบอาจมีการเปลี่ยนแปลง ปิดปรับปรุง หรือแก้ไขข้อมูลทดสอบเพื่อปรับปรุงคุณภาพบริการ'],
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
