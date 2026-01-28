'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useLeads } from '@/hooks/useLeads'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { LEAD_STATUS } from '@/shared/constants/lead-status'
import { Bell, Search, MoreVertical, Plus, Download, Settings, List, Columns, Grid, ChevronDown, Phone, Mail, TrendingUp, TrendingDown, DollarSign, Calendar, Building2, MapPin, Snowflake } from 'lucide-react'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { LEAD_STATUS, LEAD_STATUS_LABELS } from '@/shared/constants/lead-status'

// New lead modal is quite heavy; load it only when the user actually opens it
// so the main Leads list and filters become interactive faster.
const NewLeadForm = dynamic(() => import('@/components/NewLeadForm'), {
  ssr: false,
})

// Source Icon Component with fallback
function SourceIcon({ platform, source }: { platform?: string | null; source: string }) {
  const [imgError, setImgError] = useState(false)
  
  const getIconPath = (): string | null => {
    if (platform) {
      const platformLower = String(platform).toLowerCase().trim()
      if (platformLower === 'ig' || platformLower === 'instagram') {
        return '/source-icons/ig.png'
      } else if (platformLower === 'fb' || platformLower === 'facebook') {
        return '/source-icons/fb.png'
      }
    }
    
    const sourceLower = source.toLowerCase()
    if (sourceLower.includes('facebook') || sourceLower === 'meta') {
      return '/source-icons/fb.png'
    } else if (sourceLower.includes('whatsapp')) {
      return '/source-icons/wa.png'
    } else if (sourceLower.includes('instagram')) {
      return '/source-icons/ig.png'
    }
    
    // Return null instead of default.png to avoid 404 errors
    return null
  }

  const iconPath = getIconPath()

  // If no icon path found or image error, show emoji fallback
  if (!iconPath || imgError) {
    return <span className="text-3xl">📱</span>
  }

  return (
    <Image
      src={iconPath}
      alt={platform || source}
      width={32}
      height={32}
      className="w-8 h-8 object-contain"
      style={{ width: 'auto', height: 'auto' }}
      onError={() => setImgError(true)}
    />
  )
}

// User Avatar Component with fallback
function UserAvatar({ profileImageUrl, name }: { profileImageUrl: string | null; name: string }) {
  const [imgError, setImgError] = useState(false)

  if (!profileImageUrl || imgError) {
    return (
      <div className="w-10 h-10 rounded-full bg-[#ed1b24] flex items-center justify-center text-white text-sm font-medium">
        {name.charAt(0).toUpperCase()}
      </div>
    )
  }

  return (
    <Image
      src={profileImageUrl}
      alt={name}
      width={40}
      height={40}
      className="w-10 h-10 rounded-full object-cover"
      onError={() => setImgError(true)}
    />
  )
}

interface Lead {
  id: string
  lead_id: string
  name: string
  phone: string
  email: string | null
  source: string
  status: string
  interest_level: string | null
  requirement: string | null
  meta_data: Record<string, any> | null
  assigned_user: {
    id: string
    name: string
    email: string
    profile_image_url: string | null
  } | null
  created_at: string
  updated_at: string
  first_contact_at: string | null
}

interface TeleCaller {
  id: string
  name: string
  email: string
}

interface LeadStats {
  untouched: number
  hotLeads: number
  conversions: number
  convertedCount?: number // Number of leads converted to customers
  totalLeadsCount?: number // Total number of leads (including converted)
}

// Grid View Component
function GridView({
  leads,
  getVehicleName,
  getTimeAgo,
  getLastContactedTime,
  formatStageName,
  getStageBadgeColor,
  router
}: {
  leads: Lead[]
  getVehicleName: (lead: Lead) => string
  getTimeAgo: (date: string | null) => string
  getLastContactedTime: (lead: Lead) => string | null
  formatStageName: (status: string) => string
  getStageBadgeColor: (status: string) => string
  router: ReturnType<typeof useRouter>
}) {
  // Get budget/amount from meta_data
  function getBudget(lead: Lead): string {
    if (lead.meta_data?.payment_amount) {
      return `$${Number(lead.meta_data.payment_amount).toLocaleString()}`
    }
    if (lead.meta_data?.budget_range) {
      return String(lead.meta_data.budget_range)
    }
    return '-'
  }

  // Get company from meta_data
  function getCompany(lead: Lead): string | null {
    return lead.meta_data?.company || lead.meta_data?.Company || null
  }

  // Get location from meta_data
  function getLocation(lead: Lead): string | null {
    if (lead.meta_data?.city && lead.meta_data?.country) {
      return `${lead.meta_data.city}, ${lead.meta_data.country}`
    }
    if (lead.meta_data?.location) {
      return String(lead.meta_data.location)
    }
    return null
  }

  // Get stage badge color based on status
  function getStageBadgeClass(status: string): string {
    const statusLower = status.toLowerCase()
    if (statusLower.includes('negotiation')) {
      return 'bg-[#FFE8D7] text-[#FF513A]'
    } else if (statusLower.includes('review') || statusLower.includes('viewed')) {
      return 'bg-[#FFF4E6] text-[#FF9500]'
    } else if (statusLower === 'new' || statusLower.includes('qualified')) {
      return 'bg-[#E3F2FD] text-[#2196F3]'
    } else if (statusLower.includes('accepted') || statusLower.includes('converted') || statusLower.includes('won')) {
      return 'bg-[#E8F5E9] text-[#4CAF50]'
    } else if (statusLower.includes('closed') || statusLower.includes('paid')) {
      return 'bg-[#E0E0E0] text-[#616161]'
    } else if (statusLower.includes('lost') || statusLower.includes('rejected') || statusLower.includes('unqualified')) {
      return 'bg-[#FFEBEE] text-[#F44336]'
    }
    return 'bg-[#E3F2FD] text-[#2196F3]'
  }

  // Get priority badge
  function getPriorityBadge(lead: Lead) {
    const isHot = lead.interest_level === 'hot'
    const isWarm = lead.interest_level === 'warm'
    
    if (isHot) {
      return <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#FFEBEE] text-[#F44336]">High</span>
    } else if (isWarm) {
      return <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#FFF4E6] text-[#FF9500]">Medium</span>
    } else {
      return <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#E0E0E0] text-[#757575]">Low</span>
    }
  }

  // Format last contact date
  function formatLastContact(lead: Lead): string {
    const lastContact = getLastContactedTime(lead)
    if (!lastContact) return 'Never'
    return getTimeAgo(lastContact)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
      {leads.map((lead) => {
        const vehicleName = getVehicleName(lead)
        const isHot = lead.interest_level === 'hot'
        const budget = getBudget(lead)
        const company = getCompany(lead)
        const location = getLocation(lead)
        const lastContact = formatLastContact(lead)
        
        return (
          <div
            key={lead.id}
            onClick={() => router.push(`/leads/${lead.id}`)}
            className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer border border-[#eaecee] overflow-hidden"
          >
            {/* CARD HEADER */}
            <div className="px-4 py-3 bg-gradient-to-r from-[#fafafa] to-white border-b border-[#eaecee]">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0 pr-2">
                  <h3 
                    className="text-sm font-bold text-[#242d35] truncate hover:text-[#de0510] transition-colors cursor-pointer"
                    style={{ fontSize: '14px' }}
                  >
                    {lead.name}
                  </h3>
                  {vehicleName && (
                    <p 
                      className="text-[11px] font-medium text-[#717d8a] truncate mt-0.5"
                      style={{ fontSize: '11px' }}
                    >
                      {vehicleName}
                    </p>
                  )}
                </div>
                {/* Status Icon */}
                <div className={`p-1.5 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isHot ? 'bg-[#FF513A] animate-pulse' : 'bg-[#64B5F6]'
                }`}>
                  {isHot ? (
                    <TrendingUp className="w-3.5 h-3.5 text-white" />
                  ) : (
                    <Snowflake className="w-3.5 h-3.5 text-white" />
                  )}
                </div>
              </div>
              
              {/* Stage & Priority Badges */}
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded-full text-[10px] ${getStageBadgeClass(lead.status)}`}>
                  {formatStageName(lead.status)}
                </span>
                {getPriorityBadge(lead)}
                {(lead as any).lead_score !== null && (lead as any).lead_score !== undefined && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    (lead as any).lead_score >= 80 ? 'bg-green-100 text-green-800' :
                    (lead as any).lead_score >= 60 ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    Score: {(lead as any).lead_score.toFixed(0)}
                  </span>
                )}
                {(lead as any).has_active_sla_violation && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-red-100 text-red-800 font-semibold">
                    ⚠️ SLA
                  </span>
                )}
              </div>
            </div>

            {/* CARD BODY - 2 Column Grid */}
            <div className="px-4 py-3 grid grid-cols-2 gap-x-3 gap-y-2">
              {/* Value (top-left) */}
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-[#E8F5E9] flex items-center justify-center flex-shrink-0">
                  <DollarSign className="w-3 h-3 text-[#4CAF50]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] text-[#717d8a] uppercase tracking-wide">VALUE</p>
                  <p className="text-[11px] font-bold text-[#242d35] truncate">{budget}</p>
                </div>
              </div>

              {/* Last Contact (top-right) */}
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-[#E3F2FD] flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-3 h-3 text-[#2196F3]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] text-[#717d8a] uppercase tracking-wide">CONTACT</p>
                  <p className="text-[11px] font-medium text-[#242d35] truncate">{lastContact}</p>
                </div>
              </div>

              {/* Phone (middle-left) */}
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-[#FFF4E6] flex items-center justify-center flex-shrink-0">
                  <Phone className="w-3 h-3 text-[#FF9500]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] text-[#717d8a] uppercase tracking-wide">PHONE</p>
                  <p className="text-[11px] font-medium text-[#242d35] truncate break-all">{lead.phone || '-'}</p>
                </div>
              </div>

              {/* Company (middle-right) */}
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-[#F3E5F5] flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-3 h-3 text-[#9C27B0]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] text-[#717d8a] uppercase tracking-wide">COMPANY</p>
                  <p className="text-[11px] font-medium text-[#242d35] truncate">{company || '-'}</p>
                </div>
              </div>

              {/* Location (spans 2 columns) */}
              {location && (
                <div className="flex items-center gap-2 col-span-2">
                  <div className="w-6 h-6 rounded-full bg-[#E0E0E0] flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-3 h-3 text-[#616161]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] text-[#717d8a] uppercase tracking-wide">LOCATION</p>
                    <p className="text-[11px] font-medium text-[#242d35] truncate">{location}</p>
                  </div>
                </div>
              )}
            </div>

            {/* CARD FOOTER */}
            <div className="px-4 py-3 bg-[#fafafa] border-t border-[#eaecee]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {lead.assigned_user ? (
                    <>
                      <div className="flex-shrink-0">
                        {lead.assigned_user.profile_image_url ? (
                          <Image
                            src={lead.assigned_user.profile_image_url}
                            alt={lead.assigned_user.name}
                            width={32}
                            height={32}
                            className="w-8 h-8 rounded-full object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement
                              target.style.display = 'none'
                              const parent = target.parentElement
                              if (parent && !parent.querySelector('.avatar-fallback') && lead.assigned_user) {
                                const fallback = document.createElement('div')
                                fallback.className = 'avatar-fallback w-8 h-8 rounded-full bg-[#de0510] flex items-center justify-center text-white text-xs font-medium'
                                fallback.textContent = lead.assigned_user?.name?.charAt(0).toUpperCase() || '?'
                                parent.appendChild(fallback)
                              }
                            }}
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-[#de0510] flex items-center justify-center text-white text-xs font-medium">
                            {lead.assigned_user.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-medium text-[#242d35] truncate">{lead.assigned_user.name}</p>
                        <p className="text-[9px] text-[#717d8a]">Sales Executive</p>
                      </div>
                    </>
                  ) : (
                    <p className="text-[11px] text-[#717d8a]">Unassigned</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <div className="w-8 h-8 flex items-center justify-center">
                    <SourceIcon 
                      platform={lead.meta_data?.platform || lead.meta_data?.Platform} 
                      source={lead.source} 
                    />
                  </div>
                  {(lead.meta_data?.platform || lead.meta_data?.Platform) && (
                    <span className="text-[10px] text-[#717d8a] font-medium capitalize">
                      {String(lead.meta_data?.platform || lead.meta_data?.Platform).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Kanban Board Component
function KanbanBoard({ 
  leads, 
  allLeads,
  groupBy, 
  onLeadMove,
  getVehicleName,
  getProductInterest,
  getTimeAgo,
  router
}: {
  leads: Lead[]
  allLeads: Lead[]
  groupBy: string
  onLeadMove: (leadId: string, newStatus: string) => Promise<void>
  getVehicleName: (lead: Lead) => string
  getProductInterest: (lead: Lead) => string
  getTimeAgo: (date: string | null) => string
  router: ReturnType<typeof useRouter>
}) {
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null)
  const [draggedOverColumn, setDraggedOverColumn] = useState<string | null>(null)

  // Get all possible group values based on groupBy
  function getAllPossibleGroups(): string[] {
    if (groupBy === 'status') {
      // All possible status values (using formatStageName for consistency)
      const allStatuses = [
        'new', 'contacted', 'qualified', 'unqualified', 'quotation_shared', 'quotation_viewed',
        'quotation_accepted', 'quotation_expired', 'interested', 'negotiation',
        'lost', 'discarded', 'converted', 'deal_won', 'payment_pending', 'advance_received', 'fully_paid'
      ]
      // Use formatStageName to get display names, then remove duplicates
      const formattedStatuses = allStatuses.map(status => formatStageName(status))
      return Array.from(new Set(formattedStatuses)) // Remove duplicates
    } else if (groupBy === 'interest_level') {
      return ['Hot', 'Warm', 'Cold', 'Unassigned']
    } else if (groupBy === 'assigned_to') {
      // Get all unique assigned users from allLeads
      const assignedUsers = new Set<string>()
      allLeads.forEach(lead => {
        if (lead.assigned_user?.name) {
          assignedUsers.add(lead.assigned_user.name)
        }
      })
      return ['Unassigned', ...Array.from(assignedUsers).sort()]
    } else if (groupBy === 'source') {
      // Get all unique platforms from allLeads
      const platforms = new Set<string>()
      allLeads.forEach(lead => {
        const platform = lead.meta_data?.platform || lead.meta_data?.Platform
        if (platform) {
          platforms.add(String(platform).toUpperCase())
        }
      })
      return ['Unassigned', ...Array.from(platforms).sort()]
    }
    return []
  }

  // Group leads by the selected field
  function groupLeads() {
    const groups: Record<string, Lead[]> = {}
    const allPossibleGroups = getAllPossibleGroups()
    
    // Initialize all possible groups with empty arrays
    allPossibleGroups.forEach(groupKey => {
      groups[groupKey] = []
    })
    
    // Add leads to their respective groups
    leads.forEach(lead => {
      let groupKey = ''
      
      if (groupBy === 'status') {
        groupKey = formatStageName(lead.status)
      } else if (groupBy === 'interest_level') {
        groupKey = lead.interest_level ? (lead.interest_level === 'hot' ? 'Hot' : lead.interest_level === 'warm' ? 'Warm' : 'Cold') : 'Unassigned'
      } else if (groupBy === 'assigned_to') {
        groupKey = lead.assigned_user?.name || 'Unassigned'
      } else if (groupBy === 'source') {
        // Group by platform (from meta_data.platform) instead of source field
        const platform = lead.meta_data?.platform || lead.meta_data?.Platform
        groupKey = platform ? String(platform).toUpperCase() : 'Unassigned'
      } else {
        const value = getColumnValue(lead, groupBy)
        groupKey = value ? String(value) : 'Unassigned'
      }
      
      // Only add to group if it exists in allPossibleGroups, otherwise add to Unassigned
      if (!groups[groupKey]) {
        if (!groups['Unassigned']) {
          groups['Unassigned'] = []
        }
        groups['Unassigned'].push(lead)
      } else {
        groups[groupKey].push(lead)
      }
    })
    
    return groups
  }

  function getColumnValue(lead: Lead, column: string): any {
    switch (column) {
      case 'name': return lead.name
      case 'interest': return getProductInterest(lead)
      case 'phone': return lead.phone
      case 'email': return lead.email
      case 'source': return lead.source
      case 'platform': return lead.meta_data?.platform || lead.meta_data?.Platform || null
      case 'status': return lead.status
      case 'interest_level': return lead.interest_level
      case 'requirement': return lead.requirement || getProductInterest(lead)
      case 'assigned_to': return lead.assigned_user?.name || 'Unassigned'
      default: return null
    }
  }

  function formatStageName(status: string): string {
    // Use LEAD_STATUS_LABELS if available, otherwise format manually
    if (LEAD_STATUS_LABELS[status as keyof typeof LEAD_STATUS_LABELS]) {
      return LEAD_STATUS_LABELS[status as keyof typeof LEAD_STATUS_LABELS]
    }
    const statusLower = status.toLowerCase()
    if (statusLower.includes('negotiation')) return 'Negotiation'
    if (statusLower.includes('review') || statusLower.includes('qualified')) return 'In review'
    if (statusLower === 'new') return 'New'
    if (statusLower === 'contacted') return 'Contacted'
    if (statusLower === 'discarded') return 'Discarded'
    if (statusLower.includes('approved') || statusLower.includes('converted') || statusLower.includes('deal_won')) return 'Approved'
    if (statusLower === 'lost') return 'Lost'
    if (statusLower === 'closed') return 'Closed'
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  // Get status value for a group key (when grouping by status)
  function getStatusForGroup(groupKey: string): string {
    if (groupBy !== 'status') return ''
    
    // Map display names back to status values
    const statusMap: Record<string, string> = {
      'New': 'new',
      'In review': 'qualified',
      'Negotiation': 'negotiation',
      'Approved': 'converted',
      'Lost': 'lost',
      'Closed': 'closed',
      'Qualified': 'qualified',
      'Unqualified': 'unqualified',
      'Quotation Shared': 'quotation_shared',
      'Quotation Viewed': 'quotation_viewed',
      'Quotation Accepted': 'quotation_accepted',
      'Quotation Expired': 'quotation_expired',
      'Interested': 'interested',
      'Converted': 'converted',
      'Deal Won': 'deal_won',
      'Payment Pending': 'payment_pending',
      'Advance Received': 'advance_received',
      'Fully Paid': 'fully_paid',
    }
    
    return statusMap[groupKey] || groupKey.toLowerCase().replace(/\s+/g, '_')
  }

  function handleDragStart(e: React.DragEvent, lead: Lead) {
    setDraggedLead(lead)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, groupKey: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDraggedOverColumn(groupKey)
  }

  function handleDrop(e: React.DragEvent, groupKey: string) {
    e.preventDefault()
    if (!draggedLead) return

    if (groupBy === 'status') {
      const newStatus = getStatusForGroup(groupKey)
      if (newStatus && newStatus !== draggedLead.status) {
        onLeadMove(draggedLead.id, newStatus)
      }
    } else if (groupBy === 'interest_level') {
      // Map group key to interest_level value
      const interestLevelMap: Record<string, string> = {
        'Hot': 'hot',
        'Warm': 'warm',
        'Cold': 'cold',
        'Unassigned': '',
      }
      const newInterestLevel = interestLevelMap[groupKey]
      if (newInterestLevel !== undefined && newInterestLevel !== draggedLead.interest_level) {
        // Update lead's interest_level
        fetch(`/api/leads/${draggedLead.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            interest_level: newInterestLevel || null,
          }),
        }).then(() => {
          window.location.reload() // Refresh to show updated grouping
        })
      }
    } else if (groupBy === 'assigned_to') {
      // Find user ID by name
      const targetUser = allLeads.find(lead => lead.assigned_user?.name === groupKey)?.assigned_user
      if (targetUser && targetUser.id !== draggedLead.assigned_user?.id) {
        fetch(`/api/leads/${draggedLead.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assigned_to: groupKey === 'Unassigned' ? null : targetUser.id,
          }),
        }).then(() => {
          window.location.reload() // Refresh to show updated grouping
        })
      }
    }
    
    setDraggedLead(null)
    setDraggedOverColumn(null)
  }

  function handleDragEnd() {
    setDraggedLead(null)
    setDraggedOverColumn(null)
  }

  // Get priority badge (High/Medium based on interest_level)
  function getPriorityBadge(lead: Lead) {
    const isHot = lead.interest_level === 'hot'
    return (
      <span className={`px-2 py-0.5 text-xs font-semibold rounded ${
        isHot ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
      }`}>
        {isHot ? 'High' : 'Medium'}
      </span>
    )
  }

  // Get budget/amount from meta_data
  function getBudget(lead: Lead): string {
    if (lead.meta_data?.budget_range) {
      return String(lead.meta_data.budget_range)
    }
    if (lead.meta_data?.payment_amount) {
      return `$${Number(lead.meta_data.payment_amount).toLocaleString()}`
    }
    return ''
  }

  const groupedLeads = groupLeads()
  // Get all possible groups and ensure they're all shown
  const allPossibleGroups = getAllPossibleGroups()
  const groupKeys = allPossibleGroups.length > 0 
    ? allPossibleGroups
    : Object.keys(groupedLeads).sort()

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-4 min-w-max">
        {groupKeys.map((groupKey) => {
          const groupLeadsList = groupedLeads[groupKey]
          const isDraggedOver = draggedOverColumn === groupKey
          
          return (
            <div
              key={groupKey}
              className={`flex-shrink-0 w-80 bg-gray-50 rounded-lg p-4 ${
                isDraggedOver ? 'bg-blue-50 border-2 border-blue-300' : ''
              }`}
              onDragOver={(e) => handleDragOver(e, groupKey)}
              onDrop={(e) => handleDrop(e, groupKey)}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-gray-900">{groupKey}</h3>
                <span className="text-sm text-gray-500 bg-white px-2 py-1 rounded-full">
                  {groupLeadsList?.length || 0}
                </span>
              </div>
              
              <div className="space-y-3 min-h-[100px]">
                {!groupLeadsList || groupLeadsList.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    No leads in this group
                    <br />
                    <span className="text-xs">Drag a card here to add</span>
                  </div>
                ) : (
                  groupLeadsList.map((lead) => {
                  const vehicleName = getVehicleName(lead)
                  const isHot = lead.interest_level === 'hot'
                  const budget = getBudget(lead)
                  
                  return (
                    <div
                      key={lead.id}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, lead)}
                      onDragEnd={handleDragEnd}
                      onClick={() => router.push(`/leads/${lead.id}`)}
                      className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-gray-200"
                    >
                      <div className="mb-3 relative">
                        <div className="flex-1 min-w-0 pr-12">
                          <h4 className="text-base font-bold text-gray-900 truncate">{lead.name}</h4>
                          {vehicleName && (
                            <p className="text-sm text-gray-600 truncate">{vehicleName}</p>
                          )}
                        </div>
                        {/* Source logo in top right corner */}
                        <div className="absolute top-0 right-0 flex items-center gap-1">
                          <SourceIcon 
                            platform={lead.meta_data?.platform || lead.meta_data?.Platform} 
                            source={lead.source} 
                          />
                          {(lead.meta_data?.platform || lead.meta_data?.Platform) && (
                            <span className="text-xs text-gray-900 font-medium capitalize">
                              {String(lead.meta_data?.platform || lead.meta_data?.Platform).toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {budget && (
                        <div className="mb-2">
                          <span className="text-base font-semibold text-gray-900">{budget}</span>
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-500">
                          Last contact: {getTimeAgo(lead.first_contact_at || lead.updated_at)}
                        </span>
                      </div>
                      
                      {/* Contact Information */}
                      <div className="space-y-1 mb-2">
                        {lead.phone && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-600">
                            <Phone size={12} className="text-gray-500" />
                            <span className="break-all">{lead.phone}</span>
                          </div>
                        )}
                        {lead.email && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-600">
                            <Mail size={12} className="text-gray-500" />
                            <span className="break-all">{lead.email}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {lead.assigned_user && (
                            <div className="flex items-center gap-2">
                              <UserAvatar 
                                profileImageUrl={lead.assigned_user.profile_image_url}
                                name={lead.assigned_user.name}
                              />
                              <span className="text-xs font-medium text-gray-900">{lead.assigned_user.name}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {getPriorityBadge(lead)}
                          {(lead as any).lead_score !== null && (lead as any).lead_score !== undefined && (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              (lead as any).lead_score >= 80 ? 'bg-green-100 text-green-800' :
                              (lead as any).lead_score >= 60 ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {(lead as any).lead_score.toFixed(0)}
                            </span>
                          )}
                          {isHot ? (
                            <TrendingUp size={14} className="text-[#ed1b24]" />
                          ) : (
                            <span className="text-sm">❄️</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                }))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function LeadsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user, isLoading: authLoading, isAuthenticated } = useAuth()
  const { data: allLeadsData = [], isLoading: leadsLoading } = useLeads()
  const [leads, setLeads] = useState<Lead[]>([])
  const [allLeads, setAllLeads] = useState<Lead[]>([])
  const [discardedLeads, setDiscardedLeads] = useState<Lead[]>([])
  const [overallStats, setOverallStats] = useState<{ totalLeads: number; convertedLeads: number; conversionRate: number } | null>(null)
  const hasFetchedOverallStats = useRef(false)
  const [teleCallers, setTeleCallers] = useState<TeleCaller[]>([])
  const [stats, setStats] = useState<LeadStats>({ 
    untouched: 0, 
    hotLeads: 0, 
    conversions: 0,
    convertedCount: 0,
    totalLeadsCount: 0
  })
  
  const userRole = user?.role || null
  const isAdmin = userRole === 'admin' || userRole === 'super_admin'
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'table' | 'kanban' | 'grid'>('table')
  const [groupBy, setGroupBy] = useState<string>('status')
  const [groupByDropdownOpen, setGroupByDropdownOpen] = useState(false)
  const [newLeadModalOpen, setNewLeadModalOpen] = useState(false)
  
  // Filter and Sort state
  interface FilterCondition {
    id: string
    column: string
    operator: string
    value: string
    logic?: 'AND' | 'OR'
  }
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([])
  const [sortColumn, setSortColumn] = useState<string>('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false)
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false)
  
  // Reassign state
  const [reassigningLeadId, setReassigningLeadId] = useState<string | null>(null)
  const [selectedTeleCaller, setSelectedTeleCaller] = useState<string>('')
  const [reassignLoading, setReassignLoading] = useState(false)
  
  // Bulk reassign state
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set())
  const [bulkReassignModalOpen, setBulkReassignModalOpen] = useState(false)
  const [bulkReassignTeleCaller, setBulkReassignTeleCaller] = useState<string>('')
  const [bulkReassignLoading, setBulkReassignLoading] = useState(false)
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  // Column customization state
  interface ColumnConfig {
    key: string
    label: string
    visible: boolean
    width: number
  }

  const defaultColumns: ColumnConfig[] = [
    { key: 'name', label: 'Name/Vehicle', visible: true, width: 200 },
    { key: 'interest', label: 'Interest', visible: true, width: 180 },
    { key: 'status', label: 'Lead stage', visible: true, width: 150 },
    { key: 'interest_level', label: 'Lead Type', visible: true, width: 120 },
    { key: 'source', label: 'Source', visible: true, width: 150 },
    { key: 'assigned_to', label: 'Assigned To', visible: true, width: 180 },
    { key: 'phone', label: 'Mobile', visible: true, width: 150 },
    { key: 'metadata', label: 'Metadata', visible: true, width: 250 },
  ]

  const [columns, setColumns] = useState<ColumnConfig[]>(defaultColumns)
  const [columnsInitialized, setColumnsInitialized] = useState(false)

  // Load columns from localStorage after mount to avoid hydration mismatch
  useEffect(() => {
    if (typeof window !== 'undefined' && !columnsInitialized) {
      const saved = localStorage.getItem('leads-table-columns')
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          setColumns(parsed)
        } catch (e) {
          // Keep default columns if parse fails
        }
      }
      setColumnsInitialized(true)
    }
  }, [columnsInitialized])

  const [customizeModalOpen, setCustomizeModalOpen] = useState(false)
  const [customizeMode, setCustomizeMode] = useState<'select' | 'adjust-width' | null>(null)
  const [resizingColumn, setResizingColumn] = useState<string | null>(null)
  const [resizeStartX, setResizeStartX] = useState(0)
  const [resizeStartWidth, setResizeStartWidth] = useState(0)

  // Container customization state
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false)
  const [containerCustomizeOpen, setContainerCustomizeOpen] = useState(false)
  const defaultContainerStyles = {
    containerColor: '#000000',
    iconColor: '#ffffff',
    textColor: '#ffffff',
    opacity: 0.2,
    backgroundColor: '#ffffff', // Base color, opacity handled separately
  }
  const [containerStyles, setContainerStyles] = useState(defaultContainerStyles)
  const [containerStylesInitialized, setContainerStylesInitialized] = useState(false)

  // Load container styles from localStorage after mount to avoid hydration mismatch
  useEffect(() => {
    if (typeof window !== 'undefined' && !containerStylesInitialized) {
      const saved = localStorage.getItem('leads-container-styles')
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          setContainerStyles(parsed)
        } catch (e) {
          // Keep default styles if parse fails
        }
      }
      setContainerStylesInitialized(true)
    }
  }, [containerStylesInitialized])

  // Update allLeads when data is fetched from useLeads hook
  // This ensures the leads list stays in sync when status/interest_level changes
  // Use a ref to track the last processed data to prevent infinite loops
  const lastProcessedDataRef = useRef<string>('')
  
  useEffect(() => {
    if (allLeadsData && Array.isArray(allLeadsData)) {
      // Create a stable identifier for the data (using IDs and length)
      // Only use first few IDs to avoid performance issues with large arrays
      const ids = allLeadsData.slice(0, 10).map(l => l?.id || '').join(',')
      const dataSignature = `${allLeadsData.length}-${ids}`
      
      // Only update if data actually changed
      if (lastProcessedDataRef.current !== dataSignature) {
        lastProcessedDataRef.current = dataSignature
        setAllLeads([...allLeadsData] as Lead[]) // Create new array reference
      }
    } else if (!allLeadsData) {
      // If data is null/undefined, clear the leads
      const currentSignature = '0-'
      if (lastProcessedDataRef.current !== currentSignature) {
        setAllLeads([])
        lastProcessedDataRef.current = currentSignature
      }
    }
  }, [allLeadsData])

  // Fetch overall conversion stats for admins (only once when component mounts or isAdmin changes)
  useEffect(() => {
    if (isAdmin && !hasFetchedOverallStats.current) {
      hasFetchedOverallStats.current = true
      // Fetch overall stats only once
      fetch('/api/leads?limit=1')
        .then(res => res.json())
        .then(data => {
          if (data.overallStats) {
            setOverallStats(data.overallStats)
          }
        })
        .catch(err => {
          console.error('Failed to fetch overall stats:', err)
          hasFetchedOverallStats.current = false // Reset on error to allow retry
        })
    } else if (!isAdmin) {
      // Reset the ref when user is no longer admin
      hasFetchedOverallStats.current = false
      setOverallStats(null)
    }
  }, [isAdmin])

  // Fetch discarded leads when discarded filter is active
  useEffect(() => {
    const hasDiscardedFilter = filterConditions.some(
      c => c.column === 'status' && c.value === LEAD_STATUS.DISCARDED
    )
    
    if (hasDiscardedFilter) {
      // Fetch discarded leads from backend
      fetch(`/api/leads?status=${LEAD_STATUS.DISCARDED}`)
        .then(res => res.json())
        .then(data => {
          if (data.leads) {
            setDiscardedLeads(data.leads as Lead[])
          }
        })
        .catch(err => console.error('Failed to fetch discarded leads:', err))
    } else {
      // Clear discarded leads when filter is removed
      setDiscardedLeads([])
    }
  }, [filterConditions])

  // Save columns to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined' && columnsInitialized) {
      localStorage.setItem('leads-table-columns', JSON.stringify(columns))
    }
  }, [columns, columnsInitialized])

  // Save container styles to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined' && containerStylesInitialized) {
      localStorage.setItem('leads-container-styles', JSON.stringify(containerStyles))
    }
  }, [containerStyles, containerStylesInitialized])
  
  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.filter-dropdown') && !target.closest('.sort-dropdown') && !target.closest('.groupby-dropdown') && !target.closest('.more-options-dropdown')) {
        setFilterDropdownOpen(false)
        setSortDropdownOpen(false)
        setGroupByDropdownOpen(false)
        setMoreOptionsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [filterConditions, sortColumn, sortDirection])

  // Save column preferences to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('leads-table-columns', JSON.stringify(columns))
    }
  }, [columns])

  // LEAD JOURNEY: Calculate stats from leads with new buckets
  useEffect(() => {
    if (allLeads.length > 0) {
      // Untouched: leads with status 'new' and no first_contact_at
      const untouched = allLeads.filter(lead => 
        lead.status === LEAD_STATUS.NEW && !lead.first_contact_at
      ).length
      
      // Contacted: leads with status 'contacted' (after first call attempt)
      const contacted = allLeads.filter(lead => 
        lead.status === LEAD_STATUS.CONTACTED
      ).length
      
      // Qualified: leads with status 'qualified'
      const qualified = allLeads.filter(lead => 
        lead.status === LEAD_STATUS.QUALIFIED
      ).length
      
      // Negotiation: leads with status 'negotiation'
      const negotiation = allLeads.filter(lead => 
        lead.status === LEAD_STATUS.NEGOTIATION
      ).length
      
      // Won: leads with status 'deal_won' or 'converted'
      const won = allLeads.filter(lead => 
        lead.status === LEAD_STATUS.DEAL_WON || lead.status === LEAD_STATUS.CONVERTED
      ).length
      
      // Discarded: leads with status 'lost' or 'discarded'
      const discarded = allLeads.filter(lead => 
        lead.status === LEAD_STATUS.LOST || lead.status === LEAD_STATUS.DISCARDED
      ).length
      
      // Hot Leads: leads with interest_level 'hot' (for backward compatibility)
      const hotLeads = allLeads.filter(lead => 
        lead.interest_level === 'hot'
      ).length
      
      // Conversion Rate: Won / Total Leads
      const conversionRate = allLeads.length > 0 
        ? Math.round((won / allLeads.length) * 100) 
        : 0
      
      setStats({
        untouched,
        hotLeads,
        conversions: conversionRate
      })
      
      // Store detailed stats for potential future use
      // Note: stats interface may need to be extended to include all buckets
    }
  }, [allLeads])

  // Filter, sort and paginate leads
  useEffect(() => {
    // First, filter out any leads that have been converted to customers
    // (they should not appear in the leads list)
    // Also filter out discarded leads unless specifically filtered
    const hasDiscardedFilter = filterConditions.some(
      c => c.column === 'status' && c.value === LEAD_STATUS.DISCARDED
    )
    
    // If discarded filter is active, use discarded leads; otherwise use allLeads
    const leadsToFilter = hasDiscardedFilter ? discardedLeads : allLeads
    
    let filtered = leadsToFilter.filter(lead => {
      // Exclude leads that have a customer record (converted to customer)
      const hasCustomer = (lead as any).customer && (lead as any).customer.lead_id === lead.id
      if (hasCustomer) return false
      
      // For non-discarded filter, exclude discarded leads
      if (!hasDiscardedFilter && lead.status === LEAD_STATUS.DISCARDED) {
        return false
      }
      
      return true
    })
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(lead => 
        lead.name.toLowerCase().includes(query) ||
        lead.phone.includes(query) ||
        lead.email?.toLowerCase().includes(query) ||
        lead.requirement?.toLowerCase().includes(query) ||
        getVehicleName(lead).toLowerCase().includes(query) ||
        getProductInterest(lead).toLowerCase().includes(query)
      )
    }
    
    // Apply multiple filter conditions (only if they have values, except for is_empty/is_not_empty operators)
    const activeConditions = filterConditions.filter(condition => {
      // Allow is_empty and is_not_empty operators even without a value
      if (condition.operator === 'is_empty' || condition.operator === 'is_not_empty') {
        return true
      }
      // For other operators, require a non-empty value
      return condition.value && condition.value.trim() !== ''
    })
    
    if (activeConditions.length > 0) {
      filtered = filtered.filter(lead => {
        let result = true
        let previousResult: boolean | null = null
        
        for (let i = 0; i < activeConditions.length; i++) {
          const condition = activeConditions[i]
          const columnValue = getColumnValue(lead, condition.column)
          const conditionResult = evaluateCondition(columnValue, condition.operator, condition.value)
          
          if (i === 0) {
            result = conditionResult
            previousResult = conditionResult
          } else {
            const logic = condition.logic || 'AND'
            if (logic === 'AND') {
              result = result && conditionResult
            } else {
              result = result || conditionResult
            }
            previousResult = conditionResult
          }
        }
        
        return result
      })
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      const aValue = getColumnValue(a, sortColumn)
      const bValue = getColumnValue(b, sortColumn)
      
      // Handle null/undefined values
      if (aValue === null || aValue === undefined) return sortDirection === 'asc' ? -1 : 1
      if (bValue === null || bValue === undefined) return sortDirection === 'asc' ? 1 : -1
      
      // Handle dates
      if (sortColumn.includes('_at') || sortColumn === 'created_at' || sortColumn === 'updated_at' || sortColumn === 'first_contact_at' || sortColumn === 'converted_at') {
        const aDate = new Date(aValue as string).getTime()
        const bDate = new Date(bValue as string).getTime()
        return sortDirection === 'asc' ? aDate - bDate : bDate - aDate
      }
      
      // Handle numbers
      if (sortColumn === 'payment_amount' || sortColumn === 'advance_amount') {
        const aNum = Number(aValue) || 0
        const bNum = Number(bValue) || 0
        return sortDirection === 'asc' ? aNum - bNum : bNum - aNum
      }
      
      // Handle strings
      const aStr = String(aValue).toLowerCase()
      const bStr = String(bValue).toLowerCase()
      if (sortDirection === 'asc') {
        return aStr < bStr ? -1 : aStr > bStr ? 1 : 0
      } else {
        return aStr > bStr ? -1 : aStr < bStr ? 1 : 0
      }
    })
    
    // Pagination (only for table view)
    if (viewMode === 'table') {
      const startIndex = (currentPage - 1) * itemsPerPage
      const endIndex = startIndex + itemsPerPage
      setLeads(filtered.slice(startIndex, endIndex))
    } else {
      // For Kanban and Grid views, show all filtered leads
      setLeads(filtered)
    }
  }, [allLeads, discardedLeads, searchQuery, filterConditions, sortColumn, sortDirection, currentPage, itemsPerPage, viewMode, LEAD_STATUS.DISCARDED])
  
  // Helper function to get column value
  function getColumnValue(lead: Lead, column: string): any {
    switch (column) {
      case 'name': return lead.name
      case 'interest': return getProductInterest(lead)
      case 'phone': return lead.phone
      case 'email': return lead.email
      case 'source': return lead.source
      case 'status': return lead.status
      case 'interest_level': return lead.interest_level
      case 'requirement': return lead.requirement || getProductInterest(lead)
      case 'assigned_to': return lead.assigned_user?.name || 'Unassigned'
      case 'created_at': return lead.created_at
      case 'updated_at': return lead.updated_at
      case 'first_contact_at': return lead.first_contact_at
      case 'lead_id': return lead.lead_id
      case 'budget_range': return lead.meta_data?.budget_range || null
      case 'timeline': return lead.meta_data?.timeline || null
      case 'payment_status': return lead.meta_data?.payment_status || null
      case 'payment_amount': return lead.meta_data?.payment_amount || null
      case 'advance_amount': return lead.meta_data?.advance_amount || null
      case 'metadata': 
        // Return a searchable string of all metadata
        if (!lead.meta_data) return null
        return Object.entries(lead.meta_data)
          .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
          .join(' ')
      default: return null
    }
  }
  
  // Evaluate a filter condition
  function evaluateCondition(columnValue: any, operator: string, filterValue: string): boolean {
    if (columnValue === null || columnValue === undefined) {
      return operator === 'is_empty' || operator === 'is_null'
    }
    
    const valueStr = String(columnValue).toLowerCase()
    const filterStr = filterValue.toLowerCase()
    
    switch (operator) {
      case 'equals':
        return valueStr === filterStr
      case 'not_equals':
        return valueStr !== filterStr
      case 'contains':
        return valueStr.includes(filterStr)
      case 'not_contains':
        return !valueStr.includes(filterStr)
      case 'starts_with':
        return valueStr.startsWith(filterStr)
      case 'ends_with':
        return valueStr.endsWith(filterStr)
      case 'is_empty':
        return valueStr === '' || columnValue === null || columnValue === undefined
      case 'is_not_empty':
        return valueStr !== '' && columnValue !== null && columnValue !== undefined
      case 'greater_than':
        return Number(columnValue) > Number(filterValue)
      case 'less_than':
        return Number(columnValue) < Number(filterValue)
      case 'greater_equal':
        return Number(columnValue) >= Number(filterValue)
      case 'less_equal':
        return Number(columnValue) <= Number(filterValue)
      default:
        return true
    }
  }
  
  // Add a new filter condition
  function addFilterCondition() {
    const newCondition: FilterCondition = {
      id: Date.now().toString(),
      column: 'name',
      operator: 'contains',
      value: '',
      logic: filterConditions.length > 0 ? 'AND' : undefined
    }
    setFilterConditions([...filterConditions, newCondition])
  }
  
  // Remove a filter condition
  function removeFilterCondition(id: string) {
    setFilterConditions(filterConditions.filter(f => f.id !== id))
  }
  
  // Update a filter condition
  function updateFilterCondition(id: string, updates: Partial<FilterCondition>) {
    setFilterConditions(filterConditions.map(f => 
      f.id === id ? { ...f, ...updates } : f
    ))
  }
  
  // Get available operators for a column
  function getOperatorsForColumn(column: string): Array<{ key: string; label: string }> {
    const dateColumns = ['created_at', 'updated_at', 'first_contact_at', 'converted_at']
    const numberColumns = ['payment_amount', 'advance_amount']
    
    if (dateColumns.includes(column)) {
      return [
        { key: 'equals', label: 'Equals' },
        { key: 'not_equals', label: 'Not Equals' },
        { key: 'greater_than', label: 'After' },
        { key: 'less_than', label: 'Before' },
        { key: 'is_empty', label: 'Is Empty' },
        { key: 'is_not_empty', label: 'Is Not Empty' },
      ]
    }
    
    if (numberColumns.includes(column)) {
      return [
        { key: 'equals', label: 'Equals' },
        { key: 'not_equals', label: 'Not Equals' },
        { key: 'greater_than', label: 'Greater Than' },
        { key: 'less_than', label: 'Less Than' },
        { key: 'greater_equal', label: 'Greater or Equal' },
        { key: 'less_equal', label: 'Less or Equal' },
        { key: 'is_empty', label: 'Is Empty' },
        { key: 'is_not_empty', label: 'Is Not Empty' },
      ]
    }
    
    return [
      { key: 'equals', label: 'Equals' },
      { key: 'not_equals', label: 'Not Equals' },
      { key: 'contains', label: 'Contains' },
      { key: 'not_contains', label: 'Does Not Contain' },
      { key: 'starts_with', label: 'Starts With' },
      { key: 'ends_with', label: 'Ends With' },
      { key: 'is_empty', label: 'Is Empty' },
      { key: 'is_not_empty', label: 'Is Not Empty' },
    ]
  }

  async function fetchTeleCallers() {
    try {
      const response = await fetch('/api/users/tele-callers')
      if (response.ok) {
        const data = await response.json()
        setTeleCallers(data.teleCallers || [])
      }
    } catch (error) {
      console.error('Failed to fetch tele-callers:', error)
    }
  }

  async function fetchLeads() {
    try {
      const response = await fetch('/api/leads')
      if (response.ok) {
        const data = await response.json()
        setAllLeads(data.leads || [])
      }
    } catch (error) {
      console.error('Failed to fetch leads:', error)
    } finally {
      setLoading(false)
    }
  }

  // Get car model from lead meta_data
  function getVehicleName(lead: Lead): string {
    if (lead.meta_data) {
      const carModel = lead.meta_data['car_model'] ||
                     lead.meta_data['Car Model'] ||
                     lead.meta_data['vehicle_model'] ||
                     lead.meta_data['Vehicle Model'] ||
                     lead.meta_data['vehicle'] ||
                     lead.meta_data['Vehicle'] ||
                     null
      if (carModel) {
        return String(carModel).replace(/_/g, ' ')
      }
    }
    return ''
  }

  // Get product/service interest from lead
  function getProductInterest(lead: Lead): string {
    if (lead.requirement) {
      return lead.requirement.replace(/_/g, ' ')
    }
    if (lead.meta_data) {
      const productInterest = lead.meta_data['what_services_are_you_looking_for?'] || 
                             lead.meta_data['what_services_are_you_looking_for'] ||
                             lead.meta_data['What services are you looking for?'] ||
                             lead.meta_data['product_interest'] ||
                             lead.meta_data['service'] ||
                             null
      if (productInterest) {
        return String(productInterest).replace(/_/g, ' ')
      }
    } else if (lead.requirement) {
      return lead.requirement
    }
    return ''
  }


  // Get stage badge color
  function getStageBadgeColor(status: string) {
    const statusLower = status.toLowerCase()
    if (statusLower.includes('negotiation')) {
      return 'bg-red-100 text-red-800'
    } else if (statusLower.includes('review') || statusLower.includes('qualified')) {
      return 'bg-orange-100 text-orange-800'
    } else if (statusLower === 'contacted') {
      return 'bg-purple-100 text-purple-800'
    } else if (statusLower.includes('new')) {
      return 'bg-blue-100 text-blue-800'
    } else if (statusLower === 'discarded' || statusLower === 'lost') {
      return 'bg-gray-100 text-gray-800'
    } else if (statusLower.includes('approved') || statusLower.includes('converted') || statusLower.includes('deal_won')) {
      return 'bg-green-100 text-green-800'
    }
    return 'bg-gray-100 text-gray-800'
  }

  // Format stage name
  function formatStageName(status: string): string {
    // Use LEAD_STATUS_LABELS if available, otherwise format manually
    if (LEAD_STATUS_LABELS[status as keyof typeof LEAD_STATUS_LABELS]) {
      return LEAD_STATUS_LABELS[status as keyof typeof LEAD_STATUS_LABELS]
    }
    const statusLower = status.toLowerCase()
    if (statusLower.includes('negotiation')) return 'Negotiation'
    if (statusLower.includes('review')) return 'In review'
    if (statusLower.includes('new')) return 'New'
    if (statusLower === 'contacted') return 'Contacted'
    if (statusLower === 'discarded') return 'Discarded'
    if (statusLower.includes('approved') || statusLower.includes('converted') || statusLower.includes('deal_won')) return 'Approved'
    if (statusLower.includes('qualified')) return 'Qualified'
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  // Get last contacted time - use first_contact_at if available, otherwise updated_at
  function getLastContactedTime(lead: Lead): string | null {
    // Use first_contact_at if available, otherwise fall back to updated_at
    return lead.first_contact_at || lead.updated_at
  }

  // Format time ago
  function getTimeAgo(dateString: string | null): string {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)
    
    if (diffHours < 1) return 'Just now'
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    if (diffDays === 1) return '1 day ago'
    return `${diffDays} days ago`
  }

  // Mask contact info
  function maskContact(value: string | null, type: 'phone' | 'email'): string {
    if (!value) return '-'
    if (type === 'phone') {
      return value.length > 6 ? `${value.slice(0, 6)}...` : value
    } else {
      const [local, domain] = value.split('@')
      if (!domain) return value
      return `${local.slice(0, 4)}...@${domain}`
    }
  }

  // Handle lead selection
  const handleLeadSelect = (leadId: string) => {
    setSelectedLeadIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(leadId)) {
        newSet.delete(leadId)
      } else {
        newSet.add(leadId)
      }
      return newSet
    })
  }

  const handleSelectAll = () => {
    if (selectedLeadIds.size === leads.length && leads.every(lead => selectedLeadIds.has(lead.id))) {
      setSelectedLeadIds(new Set())
    } else {
      setSelectedLeadIds(new Set(leads.map(lead => lead.id)))
    }
  }

  // Handle bulk reassign
  async function handleBulkReassign() {
    if (selectedLeadIds.size === 0) {
      alert('Please select at least one lead to reassign')
      return
    }

    if (!bulkReassignTeleCaller || bulkReassignTeleCaller.trim() === '' || bulkReassignTeleCaller === 'undefined') {
      alert('Please select a tele-caller')
      return
    }

    setBulkReassignLoading(true)
    try {
      const response = await fetch('/api/leads/bulk-reassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_ids: Array.from(selectedLeadIds),
          assigned_to: bulkReassignTeleCaller.trim(),
        }),
      })

      const data = await response.json()

      if (response.ok) {
        queryClient.invalidateQueries({ queryKey: ['leads'] })
        setSelectedLeadIds(new Set())
        setBulkReassignModalOpen(false)
        setBulkReassignTeleCaller('')
        alert(`Successfully reassigned ${data.success} lead(s)`)
      } else {
        alert(data.error || 'Failed to bulk reassign leads')
      }
    } catch (error) {
      console.error('Failed to bulk reassign leads:', error)
      alert('Failed to bulk reassign leads')
    } finally {
      setBulkReassignLoading(false)
    }
  }

  // Handle lead move in Kanban (drag and drop)
  async function handleLeadMove(leadId: string, newStatus: string) {
    try {
      const response = await fetch(`/api/leads/${leadId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (response.ok) {
        // Invalidate and refetch to ensure all views are updated
        await queryClient.invalidateQueries({ queryKey: ['leads'] })
        await queryClient.refetchQueries({ queryKey: ['leads'] })
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to update lead status')
      }
    } catch (error) {
      console.error('Failed to move lead:', error)
      alert('Failed to move lead')
    }
  }

  async function handleReassign(leadId: string | null) {
    if (!leadId || !selectedTeleCaller || selectedTeleCaller.trim() === '' || selectedTeleCaller === 'undefined') {
      alert('Please select a tele-caller')
      return
    }

    setReassignLoading(true)
    try {
      const response = await fetch(`/api/leads/${leadId}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_to: selectedTeleCaller.trim() }),
      })

      const data = await response.json()

      if (response.ok) {
        queryClient.invalidateQueries({ queryKey: ['leads'] })
        setReassigningLeadId(null)
        setSelectedTeleCaller('')
        alert('Lead reassigned successfully')
      } else {
        alert(data.error || 'Failed to reassign lead')
      }
    } catch (error) {
      console.error('Failed to reassign lead:', error)
      alert('Failed to reassign lead')
    } finally {
      setReassignLoading(false)
    }
  }

  // Column customization handlers
  function toggleColumnVisibility(columnKey: string) {
    setColumns(prev => prev.map(col => 
      col.key === columnKey ? { ...col, visible: !col.visible } : col
    ))
  }

  function handleResizeStart(columnKey: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setResizingColumn(columnKey)
    setResizeStartX(e.clientX)
    const column = columns.find(col => col.key === columnKey)
    if (column) {
      setResizeStartWidth(column.width)
    }
  }

  useEffect(() => {
    if (!resizingColumn) return

    function handleResizeMove(e: MouseEvent) {
      const diff = e.clientX - resizeStartX
      const newWidth = Math.max(100, resizeStartWidth + diff) // Minimum width of 100px
      
      setColumns(prev => prev.map(col => 
        col.key === resizingColumn ? { ...col, width: newWidth } : col
      ))
    }

    function handleResizeEnd() {
      setResizingColumn(null)
    }

    document.addEventListener('mousemove', handleResizeMove)
    document.addEventListener('mouseup', handleResizeEnd)
    
    return () => {
      document.removeEventListener('mousemove', handleResizeMove)
      document.removeEventListener('mouseup', handleResizeEnd)
    }
  }, [resizingColumn, resizeStartX, resizeStartWidth])

  function resetColumns() {
    setColumns(defaultColumns)
  }

  const loading = authLoading || leadsLoading
  const totalPages = Math.ceil(
    (searchQuery.trim() 
      ? allLeads.filter(lead => 
          lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          lead.phone.includes(searchQuery) ||
          lead.email?.toLowerCase().includes(searchQuery.toLowerCase())
        ).length
      : allLeads.length) / itemsPerPage
  )

  // Don't show anything if not authenticated
  if (!authLoading && !isAuthenticated) {
    return null
  }

  return (
    <Layout>
      <div className="p-6 bg-gray-50 min-h-screen">
        <div className="w-full">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold text-gray-900">Leads</h1>
              <span className="text-gray-400 text-lg">/</span>
              <div className="flex items-center gap-1 text-gray-600 text-lg">
                <span>
                  {viewMode === 'table' ? 'Table View' : 
                   viewMode === 'kanban' ? 'Kanban View' : 
                   'Grid View'}
              </span>
                <ChevronDown size={18} />
              </div>
            </div>
            <div className="flex items-center gap-3">
          {isAdmin && (
              <button
                onClick={() => setNewLeadModalOpen(true)}
                className="bg-[#ed1b24] text-white px-5 py-2.5 rounded-md hover:bg-[#d11820] flex items-center gap-2 font-medium text-base"
              >
                  <Plus size={20} />
                  New Lead
              </button>
              )}
              <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-md">
                <Bell size={20} />
              </button>
              <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-md">
                <Search size={20} />
              </button>
              <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-md">
                <MoreVertical size={20} />
              </button>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {/* Total Leads Card */}
            <div className="bg-white rounded-lg shadow-sm p-6 flex items-center justify-between">
              <div>
                <p className="text-base text-gray-500 mb-1">Total Leads</p>
                <p className="text-4xl font-bold text-gray-900">{allLeads.length}</p>
              </div>
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 transform -rotate-90">
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="#f3f4f6"
                    strokeWidth="6"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="6"
                    strokeDasharray={`${(allLeads.length > 0 ? 100 : 0) * 175.9 / 100} 175.9`}
                    strokeLinecap="round"
                  />
                </svg>
                <TrendingUp className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[#3b82f6]" size={20} />
              </div>
            </div>

            {/* Untouched Card */}
            <div className="bg-white rounded-lg shadow-sm p-6 flex items-center justify-between">
              <div>
                <p className="text-base text-gray-500 mb-1">Untouched</p>
                <p className="text-4xl font-bold text-gray-900">{stats.untouched}</p>
              </div>
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 transform -rotate-90">
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="#f3f4f6"
                    strokeWidth="6"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="#ed1b24"
                    strokeWidth="6"
                    strokeDasharray={`${(stats.untouched / allLeads.length) * 175.9} 175.9`}
                    strokeLinecap="round"
                  />
                </svg>
                <TrendingDown className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[#ed1b24]" size={20} />
              </div>
            </div>

            {/* Hot Leads Card */}
            <div className="bg-white rounded-lg shadow-sm p-6 flex items-center justify-between">
              <div>
                <p className="text-base text-gray-500 mb-1">Hot Leads</p>
                <p className="text-4xl font-bold text-gray-900">{stats.hotLeads}</p>
              </div>
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 transform -rotate-90">
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="#f3f4f6"
                    strokeWidth="6"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="6"
                    strokeDasharray={`${(stats.hotLeads / allLeads.length) * 175.9} 175.9`}
                    strokeLinecap="round"
                  />
                </svg>
                <TrendingUp className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[#10b981]" size={20} />
              </div>
        </div>

            {/* Conversions Card */}
            <div className="bg-white rounded-lg shadow-sm p-6 flex items-center justify-between">
              <div>
                <p className="text-base text-gray-500 mb-1">Conversions</p>
                <p className="text-4xl font-bold text-gray-900">
                  {typeof stats.conversions === 'number' ? `${stats.conversions}%` : '0%'}
                </p>
                {stats.totalLeadsCount !== undefined && stats.totalLeadsCount > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    {stats.convertedCount || 0} of {stats.totalLeadsCount} leads converted to customers
                  </p>
                )}
              </div>
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 transform -rotate-90">
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="#f3f4f6"
                    strokeWidth="6"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="6"
                    strokeDasharray={`${(Math.max(0, Math.min(100, stats.conversions || 0)) / 100) * 175.9} 175.9`}
                    strokeLinecap="round"
                  />
                </svg>
                <TrendingUp className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[#10b981]" size={20} />
              </div>
            </div>
          </div>

          {/* Filter and Search Bar */}
          <div 
            className="rounded-lg shadow-sm p-4 mb-4 flex items-center justify-between gap-4"
            style={{
              backgroundColor: containerStyles.containerColor,
              opacity: containerStyles.opacity,
            }}
          >
            <div className="flex items-center gap-3 flex-1">
              {/* Quick Filter: Discarded Leads */}
              <button
                onClick={() => {
                  const discardedFilter = filterConditions.find(c => c.column === 'status' && c.value === LEAD_STATUS.DISCARDED)
                  if (discardedFilter) {
                    // Remove filter if already applied
                    setFilterConditions(filterConditions.filter(c => c.id !== discardedFilter.id))
                  } else {
                    // Add filter for discarded leads
                    setFilterConditions([...filterConditions, {
                      id: `discarded-${Date.now()}`,
                      column: 'status',
                      operator: 'equals',
                      value: LEAD_STATUS.DISCARDED,
                    }])
                  }
                }}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  filterConditions.some(c => c.column === 'status' && c.value === LEAD_STATUS.DISCARDED)
                    ? 'bg-red-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                🗑️ Discarded
              </button>
              
              {/* Advanced Filter Dropdown */}
              <div className="relative filter-dropdown">
                <button 
                  onClick={() => {
                    setFilterDropdownOpen(!filterDropdownOpen)
                    setSortDropdownOpen(false)
                  }}
                  className={`px-4 py-2 text-base bg-white/20 border border-white/30 rounded-md hover:bg-white/30 flex items-center gap-2 ${
                    filterConditions.length > 0 ? 'border-white' : 'border-white/30'
                  }`}
                  style={{ 
                    color: containerStyles.textColor,
                    backgroundColor: containerStyles.backgroundColor,
                    opacity: containerStyles.opacity,
                  }}
                >
                  <span>
                    {filterConditions.length > 0 
                      ? `Filters (${filterConditions.length})` 
                      : 'Filter by'}
                  </span>
                  <ChevronDown size={18} className={`transition-transform ${filterDropdownOpen ? 'transform rotate-180' : ''}`} style={{ color: containerStyles.iconColor }} />
                </button>
                {filterDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[600px] max-w-[800px]">
                    <div className="p-4">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-base font-semibold text-gray-900">Advanced Filters</h3>
                        <div className="flex gap-2">
                          <button
                            onClick={addFilterCondition}
                            className="px-3 py-1.5 text-sm text-[#ed1b24] border border-[#ed1b24] rounded-md hover:bg-[#ed1b24] hover:text-white transition-colors"
                          >
                            + Add Condition
                          </button>
                          {filterConditions.length > 0 && (
                            <button
                              onClick={() => {
                                setFilterConditions([])
                                setFilterDropdownOpen(false)
                              }}
                              className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100"
                            >
                              Clear All
                            </button>
                          )}
                        </div>
        </div>

                      {filterConditions.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          <p className="mb-2">No filters applied</p>
                          <p className="text-sm">Click "Add Condition" to create a filter</p>
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-[400px] overflow-y-auto">
                          {filterConditions.map((condition, index) => (
                            <div key={condition.id} className="flex items-center gap-2 p-3 bg-gray-50 rounded-md">
                              {index > 0 && (
            <select
                                  value={condition.logic || 'AND'}
                                  onChange={(e) => updateFilterCondition(condition.id, { logic: e.target.value as 'AND' | 'OR' })}
                                  className="px-2 py-1.5 text-sm font-semibold border border-gray-300 rounded bg-white text-[#ed1b24] focus:outline-none focus:ring-2 focus:ring-[#ed1b24]"
                                >
                                  <option value="AND">AND</option>
                                  <option value="OR">OR</option>
            </select>
                              )}
                              
                              <select
                                value={condition.column}
                                onChange={(e) => {
                                  const newColumn = e.target.value
                                  // Set appropriate default operator based on column type
                                  let defaultOperator = 'contains'
                                  if (newColumn === 'interest_level' || newColumn === 'status' || newColumn === 'source') {
                                    defaultOperator = 'equals'
                                  } else if (['payment_amount', 'advance_amount', 'created_at', 'updated_at', 'first_contact_at'].includes(newColumn)) {
                                    defaultOperator = 'greater_than'
                                  }
                                  updateFilterCondition(condition.id, { column: newColumn, operator: defaultOperator })
                                }}
                                className="px-3 py-1.5 text-sm border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-[#ed1b24]"
                              >
                                {[
                                  { key: 'name', label: 'Name' },
                                  { key: 'interest', label: 'Interest' },
                                  { key: 'phone', label: 'Phone' },
                                  { key: 'email', label: 'Email' },
                                  { key: 'source', label: 'Source' },
                                  { key: 'status', label: 'Status' },
                                  { key: 'interest_level', label: 'Lead Type' },
                                  { key: 'requirement', label: 'Requirement/Vehicle' },
                                  { key: 'assigned_to', label: 'Assigned To' },
                                  { key: 'lead_id', label: 'Lead ID' },
                                  { key: 'budget_range', label: 'Budget Range' },
                                  { key: 'timeline', label: 'Timeline' },
                                  { key: 'payment_status', label: 'Payment Status' },
                                  { key: 'payment_amount', label: 'Payment Amount' },
                                  { key: 'advance_amount', label: 'Advance Amount' },
                                  { key: 'created_at', label: 'Created At' },
                                  { key: 'updated_at', label: 'Updated At' },
                                  { key: 'first_contact_at', label: 'First Contact At' },
                                ].map((col) => (
                                  <option key={col.key} value={col.key}>{col.label}</option>
                                ))}
                              </select>
                              
                              <select
                                value={condition.operator}
                                onChange={(e) => updateFilterCondition(condition.id, { operator: e.target.value })}
                                className="px-3 py-1.5 text-sm border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-[#ed1b24]"
                              >
                                {getOperatorsForColumn(condition.column).map((op) => (
                                  <option key={op.key} value={op.key}>{op.label}</option>
                                ))}
                              </select>
                              
                              {(condition.operator !== 'is_empty' && condition.operator !== 'is_not_empty') && (
                                <input
                                  type={['payment_amount', 'advance_amount', 'created_at', 'updated_at', 'first_contact_at'].includes(condition.column) 
                                    ? (condition.column.includes('_at') ? 'date' : 'number')
                                    : 'text'}
                                  value={condition.value}
                                  onChange={(e) => updateFilterCondition(condition.id, { value: e.target.value })}
                                  placeholder="Value"
                                  className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#ed1b24]"
                                />
                              )}
                              
                              <button
                                onClick={() => removeFilterCondition(condition.id)}
                                className="px-2 py-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="Remove condition"
                              >
                                ✕
                              </button>
          </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Sort Dropdown */}
              <div className="relative sort-dropdown">
            <button
                  onClick={() => {
                    setSortDropdownOpen(!sortDropdownOpen)
                    setFilterDropdownOpen(false)
                  }}
                  className="px-4 py-2 text-base border rounded-md hover:opacity-80 flex items-center gap-2 transition-all"
                  style={{ 
                    color: containerStyles.textColor,
                    backgroundColor: containerStyles.backgroundColor,
                    opacity: containerStyles.opacity,
                    borderColor: containerStyles.textColor + '30',
                  }}
                >
                  <span>Sort by: {sortColumn.replace(/_/g, ' ')} ({sortDirection})</span>
                  <ChevronDown size={18} className={`transition-transform ${sortDropdownOpen ? 'transform rotate-180' : ''}`} style={{ color: containerStyles.iconColor }} />
            </button>
                {sortDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[250px]">
                    <div className="p-2">
                      <div className="mb-2 px-2 text-xs font-semibold text-gray-500 uppercase">Sort Column</div>
                      <div className="max-h-60 overflow-y-auto mb-2">
                        {[
                          { key: 'created_at', label: 'Created At' },
                          { key: 'updated_at', label: 'Updated At' },
                          { key: 'first_contact_at', label: 'First Contact At' },
                          { key: 'name', label: 'Name' },
                          { key: 'interest', label: 'Interest' },
                          { key: 'phone', label: 'Phone' },
                          { key: 'email', label: 'Email' },
                          { key: 'source', label: 'Source' },
                          { key: 'status', label: 'Status' },
                          { key: 'interest_level', label: 'Lead Type' },
                          { key: 'requirement', label: 'Requirement' },
                          { key: 'assigned_to', label: 'Assigned To' },
                          { key: 'lead_id', label: 'Lead ID' },
                          { key: 'budget_range', label: 'Budget Range' },
                          { key: 'timeline', label: 'Timeline' },
                          { key: 'payment_status', label: 'Payment Status' },
                          { key: 'payment_amount', label: 'Payment Amount' },
                          { key: 'advance_amount', label: 'Advance Amount' },
                        ].map((col) => (
                          <button
                            key={col.key}
                            onClick={() => setSortColumn(col.key)}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded ${
                              sortColumn === col.key ? 'bg-blue-50 text-blue-700 font-medium' : ''
                            }`}
                          >
                            {col.label}
                          </button>
                        ))}
                      </div>
                      <div className="border-t pt-2">
                        <div className="px-2 text-xs font-semibold text-gray-500 uppercase mb-1">Direction</div>
                        <button
                          onClick={() => setSortDirection('asc')}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded ${
                            sortDirection === 'asc' ? 'bg-blue-50 text-blue-700 font-medium' : ''
                          }`}
                        >
                          Ascending ↑
                        </button>
                        <button
                          onClick={() => setSortDirection('desc')}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded ${
                            sortDirection === 'desc' ? 'bg-blue-50 text-blue-700 font-medium' : ''
                          }`}
                        >
                          Descending ↓
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex-1 max-w-md relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2" size={18} style={{ color: containerStyles.iconColor + 'CC' }} />
                <input
                  type="text"
                  placeholder="Try 'Miami invoice'"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="w-full pl-10 pr-4 py-2.5 text-base border rounded-md focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-all"
                  style={{ 
                    color: containerStyles.textColor,
                    backgroundColor: containerStyles.backgroundColor,
                    borderColor: containerStyles.textColor + '30',
                    '--tw-ring-color': containerStyles.textColor + '50',
                  } as React.CSSProperties & { '--tw-ring-color'?: string }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('table')}
                className={`p-2 rounded-md transition-colors ${viewMode === 'table' ? 'text-[#ed1b24]' : 'hover:opacity-80'}`}
                style={{ 
                  color: viewMode === 'table' ? '#ed1b24' : containerStyles.iconColor,
                  backgroundColor: viewMode === 'table' ? '#ffffff' : 'transparent',
                }}
                title="Table View"
              >
                <List size={18} />
              </button>
              <button
                onClick={() => setViewMode('kanban')}
                className={`p-2 rounded-md transition-colors ${viewMode === 'kanban' ? 'text-[#ed1b24]' : 'hover:opacity-80'}`}
                style={{ 
                  color: viewMode === 'kanban' ? '#ed1b24' : containerStyles.iconColor,
                  backgroundColor: viewMode === 'kanban' ? '#ffffff' : 'transparent',
                }}
                title="Kanban View"
              >
                <Columns size={18} />
              </button>
            <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'text-[#ed1b24]' : 'hover:opacity-80'}`}
                style={{ 
                  color: viewMode === 'grid' ? '#ed1b24' : containerStyles.iconColor,
                  backgroundColor: viewMode === 'grid' ? '#ffffff' : 'transparent',
                }}
                title="Grid View"
              >
                <Grid size={18} />
              </button>
              <Link 
                href="/leads/upload"
                className="px-4 py-2 text-base border rounded-md hover:opacity-80 flex items-center gap-2 transition-all"
                style={{ 
                  color: containerStyles.textColor,
                  backgroundColor: containerStyles.backgroundColor,
                  borderColor: containerStyles.textColor + '30',
                }}
              >
                <Download size={18} style={{ color: containerStyles.iconColor }} />
                Import
              </Link>
              <button 
                onClick={() => {
                  setCustomizeModalOpen(true)
                  setCustomizeMode(null)
                }}
                className="px-4 py-2 text-base border rounded-md hover:opacity-80 flex items-center gap-2 transition-all"
                style={{ 
                  color: containerStyles.textColor,
                  backgroundColor: containerStyles.backgroundColor,
                  borderColor: containerStyles.textColor + '30',
                }}
              >
                <Settings size={18} style={{ color: containerStyles.iconColor }} />
                Customise
              </button>
              <div className="relative more-options-dropdown">
                <button 
                  onClick={() => setMoreOptionsOpen(!moreOptionsOpen)}
                  className="p-2 hover:opacity-80 rounded-md transition-colors"
                  style={{ color: containerStyles.iconColor }}
                >
                  <MoreVertical size={18} />
                </button>
                {moreOptionsOpen && (
                  <div className="absolute right-0 top-full mt-2 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                    <div className="p-2">
                      <button
                        onClick={() => {
                          setMoreOptionsOpen(false)
                          setContainerCustomizeOpen(true)
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded"
                      >
                        Customize Container
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
        </div>

          {/* Group By Dropdown for Kanban View */}
          {viewMode === 'kanban' && (
            <div className="mb-4 flex items-center gap-3">
              <div className="relative groupby-dropdown">
                <button
                  onClick={() => {
                    setGroupByDropdownOpen(!groupByDropdownOpen)
                    setFilterDropdownOpen(false)
                    setSortDropdownOpen(false)
                  }}
                  className="px-4 py-2 text-base text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 flex items-center gap-2"
                >
                  <span>Group by: {
                    groupBy === 'status' ? 'Lead Stage' : 
                    groupBy === 'interest_level' ? 'Lead Type' : 
                    groupBy === 'assigned_to' ? 'Assigned To' : 
                    'Source'
                  }</span>
                  <ChevronDown size={18} className={`transition-transform ${groupByDropdownOpen ? 'transform rotate-180' : ''}`} />
                </button>
                {groupByDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                    <div className="p-2">
                      {[
                        { key: 'status', label: 'Lead Stage' },
                        { key: 'interest_level', label: 'Lead Type' },
                        { key: 'assigned_to', label: 'Assigned To' },
                        { key: 'source', label: 'Source' },
                      ].map((option) => (
                        <button
                          key={option.key}
                          onClick={() => {
                            setGroupBy(option.key)
                            setGroupByDropdownOpen(false)
                          }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded ${
                            groupBy === option.key ? 'bg-blue-50 text-blue-700 font-medium' : ''
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Leads Table View */}
          {viewMode === 'table' && (
          <>
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
          <table className={`min-w-full divide-y divide-gray-200 ${resizingColumn ? 'select-none' : ''}`}>
            <thead className="bg-gray-50">
              <tr>
                {isAdmin && (
                  <th className="px-6 py-3 text-left" style={{ width: '50px' }}>
                    <input
                      type="checkbox"
                      checked={leads.length > 0 && leads.every(lead => selectedLeadIds.has(lead.id))}
                      onChange={handleSelectAll}
                          className="rounded border-gray-300 text-[#ed1b24] focus:ring-[#ed1b24]"
                    />
                  </th>
                )}
                {columns.filter(col => col.visible).map((column) => (
                  <th
                    key={column.key}
                    className="px-6 py-4 text-left text-sm font-medium text-gray-500 uppercase tracking-wider relative"
                    style={{ width: `${column.width}px`, minWidth: `${column.width}px` }}
                  >
                    <div className="flex items-center">
                      {column.label}
                      {(column.key === 'status' || column.key === 'last_contacted' || column.key === 'phone' || column.key === 'email') && (
                        <ChevronDown size={16} className="inline ml-1" />
                      )}
                    </div>
                    {customizeMode === 'adjust-width' && (
                      <div
                        className={`absolute top-0 right-0 w-4 h-full cursor-col-resize transition-all z-10 flex items-center justify-center ${
                          resizingColumn === column.key 
                            ? 'bg-blue-600' 
                            : 'bg-blue-500 hover:bg-blue-600 hover:w-5'
                        }`}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleResizeStart(column.key, e)
                        }}
                        style={{ cursor: 'col-resize' }}
                        title="Drag to resize column width"
                      >
                        <div className="w-1 h-8 bg-white rounded-full opacity-80"></div>
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={(isAdmin ? 1 : 0) + columns.filter(col => col.visible).length} className="px-6 py-12 text-center text-base text-gray-500">
                    No leads found
                  </td>
                </tr>
              ) : (
                leads.map((lead) => {
                  const vehicleName = getVehicleName(lead)
                  const productInterest = getProductInterest(lead)
                  const isHot = lead.interest_level === 'hot'
                  
                  function renderCell(column: ColumnConfig) {
                    switch (column.key) {
                      case 'name':
                        return (
                          <div className="text-base font-medium text-gray-900">
                            {lead.name}
                            {vehicleName && (
                              <span className="text-gray-500 block text-sm mt-0.5">
                                {vehicleName}
                              </span>
                            )}
                          </div>
                        )
                      case 'interest':
                        return (
                          <div className="text-base text-gray-900">
                            {productInterest || '-'}
                          </div>
                        )
                      case 'status':
                        return (
                          <span className={`px-3 py-1.5 text-sm font-semibold rounded-full ${getStageBadgeColor(lead.status)}`}>
                            {formatStageName(lead.status)}
                          </span>
                        )
                      case 'lead_score':
                        const score = (lead as any).lead_score
                        if (score === null || score === undefined) {
                          return <span className="text-gray-400">-</span>
                        }
                        return (
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              score >= 80 ? 'bg-green-100 text-green-800' :
                              score >= 60 ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {score.toFixed(0)}
                            </span>
                          </div>
                        )
                      case 'interest_level':
                        return (
                          <div className="flex items-center gap-1.5">
                            {isHot ? (
                              <>
                                <TrendingUp size={16} className="text-[#ed1b24]" />
                                <span className="text-base text-gray-900">Hot</span>
                              </>
                            ) : (
                              <>
                                <span className="text-base">❄️</span>
                                <span className="text-base text-gray-900">Cold</span>
                              </>
                            )}
                          </div>
                        )
                      case 'source':
                        return (
                          <div className="flex items-center gap-2">
                            <SourceIcon platform={lead.meta_data?.platform || lead.meta_data?.Platform} source={lead.source} />
                            {(lead.meta_data?.platform || lead.meta_data?.Platform) && (
                              <span className="text-base text-gray-900 capitalize">
                                {String(lead.meta_data?.platform || lead.meta_data?.Platform).toUpperCase()}
                              </span>
                            )}
                          </div>
                        )
                      case 'assigned_to':
                        return lead.assigned_user ? (
                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <UserAvatar 
                                profileImageUrl={lead.assigned_user.profile_image_url}
                                name={lead.assigned_user.name}
                              />
                              <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full"></div>
                            </div>
                            <div>
                              <div className="text-base font-bold text-gray-900">{lead.assigned_user.name}</div>
                              <div className="text-sm text-gray-500">Sales Executive</div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-base text-gray-500">Unassigned</span>
                        )
                      case 'last_contacted':
                        return (
                          <span className="text-base text-gray-500">
                            {getTimeAgo(getLastContactedTime(lead))}
                          </span>
                        )
                      case 'phone':
                        return (
                          <div className="flex items-center gap-1.5 text-base text-gray-500">
                            <Phone size={16} />
                            <span className="break-all">{lead.phone}</span>
                          </div>
                        )
                      case 'email':
                        return (
                          <div className="flex items-center gap-1.5 text-base text-gray-500">
                            <Mail size={16} />
                            <span className="break-all">{lead.email || '-'}</span>
                          </div>
                        )
                      case 'metadata':
                        if (!lead.meta_data || Object.keys(lead.meta_data).length === 0) {
                          return <span className="text-gray-400 text-sm">No metadata</span>
                        }
                        
                        const meta = lead.meta_data
                        const metaEntries = Object.entries(meta).filter(([key]) => {
                          // Exclude internal/system fields
                          return !['platform', 'Platform', 'customer_id'].includes(key)
                        })
                        
                        if (metaEntries.length === 0) {
                          return <span className="text-gray-400 text-sm">-</span>
                        }
                        
                        // Get key metadata fields to display (prioritize important ones)
                        const importantFields: Array<{key: string, value: any, icon: string}> = []
                        
                        // Company
                        if (meta.company || meta.Company) {
                          importantFields.push({ key: 'Company', value: meta.company || meta.Company, icon: '🏢' })
                        }
                        
                        // Location
                        if (meta.city && meta.country) {
                          importantFields.push({ key: 'Location', value: `${meta.city}, ${meta.country}`, icon: '📍' })
                        } else if (meta.location) {
                          importantFields.push({ key: 'Location', value: meta.location, icon: '📍' })
                        }
                        
                        // Budget/Payment
                        if (meta.payment_amount) {
                          importantFields.push({ key: 'Payment', value: `$${Number(meta.payment_amount).toLocaleString()}`, icon: '💰' })
                        } else if (meta.budget_range) {
                          importantFields.push({ key: 'Budget', value: meta.budget_range, icon: '💰' })
                        }
                        
                        // Timeline
                        if (meta.timeline) {
                          importantFields.push({ key: 'Timeline', value: meta.timeline, icon: '📅' })
                        }
                        
                        // Payment Status
                        if (meta.payment_status) {
                          importantFields.push({ key: 'Payment Status', value: String(meta.payment_status).replace(/_/g, ' '), icon: '💳' })
                        }
                        
                        // Vehicle/Service
                        const vehicle = meta['what_services_are_you_looking_for?'] || 
                                       meta['what_services_are_you_looking_for'] ||
                                       meta.vehicle ||
                                       meta.car_model
                        if (vehicle) {
                          importantFields.push({ key: 'Vehicle', value: String(vehicle).replace(/_/g, ' '), icon: '🚗' })
                        }
                        
                        // Build tooltip with all metadata
                        const allMetaText = metaEntries
                          .map(([key, value]) => {
                            const displayKey = key.replace(/_/g, ' ').replace(/\?/g, '')
                            const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value)
                            return `${displayKey}: ${displayValue}`
                          })
                          .join('\n')
                        
                        return (
                          <div 
                            className="relative group"
                            title={allMetaText}
                          >
                            <div className="flex flex-col gap-1 text-sm">
                              {importantFields.length > 0 ? (
                                <>
                                  {importantFields.slice(0, 3).map((field, idx) => (
                                    <div key={idx} className="flex items-center gap-1 text-gray-700">
                                      <span>{field.icon}</span>
                                      <span className="truncate" title={`${field.key}: ${field.value}`}>
                                        {field.value}
                                      </span>
                                    </div>
                                  ))}
                                  {metaEntries.length > importantFields.length && (
                                    <span className="text-gray-400 text-xs">
                                      +{metaEntries.length - importantFields.length} more field{metaEntries.length - importantFields.length !== 1 ? 's' : ''}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <div className="text-sm text-gray-600">
                                  <span className="font-medium">{metaEntries.length}</span> field{metaEntries.length !== 1 ? 's' : ''}
                                  <span className="text-gray-400 text-xs block mt-0.5">Hover to see details</span>
                                </div>
                              )}
                            </div>
                            {/* Tooltip on hover */}
                            <div className="absolute left-full ml-2 top-0 z-50 hidden group-hover:block bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl max-w-xs whitespace-pre-wrap break-words">
                              <div className="font-semibold mb-2 text-white">All Metadata:</div>
                              <div className="space-y-1">
                                {metaEntries.slice(0, 10).map(([key, value], idx) => {
                                  const displayKey = key.replace(/_/g, ' ').replace(/\?/g, '')
                                  const displayValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
                                  return (
                                    <div key={idx} className="border-b border-gray-700 pb-1 last:border-0">
                                      <span className="font-medium text-yellow-300">{displayKey}:</span>
                                      <span className="ml-1 text-gray-200">{displayValue}</span>
                                    </div>
                                  )
                                })}
                                {metaEntries.length > 10 && (
                                  <div className="text-gray-400 pt-1">
                                    ... and {metaEntries.length - 10} more
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      default:
                        return null
                    }
                  }
                  
                  return (
                    <tr 
                      key={lead.id} 
                      className={`hover:bg-gray-50 cursor-pointer ${selectedLeadIds.has(lead.id) ? 'bg-indigo-50' : ''}`}
                      onClick={(e) => {
                        // Don't navigate if clicking checkbox or button
                        if ((e.target as HTMLElement).tagName === 'INPUT' || 
                            (e.target as HTMLElement).tagName === 'BUTTON' ||
                            (e.target as HTMLElement).closest('button')) {
                          return
                        }
                        router.push(`/leads/${lead.id}`)
                      }}
                    >
                    {isAdmin && (
                        <td className="px-6 py-4 whitespace-nowrap" style={{ width: '50px' }}>
                        <input
                          type="checkbox"
                          checked={selectedLeadIds.has(lead.id)}
                          onChange={() => handleLeadSelect(lead.id)}
                            className="rounded border-gray-300 text-[#ed1b24] focus:ring-[#ed1b24]"
                        />
                      </td>
                    )}
                      {columns.filter(col => col.visible).map((column) => (
                        <td
                          key={column.key}
                          className="px-6 py-4 whitespace-nowrap"
                          style={{ width: `${column.width}px`, minWidth: `${column.width}px` }}
                        >
                          {renderCell(column)}
                    </td>
                      ))}
                  </tr>
                  )
                })
              )}
            </tbody>
          </table>
            </div>
        </div>

          {/* Pagination */}
        {totalPages > 1 && (
            <div className="bg-white rounded-lg shadow-sm mt-4 p-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 text-base font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                  if (
                    page === 1 ||
                    page === totalPages ||
                    (page >= currentPage - 1 && page <= currentPage + 1)
                  ) {
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`px-3 py-2 text-base font-medium rounded-md ${
                          currentPage === page
                            ? 'bg-[#ed1b24] text-white'
                            : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {page}
                      </button>
                    )
                  } else if (page === currentPage - 2 || page === currentPage + 2) {
                    return <span key={page} className="px-2 text-gray-500 text-base">...</span>
                  }
                  return null
                })}
              </div>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 text-base font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
            <div className="text-base text-gray-600">
              Page {currentPage} of {totalPages}
            </div>
          </div>
        )}
          </>
          )}

          {/* Kanban View */}
          {viewMode === 'kanban' && (
            <KanbanBoard 
              leads={leads}
              allLeads={allLeads}
              groupBy={groupBy}
              onLeadMove={handleLeadMove}
              getVehicleName={getVehicleName}
              getProductInterest={getProductInterest}
              getTimeAgo={getTimeAgo}
              router={router}
            />
          )}

          {/* Grid View */}
          {viewMode === 'grid' && (
            <>
              <GridView 
                leads={leads}
                getVehicleName={getVehicleName}
                getTimeAgo={getTimeAgo}
                getLastContactedTime={getLastContactedTime}
                formatStageName={formatStageName}
                getStageBadgeColor={getStageBadgeColor}
                router={router}
              />
              {/* Pagination for Grid View */}
              {totalPages > 1 && (
                <div className="bg-white rounded-lg shadow-sm mt-4 p-4 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="px-4 py-2 text-base font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                        if (
                          page === 1 ||
                          page === totalPages ||
                          (page >= currentPage - 1 && page <= currentPage + 1)
                        ) {
                          return (
                            <button
                              key={page}
                              onClick={() => setCurrentPage(page)}
                              className={`px-3 py-2 text-base font-medium rounded-md ${
                                currentPage === page
                                  ? 'bg-[#ed1b24] text-white'
                                  : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              {page}
                            </button>
                          )
                        } else if (page === currentPage - 2 || page === currentPage + 2) {
                          return <span key={page} className="px-2 text-gray-500 text-base">...</span>
                        }
                        return null
                      })}
        </div>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="px-4 py-2 text-base font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
      </div>
                  <div className="text-base text-gray-600">
                    Page {currentPage} of {totalPages}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Bulk Reassign Button */}
          {isAdmin && selectedLeadIds.size > 0 && (
            <div className="fixed bottom-6 right-6">
              <button
                onClick={() => setBulkReassignModalOpen(true)}
                className="bg-[#ed1b24] text-white px-6 py-3 rounded-md hover:bg-[#d11820] shadow-lg font-medium text-base"
              >
                Bulk Reassign ({selectedLeadIds.size})
              </button>
          </div>
        )}
        </div>
      </div>

      {/* Reassign Modal */}
      {reassigningLeadId && isAdmin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold mb-4">Reassign Lead</h3>
            <div className="mb-4">
              <label className="block text-base font-medium text-gray-700 mb-2">
                Select Tele-caller
              </label>
              <select
                value={selectedTeleCaller}
                onChange={(e) => setSelectedTeleCaller(e.target.value)}
                className="w-full px-3 py-2.5 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#ed1b24]"
              >
                <option value="">Select a tele-caller...</option>
                {teleCallers.map((tc) => (
                    <option key={tc.id} value={tc.id}>
                      {tc.name} ({tc.email})
                    </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setReassigningLeadId(null)
                  setSelectedTeleCaller('')
                }}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReassign(reassigningLeadId)}
                disabled={reassignLoading || !selectedTeleCaller}
                className="px-4 py-2 text-white bg-[#ed1b24] rounded-md hover:bg-[#d11820] disabled:opacity-50"
              >
                {reassignLoading ? 'Reassigning...' : 'Reassign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Reassign Modal */}
      {bulkReassignModalOpen && isAdmin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold mb-4">
              Bulk Reassign Leads ({selectedLeadIds.size} selected)
            </h3>
            <div className="mb-4">
              <label className="block text-base font-medium text-gray-700 mb-2">
                Select Tele-caller
              </label>
              <select
                value={bulkReassignTeleCaller}
                onChange={(e) => setBulkReassignTeleCaller(e.target.value)}
                className="w-full px-3 py-2.5 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#ed1b24]"
              >
                <option value="">Select a tele-caller...</option>
                {teleCallers.map((tc) => (
                    <option key={tc.id} value={tc.id}>
                      {tc.name} ({tc.email})
                    </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setBulkReassignModalOpen(false)
                  setBulkReassignTeleCaller('')
                }}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkReassign}
                disabled={bulkReassignLoading || !bulkReassignTeleCaller}
                className="px-4 py-2 text-white bg-[#ed1b24] rounded-md hover:bg-[#d11820] disabled:opacity-50"
              >
                {bulkReassignLoading ? 'Reassigning...' : `Reassign ${selectedLeadIds.size} Lead(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customize Columns Modal - Initial Selection */}
      {customizeModalOpen && customizeMode === null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold">Customize Columns</h3>
              <button
                onClick={() => {
                  setCustomizeModalOpen(false)
                  setCustomizeMode(null)
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => setCustomizeMode('adjust-width')}
                className="w-full p-4 text-left border-2 border-gray-200 rounded-lg hover:border-[#ed1b24] hover:bg-red-50 transition-colors"
              >
                <div className="font-semibold text-gray-900 mb-1">Adjust Column Width</div>
                <div className="text-sm text-gray-600">Drag the adjustment icon in column headers to resize</div>
              </button>

              <button
                onClick={() => setCustomizeMode('select')}
                className="w-full p-4 text-left border-2 border-gray-200 rounded-lg hover:border-[#ed1b24] hover:bg-red-50 transition-colors"
              >
                <div className="font-semibold text-gray-900 mb-1">What to Show</div>
                <div className="text-sm text-gray-600">Select which columns to display in the table</div>
              </button>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => {
                  setCustomizeModalOpen(false)
                  setCustomizeMode(null)
                }}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* What to Show Modal */}
      {customizeModalOpen && customizeMode === 'select' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold">What to Show</h3>
              <button
                onClick={() => {
                  setCustomizeModalOpen(false)
                  setCustomizeMode(null)
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-4">
                Select which columns to display in the table.
              </p>
              
              <div className="space-y-3">
                {columns.map((column) => (
                  <div
                    key={column.key}
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <input
                        type="checkbox"
                        checked={column.visible}
                        onChange={() => toggleColumnVisibility(column.key)}
                        className="rounded border-gray-300 text-[#ed1b24] focus:ring-[#ed1b24] w-4 h-4"
                      />
                      <label 
                        className="text-base font-medium text-gray-900 cursor-pointer flex-1" 
                        onClick={() => toggleColumnVisibility(column.key)}
                      >
                        {column.label}
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t">
              <button
                onClick={resetColumns}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 text-sm"
              >
                Reset to Default
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setCustomizeModalOpen(false)
                    setCustomizeMode(null)
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setCustomizeModalOpen(false)
                    setCustomizeMode(null)
                  }}
                  className="px-4 py-2 text-white bg-[#ed1b24] rounded-md hover:bg-[#d11820]"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Column Width Mode - Shows resize handles in table */}
      {customizeMode === 'adjust-width' && viewMode === 'table' && (
        <div className="fixed top-4 right-4 z-50 pointer-events-none">
          <div className="bg-white rounded-lg p-4 shadow-lg pointer-events-auto border-2 border-blue-500">
            <div className="flex items-center gap-3">
              <div className="text-sm font-medium text-gray-900">
                <span className="text-blue-600 font-bold">💡</span> Drag the blue handles in column headers to adjust width
              </div>
              <button
                onClick={() => {
                  setCustomizeMode(null)
                  setCustomizeModalOpen(false)
                }}
                className="px-4 py-2 text-white bg-[#ed1b24] rounded-md hover:bg-[#d11820] text-sm font-medium"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Show message if not in table view */}
      {customizeMode === 'adjust-width' && viewMode !== 'table' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="text-center">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-xl font-semibold mb-2">Switch to Table View</h3>
              <p className="text-gray-600 mb-4">
                Column width adjustment is only available in Table View. Please switch to Table View to adjust column widths.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => {
                    setViewMode('table')
                  }}
                  className="px-4 py-2 text-white bg-[#ed1b24] rounded-md hover:bg-[#d11820]"
                >
                  Switch to Table View
                </button>
                <button
                  onClick={() => {
                    setCustomizeMode(null)
                    setCustomizeModalOpen(false)
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Lead Modal */}
      {newLeadModalOpen && (
        <NewLeadForm onClose={() => setNewLeadModalOpen(false)} />
      )}

      {/* Container Customization Modal */}
      {containerCustomizeOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold">Customize Container</h3>
              <button
                onClick={() => setContainerCustomizeOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6">
              {/* Container Background Color */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Container Background Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={containerStyles.containerColor}
                    onChange={(e) => setContainerStyles((prev: any) => ({ ...prev, containerColor: e.target.value }))}
                    className="w-16 h-10 rounded border border-gray-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={containerStyles.containerColor}
                    onChange={(e) => setContainerStyles((prev: any) => ({ ...prev, containerColor: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#ed1b24]"
                    placeholder="#000000"
                  />
                </div>
              </div>

              {/* Icon Color */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Icon Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={containerStyles.iconColor}
                    onChange={(e) => setContainerStyles((prev: any) => ({ ...prev, iconColor: e.target.value }))}
                    className="w-16 h-10 rounded border border-gray-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={containerStyles.iconColor}
                    onChange={(e) => setContainerStyles((prev: any) => ({ ...prev, iconColor: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#ed1b24]"
                    placeholder="#ffffff"
                  />
                </div>
              </div>

              {/* Text Color */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Text Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={containerStyles.textColor}
                    onChange={(e) => setContainerStyles((prev: any) => ({ ...prev, textColor: e.target.value }))}
                    className="w-16 h-10 rounded border border-gray-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={containerStyles.textColor}
                    onChange={(e) => setContainerStyles((prev: any) => ({ ...prev, textColor: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#ed1b24]"
                    placeholder="#ffffff"
                  />
                </div>
              </div>

              {/* Button Background Color */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Button Background Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={containerStyles.backgroundColor}
                    onChange={(e) => setContainerStyles((prev: any) => ({ ...prev, backgroundColor: e.target.value }))}
                    className="w-16 h-10 rounded border border-gray-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={containerStyles.backgroundColor}
                    onChange={(e) => setContainerStyles((prev: any) => ({ ...prev, backgroundColor: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#ed1b24]"
                    placeholder="#ffffff33"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Use hex format with alpha for transparency (e.g., #ffffff33 for 20% white)</p>
              </div>

              {/* Opacity */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Container Opacity: {Math.round(containerStyles.opacity * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={containerStyles.opacity}
                  onChange={(e) => setContainerStyles((prev: any) => ({ ...prev, opacity: parseFloat(e.target.value) }))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Preview */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Preview
                </label>
                <div 
                  className="p-4 rounded-lg border-2 border-gray-200"
                  style={{
                    backgroundColor: containerStyles.containerColor,
                    opacity: containerStyles.opacity,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <button
                      className="px-4 py-2 rounded-md border flex items-center gap-2"
                      style={{
                        color: containerStyles.textColor,
                        backgroundColor: containerStyles.backgroundColor,
                        opacity: containerStyles.opacity,
                        borderColor: containerStyles.textColor + '30',
                      }}
                    >
                      <Search size={18} style={{ color: containerStyles.iconColor }} />
                      <span>Sample Button</span>
                    </button>
                    <div style={{ color: containerStyles.iconColor }}>
                      <Settings size={18} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-6 mt-6 border-t">
              <button
                onClick={() => {
                  setContainerStyles({
                    containerColor: '#000000',
                    iconColor: '#ffffff',
                    textColor: '#ffffff',
                    opacity: 1,
                    backgroundColor: '#ffffff', // Base color, opacity handled separately
                  })
                }}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 text-sm"
              >
                Reset to Default
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => setContainerCustomizeOpen(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setContainerCustomizeOpen(false)}
                  className="px-4 py-2 text-white bg-[#ed1b24] rounded-md hover:bg-[#d11820]"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
