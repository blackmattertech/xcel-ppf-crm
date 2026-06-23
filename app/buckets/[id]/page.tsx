'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { useAuthContext } from '@/components/AuthProvider'
import { cachedFetch } from '@/lib/api-client'
import { SYSTEM_ROLES } from '@/shared/constants/roles'
import { LEAD_STATUS_LABELS } from '@/shared/constants/lead-status'
import { ArrowLeft, FolderOpen, Phone, User } from 'lucide-react'

interface BucketLead {
  id: string
  lead_id: string
  name: string
  phone: string | null
  status: string
  assigned_user?: { id: string; name: string | null } | null
  created_at: string
}

interface BucketDetail {
  bucket: {
    id: string
    name: string
    description: string | null
    color: string | null
    is_active: boolean
  }
  leads: BucketLead[]
}

export default function BucketDetailPage() {
  const router = useRouter()
  const params = useParams()
  const bucketId = params?.id as string
  const { role, loading: authLoading, isAuthenticated } = useAuthContext()
  const [data, setData] = useState<BucketDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const userRole = role?.name
  const permissions = role?.permissions || []

  const canView = useMemo(() => {
    if (!userRole) return false
    return (
      userRole === SYSTEM_ROLES.ADMIN ||
      userRole === SYSTEM_ROLES.SUPER_ADMIN ||
      userRole === SYSTEM_ROLES.TELE_CALLER ||
      permissions.includes('buckets.read') ||
      permissions.includes('buckets.manage')
    )
  }, [userRole, permissions])

  const fetchBucket = useCallback(async () => {
    if (!bucketId) return
    try {
      const res = await cachedFetch(`/api/buckets/${bucketId}?include=leads`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setError(err.error || 'Failed to load bucket')
        return
      }
      setData(await res.json())
    } catch {
      setError('Failed to load bucket')
    } finally {
      setLoading(false)
    }
  }, [bucketId])

  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    if (!canView) {
      router.push('/dashboard')
      return
    }
    void fetchBucket()
  }, [authLoading, isAuthenticated, canView, router, fetchBucket])

  const bucket = data?.bucket
  const leads = data?.leads ?? []

  if (authLoading || loading) {
    return (
      <Layout>
        <div className="p-6 text-sm text-gray-500">Loading…</div>
      </Layout>
    )
  }

  if (error || !bucket) {
    return (
      <Layout>
        <div className="p-6 max-w-3xl mx-auto">
          <Link href="/buckets" className="text-sm text-[#dd3f3c] hover:underline flex items-center gap-1 mb-4">
            <ArrowLeft className="w-4 h-4" />
            Back to buckets
          </Link>
          <p className="text-red-600">{error || 'Bucket not found'}</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto">
        <Link href="/buckets" className="text-sm text-[#dd3f3c] hover:underline flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" />
          All buckets
        </Link>

        <div className="flex items-start gap-4 mb-6">
          <span
            className="w-2 h-14 rounded-full shrink-0 mt-1"
            style={{ backgroundColor: bucket.color || '#dd3f3c' }}
          />
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
              <FolderOpen className="w-7 h-7 text-[#dd3f3c]" />
              {bucket.name}
            </h1>
            {bucket.description && <p className="text-sm text-gray-500 mt-1">{bucket.description}</p>}
            <p className="text-sm text-gray-600 mt-2">
              <span className="font-semibold text-[#dd3f3c]">{leads.length}</span> lead{leads.length !== 1 ? 's' : ''} in this bucket
              {userRole === SYSTEM_ROLES.TELE_CALLER && ' (your assigned leads only)'}
            </p>
          </div>
        </div>

        {leads.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center text-gray-500">
            No leads tagged in this bucket yet.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Lead</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Assigned to</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{lead.name}</p>
                      <p className="text-xs text-gray-400">{lead.lead_id}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <span className="inline-flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5" />
                        {lead.phone || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-[rgba(248,229,231,0.6)] text-[#dd3f3c]">
                        {LEAD_STATUS_LABELS[lead.status as keyof typeof LEAD_STATUS_LABELS] || lead.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {lead.assigned_user ? (
                        <span className="inline-flex items-center gap-1">
                          <User className="w-3.5 h-3.5" />
                          {lead.assigned_user.name}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/leads/${lead.id}`} className="text-[#dd3f3c] hover:underline font-medium">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  )
}
