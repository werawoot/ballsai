import { managementRequest } from '@/lib/beta-management-api'

// Coach roster actions only. The allow-list is the contract: anything to do with
// ratings, performances or match results is absent on purpose and returns 400 here
// before it ever reaches the database.
export async function POST(request: Request) {
  return managementRequest(request, 'manage_coach_beta', ['remove'])
}
