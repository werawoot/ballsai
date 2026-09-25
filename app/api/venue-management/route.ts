import { managementRequest } from '@/lib/beta-management-api'
export async function POST(request: Request) {
  return managementRequest(request, 'manage_venue_beta', ['venue', 'court', 'slot', 'bulk_slots'])
}
