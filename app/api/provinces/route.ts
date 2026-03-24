import { NextResponse } from 'next/server'
import {
  getAllProvinces,
  getProvincesByRegion,
  getProvincesWithRegion,
  searchProvinces,
  searchProvincesWithRegion
} from '@/lib/db/thailand-queries'

/**
 * GET /api/provinces
 *
 * Query parameters:
 * - region_id: Filter by region ID (optional)
 * - search: Search query for province name (optional)
 * - language: 'en' | 'th' | 'both' (default: 'en')
 * - with_region: 'true' | 'false' (default: 'false')
 * - sort_field: 'province_id' | 'province_name_en' | 'province_name_th' | 'region_id' (default: 'province_name_en')
 * - sort_order: 'asc' | 'desc' (default: 'asc')
 *
 * Examples:
 * - GET /api/provinces
 * - GET /api/provinces?region_id=1
 * - GET /api/provinces?search=chiang&language=both
 * - GET /api/provinces?with_region=true
 * - GET /api/provinces?sort_field=province_name_th&sort_order=asc
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    // Parse query parameters
    const regionId = searchParams.get('region_id')
    const searchQuery = searchParams.get('search')
    const language = (searchParams.get('language') as 'en' | 'th' | 'both') || 'en'
    const withRegion = searchParams.get('with_region') === 'true'
    const sortField = (searchParams.get('sort_field') as any) || 'province_name_en'
    const sortOrder = (searchParams.get('sort_order') as 'asc' | 'desc') || 'asc'

    let data

    // Build query based on parameters
    if (searchQuery) {
      // Search mode
      if (withRegion) {
        data = await searchProvincesWithRegion({
          query: searchQuery,
          language
        })
      } else {
        data = await searchProvinces({
          query: searchQuery,
          language
        })
      }
    } else if (regionId) {
      // Filter by region mode
      const regionIdNum = parseInt(regionId)
      if (isNaN(regionIdNum)) {
        return NextResponse.json(
          { error: 'Invalid region_id parameter' },
          { status: 400 }
        )
      }

      if (withRegion) {
        data = await getProvincesWithRegion(regionIdNum, {
          field: sortField,
          order: sortOrder
        })
      } else {
        data = await getProvincesByRegion(regionIdNum, {
          field: sortField,
          order: sortOrder
        })
      }
    } else {
      // Get all provinces mode
      if (withRegion) {
        data = await getProvincesWithRegion(undefined, {
          field: sortField,
          order: sortOrder
        })
      } else {
        data = await getAllProvinces({
          field: sortField,
          order: sortOrder
        })
      }
    }

    return NextResponse.json({
      success: true,
      data,
      meta: {
        count: data.length,
        language,
        with_region: withRegion,
        filters: {
          region_id: regionId || null,
          search: searchQuery || null
        }
      }
    })

  } catch (error) {
    console.error('Error in GET /api/provinces:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch provinces'
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/provinces
 *
 * Create a new province (requires proper authentication and authorization)
 *
 * Body:
 * {
 *   province_id: number
 *   province_name_en: string
 *   province_name_th: string
 *   region_id: number
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Validate required fields
    if (!body.province_id || !body.province_name_en || !body.province_name_th || !body.region_id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: province_id, province_name_en, province_name_th, region_id'
        },
        { status: 400 }
      )
    }

    // This is a placeholder - in production, you would:
    // 1. Check authentication
    // 2. Check authorization
    // 3. Use Supabase client to insert the data
    // Example:
    // const supabase = createClient()
    // const { data, error } = await supabase
    //   .from('province')
    //   .insert({
    //     province_id: body.province_id,
    //     province_name_en: body.province_name_en,
    //     province_name_th: body.province_name_th,
    //     region_id: body.region_id
    //   })
    //   .select()
    //   .single()

    return NextResponse.json(
      {
        success: false,
        error: 'Province creation not implemented - requires proper authentication'
      },
      { status: 501 }
    )

  } catch (error) {
    console.error('Error in POST /api/provinces:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create province'
      },
      { status: 500 }
    )
  }
}

/**
 * OPTIONS /api/provinces
 *
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  })
}
