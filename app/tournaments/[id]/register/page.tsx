import { redirect } from 'next/navigation'

export default async function TournamentRegisterRedirect(
  props: {
    params: Promise<{ id: string }>
  }
) {
  const params = await props.params
  redirect(`/tournaments/${params.id}`)
}
