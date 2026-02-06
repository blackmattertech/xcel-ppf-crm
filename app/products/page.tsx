'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import Image from 'next/image'

interface Product {
  id: string
  title: string
  description: string | null
  price: number
  mrp: number
  image_url: string | null
  sku: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

interface ProductWithStats extends Product {
  leads_interested: number
  customers_bought: number
}

export default function ProductsPage() {
  const router = useRouter()
  const [products, setProducts] = useState<ProductWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<ProductWithStats | null>(null)
  const [totalLeads, setTotalLeads] = useState(0)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    mrp: '',
    sku: '',
    is_active: true,
  })
  const [productImage, setProductImage] = useState<File | null>(null)
  const [productImagePreview, setProductImagePreview] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)

  useEffect(() => {
    checkAuth()
    fetchProducts()
    fetchTotalLeads()
  }, [])

  async function fetchTotalLeads() {
    try {
      const response = await fetch('/api/leads')
      if (response.ok) {
        const data = await response.json()
        setTotalLeads(data.leads?.length || 0)
      }
    } catch (error) {
      console.error('Failed to fetch total leads:', error)
    }
  }

  async function checkAuth() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }

    // Fetch user with role and permissions
    const { data: userData } = await supabase
      .from('users')
      .select(`
        role_id,
        roles!users_role_id_fkey (
          name,
          role_permissions (
            permissions (
              name
            )
          )
        )
      `)
      .eq('id', user.id)
      .single()

    if (userData) {
      const roleData = (userData as any).roles
      if (roleData) {
        const roleName = roleData.name
        setUserRole(roleName)
        
        // Extract permissions
        const permissions = (roleData.role_permissions || [])
          .map((rp: any) => rp.permissions?.name)
          .filter(Boolean)
        
        // Check if user has permission to view products
        // User needs products.read or products.manage permission
        const hasReadPermission = permissions.includes('products.read')
        const hasManagePermission = permissions.includes('products.manage')
        
        // Also allow super_admin, admin, and marketing roles (for backward compatibility)
        const isAllowedRole = roleName === 'super_admin' || roleName === 'admin' || roleName === 'marketing'
        
        if (!isAllowedRole && !hasReadPermission && !hasManagePermission) {
          router.push('/dashboard')
        }
      } else {
        router.push('/dashboard')
      }
    } else {
      router.push('/dashboard')
    }
  }

  async function fetchProducts() {
    try {
      const response = await fetch('/api/products?with_stats=true')
      if (response.ok) {
        const data = await response.json()
        setProducts(data || [])
      }
    } catch (error) {
      console.error('Failed to fetch products:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      alert('Invalid file type. Only JPEG, PNG, and WebP are allowed.')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size exceeds 5MB limit.')
      return
    }

    setProductImage(file)
    
    // Create preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setProductImagePreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  async function uploadImage(): Promise<string | null> {
    if (!productImage) {
      return imageUrl // Return existing image URL if no new image
    }

    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', productImage)

      const response = await fetch('/api/products/upload-image', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        const errorMessage = error.error || 'Failed to upload image'
        const errorDetails = error.details ? `\n\n${error.details}` : ''
        throw new Error(`${errorMessage}${errorDetails}`)
      }

      const data = await response.json()
      return data.url
    } catch (error) {
      console.error('Error uploading image:', error)
      alert(error instanceof Error ? error.message : 'Failed to upload image')
      return null
    } finally {
      setUploadingImage(false)
    }
  }

  async function handleCreateProduct() {
    if (!formData.title || !formData.price || !formData.mrp) {
      alert('Please fill in all required fields (Title, Price, MRP)')
      return
    }

    setSubmitting(true)
    try {
      // Upload image first if provided
      const uploadedImageUrl = await uploadImage()
      if (productImage && !uploadedImageUrl) {
        setSubmitting(false)
        return
      }

      const response = await fetch('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description || null,
          price: parseFloat(formData.price),
          mrp: parseFloat(formData.mrp),
          image_url: uploadedImageUrl || null,
          sku: formData.sku || null,
          is_active: formData.is_active,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create product')
      }

      // Reset form and close modal
      setFormData({
        title: '',
        description: '',
        price: '',
        mrp: '',
        sku: '',
        is_active: true,
      })
      setProductImage(null)
      setProductImagePreview(null)
      setImageUrl(null)
      setShowCreateModal(false)
      
      // Refresh products list
      await fetchProducts()
    } catch (error) {
      console.error('Error creating product:', error)
      alert(error instanceof Error ? error.message : 'Failed to create product')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdateProduct() {
    if (!editingProduct) return

    if (!formData.title || !formData.price || !formData.mrp) {
      alert('Please fill in all required fields (Title, Price, MRP)')
      return
    }

    setSubmitting(true)
    try {
      // Upload image first if provided
      const uploadedImageUrl = await uploadImage()
      if (productImage && !uploadedImageUrl) {
        setSubmitting(false)
        return
      }

      const response = await fetch(`/api/products/${editingProduct.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description || null,
          price: parseFloat(formData.price),
          mrp: parseFloat(formData.mrp),
          image_url: uploadedImageUrl !== null ? uploadedImageUrl : editingProduct.image_url,
          sku: formData.sku || null,
          is_active: formData.is_active,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update product')
      }

      // Reset form and close modal
      setFormData({
        title: '',
        description: '',
        price: '',
        mrp: '',
        sku: '',
        is_active: true,
      })
      setProductImage(null)
      setProductImagePreview(null)
      setImageUrl(null)
      setEditingProduct(null)
      
      // Refresh products list
      await fetchProducts()
    } catch (error) {
      console.error('Error updating product:', error)
      alert(error instanceof Error ? error.message : 'Failed to update product')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteProduct(id: string) {
    if (!confirm('Are you sure you want to delete this product?')) {
      return
    }

    try {
      const response = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete product')
      }

      // Refresh products list
      await fetchProducts()
    } catch (error) {
      console.error('Error deleting product:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete product')
    }
  }

  function openEditModal(product: ProductWithStats) {
    setEditingProduct(product)
    setFormData({
      title: product.title,
      description: product.description || '',
      price: product.price.toString(),
      mrp: product.mrp.toString(),
      sku: product.sku || '',
      is_active: product.is_active,
    })
    setImageUrl(product.image_url)
    setProductImagePreview(product.image_url)
    setProductImage(null)
    setShowCreateModal(true)
  }

  function closeModal() {
    setShowCreateModal(false)
    setEditingProduct(null)
    setFormData({
      title: '',
      description: '',
      price: '',
      mrp: '',
      sku: '',
      is_active: true,
    })
    setProductImage(null)
    setProductImagePreview(null)
    setImageUrl(null)
  }

  const canCreate = userRole === 'super_admin' || userRole === 'admin' || userRole === 'marketing'
  const canDelete = userRole === 'super_admin' || userRole === 'admin'

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-gray-600">Loading...</div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="p-4 md:p-6 lg:p-8 w-full">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          {canCreate && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              + Add New Product
            </button>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3 md:gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">Total Leads</h3>
            <p className="text-2xl font-bold text-gray-900 mt-2">
              {totalLeads}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">Total Products</h3>
            <p className="text-2xl font-bold text-gray-900 mt-2">
              {products.length}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {products.map((product) => (
            <div
              key={product.id}
              className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
            >
              {/* Product Image */}
              <div className="relative w-full h-48 bg-gray-200">
                {product.image_url ? (
                  <Image
                    src={product.image_url}
                    alt={product.title}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                {!product.is_active && (
                  <div className="absolute top-2 right-2 bg-red-500 text-white px-2 py-1 rounded text-xs">
                    Inactive
                  </div>
                )}
              </div>

              {/* Product Info */}
              <div className="p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{product.title}</h3>
                {product.description && (
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">{product.description}</p>
                )}
                
                {/* Price Info */}
                <div className="mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-indigo-600">₹{product.price.toLocaleString()}</span>
                    {product.mrp > product.price && (
                      <span className="text-sm text-gray-500 line-through">₹{product.mrp.toLocaleString()}</span>
                    )}
                  </div>
                  {product.mrp > product.price && (
                    <span className="text-xs text-green-600">
                      {Math.round(((product.mrp - product.price) / product.mrp) * 100)}% off
                    </span>
                  )}
                </div>

                {/* Statistics */}
                <div className="grid grid-cols-2 gap-2 mb-3 pt-3 border-t">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{product.leads_interested}</div>
                    <div className="text-xs text-gray-600">Leads Interested</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{product.customers_bought}</div>
                    <div className="text-xs text-gray-600">Customers Bought</div>
                  </div>
                </div>

                {/* Actions */}
                {canCreate && (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => openEditModal(product)}
                      className="flex-1 px-3 py-2 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 transition-colors text-sm"
                    >
                      Edit
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => handleDeleteProduct(product.id)}
                        className="px-3 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors text-sm"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {products.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No products found. {canCreate && 'Click "Add New Product" to create one.'}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">
                {editingProduct ? 'Edit Product' : 'Create New Product'}
              </h2>

              <div className="space-y-4">
                {/* Product Image */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Product Image
                  </label>
                  <div className="flex items-center gap-4">
                    {(productImagePreview || imageUrl) && (
                      <div className="relative w-32 h-32 bg-gray-200 rounded-lg overflow-hidden">
                        <Image
                          src={productImagePreview || imageUrl || ''}
                          alt="Preview"
                          fill
                          className="object-cover"
                        />
                      </div>
                    )}
                    <div>
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        onChange={handleImageChange}
                        className="block text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                      />
                      <p className="text-xs text-gray-500 mt-1">Max 5MB. JPEG, PNG, or WebP</p>
                    </div>
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Product title"
                    required
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Product description"
                    rows={3}
                  />
                </div>

                {/* Price and MRP */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Price (₹) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      MRP (₹) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.mrp}
                      onChange={(e) => setFormData({ ...formData, mrp: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="0.00"
                      required
                    />
                  </div>
                </div>

                {/* SKU */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    SKU
                  </label>
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Product SKU"
                  />
                </div>

                {/* Active Status */}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                  />
                  <label htmlFor="is_active" className="ml-2 text-sm text-gray-700">
                    Product is active
                  </label>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={submitting || uploadingImage}
                >
                  Cancel
                </button>
                <button
                  onClick={editingProduct ? handleUpdateProduct : handleCreateProduct}
                  disabled={submitting || uploadingImage}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting || uploadingImage ? 'Saving...' : editingProduct ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
