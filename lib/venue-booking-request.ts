type Identified = { id: string }

// After a successful request the slot becomes `reserved`, so router.refresh() drops it
// from props while React still holds the old id in state. Never trust that id again.
export function resolveSelectedSlotId(selected: string, slots: Identified[]) {
  if (selected && slots.some(slot => slot.id === selected)) return selected
  return slots[0]?.id ?? ''
}

export type BookingRequestMode = 'form' | 'success' | 'empty'

export type BookingRequestView = {
  mode: BookingRequestMode
  selected: string
  canSubmit: boolean
}

export function bookingRequestView({ submitted, selected, slots }: {
  submitted: boolean
  selected: string
  slots: Identified[]
}): BookingRequestView {
  const resolved = resolveSelectedSlotId(selected, slots)

  // The confirmation outranks the empty state: taking the last slot must not replace
  // the success message with "no slots available".
  if (submitted) return { mode: 'success', selected: resolved, canSubmit: false }
  if (!slots.length) return { mode: 'empty', selected: '', canSubmit: false }
  return { mode: 'form', selected: resolved, canSubmit: true }
}
