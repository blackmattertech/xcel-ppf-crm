'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuthContext } from '@/components/AuthProvider'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { SYSTEM_ROLES } from '@/shared/constants/roles'
import {
  Calendar,
  CheckCircle2,
  Clock,
  Phone,
  Trash2,
  User,
  FileText,
  ExternalLink,
  AlertCircle,
  ListTodo,
} from 'lucide-react'
import { cachedFetch } from '@/lib/api-client'

interface AssignedUser {
  id: string
  name: string
  email?: string
}

interface FollowUp {
  id: string
  scheduled_at: string
  completed_at: string | null
  status: string
  notes: string | null
  assigned_to?: string | null
  assigned_user?: AssignedUser | null
  lead: {
    id: string
    name: string
    phone: string
    status: string
  } | null
}

export default function FollowUpsPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthContext()
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'overdue' | 'upcoming' | 'pending'>('all')
  const [assignedUserFilter, setAssignedUserFilter] = useState<string>('')
  const [assignedUsersList, setAssignedUsersList] = useState<{ id: string; name: string }[]>([])
  const [totalLeads, setTotalLeads] = useState(0)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingAll, setDeletingAll] = useState(false)
  const [deletingSelected, setDeletingSelected] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    checkAuth()
  }, [isAuthenticated, router])

  useEffect(() => {
    if (!isAuthenticated) return
    fetchFollowUps()
  }, [isAuthenticated, assignedUserFilter])

  useEffect(() => {
    if (!isAuthenticated) return
    fetchTotalLeads()
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchFollowUps()
        fetchTotalLeads()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [isAuthenticated, assignedUserFilter])

  async function fetchTotalLeads() {
    try {
      const res = await cachedFetch('/api/leads/count')
      if (res.ok) {
        const data = await res.json()
        setTotalLeads(data.count || 0)
      }
    } catch {
      // ignore
    }
  }

  async function checkAuth() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }
    const { data: userData } = await supabase
      .from('users')
      .select('role_id, roles!users_role_id_fkey(name)')
      .eq('id', user.id)
      .single()
    if (userData) {
      const roleName = (userData as any).roles?.name ?? (Array.isArray((userData as any).roles) ? (userData as any).roles[0]?.name : null)
      setUserRole(roleName)
    }
  }

  async function fetchFollowUps() {
    try {
      let url = '/api/followups'
      if (assignedUserFilter) url += `?assignedTo=${encodeURIComponent(assignedUserFilter)}`
      const res = await cachedFetch(url)
      if (res.ok) {
        const data = await res.json()
        const list = data.followUps || []
        setFollowUps(list)
        setSelectedIds(new Set())
        if (!assignedUserFilter && list.length > 0) {
          const seen = new Set<string>()
          const users: { id: string; name: string }[] = []
          for (const fu of list) {
            if (fu.assigned_to && fu.assigned_user && !seen.has(fu.assigned_to)) {
              seen.add(fu.assigned_to)
              users.push({ id: fu.assigned_to, name: fu.assigned_user.name })
            }
          }
          users.sort((a, b) => a.name.localeCompare(b.name))
          setAssignedUsersList(users)
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const isAdmin = userRole === SYSTEM_ROLES.ADMIN || userRole === SYSTEM_ROLES.SUPER_ADMIN
  const now = new Date()
  const overdueFollowUps = followUps.filter((fu) => fu.status === 'pending' && new Date(fu.scheduled_at) < now)
  const upcomingFollowUps = followUps.filter((fu) => fu.status === 'pending' && new Date(fu.scheduled_at) >= now)
  const pendingFollowUps = followUps.filter((fu) => fu.status === 'pending')

  const displayedFollowUps = useMemo(() => {
    if (filter === 'overdue') return overdueFollowUps
    if (filter === 'upcoming') return upcomingFollowUps
    if (filter === 'pending') return pendingFollowUps
    return followUps
  }, [filter, followUps, overdueFollowUps, upcomingFollowUps, pendingFollowUps])

  const selectedCount = selectedIds.size
  const allVisibleSelected = displayedFollowUps.length > 0 && displayedFollowUps.every((fu) => selectedIds.has(fu.id))

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelectedIds(new Set(displayedFollowUps.map((fu) => fu.id)))
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  async function handleDeleteSelected() {
    if (selectedCount === 0) return
    if (!confirm(`Delete ${selectedCount} selected follow-up${selectedCount === 1 ? '' : 's'}? This cannot be undone.`)) return
    setDeletingSelected(true)
    try {
      const res = await cachedFetch('/api/followups/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      })
      const data = await res.json()
        if (res.ok) {
        const removed = new Set(selectedIds)
        setFollowUps((prev) => prev.filter((fu) => !removed.has(fu.id)))
        setSelectedIds(new Set())
        alert(`Deleted ${data.deletedCount ?? selectedCount} follow-up(s).`)
      } else {
        alert(data.error || 'Failed to delete follow-ups')
      }
    } catch (e) {
      console.error(e)
      alert('Failed to delete follow-ups')
    } finally {
      setDeletingSelected(false)
    }
  }

  async function handleDeleteAllFollowUps() {
    if (followUps.length === 0) {
      alert('No follow-ups to delete.')
      return
    }
    const scope = isAdmin && assignedUserFilter ? ' these follow-ups' : isAdmin ? ' all follow-ups in the system' : ' all your follow-ups'
    if (!confirm(`Permanently delete ${followUps.length} follow-up${followUps.length === 1 ? '' : 's'}${scope}? This cannot be undone.`)) return
    setDeletingAll(true)
    try {
      const url = isAdmin && assignedUserFilter ? `/api/followups?assignedTo=${encodeURIComponent(assignedUserFilter)}` : '/api/followups'
      const res = await fetch(url, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        setFollowUps([])
        setSelectedIds(new Set())
        alert(`Deleted ${data.deletedCount ?? followUps.length} follow-up(s).`)
      } else {
        alert(data.error || 'Failed to delete follow-ups')
      }
    } catch (e) {
      console.error(e)
      alert('Failed to delete follow-ups')
    } finally {
      setDeletingAll(false)
    }
  }

  async function handleDeleteFollowUp(id: string) {
    if (!confirm('Delete this follow-up? This cannot be undone.')) return
    setDeletingId(id)
    try {
      const res = await cachedFetch(`/api/followups/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setFollowUps((prev) => prev.filter((fu) => fu.id !== id))
        setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n })
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to delete follow-up')
      }
    } catch (e) {
      console.error(e)
      alert('Failed to delete follow-up')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleCompleteFollowUp(id: string) {
    try {
      const res = await cachedFetch(`/api/followups/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Follow-up completed' }),
      })
      if (res.ok) {
        await fetchFollowUps()
        alert('Follow-up marked as completed')
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to complete follow-up')
      }
    } catch {
      alert('Failed to complete follow-up')
    }
  }

  const followUpsByUser = useMemo(() => {
    if (!isAdmin || followUps.length === 0) return null
    const groups: Record<string, { user: AssignedUser | null; items: FollowUp[] }> = {}
    for (const fu of followUps) {
      const key = fu.assigned_to ?? '__unassigned__'
      if (!groups[key]) {
        groups[key] = { user: key === '__unassigned__' ? null : (fu.assigned_user ?? { id: fu.assigned_to!, name: 'Unknown', email: '' }), items: [] }
      }
      groups[key].items.push(fu)
    }
    return Object.entries(groups).sort((a, b) => {
      if (a[0] === '__unassigned__') return -1
      if (b[0] === '__unassigned__') return 1
      return (a[1].user?.name ?? '').localeCompare(b[1].user?.name ?? '')
    })
  }, [isAdmin, followUps])

  const assignedUsersForFilter = isAdmin ? assignedUsersList : []

  function renderCard(fu: FollowUp, showCheckbox: boolean) {
    const scheduledDate = new Date(fu.scheduled_at)
    const isOverdue = fu.status === 'pending' && scheduledDate < now
    const isUpcoming = fu.status === 'pending' && scheduledDate >= now
    const isSelected = selectedIds.has(fu.id)

    return (
      <div
        key={fu.id}
        className={`rounded-xl border transition-all ${
          isSelected ? 'ring-2 ring-indigo-500 border-indigo-300 bg-indigo-50/30' : 'border-gray-200 bg-white hover:border-gray-300'
        } ${isOverdue ? 'border-l-4 border-l-red-500' : isUpcoming ? 'border-l-4 border-l-amber-500' : ''}`}
      >
        <div className="p-5 flex gap-4">
          {showCheckbox && (
            <div className="flex items-start pt-0.5">
              <button
                type="button"
                onClick={() => toggleSelect(fu.id)}
                className="rounded border-2 border-gray-300 w-5 h-5 flex items-center justify-center hover:border-indigo-500 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
                aria-label={isSelected ? 'Deselect' : 'Select'}
              >
                {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />}
              </button>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Link
                href={`/leads/${fu.lead?.id}`}
                className="font-semibold text-gray-900 hover:text-indigo-600 text-lg truncate"
              >
                {fu.lead?.name || 'Unknown Lead'}
              </Link>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  fu.status === 'done'
                    ? 'bg-emerald-100 text-emerald-800'
                    : isOverdue
                    ? 'bg-red-100 text-red-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {fu.status === 'done' ? <CheckCircle2 className="w-3.5 h-3.5" /> : isOverdue ? <AlertCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                {fu.status === 'done' ? 'Completed' : isOverdue ? 'Overdue' : 'Upcoming'}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-4 h-4 text-gray-400" />
                {scheduledDate.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
              {fu.lead?.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="w-4 h-4 text-gray-400" />
                  {fu.lead.phone.replace(/^(p|tel|phone|mobile):/i, '').trim()}
                </span>
              )}
            </div>
            {fu.notes && (
              <p className="mt-2 text-sm text-gray-700 bg-gray-50 rounded-lg p-2.5 flex items-start gap-2">
                <FileText className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                {fu.notes}
              </p>
            )}
            {fu.completed_at && (
              <p className="mt-1 text-xs text-gray-500">
                Completed: {new Date(fu.completed_at).toLocaleString()}
              </p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            {fu.status === 'pending' && (
              <button
                onClick={() => handleCompleteFollowUp(fu.id)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
              >
                <CheckCircle2 className="w-4 h-4" /> Mark Done
              </button>
            )}
            <Link
              href={`/leads/${fu.lead?.id}`}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50"
            >
              <ExternalLink className="w-4 h-4" /> View Lead
            </Link>
            <button
              onClick={() => handleDeleteFollowUp(fu.id)}
              disabled={deletingId === fu.id}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" /> {deletingId === fu.id ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <ListTodo className="w-10 h-10 text-gray-400 animate-pulse" />
            <p className="text-gray-500">Loading follow-ups...</p>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
            <ListTodo className="w-8 h-8 text-indigo-600" />
            Tasks & Follow-ups
          </h1>
          <p className="mt-1 text-gray-500">Manage and complete your scheduled follow-ups</p>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl bg-white border border-gray-200 p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Total leads</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{totalLeads}</p>
          </div>
          <div className="rounded-xl bg-white border border-gray-200 p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Total follow-ups</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{followUps.length}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm mb-6">
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: 'All', count: followUps.length },
              { key: 'overdue', label: 'Overdue', count: overdueFollowUps.length },
              { key: 'upcoming', label: 'Upcoming', count: upcomingFollowUps.length },
              { key: 'pending', label: 'Pending', count: pendingFollowUps.length },
            ].map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setFilter(key as typeof filter)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === key
                    ? key === 'overdue'
                      ? 'bg-red-600 text-white'
                      : key === 'upcoming'
                      ? 'bg-amber-500 text-white'
                      : key === 'pending'
                      ? 'bg-blue-600 text-white'
                      : 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {label} ({count})
              </button>
            ))}
          </div>
          {isAdmin && assignedUsersForFilter.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2 flex-wrap">
              <User className="w-4 h-4 text-gray-400" />
              <label className="text-sm font-medium text-gray-700">Assigned to:</label>
              <select
                value={assignedUserFilter}
                onChange={(e) => setAssignedUserFilter(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">All users</option>
                {assignedUsersForFilter.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Selection toolbar */}
        {displayedFollowUps.length > 0 && (
          <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={allVisibleSelected ? clearSelection : selectAll}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              {allVisibleSelected ? 'Clear selection' : 'Select all'}
            </button>
            {selectedCount > 0 && (
              <>
                <span className="text-sm text-gray-500">{selectedCount} selected</span>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  disabled={deletingSelected}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" /> {deletingSelected ? 'Deleting...' : `Delete selected (${selectedCount})`}
                </button>
              </>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={handleDeleteAllFollowUps}
                disabled={deletingAll}
                className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
              >
                {deletingAll ? 'Deleting...' : 'Delete all'}
              </button>
            </div>
          </div>
        )}

        {/* List */}
        <div className="space-y-4">
          {followUps.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
              <ListTodo className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No follow-ups found</p>
              <p className="text-sm text-gray-400 mt-1">Create follow-ups from lead pages or schedule them after calls.</p>
            </div>
          ) : displayedFollowUps.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white py-12 text-center">
              <p className="text-gray-500 font-medium">No follow-ups in this category</p>
              <p className="text-sm text-gray-400 mt-1">Switch to &quot;All&quot; or another filter.</p>
            </div>
          ) : isAdmin && followUpsByUser && !assignedUserFilter ? (
            <div className="space-y-6">
              {(() => {
                const byUser = followUpsByUser.map(([key, { user, items }]) => ({
                  key,
                  user,
                  items: filter === 'all' ? items : items.filter((fu) => displayedFollowUps.some((d) => d.id === fu.id)),
                })).filter((g) => g.items.length > 0)
                return byUser.map(({ key, user, items }) => (
                  <div key={key}>
                    <div className="flex items-center gap-2 mb-3">
                      <User className="w-5 h-5 text-gray-400" />
                      <h2 className="text-base font-semibold text-gray-900">{user ? user.name : 'Unassigned'}</h2>
                      <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800">
                        {items.length}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {items.map((fu) => renderCard(fu, true))}
                    </div>
                  </div>
                ))
              })()}
            </div>
          ) : (
            <div className="space-y-3">
              {displayedFollowUps.map((fu) => renderCard(fu, true))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
