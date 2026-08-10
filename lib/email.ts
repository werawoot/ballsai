type TeamStatusEmail = {
  teamName: string
  tournamentName: string
  email: string
  status: 'confirmed' | 'rejected'
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
