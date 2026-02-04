'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { Bell, Search, MoreVertical, Plus, Download, Upload, Settings, List, Columns, Grid, ChevronDown, Phone, Mail, TrendingUp, TrendingDown, DollarSign, Calendar, Building2, MapPin, Snowflake, X, LogOut, Trash2, Check, MessageCircle, FileText } from 'lucide-react'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { LEAD_STATUS, LEAD_STATUS_LABELS } from '@/shared/constants/lead-status'
import { SIDEBAR_MENU_ITEMS, type SidebarMenuItem } from '@/shared/constants/sidebar'
import { useAuthContext } from '@/components/AuthProvider'
import MobileHeader from '@/components/MobileHeader'
import MobileBottomNav from '@/components/MobileBottomNav'

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
  discarded: number
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

  // Get checklist items from meta_data
  function getChecklistItems(lead: Lead) {
    const priceShared = lead.meta_data?.price_shared || lead.meta_data?.PriceShared || false
    const budgetConfirmed = lead.meta_data?.budget_confirmed || lead.meta_data?.BudgetConfirmed || false
    return { priceShared, budgetConfirmed }
  }

  // Get platform icon (Instagram, Facebook, etc.)
  function getPlatformIcon(lead: Lead) {
    const platform = lead.meta_data?.platform || lead.meta_data?.Platform
    if (!platform) return null
    
    const platformLower = String(platform).toLowerCase()
    if (platformLower.includes('instagram') || platformLower === 'ig') {
      return <span className="text-sm">📷</span>
    } else if (platformLower.includes('facebook') || platformLower === 'fb') {
      return <span className="text-sm">📘</span>
    } else if (platformLower.includes('whatsapp') || platformLower === 'wa') {
      return <span className="text-sm">💬</span>
    }
    return null
  }

  // Get notes count (placeholder - you may need to fetch this from API)
  function getNotesCount(lead: Lead): number {
    return lead.meta_data?.notes_count || 0
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" style={{ fontFamily: 'General Sans, Poppins, sans-serif' }}>
      {leads.map((lead) => {
        const vehicleName = getVehicleName(lead)
        const isHot = lead.interest_level === 'hot'
        const lastContact = formatLastContact(lead)
        const checklist = getChecklistItems(lead)
        const platformIcon = getPlatformIcon(lead)
        const platform = lead.meta_data?.platform || lead.meta_data?.Platform
        const notesCount = getNotesCount(lead)
        
        return (
          <div
            key={lead.id}
            className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all border border-[#eaecee] overflow-hidden"
          >
            {/* CARD HEADER */}
            <div className="px-4 py-3 border-b border-[#eaecee]">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0 pr-2">
                  <h3 
                    className="text-sm font-semibold text-[#242d35] truncate"
                    style={{ fontSize: '14px', fontWeight: 600 }}
                  >
                    {lead.name}
                  </h3>
                  {vehicleName && (
                    <p 
                      className="text-xs text-[#717d8a] truncate mt-0.5"
                      style={{ fontSize: '12px' }}
                    >
                      {vehicleName}
                    </p>
                  )}
                </div>
                {/* Red wavy line icon for hot leads */}
                {isHot && (
                  <div className="flex-shrink-0">
                    <TrendingUp className="w-4 h-4 text-[#ed1b24]" />
                  </div>
                )}
              </div>
              
              {/* Stage & Priority Badges */}
              <div className="flex items-center gap-1.5 mt-2">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getStageBadgeClass(lead.status)}`}>
                  {formatStageName(lead.status)}
                </span>
                {isHot && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FFF4E6] text-[#FF9500]">
                    Hot
                  </span>
                )}
              </div>
            </div>

            {/* CARD BODY - Contact Information */}
            <div className="px-4 py-3 space-y-2">
              {/* Platform/Instagram */}
              {platform && (
                <div className="flex items-center gap-2 text-xs text-[#717d8a]">
                  {platformIcon}
                  <span className="uppercase">{String(platform).toUpperCase()}</span>
                </div>
              )}

              {/* Last Contacted */}
              <div className="flex items-center gap-2 text-xs text-[#717d8a]">
                <Calendar className="w-3.5 h-3.5" />
                <span>Last contacted {lastContact === 'Never' ? 'never' : lastContact}</span>
              </div>

              {/* Phone */}
              {lead.phone && (
                <div className="flex items-center gap-2 text-xs text-[#717d8a]">
                  <Phone className="w-3.5 h-3.5" />
                  <span className="break-all">{lead.phone}</span>
                </div>
              )}

              {/* Checklist Items */}
              <div className="pt-2 space-y-1.5 border-t border-[#eaecee]">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-[#242d35]">Price Shared?</span>
                  {checklist.priceShared ? (
                    <div className="flex items-center gap-1 text-[#4CAF50]">
                      <Check className="w-3.5 h-3.5" />
                      <span>Yes</span>
                </div>
                  ) : (
                    <div className="flex items-center gap-1 text-[#F44336]">
                      <X className="w-3.5 h-3.5" />
                      <span>No</span>
                </div>
                  )}
              </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-[#242d35]">Budget Confirmed?</span>
                  {checklist.budgetConfirmed ? (
                    <div className="flex items-center gap-1 text-[#4CAF50]">
                      <Check className="w-3.5 h-3.5" />
                      <span>Yes</span>
                  </div>
                  ) : (
                    <div className="flex items-center gap-1 text-[#F44336]">
                      <X className="w-3.5 h-3.5" />
                      <span>No</span>
                </div>
              )}
                </div>
            </div>

              {/* Assigned Executive */}
              {lead.assigned_user && (
                <div className="flex items-center gap-2 pt-2">
                        {lead.assigned_user.profile_image_url ? (
                          <Image
                            src={lead.assigned_user.profile_image_url}
                            alt={lead.assigned_user.name}
                      width={24}
                      height={24}
                      className="w-6 h-6 rounded-full object-cover"
                          />
                        ) : (
                    <div className="w-6 h-6 rounded-full bg-[#de0510] flex items-center justify-center text-white text-[10px] font-medium">
                            {lead.assigned_user.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                  <div>
                    <p className="text-xs font-medium text-[#242d35]">{lead.assigned_user.name}</p>
                    <p className="text-[10px] text-[#717d8a]">Sales Executive</p>
                      </div>
                      </div>
                  )}
                </div>

            {/* CARD FOOTER - Action Buttons */}
            <div className="px-4 py-3 bg-[#fafafa] border-t border-[#eaecee]">
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    window.location.href = `tel:${lead.phone}`
                  }}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 bg-[#2196F3] text-white rounded-md text-[10px] font-medium hover:bg-[#1976D2] transition-colors"
                >
                  <Phone className="w-3 h-3" />
                  <span>Call</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    const whatsappUrl = `https://wa.me/${lead.phone.replace(/\D/g, '')}`
                    window.open(whatsappUrl, '_blank')
                  }}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 bg-[#25D366] text-white rounded-md text-[10px] font-medium hover:bg-[#20BA5A] transition-colors"
                >
                  <MessageCircle className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    router.push(`/leads/${lead.id}`)
                  }}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 bg-[#ed1b24] text-white rounded-md text-[10px] font-medium hover:bg-[#c0040e] transition-colors"
                >
                  <span>View Details</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    router.push(`/leads/${lead.id}`)
                  }}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 bg-white border border-[#eaecee] text-[#717d8a] rounded-md text-[10px] font-medium hover:bg-[#f5f5f5] transition-colors"
                >
                  <FileText className="w-3 h-3" />
                  <span>{notesCount} Notes</span>
                </button>
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
      case 'date': return lead.created_at
      case 'name': return lead.name
      case 'car_model': return getVehicleName(lead)
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
    const isWarm = lead.interest_level === 'warm'
    
    if (isHot) {
      return <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-[#E6FBD9] text-[#2BA52E]">High</span>
    } else if (isWarm) {
      return <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-[#FFF4E6] text-[#FF9500]">Medium</span>
    } else {
      return <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-[#E0E0E0] text-[#757575]">Low</span>
    }
  }

  // Get budget/amount from meta_data
  function getBudget(lead: Lead): string {
    if (lead.meta_data?.payment_amount) {
      return `$${Number(lead.meta_data.payment_amount).toLocaleString()}`
    }
    if (lead.meta_data?.budget_range) {
      return String(lead.meta_data.budget_range)
    }
    return ''
  }

  // Get column header color based on stage
  function getColumnHeaderColor(groupKey: string): string {
    const keyLower = groupKey.toLowerCase()
    if (keyLower === 'new') {
      return 'bg-[#E3F2FD] text-[#2196F3]'
    } else if (keyLower.includes('review')) {
      return 'bg-[#FFF4E6] text-[#FF9500]'
    } else if (keyLower.includes('negotiation')) {
      return 'bg-[#FFE8D7] text-[#FF513A]'
    } else if (keyLower.includes('qualified')) {
      return 'bg-[#E6FBD9] text-[#2BA52E]'
    }
    return 'bg-gray-100 text-gray-700'
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
          const headerColor = getColumnHeaderColor(groupKey)
          
          return (
            <div
              key={groupKey}
              className={`flex-shrink-0 w-[280px] bg-gray-50 rounded-lg ${
                isDraggedOver ? 'bg-blue-50 border-2 border-blue-300' : ''
              }`}
              onDragOver={(e) => handleDragOver(e, groupKey)}
              onDrop={(e) => handleDrop(e, groupKey)}
            >
              {/* Column Header */}
              <div className={`px-4 py-3 rounded-t-lg ${headerColor}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{groupKey}</h3>
                  <span className="text-xs font-medium bg-white/50 px-2 py-0.5 rounded-full">
                  {groupLeadsList?.length || 0}
                </span>
                </div>
              </div>
              
              {/* Cards Container */}
              <div className="p-3 space-y-3 min-h-[100px]">
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
                  const lastContact = getTimeAgo(lead.first_contact_at || lead.updated_at)
                  
                  return (
                    <div
                      key={lead.id}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, lead)}
                      onDragEnd={handleDragEnd}
                      onClick={() => router.push(`/leads/${lead.id}`)}
                      className="bg-white rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-[#eaecee]"
                    >
                      {/* Name and Product */}
                      <div className="mb-2">
                        <h4 className="text-sm font-semibold text-[#242d35] truncate mb-0.5">{lead.name}</h4>
                          {vehicleName && (
                          <p className="text-xs text-[#717d8a] truncate">{vehicleName}</p>
                        )}
                      </div>
                      
                      {/* Price */}
                      {budget && budget !== '' && (
                        <div className="mb-2">
                          <span className="text-sm font-semibold text-[#242d35]">{budget}</span>
                        </div>
                      )}
                      
                      {/* Last Contact */}
                      <div className="mb-2 flex items-center gap-1.5 text-xs text-[#717d8a]">
                        <Calendar className="w-3 h-3" />
                        <span>Last contact: {lastContact}</span>
                      </div>
                      
                      {/* Assigned Agent and Priority */}
                      <div className="flex items-center justify-between pt-2 border-t border-[#eaecee]">
                        <div className="flex items-center gap-2">
                          {lead.assigned_user ? (
                            <>
                              {lead.assigned_user.profile_image_url ? (
                                <Image
                                  src={lead.assigned_user.profile_image_url}
                                  alt={lead.assigned_user.name}
                                  width={20}
                                  height={20}
                                  className="w-5 h-5 rounded-full object-cover"
                                />
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-[#de0510] flex items-center justify-center text-white text-[10px] font-medium">
                                  {lead.assigned_user.name.charAt(0).toUpperCase()}
                            </div>
                              )}
                              <span className="text-xs text-[#242d35] font-medium truncate max-w-[100px]">
                                {lead.assigned_user.name}
                              </span>
                            </>
                          ) : (
                            <span className="text-xs text-[#717d8a]">Unassigned</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {getPriorityBadge(lead)}
                          {isHot ? (
                            <TrendingUp className="w-3.5 h-3.5 text-[#ed1b24]" />
                          ) : (
                            <Snowflake className="w-3.5 h-3.5 text-[#64B5F6]" />
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
  const pathname = usePathname()
  const { loading: authLoading, userId, role, profile } = useAuthContext()
  const userRole = role?.name ?? null
  const userPermissions = role?.permissions ?? []
  const [leads, setLeads] = useState<Lead[]>([])
  const [allLeads, setAllLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [userRoleState, setUserRoleState] = useState<string | null>(null)
  const [teleCallers, setTeleCallers] = useState<TeleCaller[]>([])
  const [stats, setStats] = useState<LeadStats>({ untouched: 0, hotLeads: 0, conversions: 0, discarded: 0 })
  type QuickFilter = null | 'untouched' | 'contacted' | 'qualified' | 'hot' | 'conversions' | 'discarded'
  const [activeQuickFilter, setActiveQuickFilter] = useState<QuickFilter>(null)
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
  const [sortColumn, setSortColumn] = useState<string>('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false)
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false)
  
  // Mobile modals state
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false)
  const [mobileSortOpen, setMobileSortOpen] = useState(false)
  const [showFollowupsModal, setShowFollowupsModal] = useState(false)
  const [selectedLeadForFollowups, setSelectedLeadForFollowups] = useState<Lead | null>(null)
  const [leadFollowups, setLeadFollowups] = useState<any[]>([])
  const [loadingFollowups, setLoadingFollowups] = useState(false)
  const [leadFollowupsCounts, setLeadFollowupsCounts] = useState<Record<string, number>>({})
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [selectedLeadForEmail, setSelectedLeadForEmail] = useState<Lead | null>(null)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  
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
    { key: 'date', label: 'Date', visible: true, width: 110 },
    { key: 'name', label: 'Name', visible: true, width: 180 },
    { key: 'car_model', label: 'Car model', visible: true, width: 130 },
    { key: 'interest', label: 'Interested product', visible: true, width: 170 },
    { key: 'status', label: 'Lead stage', visible: true, width: 130 },
    { key: 'interest_level', label: 'Lead type', visible: true, width: 120 },
    { key: 'source', label: 'Source', visible: true, width: 120 },
    { key: 'assigned_to', label: 'Assigned to', visible: true, width: 180 },
    { key: 'last_contacted', label: 'Last contacted', visible: true, width: 140 },
    { key: 'phone', label: 'Mobile number', visible: true, width: 160 },
  ]

  const [columns, setColumns] = useState<ColumnConfig[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('leads-table-columns')
      if (saved) {
        try {
          const savedColumns = JSON.parse(saved)
          // Filter to only include columns that are in defaultColumns
          const validColumnKeys = new Set(defaultColumns.map(col => col.key))
          const filteredColumns = savedColumns.filter((col: ColumnConfig) => validColumnKeys.has(col.key))
          
          // Merge with defaultColumns to ensure all default columns are present with correct properties
          const mergedColumns = defaultColumns.map(defaultCol => {
            const savedCol = filteredColumns.find((col: ColumnConfig) => col.key === defaultCol.key)
            if (savedCol) {
              // Use saved column but ensure it has all required properties
              return {
                ...defaultCol,
                visible: savedCol.visible !== undefined ? savedCol.visible : defaultCol.visible,
                width: savedCol.width || defaultCol.width
              }
            }
            return defaultCol
          })
          
          return mergedColumns
        } catch (e) {
          return defaultColumns
        }
      }
    }
    return defaultColumns
  })

  const [customizeModalOpen, setCustomizeModalOpen] = useState(false)
  const [customizeMode, setCustomizeMode] = useState<'select' | 'adjust-width' | null>(null)
  const [resizingColumn, setResizingColumn] = useState<string | null>(null)
  const [resizeStartX, setResizeStartX] = useState(0)
  const [resizeStartWidth, setResizeStartWidth] = useState(0)

  // Container customization state
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false)
  const [containerCustomizeOpen, setContainerCustomizeOpen] = useState(false)
  const [containerStyles, setContainerStyles] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('leads-container-styles')
      if (saved) {
        try {
          return JSON.parse(saved)
        } catch (e) {
          return {
            containerColor: '#ffffff',
            iconColor: '#4b5563', // gray-700
            textColor: '#111827', // gray-900
            opacity: 1,
            backgroundColor: '#ffffff', // Base color, opacity handled separately
          }
        }
      }
    }
    return {
      containerColor: '#ffffff',
      iconColor: '#4b5563', // gray-700
      textColor: '#111827', // gray-900
      opacity: 1,
      backgroundColor: '#ffffff', // Base color, opacity handled separately
    }
  })

  // Function to fetch followups for a specific lead
  async function fetchLeadFollowups(leadId: string) {
    setLoadingFollowups(true)
    try {
      const response = await fetch(`/api/followups?leadId=${leadId}`)
      if (response.ok) {
        const data = await response.json()
        setLeadFollowups(data.followUps || [])
      }
    } catch (error) {
      console.error('Failed to fetch followups:', error)
    } finally {
      setLoadingFollowups(false)
    }
  }

  // Function to handle email send
  async function handleSendEmail() {
    if (!selectedLeadForEmail || !selectedLeadForEmail.email) {
      alert('No email address available for this lead')
      return
    }

    // Create mailto link with subject and body
    const subject = encodeURIComponent(emailSubject || '')
    const body = encodeURIComponent(emailBody || '')
    const mailtoLink = `mailto:${selectedLeadForEmail.email}?subject=${subject}&body=${body}`
    
    window.location.href = mailtoLink
    setShowEmailModal(false)
    setEmailSubject('')
    setEmailBody('')
    setSelectedLeadForEmail(null)
  }

  // Redirect when not authenticated; rely on AuthProvider so account switch updates without refresh.
  useEffect(() => {
    if (authLoading) return
    if (!userId) {
      router.push('/login')
      return
    }
    setUserRoleState(role?.name ?? null)
    if (role?.name === 'admin' || role?.name === 'super_admin') {
      fetchTeleCallers()
    }
  }, [authLoading, userId, role?.name, router])

  // Fetch leads when user is ready (and when userId changes, e.g. after switching account).
  useEffect(() => {
    if (authLoading || !userId) return
    fetchLeads()
  }, [authLoading, userId])

  // Handle scroll to hide stats cards and stick toolbar
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const handleScroll = () => {
      const scrollY = window.scrollY
      const statsCards = document.getElementById('stats-cards')
      const searchToolbar = document.getElementById('search-toolbar')
      
      if (statsCards && searchToolbar) {
        if (scrollY > 100) {
          statsCards.style.transform = 'translateY(-100%)'
          statsCards.style.opacity = '0'
          statsCards.style.position = 'absolute'
          statsCards.style.pointerEvents = 'none'
        } else {
          statsCards.style.transform = 'translateY(0)'
          statsCards.style.opacity = '1'
          statsCards.style.position = 'relative'
          statsCards.style.pointerEvents = 'auto'
        }
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Fetch followups counts for visible leads only (optimized)
  useEffect(() => {
    if (leads.length === 0) return
    
    async function fetchVisibleFollowupsCounts() {
      try {
        const counts: Record<string, number> = {}
        const leadIds = leads.map(lead => lead.id)
        
        // Fetch followups for visible leads only
        const promises = leadIds.map(async (leadId) => {
          try {
            const response = await fetch(`/api/followups?leadId=${leadId}`)
            if (response.ok) {
              const data = await response.json()
              return { leadId, count: data.followUps?.length || 0 }
            }
            return { leadId, count: 0 }
          } catch (error) {
            return { leadId, count: 0 }
          }
        })
        
        const results = await Promise.all(promises)
        const newCounts: Record<string, number> = {}
        results.forEach(({ leadId, count }) => {
          newCounts[leadId] = count
        })
        
        setLeadFollowupsCounts(prev => ({ ...prev, ...newCounts }))
      } catch (error) {
        console.error('Failed to fetch followups counts:', error)
      }
    }
    
    fetchVisibleFollowupsCounts()
  }, [leads])

  // Save container styles to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('leads-container-styles', JSON.stringify(containerStyles))
    }
  }, [containerStyles])
  
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
  }, [filterConditions, sortColumn, sortDirection, activeQuickFilter])

  // Clean up columns on mount to ensure only valid columns are shown
  useEffect(() => {
    const validColumnKeys = new Set(defaultColumns.map(col => col.key))
    const hasInvalidColumns = columns.some(col => !validColumnKeys.has(col.key))
    const hasMissingColumns = defaultColumns.some(defaultCol => !columns.find(col => col.key === defaultCol.key))
    
    if (hasInvalidColumns || hasMissingColumns) {
      // Filter to only include valid columns and merge with defaults
      const validColumns = defaultColumns.map(defaultCol => {
        const existingCol = columns.find(col => col.key === defaultCol.key)
        if (existingCol) {
          return {
            ...defaultCol,
            visible: existingCol.visible !== undefined ? existingCol.visible : defaultCol.visible,
            width: existingCol.width || defaultCol.width
          }
        }
        return defaultCol
      })
      setColumns(validColumns)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run on mount

  // Save column preferences to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Only save valid columns
      const validColumnKeys = new Set(defaultColumns.map(col => col.key))
      const validColumns = columns.filter(col => validColumnKeys.has(col.key))
      if (validColumns.length === defaultColumns.length) {
        localStorage.setItem('leads-table-columns', JSON.stringify(validColumns))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        conversions: conversionRate,
        discarded
      })
      
      // Store detailed stats for potential future use
      // Note: stats interface may need to be extended to include all buckets
    }
  }, [allLeads])

  // Filter, sort and paginate leads
  useEffect(() => {
    let filtered = [...allLeads]
    
    // Apply quick filter from summary card click
    if (activeQuickFilter === 'untouched') {
      filtered = filtered.filter(lead =>
        lead.status === LEAD_STATUS.NEW && !lead.first_contact_at
      )
    } else if (activeQuickFilter === 'contacted') {
      filtered = filtered.filter(lead => lead.status === LEAD_STATUS.CONTACTED)
    } else if (activeQuickFilter === 'qualified') {
      filtered = filtered.filter(lead =>
        lead.status === LEAD_STATUS.QUALIFIED || lead.interest_level === 'hot'
      )
    } else if (activeQuickFilter === 'hot') {
      filtered = filtered.filter(lead => lead.interest_level === 'hot')
    } else if (activeQuickFilter === 'conversions') {
      filtered = filtered.filter(lead =>
        lead.status === LEAD_STATUS.CONVERTED || lead.status === LEAD_STATUS.DEAL_WON
      )
    } else if (activeQuickFilter === 'discarded') {
      filtered = filtered.filter(lead =>
        lead.status === LEAD_STATUS.LOST || lead.status === LEAD_STATUS.DISCARDED
      )
    }
    // activeQuickFilter === null -> show all

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(lead => {
        try {
          const vehicleName = (getVehicleName(lead) || '').toLowerCase()
          const productInterest = (getProductInterest(lead) || '').toLowerCase()
          const name = (lead.name || '').toLowerCase()
          const phone = (lead.phone || '').toString()
          const email = (lead.email || '').toLowerCase()
          const requirement = (lead.requirement || '').toLowerCase()
          
          return (
            name.includes(query) ||
            phone.includes(query) ||
            email.includes(query) ||
            requirement.includes(query) ||
            vehicleName.includes(query) ||
            productInterest.includes(query)
          )
        } catch (error) {
          // Fallback if helper functions fail
          const name = (lead.name || '').toLowerCase()
          const phone = (lead.phone || '').toString()
          const email = (lead.email || '').toLowerCase()
          const requirement = (lead.requirement || '').toLowerCase()
          
          return (
            name.includes(query) ||
            phone.includes(query) ||
            email.includes(query) ||
            requirement.includes(query)
          )
        }
      })
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
      if (sortColumn === 'date' || sortColumn.includes('_at') || sortColumn === 'created_at' || sortColumn === 'updated_at' || sortColumn === 'first_contact_at' || sortColumn === 'converted_at') {
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
  }, [allLeads, searchQuery, filterConditions, sortColumn, sortDirection, currentPage, itemsPerPage, viewMode, activeQuickFilter])
  
  // Helper function to get column value
  function getColumnValue(lead: Lead, column: string): any {
    switch (column) {
      case 'date': return lead.created_at
      case 'name': return lead.name
      case 'car_model': return getVehicleName(lead)
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
      case 'last_contacted': return getLastContactedTime(lead)
      case 'lead_id': return lead.lead_id
      case 'budget_range': return lead.meta_data?.budget_range || null
      case 'timeline': return lead.meta_data?.timeline || null
      case 'payment_status': return lead.meta_data?.payment_status || null
      case 'payment_amount': return lead.meta_data?.payment_amount || null
      case 'advance_amount': return lead.meta_data?.advance_amount || null
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

  // Get all filtered & sorted leads (without pagination) for export
  function getFilteredLeadsForExport(): Lead[] {
    let filtered = [...allLeads]

    // Apply quick filter
    if (activeQuickFilter === 'untouched') {
      filtered = filtered.filter(lead =>
        lead.status === LEAD_STATUS.NEW && !lead.first_contact_at
      )
    } else if (activeQuickFilter === 'contacted') {
      filtered = filtered.filter(lead => lead.status === LEAD_STATUS.CONTACTED)
    } else if (activeQuickFilter === 'qualified') {
      filtered = filtered.filter(lead =>
        lead.status === LEAD_STATUS.QUALIFIED || lead.interest_level === 'hot'
      )
    } else if (activeQuickFilter === 'hot') {
      filtered = filtered.filter(lead => lead.interest_level === 'hot')
    } else if (activeQuickFilter === 'conversions') {
      filtered = filtered.filter(lead =>
        lead.status === LEAD_STATUS.CONVERTED || lead.status === LEAD_STATUS.DEAL_WON
      )
    } else if (activeQuickFilter === 'discarded') {
      filtered = filtered.filter(lead =>
        lead.status === LEAD_STATUS.LOST || lead.status === LEAD_STATUS.DISCARDED
      )
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter((lead) =>
        lead.name.toLowerCase().includes(query) ||
        lead.phone.includes(query) ||
        lead.email?.toLowerCase().includes(query) ||
        lead.requirement?.toLowerCase().includes(query) ||
        getVehicleName(lead).toLowerCase().includes(query) ||
        getProductInterest(lead).toLowerCase().includes(query)
      )
    }

    // Apply active filter conditions
    const activeConditions = filterConditions.filter((condition) => {
      if (condition.operator === 'is_empty' || condition.operator === 'is_not_empty') {
        return true
      }
      return condition.value && condition.value.trim() !== ''
    })

    if (activeConditions.length > 0) {
      filtered = filtered.filter((lead) => {
        let result = true

        for (let i = 0; i < activeConditions.length; i++) {
          const condition = activeConditions[i]
          const columnValue = getColumnValue(lead, condition.column)
          const conditionResult = evaluateCondition(columnValue, condition.operator, condition.value)

          if (i === 0) {
            result = conditionResult
          } else {
            const logic = condition.logic || 'AND'
            result = logic === 'AND' ? result && conditionResult : result || conditionResult
          }
        }

        return result
      })
    }

    // Apply sorting
    filtered.sort((a, b) => {
      const aValue = getColumnValue(a, sortColumn)
      const bValue = getColumnValue(b, sortColumn)

      if (aValue === null || aValue === undefined) return sortDirection === 'asc' ? -1 : 1
      if (bValue === null || bValue === undefined) return sortDirection === 'asc' ? 1 : -1

      if (
        sortColumn === 'date' ||
        sortColumn.includes('_at') ||
        sortColumn === 'created_at' ||
        sortColumn === 'updated_at' ||
        sortColumn === 'first_contact_at' ||
        sortColumn === 'converted_at'
      ) {
        const aDate = new Date(aValue as string).getTime()
        const bDate = new Date(bValue as string).getTime()
        return sortDirection === 'asc' ? aDate - bDate : bDate - aDate
      }

      if (sortColumn === 'payment_amount' || sortColumn === 'advance_amount') {
        const aNum = Number(aValue) || 0
        const bNum = Number(bValue) || 0
        return sortDirection === 'asc' ? aNum - bNum : bNum - aNum
      }

      const aStr = String(aValue).toLowerCase()
      const bStr = String(bValue).toLowerCase()
      if (sortDirection === 'asc') {
        return aStr < bStr ? -1 : aStr > bStr ? 1 : 0
      } else {
        return aStr > bStr ? -1 : aStr < bStr ? 1 : 0
      }
    })

    return filtered
  }

  // Export all filtered leads as CSV (ignores pagination)
  function handleExportLeads() {
    if (typeof window === 'undefined') return

    const filtered = getFilteredLeadsForExport()

    if (!filtered.length) {
      alert('No leads to export for the current filters.')
      return
    }

    const header = [
      'Lead ID',
      'Name',
      'Phone',
      'Email',
      'Source',
      'Status',
      'Interest Level',
      'Assigned To',
      'Created At',
    ]

    const rows = filtered.map((lead) => [
      lead.lead_id,
      lead.name,
      lead.phone,
      lead.email ?? '',
      lead.source,
      lead.status,
      lead.interest_level ?? '',
      lead.assigned_user?.name ?? '',
      lead.created_at,
    ])

    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((value) => {
            const v = String(value ?? '')
            if (v.includes(',') || v.includes('"') || v.includes('\n')) {
              return `"${v.replace(/"/g, '""')}"`
            }
            return v
          })
          .join(',')
      )
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
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
    const dateColumns = ['date', 'created_at', 'updated_at', 'first_contact_at', 'converted_at']
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

  // Get raw product/interest string (requirement or meta) — may contain "| Car Model: X"
  function getRawProductInterest(lead: Lead): string {
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
    }
    return ''
  }

  // Extract "Car Model: X" from a string (e.g. "paint protection film | Car Model: creta" -> "creta")
  function extractCarModelFromString(s: string): string {
    if (!s || typeof s !== 'string') return ''
    const match = s.match(/\|\s*Car Model:\s*([^|]+)/i) || s.match(/Car Model:\s*([^|]+)/i)
    return match ? match[1].trim() : ''
  }

  // Strip "| Car Model: X" from product string so only the product part is shown
  function stripCarModelFromProductString(s: string): string {
    if (!s || typeof s !== 'string') return ''
    return s.replace(/\|\s*Car Model:\s*[^|]+/gi, '').replace(/Car Model:\s*[^|]+/gi, '').trim()
  }

  // Get car model: from meta_data first, else from product string (e.g. "| Car Model: creta")
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
    const fromProduct = extractCarModelFromString(getRawProductInterest(lead))
    return fromProduct || ''
  }

  // Get product/service interest only — car model is shown in Car model column
  function getProductInterest(lead: Lead): string {
    const raw = getRawProductInterest(lead)
    return stripCarModelFromProductString(raw)
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
        await fetchLeads()
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
        await fetchLeads()
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
        await fetchLeads()
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

  const isAdmin = (userRole || userRoleState) === 'admin' || (userRole || userRoleState) === 'super_admin'
  
  // Helper function for search (safe version)
  const searchLeads = (leads: Lead[], query: string): Lead[] => {
    if (!query.trim()) return leads
    const q = query.toLowerCase()
    return leads.filter(lead => {
      try {
        const vehicleName = (getVehicleName(lead) || '').toLowerCase()
        const productInterest = (getProductInterest(lead) || '').toLowerCase()
        const name = (lead.name || '').toLowerCase()
        const phone = (lead.phone || '').toString()
        const email = (lead.email || '').toLowerCase()
        const requirement = (lead.requirement || '').toLowerCase()
        
        return (
          name.includes(q) ||
          phone.includes(q) ||
          email.includes(q) ||
          requirement.includes(q) ||
          vehicleName.includes(q) ||
          productInterest.includes(q)
        )
      } catch (error) {
        // Fallback if helper functions fail
        const name = (lead.name || '').toLowerCase()
        const phone = (lead.phone || '').toString()
        const email = (lead.email || '').toLowerCase()
        const requirement = (lead.requirement || '').toLowerCase()
        
        return (
          name.includes(q) ||
          phone.includes(q) ||
          email.includes(q) ||
          requirement.includes(q)
        )
      }
    })
  }
  
  const totalPages = Math.ceil(
    (searchQuery.trim() 
      ? searchLeads(allLeads, searchQuery).length
      : allLeads.length) / itemsPerPage
  )

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-lg">Loading...</div>
        </div>
      </Layout>
    )
  }

  // Calculate stats for mobile view
  const untouchedLeads = allLeads.filter(lead => !lead.first_contact_at).length
  const contactedLeads = allLeads.filter(lead => lead.status === 'contacted' || lead.first_contact_at).length
  const qualifiedLeads = allLeads.filter(lead => lead.status === 'qualified' || lead.interest_level === 'hot').length
  const convertedLeads = allLeads.filter(lead => lead.status === 'converted' || lead.status === 'deal_won').length
  const discardedLeads = allLeads.filter(lead => lead.status === LEAD_STATUS.LOST || lead.status === LEAD_STATUS.DISCARDED).length
  const conversionRate = allLeads.length > 0 ? Math.round((convertedLeads / allLeads.length) * 100) : 0

  // Filter menu items based on user role and permissions (same logic as Sidebar)
  const filteredMenuItems = SIDEBAR_MENU_ITEMS.filter((item) => {
    // Super admin and admin can see all items
    if (userRole === 'super_admin' || userRole === 'admin') {
      return true
    }

    // Items that don't require permissions are visible to all authenticated users
    if (!item.requiresPermissions) {
      return true
    }

    // If item has specific roles, check if user role matches
    if (item.roles && userRole && item.roles.includes(userRole)) {
      return true
    }

    // Check if user has required permissions
    const hasReadPermission = userPermissions.includes(`${item.resource}.read`)
    const hasManagePermission = userPermissions.includes(`${item.resource}.manage`)
    
    return hasReadPermission || hasManagePermission
  })

  return (
    <>
      {/* Mobile View - shown only on small screens, without Layout sidebar */}
      <div className="md:hidden bg-[#f5f5f5] min-h-screen pb-20 relative">
        <MobileHeader 
          title="My Leads"
          showAddButton={isAdmin}
          onAddClick={() => setNewLeadModalOpen(true)}
        />

        {/* Stats Cards - 2x2 Grid, tap to filter */}
        <div className="grid grid-cols-2 gap-3 p-4 pt-[81px] transition-transform duration-300" id="stats-cards">
          {/* Untouched Card */}
          <button
            type="button"
            onClick={() => setActiveQuickFilter(prev => prev === 'untouched' ? null : 'untouched')}
            className={`rounded-xl p-4 relative h-[125px] text-left w-full border transition-all ${
              activeQuickFilter === 'untouched' ? 'bg-red-50 border-red-300 ring-2 ring-red-400' : 'bg-white border-[#eaecee]'
            }`}
          >
            <p className="text-2xl font-semibold text-[#242d35] mb-1">{untouchedLeads}</p>
            <p className="text-sm font-semibold text-[#373f47] mb-2">Untouched</p>
            <p className="text-[6px] text-[#717d8a] leading-tight mb-2">New leads pending first call</p>
            <div className="absolute bottom-2 right-2 flex items-center justify-center">
              <div className="relative w-[58px] h-[58px]">
                <svg className="w-[58px] h-[58px] transform -rotate-90" viewBox="0 0 58 58">
                  <circle cx="29" cy="29" r="26" fill="none" stroke="#f3f4f6" strokeWidth="4" />
                  <circle cx="29" cy="29" r="26" fill="none" stroke="#FF513A" strokeWidth="4" strokeDasharray={`${Math.min(100, (untouchedLeads / Math.max(allLeads.length, 1)) * 100) * 163.36 / 100} 163.36`} strokeLinecap="round" />
                </svg>
                <TrendingDown size={14} className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[#FF513A]" />
              </div>
            </div>
          </button>

          {/* Contacted Card */}
          <button
            type="button"
            onClick={() => setActiveQuickFilter(prev => prev === 'contacted' ? null : 'contacted')}
            className={`rounded-xl p-4 relative h-[125px] text-left w-full border transition-all ${
              activeQuickFilter === 'contacted' ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400' : 'bg-white border-[#eaecee]'
            }`}
          >
            <p className="text-2xl font-semibold text-[#242d35] mb-1">{contactedLeads}</p>
            <p className="text-sm font-semibold text-[#373f47] mb-2">Contacted</p>
            <p className="text-[6px] text-[#717d8a] leading-tight mb-2">Leads in follow-up</p>
            <div className="absolute bottom-2 right-2 flex items-center justify-center">
              <div className="relative w-[58px] h-[58px]">
                <svg className="w-[58px] h-[58px] transform -rotate-90" viewBox="0 0 58 58">
                  <circle cx="29" cy="29" r="26" fill="none" stroke="#f3f4f6" strokeWidth="4" />
                  <circle cx="29" cy="29" r="26" fill="none" stroke="#FFC168" strokeWidth="4" strokeDasharray={`${Math.min(100, (contactedLeads / Math.max(allLeads.length, 1)) * 100) * 163.36 / 100} 163.36`} strokeLinecap="round" />
                </svg>
                <TrendingDown size={14} className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[#FFC168]" />
              </div>
            </div>
          </button>

          {/* Qualified Card */}
          <button
            type="button"
            onClick={() => setActiveQuickFilter(prev => prev === 'qualified' ? null : 'qualified')}
            className={`rounded-xl p-4 relative h-[125px] text-left w-full border transition-all ${
              activeQuickFilter === 'qualified' ? 'bg-green-50 border-green-300 ring-2 ring-green-400' : 'bg-white border-[#eaecee]'
            }`}
          >
            <p className="text-2xl font-semibold text-[#242d35] mb-1">{qualifiedLeads}</p>
            <p className="text-sm font-semibold text-[#373f47] mb-2">Qualified</p>
            <p className="text-[6px] text-[#717d8a] leading-tight mb-2">Interested leads ({allLeads.filter(l => l.interest_level === 'hot').length} Hot)</p>
            <div className="absolute bottom-2 right-2 flex items-center justify-center">
              <div className="relative w-[58px] h-[58px]">
                <svg className="w-[58px] h-[58px] transform -rotate-90" viewBox="0 0 58 58">
                  <circle cx="29" cy="29" r="26" fill="none" stroke="#f3f4f6" strokeWidth="4" />
                  <circle cx="29" cy="29" r="26" fill="none" stroke="#2BA52E" strokeWidth="4" strokeDasharray={`${Math.min(100, (qualifiedLeads / Math.max(allLeads.length, 1)) * 100) * 163.36 / 100} 163.36`} strokeLinecap="round" />
                </svg>
                <TrendingUp size={14} className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[#2BA52E]" />
              </div>
            </div>
          </button>

          {/* Conversions Card */}
          <button
            type="button"
            onClick={() => setActiveQuickFilter(prev => prev === 'conversions' ? null : 'conversions')}
            className={`rounded-xl p-4 relative h-[125px] text-left w-full border transition-all ${
              activeQuickFilter === 'conversions' ? 'bg-green-50 border-green-300 ring-2 ring-green-400' : 'bg-white border-[#eaecee]'
            }`}
          >
            <p className="text-2xl font-semibold text-[#242d35] mb-1">{conversionRate}%</p>
            <p className="text-sm font-semibold text-[#373f47] mb-2">Conversions</p>
            <p className="text-[6px] text-[#717d8a] leading-tight mb-2">{convertedLeads} deals won</p>
            <div className="absolute bottom-2 right-2 flex items-center justify-center">
              <div className="relative w-[58px] h-[58px]">
                <svg className="w-[58px] h-[58px] transform -rotate-90" viewBox="0 0 58 58">
                  <circle
                    cx="29"
                    cy="29"
                    r="26"
                    fill="none"
                    stroke="#f3f4f6"
                    strokeWidth="4"
                  />
                  <circle
                    cx="29"
                    cy="29"
                    r="26"
                    fill="none"
                    stroke="#FF513A"
                    strokeWidth="4"
                    strokeDasharray={`${Math.min(100, conversionRate) * 163.36 / 100} 163.36`}
                    strokeLinecap="round"
                  />
                </svg>
                <TrendingDown size={14} className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[#FF513A]" />
              </div>
            </div>
          </button>
        </div>

        {/* Search Bar and Filter - Sticky when scrolled */}
        <div className="sticky top-[65px] z-30 px-4 mb-3 bg-[#f5f5f5] pt-2 transition-all duration-300" id="search-toolbar">
          <div className="bg-black border border-[#eaecee] rounded-xl h-[49px] flex items-center px-3 gap-2">
            <div className="bg-white border border-[#313131] rounded-full h-[36px] flex-1 flex items-center pl-5 pr-3 gap-2">
              <Search size={16} className="text-[#717d8a]" />
              <input
                type="text"
                placeholder="Search leads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-[12px] text-[#717d8a] focus:outline-none"
              />
            </div>
            {/* Filter Button */}
            <button 
              onClick={() => setMobileFilterOpen(true)}
              className={`bg-[#222] border border-[#313131] rounded-full h-[33px] w-[33px] flex items-center justify-center ${filterConditions.length > 0 ? 'bg-[#ed1b24] border-[#ed1b24]' : ''}`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M13 1H1L6 7.5V12L8 13V7.5L13 1Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {/* Sort Button */}
            <button 
              onClick={() => setMobileSortOpen(true)}
              className="bg-[#222] border border-[#313131] rounded-full h-[33px] w-[33px] flex items-center justify-center"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 2V12M4 2L1 5M4 2L7 5M10 2V12M10 12L13 9M10 12L7 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {/* Bin/Trash Button for Discarded Filter */}
            <button 
              onClick={(e) => {
                e.stopPropagation()
                setActiveQuickFilter(prev => prev === 'discarded' ? null : 'discarded')
              }}
              className={`bg-[#222] border border-[#313131] rounded-full h-[33px] w-[33px] flex items-center justify-center transition-colors ${activeQuickFilter === 'discarded' ? 'bg-[#ed1b24] border-[#ed1b24]' : ''}`}
            >
              <Trash2 size={14} className="text-white" />
            </button>
          </div>
        </div>

        {/* Leads List */}
        <div className="px-4 space-y-3 pb-4">
          {leads.slice(0, 20).map((lead) => {
            const vehicleName = getVehicleName(lead)
            const isHot = lead.interest_level === 'hot'
            const statusColor = lead.status.toLowerCase().includes('negotiation') 
              ? 'bg-[#fce4e0] text-[#dd3f3c]' 
              : lead.status.toLowerCase().includes('lost') || lead.status.toLowerCase().includes('discarded')
              ? 'bg-gray-100 text-gray-800'
              : 'bg-gray-100 text-gray-800'
            const interestColor = isHot 
              ? 'bg-[#fbf4d9] text-[#604927]' 
              : 'bg-gray-100 text-gray-800'
            const createdDate = lead.created_at ? new Date(lead.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }).replace(',', '') : ''
            const platform = lead.meta_data?.platform || lead.meta_data?.Platform

            return (
              <div
                key={lead.id}
                className="bg-white border border-[#eaecee] rounded-xl p-4"
              >
                {/* Header with name, vehicle, date, and icons */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0 pr-2">
                    <h3 className="text-base font-bold text-black mb-1 leading-tight">{lead.name}</h3>
                    {vehicleName && (
                      <p className="text-sm text-[#717d8a] leading-tight">{vehicleName}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {createdDate && (
                      <p className="text-xs text-[#393941] whitespace-nowrap">Date: {createdDate}</p>
                    )}
                    {platform && (
                      <div className="w-6 h-6 flex-shrink-0">
                        <SourceIcon platform={platform} source={lead.source} />
                      </div>
                    )}
                  {isHot && (
                      <TrendingUp size={22} className="text-[#de0510] flex-shrink-0" />
                  )}
                  </div>
                </div>

                {/* Status and Interest Badges */}
                <div className="flex items-center gap-2 mb-3">
                  <span className={`px-3 py-1.5 rounded-[3px] text-xs font-medium ${statusColor}`}>
                    {formatStageName(lead.status)}
                  </span>
                  <span className={`px-3 py-1.5 rounded-[3px] text-xs font-medium flex items-center gap-1.5 ${interestColor}`}>
                    {isHot ? (
                      <>
                        <TrendingUp size={14} className="text-[#de0510]" />
                        High
                      </>
                    ) : (
                      'Medium'
                    )}
                  </span>
                </div>

                {/* Contact Info */}
                <div className="flex items-center gap-4 mb-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Phone size={14} className="text-[#393941] flex-shrink-0" />
                    <p className="text-sm text-[#393941]">{lead.phone}</p>
                  </div>
                  {lead.email && (
                    <div className="flex items-center gap-2">
                      <Mail size={14} className="text-[#393941] flex-shrink-0" />
                      <p className="text-sm text-[#393941] break-all">{lead.email}</p>
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="h-[0.5px] bg-[#eaecee] mb-3"></div>

                {/* Assigned User and Time */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    {lead.assigned_user ? (
                      <>
                        <div className="relative flex-shrink-0">
                          <div className="w-9 h-9 rounded-full bg-[#ed1b24] flex items-center justify-center text-white text-xs font-medium">
                          {lead.assigned_user.profile_image_url ? (
                            <Image
                              src={lead.assigned_user.profile_image_url}
                              alt={lead.assigned_user.name}
                                width={36}
                                height={36}
                                className="w-9 h-9 rounded-full object-cover"
                            />
                          ) : (
                            lead.assigned_user.name.charAt(0).toUpperCase()
                          )}
                          </div>
                          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full"></div>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-black leading-tight">{lead.assigned_user.name}</p>
                          <p className="text-xs text-[#717d8a] leading-tight">Sales Executive</p>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-[#717d8a]">Unassigned</p>
                    )}
                  </div>
                  <p className="text-xs text-[#393941] whitespace-nowrap">{getTimeAgo(lead.first_contact_at || lead.updated_at)}</p>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2.5">
                  {/* Followups Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedLeadForFollowups(lead)
                      setShowFollowupsModal(true)
                      fetchLeadFollowups(lead.id)
                    }}
                    className="bg-[#fbf4d9] text-[#604927] px-4 py-2 rounded-[20px] text-xs font-medium flex items-center gap-2"
                  >
                    <Check size={14} />
                    <span>{leadFollowupsCounts[lead.id] || 0} Followup{leadFollowupsCounts[lead.id] !== 1 ? 's' : ''}</span>
                  </button>
                  {/* Call Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      window.location.href = `tel:${lead.phone}`
                    }}
                    className="bg-[#ed1b24] text-white rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0"
                  >
                    <Phone size={16} />
                  </button>
                  {/* Email Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedLeadForEmail(lead)
                      setEmailSubject('')
                      setEmailBody('')
                      setShowEmailModal(true)
                    }}
                    className="bg-black text-white rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0"
                  >
                    <Mail size={16} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Bottom Navigation */}
        <MobileBottomNav />

        {/* Mobile Filter Modal */}
        {mobileFilterOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
            <div className="bg-white rounded-t-2xl w-full max-h-[80vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Filter Leads</h3>
                <button onClick={() => setMobileFilterOpen(false)} className="p-2">
                  <X size={20} />
            </button>
              </div>
              <div className="p-4">
                {/* Use the same filter UI as desktop */}
                <div className="space-y-4">
                  {filterConditions.map((condition, index) => (
                    <div key={condition.id} className="flex gap-2 items-end">
                      <select
                        value={condition.column}
                        onChange={(e) => {
                          const updated = [...filterConditions]
                          updated[index].column = e.target.value
                          setFilterConditions(updated)
                        }}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="name">Name</option>
                        <option value="status">Lead Stage</option>
                        <option value="interest_level">Lead Type</option>
                        <option value="source">Source</option>
                        <option value="assigned_to">Assigned To</option>
                        <option value="phone">Phone</option>
                        <option value="email">Email</option>
                      </select>
                      <select
                        value={condition.operator}
                        onChange={(e) => {
                          const updated = [...filterConditions]
                          updated[index].operator = e.target.value
                          setFilterConditions(updated)
                        }}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="equals">Equals</option>
                        <option value="contains">Contains</option>
                        <option value="starts_with">Starts With</option>
                        <option value="is_empty">Is Empty</option>
                        <option value="is_not_empty">Is Not Empty</option>
                      </select>
                      {condition.operator !== 'is_empty' && condition.operator !== 'is_not_empty' && (
                        <input
                          type="text"
                          value={condition.value}
                          onChange={(e) => {
                            const updated = [...filterConditions]
                            updated[index].value = e.target.value
                            setFilterConditions(updated)
                          }}
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                          placeholder="Value"
                        />
                      )}
                      <button
                        onClick={() => {
                          setFilterConditions(filterConditions.filter((_, i) => i !== index))
                        }}
                        className="p-2 text-red-600"
                      >
                        <X size={18} />
            </button>
              </div>
                  ))}
                  <button
                    onClick={() => {
                      setFilterConditions([...filterConditions, {
                        id: Date.now().toString(),
                        column: 'name',
                        operator: 'contains',
                        value: '',
                        logic: 'AND'
                      }])
                    }}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700"
                  >
                    + Add Condition
                  </button>
                  <div className="flex gap-2 pt-4">
                    <button
                      onClick={() => {
                        setFilterConditions([])
                        setMobileFilterOpen(false)
                      }}
                      className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm"
                    >
                      Clear All
                    </button>
                    <button
                      onClick={() => setMobileFilterOpen(false)}
                      className="flex-1 bg-[#ed1b24] text-white rounded-lg px-4 py-2 text-sm"
                    >
                      Apply Filters
                    </button>
            </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Sort Modal */}
        {mobileSortOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
            <div className="bg-white rounded-t-2xl w-full max-h-[60vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Sort Leads</h3>
                <button onClick={() => setMobileSortOpen(false)} className="p-2">
                  <X size={20} />
            </button>
              </div>
              <div className="p-4 space-y-2">
                {[
                  { key: 'date', label: 'Date' },
                  { key: 'name', label: 'Name' },
                  { key: 'status', label: 'Lead Stage' },
                  { key: 'last_contacted', label: 'Last Contacted' },
                  { key: 'phone', label: 'Phone' },
                ].map((col) => (
                  <button
                    key={col.key}
                    onClick={() => {
                      setSortColumn(col.key)
                      setMobileSortOpen(false)
                    }}
                    className={`w-full text-left px-4 py-3 rounded-lg ${
                      sortColumn === col.key ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
                    }`}
                  >
                    {col.label}
                  </button>
                ))}
                <div className="border-t pt-4 mt-4">
                  <button
                    onClick={() => {
                      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
                    }}
                    className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-50"
                  >
                    Direction: {sortDirection === 'asc' ? 'Ascending ↑' : 'Descending ↓'}
            </button>
          </div>
        </div>
            </div>
          </div>
        )}

        {/* Followups Modal */}
        {showFollowupsModal && selectedLeadForFollowups && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
            <div className="bg-white rounded-t-2xl w-full max-h-[80vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Followups - {selectedLeadForFollowups.name}</h3>
                <button onClick={() => {
                  setShowFollowupsModal(false)
                  setSelectedLeadForFollowups(null)
                  setLeadFollowups([])
                }} className="p-2">
                  <X size={20} />
                </button>
              </div>
              <div className="p-4">
                {loadingFollowups ? (
                  <div className="text-center py-8">Loading followups...</div>
                ) : leadFollowups.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No followups found for this lead</div>
                ) : (
                  <div className="space-y-3">
                    {leadFollowups.map((followup: any) => (
                      <div key={followup.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-semibold text-sm">
                              Scheduled: {new Date(followup.scheduled_at).toLocaleString()}
                            </p>
                            {followup.completed_at && (
                              <p className="text-xs text-gray-600">
                                Completed: {new Date(followup.completed_at).toLocaleString()}
                              </p>
                            )}
                          </div>
                          <span className={`px-2 py-1 rounded text-xs ${
                            followup.status === 'done' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {followup.status === 'done' ? 'Completed' : 'Pending'}
                          </span>
                        </div>
                        {followup.notes && (
                          <p className="text-sm text-gray-700 mt-2">{followup.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Email Modal */}
        {showEmailModal && selectedLeadForEmail && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Send Email</h3>
                <button onClick={() => {
                  setShowEmailModal(false)
                  setSelectedLeadForEmail(null)
                  setEmailSubject('')
                  setEmailBody('')
                }} className="p-2">
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                  <input
                    type="email"
                    value={selectedLeadForEmail.email || ''}
                    disabled
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="Email subject"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed1b24]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                  <textarea
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    placeholder="Email message"
                    rows={6}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed1b24] resize-none"
                  />
                </div>
                <div className="flex gap-2 pt-4">
                  <button
                    onClick={() => {
                      setShowEmailModal(false)
                      setSelectedLeadForEmail(null)
                      setEmailSubject('')
                      setEmailBody('')
                    }}
                    className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendEmail}
                    className="flex-1 bg-[#ed1b24] text-white rounded-lg px-4 py-2 text-sm"
                  >
                    Send Email
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop View - shown on md and larger screens, with Layout sidebar */}
      <div className="hidden md:block">
        <Layout>
          <div className="p-4 md:p-6 lg:p-8 bg-gray-50 min-h-screen w-full">
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

          {/* Summary Cards - click to filter list */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            {/* Total Leads Card */}
            <button
              type="button"
              onClick={() => setActiveQuickFilter(null)}
              className={`rounded-lg shadow-sm p-6 flex items-center justify-between text-left transition-all ${
                activeQuickFilter === null ? 'bg-blue-50 ring-2 ring-blue-400' : 'bg-white hover:bg-gray-50'
              }`}
            >
              <div>
                <p className="text-base text-gray-500 mb-1">Total Leads</p>
                <p className="text-4xl font-bold text-gray-900">{allLeads.length}</p>
              </div>
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 transform -rotate-90">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="#f3f4f6" strokeWidth="6" />
                  <circle
                    cx="32" cy="32" r="28"
                    fill="none" stroke="#3b82f6" strokeWidth="6"
                    strokeDasharray={`${(allLeads.length > 0 ? 100 : 0) * 175.9 / 100} 175.9`}
                    strokeLinecap="round"
                  />
                </svg>
                <TrendingUp className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[#3b82f6]" size={20} />
              </div>
            </button>

            {/* Untouched Card */}
            <button
              type="button"
              onClick={() => setActiveQuickFilter(prev => prev === 'untouched' ? null : 'untouched')}
              className={`rounded-lg shadow-sm p-6 flex items-center justify-between text-left transition-all ${
                activeQuickFilter === 'untouched' ? 'bg-red-50 ring-2 ring-red-400' : 'bg-white hover:bg-gray-50'
              }`}
            >
              <div>
                <p className="text-base text-gray-500 mb-1">Untouched</p>
                <p className="text-4xl font-bold text-gray-900">{stats.untouched}</p>
              </div>
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 transform -rotate-90">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="#f3f4f6" strokeWidth="6" />
                  <circle
                    cx="32" cy="32" r="28"
                    fill="none" stroke="#ed1b24" strokeWidth="6"
                    strokeDasharray={`${(stats.untouched / Math.max(allLeads.length, 1)) * 175.9} 175.9`}
                    strokeLinecap="round"
                  />
                </svg>
                <TrendingDown className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[#ed1b24]" size={20} />
              </div>
            </button>

            {/* Hot Leads Card */}
            <button
              type="button"
              onClick={() => setActiveQuickFilter(prev => prev === 'hot' ? null : 'hot')}
              className={`rounded-lg shadow-sm p-6 flex items-center justify-between text-left transition-all ${
                activeQuickFilter === 'hot' ? 'bg-green-50 ring-2 ring-green-400' : 'bg-white hover:bg-gray-50'
              }`}
            >
              <div>
                <p className="text-base text-gray-500 mb-1">Hot Leads</p>
                <p className="text-4xl font-bold text-gray-900">{stats.hotLeads}</p>
              </div>
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 transform -rotate-90">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="#f3f4f6" strokeWidth="6" />
                  <circle
                    cx="32" cy="32" r="28"
                    fill="none" stroke="#10b981" strokeWidth="6"
                    strokeDasharray={`${(stats.hotLeads / Math.max(allLeads.length, 1)) * 175.9} 175.9`}
                    strokeLinecap="round"
                  />
                </svg>
                <TrendingUp className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[#10b981]" size={20} />
              </div>
            </button>

            {/* Conversions Card */}
            <button
              type="button"
              onClick={() => setActiveQuickFilter(prev => prev === 'conversions' ? null : 'conversions')}
              className={`rounded-lg shadow-sm p-6 flex items-center justify-between text-left transition-all ${
                activeQuickFilter === 'conversions' ? 'bg-green-50 ring-2 ring-green-400' : 'bg-white hover:bg-gray-50'
              }`}
            >
              <div>
                <p className="text-base text-gray-500 mb-1">Conversions</p>
                <p className="text-4xl font-bold text-gray-900">{stats.conversions}%</p>
              </div>
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 transform -rotate-90">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="#f3f4f6" strokeWidth="6" />
                  <circle
                    cx="32" cy="32" r="28"
                    fill="none" stroke="#10b981" strokeWidth="6"
                    strokeDasharray={`${(stats.conversions / 100) * 175.9} 175.9`}
                    strokeLinecap="round"
                  />
                </svg>
                <TrendingUp className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[#10b981]" size={20} />
              </div>
            </button>

            {/* Discarded Leads Card */}
            <button
              type="button"
              onClick={() => setActiveQuickFilter(prev => prev === 'discarded' ? null : 'discarded')}
              className={`rounded-lg shadow-sm p-6 flex items-center justify-between text-left transition-all ${
                activeQuickFilter === 'discarded' ? 'bg-gray-100 ring-2 ring-gray-400' : 'bg-white hover:bg-gray-50'
              }`}
            >
              <div>
                <p className="text-base text-gray-500 mb-1">Discarded leads</p>
                <p className="text-4xl font-bold text-gray-900">{stats.discarded}</p>
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
                    stroke="#6b7280"
                    strokeWidth="6"
                    strokeDasharray={`${allLeads.length > 0 ? (stats.discarded / allLeads.length) * 175.9 : 0} 175.9`}
                    strokeLinecap="round"
                  />
                </svg>
                <Trash2 className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-gray-500" size={20} />
              </div>
            </button>
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
                                  } else if (['date', 'payment_amount', 'advance_amount', 'created_at', 'updated_at', 'first_contact_at'].includes(newColumn)) {
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
                                  type={['date', 'payment_amount', 'advance_amount', 'created_at', 'updated_at', 'first_contact_at'].includes(condition.column) 
                                    ? (condition.column === 'date' || condition.column.includes('_at') ? 'date' : 'number')
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
                <Upload size={18} style={{ color: containerStyles.iconColor }} />
                Import
              </Link>
              <button
                type="button"
                onClick={handleExportLeads}
                className="px-4 py-2 text-base border rounded-md hover:opacity-80 flex items-center gap-2 transition-all"
                style={{ 
                  color: containerStyles.textColor,
                  backgroundColor: containerStyles.backgroundColor,
                  borderColor: containerStyles.textColor + '30',
                }}
              >
                <Download size={18} style={{ color: containerStyles.iconColor }} />
                Export
              </button>
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
          <div className="bg-white rounded-lg shadow-sm overflow-hidden w-full">
            <div className="overflow-x-auto w-full">
          <table className={`w-full divide-y divide-gray-200 ${resizingColumn ? 'select-none' : ''}`} style={{ minWidth: 'max-content' }}>
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
                    className={`px-4 md:px-6 py-3 md:py-4 text-left text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider relative ${column.key === 'name' ? '' : 'whitespace-nowrap'}`}
                    style={column.key === 'name' ? {
                      width: `${column.width}px`,
                      minWidth: `${column.width}px`,
                    } : {
                      width: `${column.width}px`,
                      minWidth: `${column.width}px`,
                      maxWidth: `${column.width}px`
                    }}
                  >
                    <div className="flex items-center">
                      {column.label}
                      {(column.key === 'date' || column.key === 'status' || column.key === 'last_contacted' || column.key === 'phone' || column.key === 'car_model') && (
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
                      case 'date':
                        return (
                          <span className="text-base text-gray-700">
                            {lead.created_at ? new Date(lead.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                          </span>
                        )
                      case 'name':
                        return (
                          <div className="text-base font-medium text-gray-900 break-words">
                            {lead.name}
                          </div>
                        )
                      case 'car_model':
                        return (
                          <div className="text-base text-gray-900">
                            {vehicleName || '-'}
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
                          className={`px-4 md:px-6 py-3 md:py-4 ${column.key === 'name' ? '' : 'whitespace-nowrap'}`}
                          style={column.key === 'name' ? {
                            width: `${column.width}px`,
                            minWidth: `${column.width}px`,
                          } : {
                            width: `${column.width}px`,
                            minWidth: `${column.width}px`,
                            maxWidth: `${column.width}px`
                          }}
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
        </Layout>
      </div>

      {/* Reassign Modal */}
      {reassigningLeadId && isAdmin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold mb-4">
              Reassign Lead
            </h3>
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

      {/* Modals - Outside desktop view, at fragment level */}
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
                    containerColor: '#ffffff',
                    iconColor: '#4b5563', // gray-700
                    textColor: '#111827', // gray-900
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
    </>
  )
}
