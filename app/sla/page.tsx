'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Layout from '@/components/Layout'
import { AlertTriangle, Clock, CheckCircle, XCircle, Settings, Filter } from 'lucide-react'
import Link from 'next/link'

interface SLAViolation {
  id: string
  violation_type: string
  expected_time: string
  violation_duration_minutes: number
  escalation_level: number
  created_at: string
  lead: {
    id: string
    lead_id: string
    name: string
    phone: string
    status: string
    assigned_to?: string
  }
  sla_rule: {
    id: string
    name: string
    description: string
  }
}

interface SLARule {
  id: string
  name: string
  description: string
  lead_source: string
  interest_level: string
  priority: number
  first_contact_minutes: number
  qualification_hours?: number
  is_active: boolean
}

export default function SLAPage() {
  const router = useRouter()
  const { user, isLoading: authLoading, isAuthenticated } = useAuth()
  const [violations, setViolations] = useState<SLAViolation[]>([])
  const [rules, setRules] = useState<SLARule[]>([])
  const [activeTab, setActiveTab] = useState<'violations' | 'rules'>('violations')
  const [loading, setLoading] = useState(true)

  const userRole = user?.role || null
  const isAdmin = userRole === 'admin' || userRole === 'super_admin'

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
      return
    }

    // Check role permissions - only admin and super_admin can access SLA
    if (!authLoading && user && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAuthenticated, user, userRole, isAdmin, router])

  useEffect(() => {
    if (isAdmin) {
      fetchViolations()
      fetchRules()
    }
  }, [isAdmin])

  if (!authLoading && !isAuthenticated) {
    return null
  }

  if (!authLoading && user && !isAdmin) {
    return null
  }

  async function fetchViolations() {
    try {
      const response = await fetch('/api/sla/violations')
      if (response.ok) {
        const data = await response.json()
        setViolations(data.violations || [])
      }
    } catch (error) {
      console.error('Failed to fetch violations:', error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchRules() {
    try {
      const response = await fetch('/api/sla/rules')
      if (response.ok) {
        const data = await response.json()
        setRules(data.rules || [])
      }
    } catch (error) {
      console.error('Failed to fetch rules:', error)
    }
  }

  async function resolveViolation(violationId: string) {
    try {
      const response = await fetch('/api/sla/violations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ violationId }),
      })
      if (response.ok) {
        fetchViolations()
        alert('Violation resolved successfully')
      }
    } catch (error) {
      alert('Failed to resolve violation')
    }
  }

  function getEscalationLabel(level: number) {
    switch (level) {
      case 0:
        return 'No Escalation'
      case 1:
        return 'Rep Alerted'
      case 2:
        return 'Supervisor Notified'
      case 3:
        return 'Auto-Reassigned'
      default:
        return 'Unknown'
    }
  }

  function getViolationColor(type: string) {
    switch (type) {
      case 'first_contact':
        return 'bg-red-100 text-red-800'
      case 'qualification':
        return 'bg-orange-100 text-orange-800'
      default:
        return 'bg-yellow-100 text-yellow-800'
    }
  }

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">SLA Management</h1>
          <div className="flex gap-2">
            <button
              onClick={() => fetchViolations()}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Refresh
            </button>
            <button
              onClick={async () => {
                await fetch('/api/sla/check', { method: 'POST' })
                fetchViolations()
              }}
              className="px-4 py-2 bg-[#ed1b24] text-white rounded-lg hover:bg-[#d11820] transition-colors"
            >
              Check SLA
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('violations')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'violations'
                ? 'text-[#ed1b24] border-b-2 border-[#ed1b24]'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Violations ({violations.length})
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'rules'
                ? 'text-[#ed1b24] border-b-2 border-[#ed1b24]'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Rules ({rules.length})
          </button>
        </div>

        {/* Violations Tab */}
        {activeTab === 'violations' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            {violations.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                <p>No SLA violations found</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {violations.map((violation) => (
                  <div key={violation.id} className="p-6 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getViolationColor(violation.violation_type)}`}>
                            {violation.violation_type.replace('_', ' ').toUpperCase()}
                          </span>
                          <span className="text-sm text-gray-500">
                            {Math.round(violation.violation_duration_minutes)} min overdue
                          </span>
                        </div>
                        <Link
                          href={`/leads/${violation.lead.id}`}
                          className="text-lg font-semibold text-[#ed1b24] hover:underline mb-1 block"
                        >
                          {violation.lead.name} ({violation.lead.lead_id})
                        </Link>
                        <p className="text-sm text-gray-600 mb-2">
                          Rule: {violation.sla_rule.name}
                        </p>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span>Expected: {new Date(violation.expected_time).toLocaleString()}</span>
                          <span>Escalation: {getEscalationLabel(violation.escalation_level)}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => resolveViolation(violation.id)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        Resolve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Rules Tab */}
        {activeTab === 'rules' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="divide-y divide-gray-200">
              {rules.map((rule) => (
                <div key={rule.id} className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{rule.name}</h3>
                      {rule.description && (
                        <p className="text-sm text-gray-600 mt-1">{rule.description}</p>
                      )}
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      rule.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {rule.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-gray-500">Source</div>
                      <div className="font-medium">{rule.lead_source}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Interest Level</div>
                      <div className="font-medium">{rule.interest_level || 'All'}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">First Contact</div>
                      <div className="font-medium">{rule.first_contact_minutes} min</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Priority</div>
                      <div className="font-medium">{rule.priority}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
