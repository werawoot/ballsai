// Where a person goes after signing in or finishing /welcome: the page that asked them to sign
// in, otherwise "ของฉัน" (/profile), which opens on their own work for their role. The public
// home page stays one tap away on the bottom bar. A path that is not on this site is dropped.
export const LANDING_PATH = '/profile'

// Browsers read a backslash as a slash ("/\\host" is "//host", another site) and drop tabs and
// newlines from URLs, so any of them, or any other control character, rejects the path.
const UNSAFE = /[\\\u0000-\u001f\u007f]/

export function safeNextPath(value: string | null | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !UNSAFE.test(value) ? value : LANDING_PATH
}
