'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import { cachedFetch } from '@/lib/api-client'
import { BUCKET_COLORS } from '@/components/leads/LeadBucketPicker'
import { Layers, Plus, X, Pencil, Trash2, Users, Eye, Download } from 'lucide-react'
import { LEAD_STATUS_LABELS } from '@/shared/constants/lead-status'
import { BucketAutomationLinks } from '@/components/whatsapp/BucketAutomationLinks'

interface LeadBucket {
  id: string
  name: string
  description: string | null
  color: string | null
  is_active: boolean
  sort_order: number
  parent_id: string | null
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
  const [canEnrollAutomation, setCanEnrollAutomation] = useState(false)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createParentId, setCreateParentId] = useState<string | null>(null)
  const [editingBucket, setEditingBucket] = useState<LeadBucket | null>(null)
  const [detailBucket, setDetailBucket] = useState<LeadBucket | null>(null)
  const [detailLeads, setDetailLeads] = useState<BucketLead[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [exportingBucketId, setExportingBucketId] = useState<string | null>(null)

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
    setCanEnrollAutomation(
      roleName === 'super_admin' ||
        roleName === 'admin' ||
        permissions.includes('whatsapp_automation.enroll') ||
        permissions.includes('whatsapp_automation.manage') ||
        permissions.includes('leads.update')
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

  async function downloadBucketCsv(bucket: LeadBucket) {
    setExportingBucketId(bucket.id)
    try {
      const response = await fetch(`/api/buckets/${bucket.id}/export`, { credentials: 'include' })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        alert(typeof err.error === 'string' ? err.error : 'Failed to download CSV')
        return
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const disposition = response.headers.get('Content-Disposition')
      const match = disposition?.match(/filename="([^"]+)"/)
      link.download = match?.[1] || `${bucket.name}-leads.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch {
      alert('Failed to download CSV')
    } finally {
      setExportingBucketId(null)
    }
  }

  function openCreateModal(parentId: string | null = null) {
    setEditingBucket(null)
    setCreateParentId(parentId)
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
    setCreateParentId(bucket.parent_id)
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
        parent_id: editingBucket ? editingBucket.parent_id : createParentId,
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

  const bucketTree = useMemo(() => {
    const topLevel = buckets
      .filter((b) => !b.parent_id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
    const childrenByParent = new Map<string, LeadBucket[]>()
    for (const b of buckets) {
      if (!b.parent_id) continue
      const list = childrenByParent.get(b.parent_id) || []
      list.push(b)
      childrenByParent.set(b.parent_id, list)
    }
    for (const [parentId, children] of childrenByParent) {
      childrenByParent.set(
        parentId,
        children.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
      )
    }
    return { topLevel, childrenByParent }
  }, [buckets])

  function renderBucketRow(bucket: LeadBucket, isSub = false) {
    const childCount = bucketTree.childrenByParent.get(bucket.id)?.length ?? 0
    return (
      <div
        key={bucket.id}
        className={`bg-white border rounded-xl p-4 flex items-center gap-3 cursor-pointer transition-colors ${
          isSub ? 'ml-6 border-dashed' : ''
        } ${
          detailBucket?.id === bucket.id
            ? 'border-[#dd3f3c] ring-1 ring-[rgba(248,229,231,0.8)]'
            : 'border-gray-200 hover:border-[rgba(221,63,60,0.35)]'
        }`}
        onClick={() => void openBucketDetail(bucket)}
      >
        <span className="w-2 h-10 rounded-full shrink-0" style={{ backgroundColor: bucket.color || '#dd3f3c' }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900 truncate">
              {isSub ? `↳ ${bucket.name}` : bucket.name}
            </p>
            {!bucket.is_active && (
              <span className="text-[10px] uppercase px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">Inactive</span>
            )}
            {!isSub && childCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                {childCount} sub
              </span>
            )}
          </div>
          {bucket.description && <p className="text-xs text-gray-500 truncate">{bucket.description}</p>}
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
            <Users className="w-3 h-3" />
            {bucket.lead_count} lead{bucket.lead_count !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {bucket.lead_count > 0 && (
            <button
              type="button"
              title="Download leads CSV"
              disabled={exportingBucketId === bucket.id}
              onClick={() => void downloadBucketCsv(bucket)}
              className="p-2 text-gray-400 hover:text-[#dd3f3c] rounded-lg disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
          {canManage && (
            <>
            {!isSub && (
              <button
                type="button"
                title="Add sub-bucket"
                onClick={() => openCreateModal(bucket.id)}
                className="p-2 text-gray-400 hover:text-[#dd3f3c] rounded-lg"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
            <button type="button" onClick={() => openEditModal(bucket)} className="p-2 text-gray-400 hover:text-[#dd3f3c] rounded-lg">
              <Pencil className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => void handleDelete(bucket)} className="p-2 text-gray-400 hover:text-red-600 rounded-lg">
              <Trash2 className="w-4 h-4" />
            </button>
            </>
          )}
        </div>
        <Eye className="w-4 h-4 text-[#dd3f3c] shrink-0" />
      </div>
    )
  }

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
              Admin makes buckets and sub-buckets. Callers tag leads to sub-buckets (or top-level when no subs).{' '}
              <Link href="/reports" className="text-[#dd3f3c] hover:underline font-medium">
                View bucket analytics →
              </Link>
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => openCreateModal(null)}
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
              bucketTree.topLevel.map((bucket) => (
                <div key={bucket.id} className="space-y-2">
                  {renderBucketRow(bucket)}
                  {(bucketTree.childrenByParent.get(bucket.id) || []).map((sub) => renderBucketRow(sub, true))}
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
                <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-2 h-8 rounded-full shrink-0" style={{ backgroundColor: detailBucket.color || '#dd3f3c' }} />
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">
                        {detailBucket.parent_id
                          ? `${buckets.find((b) => b.id === detailBucket.parent_id)?.name ?? 'Parent'} › ${detailBucket.name}`
                          : detailBucket.name}
                      </p>
                      <p className="text-xs text-gray-500">{detailBucket.lead_count} leads tagged</p>
                    </div>
                  </div>
                  {detailBucket.lead_count > 0 && (
                    <button
                      type="button"
                      disabled={exportingBucketId === detailBucket.id}
                      onClick={() => void downloadBucketCsv(detailBucket)}
                      className="inline-flex items-center gap-1.5 shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-[#dd3f3c]/40 hover:text-[#dd3f3c] disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {exportingBucketId === detailBucket.id ? 'Downloading…' : 'Download CSV'}
                    </button>
                  )}
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
                <BucketAutomationLinks
                  bucketId={detailBucket.id}
                  canEnroll={canEnrollAutomation}
                  isParentWithChildren={(bucketTree.childrenByParent.get(detailBucket.id)?.length ?? 0) > 0}
                />
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
            <h2 className="text-lg font-semibold mb-4">
              {editingBucket
                ? 'Edit bucket'
                : createParentId
                  ? `New sub-bucket under ${buckets.find((b) => b.id === createParentId)?.name ?? 'parent'}`
                  : 'New bucket'}
            </h2>
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              {createParentId && !editingBucket && (
                <p className="text-xs text-gray-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                  Sub-bucket lives under{' '}
                  <span className="font-medium text-gray-800">
                    {buckets.find((b) => b.id === createParentId)?.name ?? 'parent bucket'}
                  </span>
                  . Callers pick it from the lead dropdown.
                </p>
              )}
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
