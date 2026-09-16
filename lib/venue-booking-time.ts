export const VENUE_BOOKING_TIME_ZONE = 'Asia/Bangkok'

const dateTimeFormatter = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: VENUE_BOOKING_TIME_ZONE,
})

const timeFormatter = new Intl.DateTimeFormat('th-TH', {
  timeStyle: 'short',
  timeZone: VENUE_BOOKING_TIME_ZONE,
})

export function formatVenueBookingDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value))
}

export function formatVenueBookingTime(value: string) {
  return timeFormatter.format(new Date(value))
}
