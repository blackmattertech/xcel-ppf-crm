import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { SYSTEM_ROLES } from '@/shared/constants/roles'
import { getAllProducts, getProductsWithStats, createProduct } from '@/backend/services/product.service'
import { z } from 'zod'

const createProductSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional().nullable(),
  price: z.number().positive('Price must be positive'),
  mrp: z.number().positive('MRP must be positive'),
  image_url: z.string().url().optional().nullable().or(z.literal('')),
  sku: z.string().optional().nullable().or(z.literal('')),
  is_active: z.boolean().optional().default(true),
})

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const userRole = user.role?.name
    const userPermissions = user.role?.permissions?.map(p => p.name) || []

    // Check if user has permission to view products
    // Super admin has all permissions
    const hasReadPermission = userPermissions.includes('products.read')
    const hasManagePermission = userPermissions.includes('products.manage')
    const isAllowedRole = userRole === SYSTEM_ROLES.ADMIN || 
                         userRole === SYSTEM_ROLES.SUPER_ADMIN || 
                         userRole === SYSTEM_ROLES.MARKETING

    if (!isAllowedRole && !hasReadPermission && !hasManagePermission) {
      return NextResponse.json(
        { error: 'Forbidden: You do not have permission to view products' },
        { status: 403 }
      )
    }

    // Get query params
    const { searchParams } = new URL(request.url)
    const withStats = searchParams.get('with_stats') === 'true'

    if (withStats) {
      const products = await getProductsWithStats()
      return NextResponse.json(products)
    }

    const products = await getAllProducts()
    return NextResponse.json(products)
  } catch (error) {
    console.error('Error fetching products:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch products' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const userRole = user.role?.name
    const userPermissions = user.role?.permissions?.map(p => p.name) || []

    // Check if user has permission to create products
    const hasCreatePermission = userPermissions.includes('products.create')
    const hasManagePermission = userPermissions.includes('products.manage')
    const isAllowedRole = userRole === SYSTEM_ROLES.ADMIN || 
                         userRole === SYSTEM_ROLES.SUPER_ADMIN || 
                         userRole === SYSTEM_ROLES.MARKETING

    if (!isAllowedRole && !hasCreatePermission && !hasManagePermission) {
      return NextResponse.json(
        { error: 'Forbidden: You do not have permission to create products' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validatedData = createProductSchema.parse(body)

    const product = await createProduct({
      title: validatedData.title,
      description: validatedData.description || undefined,
      price: validatedData.price,
      mrp: validatedData.mrp,
      image_url: validatedData.image_url || undefined,
      sku: validatedData.sku || undefined,
      is_active: validatedData.is_active,
      created_by: user.id,
    })

    return NextResponse.json(product, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Error creating product:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create product' },
      { status: 500 }
    )
  }
}
