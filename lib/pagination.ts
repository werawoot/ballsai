// The page number a list reads from its URL. Anything that is not a whole number from 1
// up (missing, "abc", "0", "-3", "2.5") is page 1, so a bad link never errors.
export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw || !/^\d+$/.test(raw)) return 1
  const page = Number(raw)
  return Number.isSafeInteger(page) && page >= 1 ? page : 1
}
