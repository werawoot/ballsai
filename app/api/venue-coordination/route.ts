import { managementRequest } from '@/lib/beta-management-api'
export async function POST(request: Request) {
  return managementRequest(request, 'coordinate_venue_booking_beta', ['message', 'propose_cancel', 'propose_move', 'accept', 'reject'])
}
