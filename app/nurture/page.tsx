'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Layout from '@/components/Layout'
import { Plus, Play, Pause, Settings, Mail, Clock } from 'lucide-react'
import Link from 'next/link'

interface Campaign {
  id: string
  name: string
  description: string
  campaign_type: string
  is_active: boolean
  steps?: Array<{
    step_order: number
    step_type: string
    delay_hours: number
  }>
}

export default function NurturePage() {
  const router = useRouter()
  const { user, isLoading: authLoading, isAuthenticated } = useAuth()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)

  const userRole = user?.role || null
  const userPermissions = user?.permissions || []
  const isAllowedRole = userRole === 'super_admin' || userRole === 'admin' || userRole === 'marketing'
  const hasReadPermission = userPermissions.includes('nurture.read')
  const hasManagePermission = userPermissions.includes('nurture.manage')

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
      return
    }

    // Check permissions
    if (!authLoading && user) {
      if (!isAllowedRole && !hasReadPermission && !hasManagePermission) {
        router.push('/dashboard')
      }
    }
  }, [authLoading, isAuthenticated, user, userRole, userPermissions, isAllowedRole, hasReadPermission, hasManagePermission, router])

  useEffect(() => {
    if (isAllowedRole || hasReadPermission || hasManagePermission) {
      fetchCampaigns()
    }
  }, [isAllowedRole, hasReadPermission, hasManagePermission])

  if (!authLoading && !isAuthenticated) {
    return null
  }

  if (!authLoading && user && !isAllowedRole && !hasReadPermission && !hasManagePermission) {
    return null
  }

  async function fetchCampaigns() {
    try {
      const response = await fetch('/api/nurture/campaigns')
      if (response.ok) {
        const data = await response.json()
        setCampaigns(data.campaigns || [])
      }
    } catch (error) {
      console.error('Failed to fetch campaigns:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Nurture Campaigns</h1>
          <button className="px-4 py-2 bg-[#ed1b24] text-white rounded-lg hover:bg-[#d11820] transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" />
            New Campaign
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading campaigns...</div>
        ) : campaigns.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <Mail className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No campaigns yet</h3>
            <p className="text-gray-600 mb-4">Create your first nurture campaign to automate lead engagement</p>
            <button className="px-4 py-2 bg-[#ed1b24] text-white rounded-lg hover:bg-[#d11820] transition-colors">
              Create Campaign
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {campaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">{campaign.name}</h3>
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                      {campaign.campaign_type}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      campaign.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {campaign.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {campaign.description && (
                  <p className="text-sm text-gray-600 mb-4">{campaign.description}</p>
                )}
                {campaign.steps && campaign.steps.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                      <Clock className="w-4 h-4" />
                      <span>{campaign.steps.length} steps</span>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <button className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm">
                    View Details
                  </button>
                  <button className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
