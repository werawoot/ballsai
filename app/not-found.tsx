import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="site-fallback">
      <p className="site-fallback-kicker">BALLDOENSAI.COM · 404</p>
      <h1>ไม่พบ<br /><em>สนามที่กำลังหา</em></h1>
      <p>ลิงก์นี้อาจถูกย้ายหรือไม่มีอยู่แล้ว ลองค้นหานักกีฬาหรือกลับหน้าแรกแทน</p>
      <div className="site-fallback-actions">
        <Link href="/athletes">ค้นหานักกีฬา</Link>
        <Link href="/">กลับหน้าแรก</Link>
      </div>
    </main>
  )
}
