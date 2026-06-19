import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { teamName, tournamentName, email, status } = await req.json()
  const isConfirmed = status === 'confirmed'

  if (!teamName || !tournamentName || !email || (status !== 'confirmed' && status !== 'rejected')) {
    return NextResponse.json({ error: 'ข้อมูลอีเมลไม่ครบถ้วน' }, { status: 400 })
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'ยังไม่ได้ตั้งค่าอีเมลสำหรับระบบ' }, { status: 500 })
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'BALLSAI <onboarding@resend.dev>',
      to: [email],
      subject: isConfirmed ? `✅ ทีม ${teamName} ได้รับการยืนยันแล้ว!` : `❌ ทีม ${teamName} ไม่ผ่านการคัดเลือก`,
      html: `<p>ทีม <b>${teamName}</b> ${isConfirmed ? 'ได้รับการยืนยันเข้าร่วม' : 'ไม่ผ่านการคัดเลือกใน'} รายการ <b>${tournamentName}</b></p>`
    })
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.ok ? 200 : 500 })
}
