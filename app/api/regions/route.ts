import { NextResponse } from 'next/server'
import {
  getAllRegions,
  getRegionsWithProvinceCount,
  getRegionsByIds
} from '@/lib/db/thailand-queries'

/**
 * GET /api/regions
 *
 * Query parameters:
 * - with_count: 'true' | 'false' (default: 'false')
 * - language: 'en' | 'th' (default: 'en')
 * - ids: Comma-separated list of region IDs (optional)
 *
 * Examples:
 * - GET /api/regions
 * - GET /api/regions?with_count=true
 * - GET /api/regions?ids=1,2,3
 * - GET /api/regions?language=th
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    // Parse query parameters
    const withCount = searchParams.get('with_count') === 'true'
    const language = (searchParams.get('language') as 'en' | 'th') || 'en'
    const idsParam = searchParams.get('ids')

    let data

    // Build query based on parameters
    if (idsParam) {
      // Fetch specific regions by IDs
      const regionIds = idsParam.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))

      if (regionIds.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Invalid region IDs parameter' },
          { status: 400 }
        )
      }

      data = await getRegionsByIds(regionIds)
    } else if (withCount) {
      // Fetch regions with province count
      data = await getRegionsWithProvinceCount()
    } else {
      // Fetch all regions
      data = await getAllRegions()
    }

    // Transform data based on language preference
    const transformedData = data.map((region: any) => ({
      id: region.region_id,
      name: language === 'en' ? region.region_name_en : region.region_name_th,
      name_en: region.region_name_en,
      name_th: region.region_name_th,
      ...(region.province_count !== undefined && { province_count: region.province_count }),
      created_at: region.created_at,
      updated_at: region.updated_at
    }))

    return NextResponse.json({
      success: true,
      data: transformedData,
      meta: {
        count: transformedData.length,
        language,
        with_count: withCount,
        filters: {
          ids: idsParam || null
        }
      }
    })

  } catch (error) {
    console.error('Error in GET /api/regions:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch regions'
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/regions
 *
 * Create a new region (requires proper authentication and authorization)
 *
 * Body:
 * {
 *   region_id: number
 *   region_name_en: string
 *   region_name_th: string
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Validate required fields
    if (!body.region_id || !body.region_name_en || !body.region_name_th) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: region_id, region_name_en, region_name_th'
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
    //   .from('region')
    //   .insert({
    //     region_id: body.region_id,
    //     region_name_en: body.region_name_en,
    //     region_name_th: body.region_name_th
    //   })
    //   .select()
    //   .single()

    return NextResponse.json(
      {
        success: false,
        error: 'Region creation not implemented - requires proper authentication'
      },
      { status: 501 }
    )

  } catch (error) {
    console.error('Error in POST /api/regions:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create region'
      },
      { status: 500 }
    )
  }
}

/**
 * OPTIONS /api/regions
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
