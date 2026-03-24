import { NextResponse } from 'next/server'
import {
  getProvinceById,
  getProvinceWithRegionName
} from '@/lib/db/thailand-queries'

/**
 * GET /api/provinces/[id]
 *
 * Query parameters:
 * - with_region: 'true' | 'false' (default: 'false')
 * - language: 'en' | 'th' (default: 'en')
 *
 * Examples:
 * - GET /api/provinces/10
 * - GET /api/provinces/10?with_region=true
 * - GET /api/provinces/10?language=th
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const provinceId = parseInt(params.id)
    const { searchParams } = new URL(request.url)
    const withRegion = searchParams.get('with_region') === 'true'
    const language = (searchParams.get('language') as 'en' | 'th') || 'en'

    // Validate province ID
    if (isNaN(provinceId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid province ID'
        },
        { status: 400 }
      )
    }

    let data

    if (withRegion) {
      // Fetch province with region information
      data = await getProvinceWithRegionName(provinceId)
    } else {
      // Fetch province only
      data = await getProvinceById(provinceId)
    }

    if (!data) {
      return NextResponse.json(
        {
          success: false,
          error: 'Province not found'
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
      meta: {
        language,
        with_region: withRegion
      }
    })

  } catch (error) {
    console.error('Error in GET /api/provinces/[id]:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch province'
      },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/provinces/[id]
 *
 * Update a province (requires proper authentication and authorization)
 *
 * Body:
 * {
 *   province_name_en?: string
 *   province_name_th?: string
 *   region_id?: number
 * }
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const provinceId = parseInt(params.id)

    // Validate province ID
    if (isNaN(provinceId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid province ID'
        },
        { status: 400 }
      )
    }

    // Check if province exists
    const existingProvince = await getProvinceById(provinceId)
    if (!existingProvince) {
      return NextResponse.json(
        {
          success: false,
          error: 'Province not found'
        },
        { status: 404 }
      )
    }

    const body = await request.json()

    // Validate that at least one field is provided
    if (!body.province_name_en && !body.province_name_th && !body.region_id) {
      return NextResponse.json(
        {
          success: false,
          error: 'At least one field to update must be provided: province_name_en, province_name_th, or region_id'
        },
        { status: 400 }
      )
    }

    // This is a placeholder - in production, you would:
    // 1. Check authentication
    // 2. Check authorization
    // 3. Use Supabase client to update the data
    // Example:
    // const supabase = createClient()
    // const { data, error } = await supabase
    //   .from('province')
    //   .update({
    //     province_name_en: body.province_name_en,
    //     province_name_th: body.province_name_th,
    //     region_id: body.region_id
    //   })
    //   .eq('province_id', provinceId)
    //   .select()
    //   .single()

    return NextResponse.json(
      {
        success: false,
        error: 'Province update not implemented - requires proper authentication'
      },
      { status: 501 }
    )

  } catch (error) {
    console.error('Error in PATCH /api/provinces/[id]:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update province'
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/provinces/[id]
 *
 * Delete a province (requires proper authentication and authorization)
 *
 * Note: This will likely fail due to the foreign key constraint ON DELETE RESTRICT
 * on the region table if there are other relationships. Consider using soft deletes instead.
 */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const provinceId = parseInt(params.id)

    // Validate province ID
    if (isNaN(provinceId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid province ID'
        },
        { status: 400 }
      )
    }

    // Check if province exists
    const existingProvince = await getProvinceById(provinceId)
    if (!existingProvince) {
      return NextResponse.json(
        {
          success: false,
          error: 'Province not found'
        },
        { status: 404 }
      )
    }

    // This is a placeholder - in production, you would:
    // 1. Check authentication
    // 2. Check authorization
    // 3. Consider using soft deletes instead of hard deletes
    // 4. Use Supabase client to delete the data
    // Example:
    // const supabase = createClient()
    // const { error } = await supabase
    //   .from('province')
    //   .delete()
    //   .eq('province_id', provinceId)

    return NextResponse.json(
      {
        success: false,
        error: 'Province deletion not implemented - requires proper authentication'
      },
      { status: 501 }
    )

  } catch (error) {
    console.error('Error in DELETE /api/provinces/[id]:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete province'
      },
      { status: 500 }
    )
  }
}

/**
 * OPTIONS /api/provinces/[id]
 *
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Methods': 'GET, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  })
}
