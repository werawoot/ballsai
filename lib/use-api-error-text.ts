import { useTranslations } from 'next-intl'

export type ApiErrorBody = { code?: string; error?: string } | null | undefined

// Words a failed API response for the reader: the code when this build knows it, else
// the sentence the server sent, else the page's own fallback. A newer server can add a
// code before the page learns it, so an unknown code never shows as a raw key.
export function useApiErrorText() {
  const t = useTranslations('apiErrors')
  return (body: ApiErrorBody, fallback: string) => {
    const code = body?.code
    return code && t.has(code as never) ? t(code as never) : body?.error ?? fallback
  }
}
