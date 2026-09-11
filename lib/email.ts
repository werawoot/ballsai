type TeamStatusEmail = {
  teamName: string
  tournamentName: string
  email: string
  status: 'confirmed' | 'rejected'
}

type GuardianVerificationEmail = {
  athleteName: string
  guardianName: string
  guardianEmail: string
  verificationUrl: string
  revocationUrl: string
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character] ?? character)
}

export async function sendGuardianVerificationEmail({
  athleteName,
  guardianName,
  guardianEmail,
  verificationUrl,
  revocationUrl,
}: GuardianVerificationEmail) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: false, reason: 'RESEND_API_KEY is not configured' }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? 'BallDoenSai.com <onboarding@resend.dev>',
      to: [guardianEmail],
      subject: `ยืนยันการเปิดเผยโปรไฟล์นักกีฬา ${athleteName} | BallDoenSai.com`,
      html: `<p>สวัสดี ${escapeHtml(guardianName)}</p>
<p>${escapeHtml(athleteName)} ได้ขอเปิดเผย Sport Profile บน BallDoenSai.com</p>
<p><a href="${escapeHtml(verificationUrl)}">ยืนยันการเปิดเผยโปรไฟล์</a></p>
<p>ลิงก์นี้ใช้ได้ 24 ชั่วโมง และใช้ได้ครั้งเดียว หากคุณไม่ยืนยัน โปรไฟล์จะยังเป็นส่วนตัว</p>
<p>หลังยืนยัน คุณสามารถ <a href="${escapeHtml(revocationUrl)}">ถอนความยินยอม</a> ได้ทุกเมื่อ</p>`,
    }),
  })

  if (!response.ok) return { sent: false, reason: await response.text() }
  return { sent: true }
}

export async function sendTeamStatusEmail({ teamName, tournamentName, email, status }: TeamStatusEmail) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: false, reason: 'RESEND_API_KEY is not configured' }

  const isConfirmed = status === 'confirmed'
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? 'BallDoenSai.com <onboarding@resend.dev>',
      to: [email],
      subject: isConfirmed ? `✅ ทีม ${teamName} ได้รับการยืนยันแล้ว!` : `❌ ทีม ${teamName} ไม่ผ่านการคัดเลือก`,
      html: `<p>ทีม <b>${teamName}</b> ${isConfirmed ? 'ได้รับการยืนยันเข้าร่วม' : 'ไม่ผ่านการคัดเลือกใน'} รายการ <b>${tournamentName}</b></p>`,
    }),
  })

  if (!response.ok) return { sent: false, reason: await response.text() }
  return { sent: true }
}
