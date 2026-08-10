import Link from 'next/link'
import { ArrowLeft, ArrowUpRight, BadgeCheck, Eye, Flag, MapPinned, PlayCircle, Sparkles, Target, Trophy, UsersRound } from 'lucide-react'

const impactSteps = [
  { number: '01', title: 'ให้คนเห็น', copy: 'รวบรวมตัวตน ตำแหน่ง และผลงานของน้องไว้ในโปรไฟล์เดียวที่แชร์ได้', icon: <Eye size={25} /> },
  { number: '02', title: 'ให้โอกาส', copy: 'เชื่อมเด็กกับรายการแข่ง สโมสร โค้ช และชุมชนฟุตบอลที่กำลังมองหาคนมีแวว', icon: <MapPinned size={25} /> },
  { number: '03', title: 'ให้เติบโต', copy: 'เปลี่ยนการแข่งขันและผลงานจริงให้กลายเป็นเส้นทางการพัฒนาที่เห็นได้ชัด', icon: <Target size={25} /> },
]

export default function ImpactPage() {
  return (
    <main className="impact-page">
      <header className="impact-header">
        <Link href="/" className="impact-back"><ArrowLeft size={17} /> กลับหน้าแรก</Link>
        <Link href="/" className="impact-logo"><span><Trophy size={15} /></span>BallDoenSai.com</Link>
        <Link href="/athletes" className="impact-directory">Athlete Database <ArrowUpRight size={15} /></Link>
      </header>

      <section className="impact-hero">
        <div className="impact-hero-grid" />
        <div className="impact-star impact-star-one" /><div className="impact-star impact-star-two" /><div className="impact-star impact-star-three" />
        <div className="impact-hero-copy">
          <span className="impact-label"><Sparkles size={13} /> WHY BALLDOENSAI.COM EXISTS</span>
          <h1>เด็กที่มีฝัน<br />ไม่ควรต้อง<br /><em>รอโอกาส</em></h1>
          <p>เราอยากให้ผลงาน ความพยายาม และความสามารถของนักกีฬาเยาวชนไทย ถูกเห็นโดยคนที่ช่วยพาเขาไปต่อได้</p>
        </div>
        <div className="impact-hero-number" aria-hidden="true">01</div>
        <div className="impact-hero-note"><span>THE MISSION</span><b>MAKE TALENT<br />VISIBLE</b></div>
      </section>

      <section className="impact-statement">
        <div className="impact-statement-mark">“</div>
        <p>ไม่ได้สร้างแค่ Ranking<br />แต่สร้าง <strong>จุดเริ่มต้น</strong> ให้ทุกคน<br />ได้เห็นศักยภาพของน้อง ๆ</p>
        <div className="impact-statement-line" />
      </section>

      <section className="impact-path">
        <div className="impact-path-heading">
          <span className="impact-label">THE IMPACT PATH</span>
          <h2>จากสนามเล็ก<br />สู่โอกาสที่ใหญ่ขึ้น</h2>
          <p>แพลตฟอร์มเดียวที่ออกแบบให้เส้นทางของเด็กนักกีฬาเดินต่อได้จริง</p>
        </div>
        <div className="impact-path-map">
          <div className="impact-path-line" />
          {impactSteps.map((step, index) => <article key={step.number} className={`impact-step impact-step-${index + 1}`}>
            <div className="impact-step-node"><span>{step.number}</span></div>
            <div className="impact-step-card">
              <div className="impact-step-icon">{step.icon}</div>
              <span>{step.number} / 03</span><h3>{step.title}</h3><p>{step.copy}</p>
            </div>
          </article>)}
        </div>
      </section>

      <section className="impact-outcomes">
        <div className="impact-outcomes-header"><span className="impact-label">WHAT WE WANT TO UNLOCK</span><h2>โอกาสที่ทุกคน<br />ควรเข้าถึงได้</h2></div>
        <div className="impact-outcome-grid">
          <div className="impact-outcome impact-outcome-red"><BadgeCheck size={30} /><b>โปรไฟล์ที่<br />มีความหมาย</b><p>ไม่ใช่แค่ชื่อ แต่เป็น portfolio ของน้องที่อัปเดตได้ตลอด</p></div>
          <div className="impact-outcome impact-outcome-navy"><PlayCircle size={30} /><b>ผลงานที่<br />เล่าเรื่องได้</b><p>Highlight และความสำเร็จช่วยให้คนเห็นสิ่งที่ตัวเลขบอกไม่ได้</p></div>
          <div className="impact-outcome impact-outcome-green"><UsersRound size={30} /><b>ชุมชนที่<br />ส่งต่อโอกาส</b><p>ผู้ปกครอง โค้ช สโมสร และผู้จัดการแข่งขัน มองเห็นเส้นทางเดียวกัน</p></div>
        </div>
      </section>

      <section className="impact-action">
        <div><span className="impact-label">START WITH ONE PROFILE</span><h2>เรื่องราวของน้อง<br /><em>ควรได้เริ่มวันนี้</em></h2></div>
        <div className="impact-action-buttons"><Link href="/profile" className="impact-primary">สร้างโปรไฟล์นักกีฬา <ArrowUpRight size={18} /></Link><Link href="/athletes" className="impact-secondary">ดูนักกีฬาในระบบ</Link></div>
        <Flag className="impact-flag" size={112} strokeWidth={.8} aria-hidden="true" />
      </section>
    </main>
  )
}
