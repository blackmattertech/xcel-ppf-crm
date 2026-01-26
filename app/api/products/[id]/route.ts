import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { SYSTEM_ROLES } from '@/shared/constants/roles'
import { getProductById, updateProduct, deleteProduct } from '@/backend/services/product.service'
import { z } from 'zod'

const updateProductSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  price: z.number().positive().optional(),
  mrp: z.number().positive().optional(),
  image_url: z.string().url().optional().nullable().or(z.literal('')),
  sku: z.string().optional().nullable().or(z.literal('')),
  is_active: z.boolean().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const userRole = user.role?.name
    const userPermissions = user.role?.permissions?.map(p => p.name) || []

    // Check if user has permission to view products
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

    const { id } = await params
    const product = await getProductById(id)

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(product)
  } catch (error) {
    console.error('Error fetching product:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch product' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const userRole = user.role?.name
    const userPermissions = user.role?.permissions?.map(p => p.name) || []

    // Check if user has permission to update products
    const hasUpdatePermission = userPermissions.includes('products.update')
    const hasManagePermission = userPermissions.includes('products.manage')
    const isAllowedRole = userRole === SYSTEM_ROLES.ADMIN || 
                         userRole === SYSTEM_ROLES.SUPER_ADMIN || 
                         userRole === SYSTEM_ROLES.MARKETING

    if (!isAllowedRole && !hasUpdatePermission && !hasManagePermission) {
      return NextResponse.json(
        { error: 'Forbidden: You do not have permission to update products' },
        { status: 403 }
      )
    }

    const { id } = await params
    const body = await request.json()
    const validatedData = updateProductSchema.parse(body)

    const product = await updateProduct(id, validatedData)

    return NextResponse.json(product)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Error updating product:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update product' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const userRole = user.role?.name

    // Only Admin and Super Admin can delete products
    if (
      userRole !== SYSTEM_ROLES.ADMIN &&
      userRole !== SYSTEM_ROLES.SUPER_ADMIN
    ) {
      return NextResponse.json(
        { error: 'Forbidden: You do not have permission to delete products' },
        { status: 403 }
      )
    }

    const { id } = await params
    await deleteProduct(id)

    return NextResponse.json({ message: 'Product deleted successfully' })
  } catch (error) {
    console.error('Error deleting product:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete product' },
      { status: 500 }
    )
  }
}
