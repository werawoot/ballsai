import GuardianConsentAction from '@/components/GuardianConsentAction'

export const metadata = { title: 'ยืนยันผู้ปกครอง | BallDoenSai.com' }

export default function GuardianVerifyPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token?.trim()
  return <main className="mx-auto flex min-h-screen max-w-xl items-center px-5 py-12">
    <section className="w-full border border-[#dedad2] bg-white p-7 shadow-[8px_9px_0_rgba(17,24,39,.14)] sm:p-10">
      <p className="font-barlow text-xs font-bold tracking-[.16em] text-[#d71920]">BALLDOENSAI.COM</p>
      <h1 className="mt-3 font-oswald text-4xl leading-none text-[#111827]">ยืนยันผู้ปกครอง</h1>
      <p className="mt-5 text-base leading-7 text-[#555]">คุณกำลังยืนยันว่ารับทราบและยินยอมให้นักกีฬาเปิดเผย Sport Profile สาธารณะได้</p>
      <p className="mt-3 text-sm leading-6 text-[#555]">ข้อมูลการแข่งขันที่ผู้จัดยืนยันแล้วจะยังคงเป็นข้อมูลส่วนตัว จนกว่านักกีฬาจะเลือกเปิดเผยโปรไฟล์ของแต่ละกีฬาเอง</p>
      {token ? <GuardianConsentAction token={token} mode="confirm" /> : <p role="alert" className="mt-6 text-sm font-semibold text-[#b91c1c]">ลิงก์ยืนยันไม่ถูกต้อง</p>}
    </section>
  </main>
}
