'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import Link from 'next/link'

interface Lead {
  id: string
  lead_id: string
  name: string
  phone: string
  email: string | null
  source: string
  status: string
  interest_level: 'hot' | 'warm' | 'cold' | null
  assigned_user: {
    id: string
    name: string
    email: string
    profile_picture?: string
  } | null
  created_at: string
  first_contact_at: string | null
  updated_at: string
}

export default function LeadDetailPage() {
  const router = useRouter()
  const params = useParams()
  const leadId = params.id as string
  const [lead, setLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAuth()
    fetchLead()
  }, [leadId])

  async function checkAuth() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
    }
  }

  async function fetchLead() {
    try {
      const response = await fetch(`/api/leads/${leadId}`)
      if (response.ok) {
        const data = await response.json()
        setLead(data.lead)
      } else {
        router.push('/leads')
      }
    } catch (error) {
      console.error('Failed to fetch lead:', error)
      router.push('/leads')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-lg">Loading...</div>
        </div>
      </Layout>
    )
  }

  if (!lead) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-lg">Lead not found</div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="min-h-screen bg-white p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <Link href="/leads" className="text-gray-500 hover:text-gray-700">
              ← Back to Leads
            </Link>
          </div>
          
          <div className="bg-white rounded-[8px] border border-gray-200 p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">{lead.name}</h1>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Lead Information</h2>
                <dl className="space-y-3">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Lead ID</dt>
                    <dd className="mt-1 text-sm text-gray-900">{lead.lead_id}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Name</dt>
                    <dd className="mt-1 text-sm text-gray-900">{lead.name}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Phone</dt>
                    <dd className="mt-1 text-sm text-gray-900">{lead.phone}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Email</dt>
                    <dd className="mt-1 text-sm text-gray-900">{lead.email || 'N/A'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Source</dt>
                    <dd className="mt-1 text-sm text-gray-900 capitalize">{lead.source}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Status</dt>
                    <dd className="mt-1 text-sm text-gray-900 capitalize">{lead.status.replace('_', ' ')}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Interest Level</dt>
                    <dd className="mt-1 text-sm text-gray-900 capitalize">{lead.interest_level || 'N/A'}</dd>
                  </div>
                </dl>
              </div>
              
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Assignment</h2>
                {lead.assigned_user ? (
                  <div className="space-y-3">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Assigned To</dt>
                      <dd className="mt-1 text-sm text-gray-900">{lead.assigned_user.name}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Email</dt>
                      <dd className="mt-1 text-sm text-gray-900">{lead.assigned_user.email}</dd>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Unassigned</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
