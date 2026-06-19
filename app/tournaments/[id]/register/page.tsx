import { redirect } from 'next/navigation'

export default function TournamentRegisterRedirect({
  params,
}: {
  params: { id: string }
}) {
  redirect(`/tournaments/${params.id}`)
}
