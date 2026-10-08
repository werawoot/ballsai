import { permanentRedirect } from 'next/navigation'

// People guess /parent for the parents' page, which lives at /guardian.
export default function ParentAlias() {
  permanentRedirect('/guardian')
}
