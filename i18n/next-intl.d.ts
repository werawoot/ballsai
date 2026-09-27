import type th from '@/messages/th.json'
import type { Locale } from './config'

// Thai is the source of truth for keys: `t('some.key')` that th.json lacks fails the build.
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale
    Messages: typeof th
  }
}
