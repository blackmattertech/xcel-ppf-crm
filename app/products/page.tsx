'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import Image from 'next/image'
import { cachedFetch } from '@/lib/api-client'

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
  orders_linked?: number
  conversion_rate?: number | null
  estimated_pipeline_value?: number
  margin_percent?: number | null
}

interface ProductsStatsSummary {
  total_products: number
  active_products: number
  total_leads_in_system: number
  leads_matching_at_least_one_product: number
  total_orders: number
  orders_with_product_assigned: number
}

type ProductSortOption =
  | 'interested_desc'
  | 'title_asc'
  | 'conversion_desc'
  | 'customers_desc'
  | 'pipeline_desc'

type ProductFilterOption = 'all' | 'active' | 'inactive' | 'high_interest_low_conversion'

export default function ProductsPage() {
  const router = useRouter()
  const [products, setProducts] = useState<ProductWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<ProductWithStats | null>(null)
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
  const [summary, setSummary] = useState<ProductsStatsSummary | null>(null)
  const [sortOption, setSortOption] = useState<ProductSortOption>('interested_desc')
  const [filterOption, setFilterOption] = useState<ProductFilterOption>('all')

  useEffect(() => {
    checkAuth()
    fetchProducts()
  }, [])

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
      const response = await cachedFetch('/api/products?with_stats=true')
      if (response.ok) {
        const raw = await response.json()
        if (raw?.products && Array.isArray(raw.products)) {
          setProducts(raw.products)
          setSummary(raw.summary ?? null)
        } else if (Array.isArray(raw)) {
          setProducts(raw)
          setSummary(null)
        } else {
          setProducts([])
          setSummary(null)
        }
      }
    } catch (error) {
      console.error('Failed to fetch products:', error)
    } finally {
      setLoading(false)
    }
  }

  const totalPipelineEstimate = useMemo(
    () => products.reduce((s, p) => s + (p.estimated_pipeline_value ?? p.leads_interested * p.price), 0),
    [products]
  )

  const displayedProducts = useMemo(() => {
    let list = [...products]
    if (filterOption === 'active') list = list.filter((p) => p.is_active)
    if (filterOption === 'inactive') list = list.filter((p) => !p.is_active)
    if (filterOption === 'high_interest_low_conversion') {
      list = list.filter(
        (p) =>
          p.leads_interested >= 3 &&
          p.customers_bought < p.leads_interested &&
          (p.conversion_rate == null || p.conversion_rate < 10)
      )
    }
    list.sort((a, b) => {
      switch (sortOption) {
        case 'title_asc':
          return a.title.localeCompare(b.title)
        case 'conversion_desc': {
          const ca = a.conversion_rate ?? -1
          const cb = b.conversion_rate ?? -1
          return cb - ca
        }
        case 'customers_desc':
          return b.customers_bought - a.customers_bought
        case 'pipeline_desc': {
          const pa = a.estimated_pipeline_value ?? a.leads_interested * a.price
          const pb = b.estimated_pipeline_value ?? b.leads_interested * b.price
          return pb - pa
        }
        case 'interested_desc':
        default:
          return b.leads_interested - a.leads_interested
      }
    })
    return list
  }, [products, filterOption, sortOption])

  function exportProductsCsv(rows: ProductWithStats[]) {
    const headers = [
      'Title',
      'SKU',
      'Active',
      'Price',
      'MRP',
      'Leads interested',
      'Orders (SKU)',
      'Orders / buyers (max)',
      'Conversion %',
      'Est. pipeline INR',
    ]
    const esc = (v: string | number) => {
      const s = String(v ?? '')
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
      return s
    }
    const lines = [
      headers.join(','),
      ...rows.map((p) =>
        [
          esc(p.title),
          esc(p.sku ?? ''),
          p.is_active ? 'yes' : 'no',
          p.price,
          p.mrp,
          p.leads_interested,
          p.orders_linked ?? 0,
          p.customers_bought,
          p.conversion_rate != null ? p.conversion_rate : '',
          p.estimated_pipeline_value ?? p.leads_interested * p.price,
        ].join(',')
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `products-insights-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
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

      const response = await cachedFetch('/api/products/upload-image', {
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

      const response = await cachedFetch('/api/products', {
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

      const response = await cachedFetch(`/api/products/${editingProduct.id}`, {
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
      const response = await cachedFetch(`/api/products/${id}`, {
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
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Products</h1>
            <p className="text-sm text-gray-500 mt-1 max-w-2xl">
              Interest counts match lead requirement and Meta fields (fuzzy). Pipeline = interested leads × list price. Conversion uses orders vs interested leads.
            </p>
          </div>
          {canCreate && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shrink-0"
            >
              + Add New Product
            </button>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-5">
            <h3 className="text-sm font-medium text-gray-500">Catalog</h3>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              <span className="text-indigo-600">
                {summary?.active_products ?? products.filter((p) => p.is_active).length}
              </span>
              <span className="text-base font-normal text-gray-500"> active · </span>
              <span>{summary?.total_products ?? products.length}</span>
              <span className="text-base font-normal text-gray-500"> total</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">Products in CRM</p>
          </div>
          <div className="bg-white rounded-lg shadow p-5">
            <h3 className="text-sm font-medium text-gray-500">Leads with product interest</h3>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {summary?.leads_matching_at_least_one_product ?? '—'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {summary != null
                ? `of ${summary.total_leads_in_system} leads (matched any product)`
                : 'Load stats to see coverage'}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-5">
            <h3 className="text-sm font-medium text-gray-500">Orders</h3>
            <p className="text-2xl font-bold text-gray-900 mt-1">{summary?.total_orders ?? '—'}</p>
            <p className="text-xs text-gray-400 mt-1">
              {summary != null
                ? `${summary.orders_with_product_assigned} with product on order`
                : '—'}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-5">
            <h3 className="text-sm font-medium text-gray-500">Est. pipeline (all products)</h3>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              ₹{Math.round(totalPipelineEstimate).toLocaleString('en-IN')}
            </p>
            <p className="text-xs text-gray-400 mt-1">Interested leads × your list price</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 mb-6">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <span className="text-gray-500 shrink-0">Sort</span>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as ProductSortOption)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white min-w-[200px]"
            >
              <option value="interested_desc">Most leads interested</option>
              <option value="pipeline_desc">Highest est. pipeline</option>
              <option value="conversion_desc">Highest conversion %</option>
              <option value="customers_desc">Most orders (buyers)</option>
              <option value="title_asc">Title A–Z</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <span className="text-gray-500 shrink-0">Filter</span>
            <select
              value={filterOption}
              onChange={(e) => setFilterOption(e.target.value as ProductFilterOption)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white min-w-[220px]"
            >
              <option value="all">All products</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
              <option value="high_interest_low_conversion">High interest, low conversion (≥3 leads, &lt;10%)</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => exportProductsCsv(displayedProducts)}
            disabled={displayedProducts.length === 0}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export CSV ({displayedProducts.length})
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {displayedProducts.map((product) => (
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
                      {product.margin_percent != null
                        ? `${product.margin_percent}% off MRP`
                        : `${Math.round(((product.mrp - product.price) / product.mrp) * 100)}% off`}
                    </span>
                  )}
                </div>

                {/* Statistics */}
                <div className="grid grid-cols-2 gap-2 mb-2 pt-3 border-t">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{product.leads_interested}</div>
                    <div className="text-xs text-gray-600">Leads interested</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{product.customers_bought}</div>
                    <div className="text-xs text-gray-600">Orders (max of SKU + match)</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3 text-[11px] text-gray-600">
                  <div>
                    <span className="text-gray-500">On order (SKU):</span>{' '}
                    <span className="font-semibold text-gray-800">{product.orders_linked ?? 0}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Conversion:</span>{' '}
                    <span className="font-semibold text-gray-800">
                      {product.conversion_rate != null ? `${product.conversion_rate}%` : '—'}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500">Est. pipeline:</span>{' '}
                    <span className="font-semibold text-indigo-700">
                      ₹
                      {(product.estimated_pipeline_value ?? product.leads_interested * product.price).toLocaleString(
                        'en-IN'
                      )}
                    </span>
                  </div>
                </div>

                <Link
                  href={`/leads?q=${encodeURIComponent(product.title)}`}
                  className="block w-full text-center text-xs text-indigo-600 hover:text-indigo-800 py-2 border border-indigo-100 rounded-lg bg-indigo-50/50 mb-2"
                >
                  View matching leads
                </Link>

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
        {products.length > 0 && displayedProducts.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No products match this filter. Try &quot;All products&quot;.
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
