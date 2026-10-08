// Where a person goes after signing in or finishing /welcome: the page that asked them to sign
// in, otherwise "ของฉัน" (/profile), which opens on their own work for their role. The public
// home page stays one tap away on the bottom bar. A path that is not on this site is dropped.
export const LANDING_PATH = '/profile'

export function safeNextPath(value: string | null | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : LANDING_PATH
}
