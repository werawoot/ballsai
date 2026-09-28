import { apiError } from '@/lib/api-error'

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// SQL43 raises a stable token per failure. Match the token first: SQLSTATE 42501 and
// 22023 are each raised for more than one reason. Each maps to an apiErrors code.
const PHOTO_ERRORS = [
  { token: 'VENUE_PHOTO_LIMIT_REACHED', status: 409, reply: 'photoLimitReached' },
  { token: 'VENUE_PHOTO_OBJECT_NOT_FOUND', status: 409, reply: 'photoObjectNotFound' },
  { token: 'VENUE_PHOTO_NOT_FOUND', status: 404, reply: 'photoNotFound' },
  { token: 'VENUE_NOT_FOUND', status: 404, reply: 'venueNotFound' },
  { token: 'VENUE_OWNER_REQUIRED', status: 403, reply: 'photoOwnerRequired' },
  { token: 'ADMIN_REQUIRED', status: 403, reply: 'adminRequired' },
  { token: 'INVALID_VENUE_PHOTO_PATH', status: 400, reply: 'photoPathInvalid' },
  { token: 'INVALID_VENUE_PHOTO_ORDER', status: 400, reply: 'photoOrderInvalid' },
  { token: 'INVALID_CAPTION', status: 400, reply: 'photoCaptionTooLong' },
  { token: 'AUTH_REQUIRED', status: 401, reply: 'signInAgain' },
] as const

export function venuePhotoRpcError(code: string | undefined, message: string) {
  if (code === 'PGRST202' || code === '42883' || code === '42P01') {
    return apiError('photoMigrationMissing', 503, { migration: 'sql/43-venue-photos-v1.sql' })
  }
  const match = PHOTO_ERRORS.find(item => message.includes(item.token))
  if (match) return apiError(match.reply, match.status)
  return apiError('photoFailed', 400)
}
