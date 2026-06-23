'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import { cachedFetch } from '@/lib/api-client'
import { BUCKET_COLORS } from '@/components/leads/LeadBucketPicker'
import { Layers, Plus, X, Pencil, Trash2, Users, Eye } from 'lucide-react'
import { LEAD_STATUS_LABELS } from '@/shared/constants/lead-status'

interface LeadBucket {
  id: string
  name: string
  description: string | null
  color: string | null
  is_active: boolean
  sort_order: number
  lead_count: number
  created_at: string
}

interface BucketLead {
  id: string
  lead_id: string
  name: string
  phone: string | null
  status: string
  assigned_user?: { id: string; name: string | null } | null
  created_at: string
}

interface BucketsSummary {
  total_buckets: number
  active_buckets: number
  total_leads_tagged: number
}

export default function BucketsPage() {
  const router = useRouter()
  const [buckets, setBuckets] = useState<LeadBucket[]>([])
  const [summary, setSummary] = useState<BucketsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [canManage, setCanManage] = useState(false)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingBucket, setEditingBucket] = useState<LeadBucket | null>(null)
  const [detailBucket, setDetailBucket] = useState<LeadBucket | null>(null)
  const [detailLeads, setDetailLeads] = useState<BucketLead[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: BUCKET_COLORS[0],
    is_active: true,
    sort_order: '0',
  })

  useEffect(() => {
    void checkAuth()
    void fetchBuckets()
  }, [])

  async function checkAuth() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data: userData } = await supabase
      .from('users')
      .select(`
        role_id,
        roles!users_role_id_fkey (
          name,
          role_permissions (
            permissions ( name )
          )
        )
      `)
      .eq('id', user.id)
      .single()

    if (!userData) {
      router.push('/dashboard')
      return
    }

    const roleData = (userData as { roles?: { name: string; role_permissions?: { permissions?: { name: string } }[] } }).roles
    if (!roleData) {
      router.push('/dashboard')
      return
    }

    const roleName = roleData.name
    setUserRole(roleName)
    const permissions = (roleData.role_permissions || [])
      .map((rp) => rp.permissions?.name)
      .filter(Boolean) as string[]

    const canView =
      roleName === 'super_admin' ||
      roleName === 'admin' ||
      roleName === 'tele_caller' ||
      permissions.includes('buckets.read') ||
      permissions.includes('buckets.manage')

    if (!canView) {
      router.push('/dashboard')
      return
    }

    setCanManage(
      roleName === 'super_admin' ||
        roleName === 'admin' ||
        permissions.includes('buckets.create') ||
        permissions.includes('buckets.manage')
    )
  }

  async function fetchBuckets() {
    try {
      const response = await cachedFetch('/api/buckets?with_stats=true')
      if (response.ok) {
        const data = await response.json()
        setBuckets(data.buckets || [])
        setSummary(data.summary || null)
      }
    } catch (err) {
      console.error('Failed to fetch buckets:', err)
    } finally {
      setLoading(false)
    }
  }

  async function openBucketDetail(bucket: LeadBucket) {
    setDetailBucket(bucket)
    setDetailLeads([])
    setDetailLoading(true)
    try {
      const response = await cachedFetch(`/api/buckets/${bucket.id}?include=leads`)
      if (response.ok) {
        const data = await response.json()
        setDetailLeads(data.leads || [])
      }
    } finally {
      setDetailLoading(false)
    }
  }

  function openCreateModal() {
    setEditingBucket(null)
    setFormData({
      name: '',
      description: '',
      color: BUCKET_COLORS[0],
      is_active: true,
      sort_order: String(buckets.length),
    })
    setShowCreateModal(true)
  }

  function openEditModal(bucket: LeadBucket) {
    setEditingBucket(bucket)
    setFormData({
      name: bucket.name,
      description: bucket.description || '',
      color: bucket.color || BUCKET_COLORS[0],
      is_active: bucket.is_active,
      sort_order: String(bucket.sort_order),
    })
    setShowCreateModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canManage) return
    setSubmitting(true)
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        color: formData.color,
        is_active: formData.is_active,
        sort_order: parseInt(formData.sort_order, 10) || 0,
      }

      const url = editingBucket ? `/api/buckets/${editingBucket.id}` : '/api/buckets'
      const method = editingBucket ? 'PUT' : 'POST'

      const response = await cachedFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        alert(err.error || 'Failed to save bucket')
        return
      }

      setShowCreateModal(false)
      await fetchBuckets()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(bucket: LeadBucket) {
    if (!canManage) return
    if (!confirm(`Delete bucket "${bucket.name}"? Leads will be untagged.`)) return

    const response = await fetch(`/api/buckets/${bucket.id}`, { method: 'DELETE' })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      alert(err.error || 'Failed to delete bucket')
      return
    }
    if (detailBucket?.id === bucket.id) setDetailBucket(null)
    await fetchBuckets()
  }

  const totalTagged = useMemo(
    () => summary?.total_leads_tagged ?? buckets.reduce((s, b) => s + b.lead_count, 0),
    [summary, buckets]
  )

  if (loading) {
    return (
      <Layout>
        <div className="p-6 text-sm text-gray-500">Loading buckets…</div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
              <Layers className="w-7 h-7 text-[#dd3f3c]" />
              Lead Buckets
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Admin makes bucket names. Callers tag leads. Status journey not touched.{' '}
              <Link href="/reports" className="text-[#dd3f3c] hover:underline font-medium">
                View bucket analytics →
              </Link>
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#dd3f3c] text-white text-sm font-medium rounded-lg hover:bg-[#c93532]"
            >
              <Plus className="w-4 h-4" />
              New bucket
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total buckets</p>
            <p className="text-2xl font-semibold mt-1">{summary?.total_buckets ?? buckets.length}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Active</p>
            <p className="text-2xl font-semibold mt-1">
              {summary?.active_buckets ?? buckets.filter((b) => b.is_active).length}
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Tagged leads</p>
            <p className="text-2xl font-semibold mt-1">{totalTagged}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">All buckets</h2>
            {buckets.length === 0 ? (
              <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center text-gray-500">
                No buckets yet.
              </div>
            ) : (
              buckets.map((bucket) => (
                <div
                  key={bucket.id}
                  className={`bg-white border rounded-xl p-4 flex items-center gap-3 cursor-pointer transition-colors ${
                    detailBucket?.id === bucket.id ? 'border-[#dd3f3c] ring-1 ring-[rgba(248,229,231,0.8)]' : 'border-gray-200 hover:border-[rgba(221,63,60,0.35)]'
                  }`}
                  onClick={() => void openBucketDetail(bucket)}
                >
                  <span className="w-2 h-10 rounded-full shrink-0" style={{ backgroundColor: bucket.color || '#dd3f3c' }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 truncate">{bucket.name}</p>
                      {!bucket.is_active && (
                        <span className="text-[10px] uppercase px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">Inactive</span>
                      )}
                    </div>
                    {bucket.description && <p className="text-xs text-gray-500 truncate">{bucket.description}</p>}
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {bucket.lead_count} lead{bucket.lead_count !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => openEditModal(bucket)} className="p-2 text-gray-400 hover:text-[#dd3f3c] rounded-lg">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => void handleDelete(bucket)} className="p-2 text-gray-400 hover:text-red-600 rounded-lg">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  <Eye className="w-4 h-4 text-[#dd3f3c] shrink-0" />
                </div>
              ))
            )}
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Bucket details</h2>
            {!detailBucket ? (
              <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center text-gray-500">
                Pick a bucket to see leads inside.
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                  <span className="w-2 h-8 rounded-full" style={{ backgroundColor: detailBucket.color || '#dd3f3c' }} />
                  <div>
                    <p className="font-semibold text-gray-900">{detailBucket.name}</p>
                    <p className="text-xs text-gray-500">{detailBucket.lead_count} leads tagged</p>
                  </div>
                </div>
                {detailLoading ? (
                  <p className="p-6 text-sm text-gray-500">Loading leads…</p>
                ) : detailLeads.length === 0 ? (
                  <p className="p-6 text-sm text-gray-500">No leads in this bucket yet.</p>
                ) : (
                  <div className="divide-y divide-gray-100 max-h-[480px] overflow-y-auto">
                    {detailLeads.map((lead) => (
                      <div key={lead.id} className="p-4 hover:bg-gray-50 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">{lead.name}</p>
                          <p className="text-xs text-gray-400">{lead.lead_id} · {lead.phone || '—'}</p>
                          <p className="text-xs text-[#dd3f3c] mt-0.5">
                            {LEAD_STATUS_LABELS[lead.status as keyof typeof LEAD_STATUS_LABELS] || lead.status}
                            {lead.assigned_user?.name ? ` · ${lead.assigned_user.name}` : ''}
                          </p>
                        </div>
                        <Link href={`/leads/${lead.id}`} className="text-sm text-[#dd3f3c] hover:underline shrink-0">
                          Open
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showCreateModal && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative">
            <button type="button" onClick={() => setShowCreateModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold mb-4">{editingBucket ? 'Edit bucket' : 'New bucket'}</h2>
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  required
                  maxLength={100}
                  value={formData.name}
                  onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={formData.description}
                  onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
                <div className="flex flex-wrap gap-2">
                  {BUCKET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormData((f) => ({ ...f, color: c }))}
                      className={`w-8 h-8 rounded-full border-2 ${formData.color === c ? 'border-gray-900' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sort order</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.sort_order}
                    onChange={(e) => setFormData((f) => ({ ...f, sort_order: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm pb-2">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData((f) => ({ ...f, is_active: e.target.checked }))}
                  />
                  Active
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium bg-[#dd3f3c] text-white rounded-lg disabled:opacity-50">
                  {submitting ? 'Saving…' : editingBucket ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
}
