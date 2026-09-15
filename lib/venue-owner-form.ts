type Identified = { id: string }

export function resolveVenueId(selectedId: string, venues: Identified[]) {
  return selectedId || venues[0]?.id || ''
}

export function resolveCourtId(selectedId: string, courts: Identified[]) {
  return selectedId || courts[0]?.id || ''
}
