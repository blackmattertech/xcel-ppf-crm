'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Layout from '@/components/Layout'
import Image from 'next/image'
import { getInterestedProductFromMeta, getCarModelFromMeta } from '@/shared/utils/lead-meta'
import { 
  LEAD_STATUS, 
  LEAD_STATUS_LABELS, 
  LEAD_STATUS_FLOW, 
  LEAD_STATUS_ICONS,
  INTEREST_LEVEL,
  INTEREST_LEVEL_LABELS,
  CALL_OUTCOME,
  CALL_OUTCOME_LABELS,
  type CallOutcome,
  type InterestLevel
} from '@/shared/constants/lead-status'
import { 
  Phone, 
  Mail, 
  Building2, 
  MapPin, 
  TrendingUp, 
  DollarSign, 
  Calendar, 
  Clock, 
  User, 
  X, 
  Gem,
  ThumbsUp,
  ThumbsDown,
  Flame,
  Zap,
  Snowflake,
  FileText,
  FilePlus,
  Plus,
  Trash2,
  ShoppingCart,
  Eye,
  Share2,
  CheckCircle,
  Pencil
} from 'lucide-react'
import { cachedFetch } from '@/lib/api-client'
import { useQuery } from '@tanstack/react-query'
import { differenceInCalendarDays, format, isToday, isYesterday } from 'date-fns'

/** Recent Activity: human labels for recent days, then explicit date + time. */
function formatActivityListWhen(dateInput: Date | string): string {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput)
  if (Number.isNaN(date.getTime())) return '—'
  if (isToday(date)) return `Today, ${format(date, 'h:mm a')}`
  if (isYesterday(date)) return `Yesterday, ${format(date, 'h:mm a')}`
  const daysAgo = differenceInCalendarDays(new Date(), date)
  if (daysAgo >= 2 && daysAgo < 7) return format(date, 'EEEE, MMM d · h:mm a')
  return format(date, 'MMM d, yyyy · h:mm a')
}

// Interactive Time Picker Component
function TimePicker({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [hours, setHours] = useState(9)
  const [minutes, setMinutes] = useState(0)
  const [period, setPeriod] = useState<'am' | 'pm'>('am')
  const hoursRef = useRef<HTMLDivElement>(null)
  const minutesRef = useRef<HTMLDivElement>(null)

  // Parse initial value
  useEffect(() => {
    if (value) {
      const [time] = value.split(' ')
      if (time) {
        const [h, m] = time.split(':')
        const hour24 = parseInt(h || '9')
        const hour12 = hour24 > 12 ? hour24 - 12 : (hour24 === 0 ? 12 : hour24)
        setHours(hour12)
        setMinutes(parseInt(m || '0'))
        setPeriod(hour24 >= 12 ? 'pm' : 'am')
      }
    }
  }, [value])

  // Scroll to selected item when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (hoursRef.current) {
          const selectedHour = hoursRef.current.children[hours - 1] as HTMLElement
          if (selectedHour) {
            hoursRef.current.scrollTop = selectedHour.offsetTop - hoursRef.current.offsetHeight / 2 + selectedHour.offsetHeight / 2
          }
        }
        if (minutesRef.current) {
          const selectedMinute = minutesRef.current.children[minutes] as HTMLElement
          if (selectedMinute) {
            minutesRef.current.scrollTop = selectedMinute.offsetTop - minutesRef.current.offsetHeight / 2 + selectedMinute.offsetHeight / 2
          }
        }
      }, 10)
    }
  }, [isOpen, hours, minutes])

  // Convert to 24-hour format for output
  const formatTime = (h: number, m: number, p: 'am' | 'pm'): string => {
    let hour24 = h
    if (p === 'pm' && h !== 12) hour24 = h + 12
    if (p === 'am' && h === 12) hour24 = 0
    return `${hour24.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
  }

  const handleTimeChange = (newHours: number, newMinutes: number, newPeriod: 'am' | 'pm') => {
    setHours(newHours)
    setMinutes(newMinutes)
    setPeriod(newPeriod)
    onChange(formatTime(newHours, newMinutes, newPeriod))
  }

  const handlePreset = (presetHours: number, presetPeriod: 'am' | 'pm') => {
    handleTimeChange(presetHours, 0, presetPeriod)
  }

  const presets = [
    { label: '9 am', hours: 9, period: 'am' as const },
    { label: '12 pm', hours: 12, period: 'pm' as const },
    { label: '4 pm', hours: 4, period: 'pm' as const },
    { label: '6 pm', hours: 6, period: 'pm' as const },
  ]

  const displayValue = value ? (() => {
    const [time] = value.split(' ')
    if (time) {
      const [h, m] = time.split(':')
      const hour24 = parseInt(h || '9')
      const hour12 = hour24 > 12 ? hour24 - 12 : (hour24 === 0 ? 12 : hour24)
      const period = hour24 >= 12 ? 'pm' : 'am'
      return `${hour12}:${m?.padStart(2, '0') || '00'} ${period}`
    }
    return ''
  })() : ''

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#ed1b24] focus:border-[#ed1b24] bg-white text-left flex items-center justify-between hover:border-gray-400 transition-colors"
      >
        <span className={displayValue ? 'text-gray-900' : 'text-gray-500'}>
          {displayValue || 'Select time'}
        </span>
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute z-50 mt-2 bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-sm p-4 left-0" style={{ fontFamily: 'Poppins, sans-serif' }}>
            <div className="text-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Time</h3>
            </div>

            {/* Time Picker Wheel */}
            <div className="flex items-center justify-center gap-2 mb-6">
              {/* Hours */}
              <div className="relative w-20 h-48 overflow-hidden rounded-lg bg-gray-50 border border-gray-200">
                <div className="absolute inset-0 pointer-events-none z-10" style={{ 
                  background: 'linear-gradient(to bottom, rgba(255,255,255,0.9) 0%, transparent 20%, transparent 80%, rgba(255,255,255,0.9) 100%)'
                }} />
                <div 
                  ref={hoursRef}
                  className="absolute inset-0 overflow-y-auto scrollbar-hide"
                  style={{ scrollSnapType: 'y mandatory', scrollPaddingTop: '96px' }}
                >
                  <div className="h-24" /> {/* Spacer for centering */}
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                    <div
                      key={h}
                      onClick={() => handleTimeChange(h, minutes, period)}
                      className={`h-12 flex items-center justify-center cursor-pointer transition-all scroll-snap-align-start ${
                        hours === h
                          ? 'bg-[#ed1b24] text-white text-lg font-semibold scale-110 rounded-lg mx-1'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {h}
                    </div>
                  ))}
                  <div className="h-24" /> {/* Spacer for centering */}
                </div>
                <div className="absolute inset-0 pointer-events-none z-20 border-y-2 border-[#ed1b24] border-opacity-40" style={{ top: '50%', transform: 'translateY(-50%)', height: '48px' }} />
              </div>

              <span className="text-2xl font-semibold text-gray-400">:</span>

              {/* Minutes */}
              <div className="relative w-20 h-48 overflow-hidden rounded-lg bg-gray-50 border border-gray-200">
                <div className="absolute inset-0 pointer-events-none z-10" style={{ 
                  background: 'linear-gradient(to bottom, rgba(255,255,255,0.9) 0%, transparent 20%, transparent 80%, rgba(255,255,255,0.9) 100%)'
                }} />
                <div 
                  ref={minutesRef}
                  className="absolute inset-0 overflow-y-auto scrollbar-hide"
                  style={{ scrollSnapType: 'y mandatory', scrollPaddingTop: '96px' }}
                >
                  <div className="h-24" /> {/* Spacer for centering */}
                  {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                    <div
                      key={m}
                      onClick={() => handleTimeChange(hours, m, period)}
                      className={`h-12 flex items-center justify-center cursor-pointer transition-all scroll-snap-align-start ${
                        minutes === m
                          ? 'bg-[#ed1b24] text-white text-lg font-semibold scale-110 rounded-lg mx-1'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {m.toString().padStart(2, '0')}
                    </div>
                  ))}
                  <div className="h-24" /> {/* Spacer for centering */}
                </div>
                <div className="absolute inset-0 pointer-events-none z-20 border-y-2 border-[#ed1b24] border-opacity-40" style={{ top: '50%', transform: 'translateY(-50%)', height: '48px' }} />
              </div>

              {/* AM/PM */}
              <div className="relative w-16 h-48 overflow-hidden rounded-lg bg-gray-50 border border-gray-200">
                <div className="absolute inset-0 pointer-events-none z-10" style={{ 
                  background: 'linear-gradient(to bottom, rgba(255,255,255,0.9) 0%, transparent 20%, transparent 80%, rgba(255,255,255,0.9) 100%)'
                }} />
                <div className="absolute inset-0 overflow-y-auto scrollbar-hide">
                  <div className="h-12" /> {/* Spacer for centering */}
                  {(['am', 'pm'] as const).map((p) => (
                    <div
                      key={p}
                      onClick={() => handleTimeChange(hours, minutes, p)}
                      className={`h-24 flex items-center justify-center cursor-pointer transition-all uppercase ${
                        period === p
                          ? 'bg-[#ed1b24] text-white text-lg font-semibold scale-110 rounded-lg mx-1'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {p}
                    </div>
                  ))}
                  <div className="h-12" /> {/* Spacer for centering */}
                </div>
                <div className="absolute inset-0 pointer-events-none z-20 border-y-2 border-[#ed1b24] border-opacity-40" style={{ top: '50%', transform: 'translateY(-50%)', height: '96px' }} />
              </div>
            </div>

            {/* Presets */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Presets</span>
              </div>
              <div className="flex gap-2">
                {presets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handlePreset(preset.hours, preset.period)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      hours === preset.hours && period === preset.period
                        ? 'bg-[#ed1b24] text-white border-2 border-[#ed1b24]'
                        : 'bg-white text-gray-700 border border-gray-300 hover:border-[#ed1b24] hover:text-[#ed1b24]'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Done Button */}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-full py-3 bg-[#ed1b24] text-white rounded-lg font-semibold hover:bg-[#d11820] transition-colors"
            >
              Done
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// Date Picker Component with Presets
function DatePicker({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState(value || '')

  useEffect(() => {
    setSelectedDate(value || '')
  }, [value])

  const handlePreset = (preset: 'today' | 'tomorrow' | 'next_week') => {
    const today = new Date()
    let targetDate = new Date(today)

    switch (preset) {
      case 'today':
        targetDate = today
        break
      case 'tomorrow':
        targetDate.setDate(today.getDate() + 1)
        break
      case 'next_week':
        targetDate.setDate(today.getDate() + 7)
        break
    }

    const dateStr = targetDate.toISOString().split('T')[0]
    setSelectedDate(dateStr)
    onChange(dateStr)
  }

  const displayValue = selectedDate ? (() => {
    const date = new Date(selectedDate)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 7)

    if (date.toDateString() === today.toDateString()) {
      return 'Today'
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow'
    } else if (date.toDateString() === nextWeek.toDateString()) {
      return 'Next Week'
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  })() : ''

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handlePreset('today')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            selectedDate && new Date(selectedDate).toDateString() === new Date().toDateString()
              ? 'bg-[#ed1b24] text-white border-2 border-[#ed1b24]'
              : 'bg-white text-gray-700 border border-gray-300 hover:border-[#ed1b24] hover:text-[#ed1b24]'
          }`}
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => handlePreset('tomorrow')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            (() => {
              const tomorrow = new Date()
              tomorrow.setDate(tomorrow.getDate() + 1)
              return selectedDate && new Date(selectedDate).toDateString() === tomorrow.toDateString()
            })()
              ? 'bg-[#ed1b24] text-white border-2 border-[#ed1b24]'
              : 'bg-white text-gray-700 border border-gray-300 hover:border-[#ed1b24] hover:text-[#ed1b24]'
          }`}
        >
          Tomorrow
        </button>
        <button
          type="button"
          onClick={() => handlePreset('next_week')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            (() => {
              const nextWeek = new Date()
              nextWeek.setDate(nextWeek.getDate() + 7)
              return selectedDate && new Date(selectedDate).toDateString() === nextWeek.toDateString()
            })()
              ? 'bg-[#ed1b24] text-white border-2 border-[#ed1b24]'
              : 'bg-white text-gray-700 border border-gray-300 hover:border-[#ed1b24] hover:text-[#ed1b24]'
          }`}
        >
          Next Week
        </button>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => {
            setSelectedDate(e.target.value)
            onChange(e.target.value)
          }}
          min={new Date().toISOString().split('T')[0]}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#ed1b24] focus:border-[#ed1b24]"
        />
      </div>
      {displayValue && (
        <p className="text-xs text-gray-500 mt-1">Selected: {displayValue}</p>
      )}
    </div>
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
  budget_range: string | null
  requirement: string | null
  timeline: string | null
  assigned_user: {
    id: string
    name: string
    email: string
    profile_image_url?: string | null
  } | null
  created_at: string
  meta_data?: Record<string, any> | null
  campaign_id?: string | null
  ad_id?: string | null
  adset_id?: string | null
  form_id?: string | null
  form_name?: string | null
  ad_name?: string | null
  campaign_name?: string | null
  status_history?: Array<{
    id: string
    old_status: string | null
    new_status: string
    notes: string | null
    created_at: string
    changed_by_user: {
      id: string
      name: string
    } | null
  }>
  calls?: Array<{
    id: string
    outcome: string
    disposition: string | null
    notes: string | null
    call_duration: number | null
    created_at: string
    integration?: 'manual' | 'mcube'
    recording_url?: string | null
    started_at?: string | null
    ended_at?: string | null
    dial_status?: string | null
    direction?: string | null
    mcube_agent_name?: string | null
    mcube_group_name?: string | null
    disconnected_by?: string | null
    answered_duration_seconds?: number | null
    called_by_user: {
      id: string
      name: string
    } | null
  }>
  follow_ups?: Array<{
    id: string
    scheduled_at: string
    completed_at: string | null
    status: string
    notes: string | null
    assigned_user: {
      id: string
      name: string
    } | null
  }>
  lead_notes?: Array<{
    id: string
    note: string
    created_at: string
    updated_at?: string
    created_by_user: {
      id: string
      name: string
    } | null
  }>
}

export type LeadDetailPageContentProps = {
  leadId: string
  onClose: () => void
  /** Overlay on /leads — real list stays visible underneath */
  embedded?: boolean
  /** After successful delete so the list can update without full remount */
  onLeadDeleted?: () => void
}

export default function LeadDetailPageContent({
  leadId,
  onClose,
  embedded = false,
  onLeadDeleted,
}: LeadDetailPageContentProps) {
  const router = useRouter()
  const [lead, setLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [userRole, setUserRole] = useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [newStatus, setNewStatus] = useState('')
  const [statusNotes, setStatusNotes] = useState('')
  
  // Call status update
  const [showCallModal, setShowCallModal] = useState(false)
  const [callOutcome, setCallOutcome] = useState<CallOutcome | ''>('')
  const [callNotes, setCallNotes] = useState('')
  const [callStartTime, setCallStartTime] = useState('')
  const [callEndTime, setCallEndTime] = useState('')
  const [callInterestLevel, setCallInterestLevel] = useState<InterestLevel | ''>('')
  const [callFollowUpDate, setCallFollowUpDate] = useState('')
  const [callFollowUpTime, setCallFollowUpTime] = useState('')
  const [submittingCall, setSubmittingCall] = useState(false)
  const [mcubeCalling, setMcubeCalling] = useState(false)
  
  // LEAD JOURNEY: Connected flow sub-options
  const [connectedSubOption, setConnectedSubOption] = useState<'interested' | 'not_interested' | 'call_later' | ''>('')
  const [interestedProductInterest, setInterestedProductInterest] = useState('')
  const [interestedBudget, setInterestedBudget] = useState('')
  const [interestedPurchaseTimeline, setInterestedPurchaseTimeline] = useState('')
  const [interestedNotes, setInterestedNotes] = useState('')
  
  // Qualification
  const [showQualifyModal, setShowQualifyModal] = useState(false)
  const [interestLevel, setInterestLevel] = useState<InterestLevel | ''>('')
  const [qualifyNotes, setQualifyNotes] = useState('')
  const [submittingQualify, setSubmittingQualify] = useState(false)
  
  // Payment status
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [advanceAmount, setAdvanceAmount] = useState('')
  const [submittingPayment, setSubmittingPayment] = useState(false)
  
  // Follow-up management
  const [showFollowUpModal, setShowFollowUpModal] = useState(false)
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpTime, setFollowUpTime] = useState('')
  const [followUpNotes, setFollowUpNotes] = useState('')
  const [submittingFollowUp, setSubmittingFollowUp] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [deletingLead, setDeletingLead] = useState(false)
  const [showStatusUpdateModal, setShowStatusUpdateModal] = useState(false)
  const [showQuotationModal, setShowQuotationModal] = useState(false)
  const [quotationItems, setQuotationItems] = useState<Array<{
    productId: string
    name: string
    description: string
    quantity: number
    unitPrice: number
    total: number
  }>>([{ productId: '', name: '', description: '', quantity: 1, unitPrice: 0, total: 0 }])
  const [gstRate, setGstRate] = useState(18)
  const [discount, setDiscount] = useState(0)
  const [validityDays, setValidityDays] = useState(30)
  const [submittingQuotation, setSubmittingQuotation] = useState(false)
  const [createdQuotationId, setCreatedQuotationId] = useState<string | null>(null)
  const [showQuotationSuccessModal, setShowQuotationSuccessModal] = useState(false)
  const [leadQuotations, setLeadQuotations] = useState<Array<{ id: string; quote_number: string; version: number }>>([])
  const [markingQuotationShared, setMarkingQuotationShared] = useState(false)
  const [hideConnectedWhenLastMcubeNotConnected, setHideConnectedWhenLastMcubeNotConnected] = useState(true)
  const [syncingInboundCalls, setSyncingInboundCalls] = useState(false)
  // Quotation shared / negotiation: call outcome (accepted | not_accepted | negotiation)
  const [quotationCallOutcome, setQuotationCallOutcome] = useState<'accepted' | 'not_accepted' | 'negotiation' | ''>('')
  // Order created after "Accepted" → used to update order payment when user submits payment modal
  const [lastCreatedOrderId, setLastCreatedOrderId] = useState<string | null>(null)

  const { data: products = [] } = useQuery({
    queryKey: ['crm', 'products'],
    queryFn: async () => {
      const response = await cachedFetch('/api/products')
      if (!response.ok) throw new Error('Failed to load products')
      const data = await response.json()
      return Array.isArray(data) ? data : []
    },
    staleTime: 60_000,
  })

  const { data: mcubeSettingsPayload } = useQuery({
    queryKey: ['crm', 'mcube-settings'],
    queryFn: async () => {
      const response = await cachedFetch('/api/integrations/mcube/settings')
      if (!response.ok) return null
      return response.json()
    },
    staleTime: 120_000,
  })

  useEffect(() => {
    const shouldHide =
      mcubeSettingsPayload?.settings?.hideConnectedWhenLastMcubeNotConnected
    if (typeof shouldHide === 'boolean') {
      setHideConnectedWhenLastMcubeNotConnected(shouldHide)
    }
  }, [mcubeSettingsPayload])

  useEffect(() => {
    checkAuth()
    fetchLead()
  }, [leadId])

  useEffect(() => {
    if (leadId && (lead?.status === LEAD_STATUS.QUALIFIED || lead?.status === LEAD_STATUS.QUOTATION_SHARED || lead?.status === LEAD_STATUS.QUOTATION_VIEWED || lead?.status === LEAD_STATUS.QUOTATION_ACCEPTED || lead?.status === LEAD_STATUS.QUOTATION_EXPIRED)) {
      fetchLeadQuotations()
    } else {
      setLeadQuotations([])
    }
  }, [leadId, lead?.status])

  useEffect(() => {
    if (!leadId) return
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      void fetchLeadLive()
    }, 4000)
    return () => clearInterval(interval)
  }, [leadId, showStatusUpdateModal])

  async function checkAuth() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }

    // Get user role
    const { data: userData } = await supabase
      .from('users')
      .select('role_id, roles!users_role_id_fkey(name)')
      .eq('id', user.id)
      .single()

    if (userData) {
      const userDataTyped = userData as any
      const roleName = Array.isArray(userDataTyped.roles) 
        ? userDataTyped.roles[0]?.name 
        : userDataTyped.roles?.name
      setUserRole(roleName)
      setUserId(user.id)
    }
  }

  async function fetchLeadQuotations() {
    try {
      const response = await cachedFetch(`/api/quotations?leadId=${leadId}`)
      if (response.ok) {
        const data = await response.json()
        const list = data.quotations || []
        setLeadQuotations(list.map((q: { id: string; quote_number: string; version: number }) => ({ id: q.id, quote_number: q.quote_number, version: q.version })))
      }
    } catch (err) {
      console.error('Failed to fetch lead quotations:', err)
      setLeadQuotations([])
    }
  }

  async function fetchLead() {
    try {
      const [minRes, relRes] = await Promise.all([
        cachedFetch(`/api/leads/${leadId}?include=minimal`),
        cachedFetch(`/api/leads/${leadId}/relations`),
      ])
      if (minRes.ok) {
        const min = await minRes.json()
        let statusHistory: unknown[] = []
        let calls: unknown[] = []
        let followUps: unknown[] = []
        let leadNotes: unknown[] = []
        if (relRes.ok) {
          const r = await relRes.json()
          const payload = r.relations ?? r
          statusHistory = Array.isArray(payload.status_history)
            ? payload.status_history
            : []
          calls = Array.isArray(payload.calls) ? payload.calls : []
          followUps = Array.isArray(payload.follow_ups) ? payload.follow_ups : []
          leadNotes = Array.isArray(payload.lead_notes) ? payload.lead_notes : []
        }
        const merged = {
          ...min.lead,
          status_history: statusHistory,
          calls,
          follow_ups: followUps,
          lead_notes: leadNotes,
        }
        setLead(merged)
        setNewStatus(min.lead.status)
      } else {
        const errorData = await minRes.json().catch(() => ({}))
        setError(errorData.error || 'Failed to fetch lead')
        if (minRes.status === 404) {
          setError('Lead not found')
        } else if (minRes.status === 403) {
          setError('You do not have permission to view this lead')
        }
      }
    } catch (error) {
      console.error('Failed to fetch lead:', error)
      setError('Failed to fetch lead')
    } finally {
      setLoading(false)
    }
  }

  async function fetchLeadLive() {
    try {
      // Bypass in-memory cache so webhook updates appear seamlessly.
      const response = await cachedFetch(`/api/leads/${leadId}?live=${Date.now()}`, undefined, 0)
      if (!response.ok) return
      const data = await response.json()
      if (!data?.lead) return
      setLead(data.lead)
      if (!showStatusUpdateModal) {
        setNewStatus(data.lead.status)
      }
    } catch {
      // Silent polling to avoid UI flicker/toasts.
    }
  }

  function toTimeInputValue(isoLike: string | null | undefined): string {
    if (!isoLike) return ''
    const d = new Date(isoLike)
    if (Number.isNaN(d.getTime())) return ''
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }

  async function handleMcubeOutbound() {
    setMcubeCalling(true)
    try {
      const response = await cachedFetch('/api/integrations/mcube/outbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        alert(typeof data.error === 'string' ? data.error : 'MCUBE call failed')
        return
      }
      alert('Call initiated via MCUBE. Recording will appear when the call ends.')
      await fetchLead()
    } catch (e) {
      console.error(e)
      alert('MCUBE call failed')
    } finally {
      setMcubeCalling(false)
    }
  }

  async function syncMcubeInboundCalls(silent = true) {
    try {
      setSyncingInboundCalls(true)
      const response = await cachedFetch('/api/integrations/mcube/inbound-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (!silent) alert(typeof data.error === 'string' ? data.error : 'Failed to sync MCUBE call details')
        return
      }
      if ((data?.synced ?? 0) > 0) {
        await fetchLead()
      }
    } catch (e) {
      console.error(e)
      if (!silent) alert('Failed to sync MCUBE call details')
    } finally {
      setSyncingInboundCalls(false)
    }
  }

  async function handleConnectedClick() {
    setCallOutcome('connected')
    await syncMcubeInboundCalls(true)
  }

  async function handleStatusUpdate() {
    if (!newStatus || newStatus === lead?.status) {
      return
    }

    setUpdatingStatus(true)
    try {
      const response = await cachedFetch(`/api/leads/${leadId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: newStatus,
          notes: statusNotes || null,
          save_as_lead_note: Boolean(statusNotes.trim()),
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setLead(data.lead)
        setStatusNotes('')
        alert('Status updated successfully')
      } else {
        const errorData = await response.json()
        alert(errorData.error || 'Failed to update status')
      }
    } catch (error) {
      console.error('Failed to update status:', error)
      alert('Failed to update status')
    } finally {
      setUpdatingStatus(false)
    }
  }

  async function handleDeleteLead() {
    if (!confirm('Are you sure you want to delete this lead? This action cannot be undone.')) return

    setDeletingLead(true)
    try {
      const response = await cachedFetch(`/api/leads/${leadId}`, { method: 'DELETE' })
      const data = await response.json()

      if (response.ok) {
        onLeadDeleted?.()
        onClose()
        alert('Lead deleted successfully')
      } else {
        alert(data.error || 'Failed to delete lead')
      }
    } catch (error) {
      console.error('Failed to delete lead:', error)
      alert('Failed to delete lead')
    } finally {
      setDeletingLead(false)
    }
  }

  const getAvailableStatuses = () => {
    if (!lead) return []
    const currentStatus = lead.status as keyof typeof LEAD_STATUS_FLOW
    return LEAD_STATUS_FLOW[currentStatus] || []
  }

  // Handle call status update with automatic transitions
  async function handleCallStatusUpdate() {
    if (!callOutcome) {
      alert('Please select a call outcome')
      return
    }

    // Validate based on outcome
    if (callOutcome === CALL_OUTCOME.CONNECTED) {
      if (!callStartTime || !callEndTime) {
        alert('Please select both start and end time for the call')
        return
      }
    } else if (callOutcome === CALL_OUTCOME.NOT_REACHABLE || callOutcome === CALL_OUTCOME.CALL_LATER) {
      if (!callFollowUpDate || !callFollowUpTime) {
        alert('Please select follow-up date and time')
        return
      }
    }

    setSubmittingCall(true)
    try {
      // Calculate call duration for connected calls
      let callDuration: number | null = null
      if (callOutcome === CALL_OUTCOME.CONNECTED && callStartTime && callEndTime) {
        const start = new Date(`2000-01-01T${callStartTime}`)
        const end = new Date(`2000-01-01T${callEndTime}`)
        if (end < start) {
          end.setDate(end.getDate() + 1)
        }
        const diffMs = end.getTime() - start.getTime()
        callDuration = Math.floor(diffMs / 1000)
      }

      // Create call record
      const callResponse = await cachedFetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: leadId,
          outcome: callOutcome,
          notes: callNotes || null,
          call_duration: callDuration,
        }),
      })

      if (!callResponse.ok) {
        const errorData = await callResponse.json()
        throw new Error(errorData.error || 'Failed to record call')
      }

      // Handle outcome-specific actions
      if (callOutcome === CALL_OUTCOME.WRONG_NUMBER) {
        // Update status to lost
        const statusResponse = await cachedFetch(`/api/leads/${leadId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: LEAD_STATUS.LOST,
            notes: 'Wrong number - Lead discarded',
          }),
        })

        if (!statusResponse.ok) {
          console.error('Failed to update status after wrong number call')
        }

        // Refresh and close
        await fetchLead()
        setShowCallModal(false)
        resetCallForm()
        alert('Call recorded - Lead status updated to Lost (Wrong Number)')
        return
      }

      // Update interest level if connected
      if (callOutcome === CALL_OUTCOME.CONNECTED && callInterestLevel && lead) {
        try {
          const updateResponse = await cachedFetch(`/api/leads/${leadId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              interest_level: callInterestLevel,
            }),
          })
          if (!updateResponse.ok) {
            console.error('Failed to update interest level')
          }
        } catch (error) {
          console.error('Error updating interest level:', error)
        }
      }

      // Create follow-up for not_reachable or call_later
      const leadData = lead as any
      if ((callOutcome === CALL_OUTCOME.NOT_REACHABLE || callOutcome === CALL_OUTCOME.CALL_LATER) && callFollowUpDate && callFollowUpTime && leadData?.assigned_to) {
        // Combine date and time
        const scheduledAt = new Date(`${callFollowUpDate}T${callFollowUpTime}`)
        
        try {
          const followUpResponse = await cachedFetch('/api/followups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lead_id: leadId,
              assigned_to: leadData.assigned_to,
              scheduled_at: scheduledAt.toISOString(),
              notes: `Follow-up scheduled after call: ${CALL_OUTCOME_LABELS[callOutcome]}. ${callNotes || ''}`,
            }),
          })

          if (!followUpResponse.ok) {
            const errorData = await followUpResponse.json()
            throw new Error(errorData.error || 'Failed to create follow-up')
          }
        } catch (followUpError) {
          console.error('Failed to create follow-up:', followUpError)
          alert('Call recorded but failed to create follow-up. Please create it manually.')
        }
      }

      // Auto-qualify if connected and new lead
      if (callOutcome === CALL_OUTCOME.CONNECTED && lead?.status === LEAD_STATUS.NEW) {
        try {
          await cachedFetch(`/api/leads/${leadId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              status: LEAD_STATUS.QUALIFIED,
              notes: 'Connected on first call - Auto-qualified',
          }),
        })
        } catch (error) {
          console.error('Failed to auto-qualify lead:', error)
        }
      }

      // Refresh lead data
      await fetchLead()
      setShowCallModal(false)
      resetCallForm()
      alert('Call recorded successfully')
    } catch (error) {
      console.error('Failed to record call:', error)
      alert(error instanceof Error ? error.message : 'Failed to record call')
    } finally {
      setSubmittingCall(false)
    }
  }

  // Reset call form
  function resetCallForm() {
    setCallOutcome('')
    setCallNotes('')
    setCallStartTime('')
    setCallEndTime('')
    setCallInterestLevel('')
    setCallFollowUpDate('')
    setCallFollowUpTime('')
    setConnectedSubOption('')
    setInterestedProductInterest('')
    setInterestedBudget('')
    setInterestedPurchaseTimeline('')
    setInterestedNotes('')
    setQuotationCallOutcome('')
  }

  // When lead is Quotation Shared or Negotiation: handle Accepted / Not Accepted / Negotiation
  const isQuotationCallFlow = lead?.status === LEAD_STATUS.QUOTATION_SHARED || lead?.status === LEAD_STATUS.NEGOTIATION
  const latestMcubeCall = (lead?.calls ?? [])
    .filter((call) => call.integration === 'mcube')
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
  const canShowConnectedOption =
    !hideConnectedWhenLastMcubeNotConnected ||
    !latestMcubeCall ||
    latestMcubeCall.outcome === CALL_OUTCOME.CONNECTED

  useEffect(() => {
    if (!showCallModal || callOutcome !== CALL_OUTCOME.CONNECTED) return
    if (!latestMcubeCall) return

    // Auto-fill from latest MCUBE hangup details, while allowing manual override.
    if (!callStartTime && latestMcubeCall.started_at) {
      setCallStartTime(toTimeInputValue(latestMcubeCall.started_at))
    }
    if (!callEndTime && latestMcubeCall.ended_at) {
      setCallEndTime(toTimeInputValue(latestMcubeCall.ended_at))
    }
  }, [
    showCallModal,
    callOutcome,
    latestMcubeCall?.started_at,
    latestMcubeCall?.ended_at,
    callStartTime,
    callEndTime,
  ])

  async function handleQuotationCallOutcomeSubmit() {
    if (!quotationCallOutcome) {
      alert('Please select an outcome')
      return
    }
    setSubmittingCall(true)
    try {
      if (quotationCallOutcome === 'not_accepted') {
        await cachedFetch(`/api/leads/${leadId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: LEAD_STATUS.LOST,
            notes: 'Quotation not accepted - Lead discarded',
          }),
        })
        await fetchLead()
        setShowCallModal(false)
        resetCallForm()
        alert('Lead discarded (Quotation not accepted)')
        return
      }

      if (quotationCallOutcome === 'negotiation') {
        await cachedFetch(`/api/leads/${leadId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: LEAD_STATUS.NEGOTIATION,
            notes: 'Customer in negotiation - Update quotation and then mark Accepted or Not Accepted',
          }),
        })
        await fetchLead()
        setShowCallModal(false)
        resetCallForm()
        alert('Status set to Negotiation. Update the quotation, then use Make Call again to mark Accepted or Not Accepted.')
        return
      }

      // accepted: mark deal won, convert to customer, create job card (order), then show payment modal
      await cachedFetch(`/api/leads/${leadId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: LEAD_STATUS.DEAL_WON,
          notes: 'Quotation accepted - Deal won',
        }),
      })

      const convertRes = await cachedFetch(`/api/leads/${leadId}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!convertRes.ok) {
        const err = await convertRes.json()
        throw new Error(err.error || 'Failed to convert lead and create job card')
      }
      const convertData = await convertRes.json()
      const orderId = convertData.order?.id
      if (orderId) setLastCreatedOrderId(orderId)

      await fetchLead()
      setShowCallModal(false)
      resetCallForm()
      setShowPaymentModal(true)
      alert('Deal won! Customer and job card created. Please record payment details.')
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : 'Failed to process outcome')
    } finally {
      setSubmittingCall(false)
    }
  }

  // LEAD JOURNEY: Handle Connected sub-option selection
  async function handleConnectedSubOption(option: 'interested' | 'not_interested' | 'call_later') {
    // Call start/end time are only required for "interested" and "not_interested" (to record call duration).
    // For "call_later" we only need follow-up date/time; call_duration can be null.
    if (option !== 'call_later' && (!callStartTime || !callEndTime)) {
      alert('Please select both start and end time for the call')
      return
    }

    setSubmittingCall(true)
    try {
      // Calculate call duration
      const start = new Date(`2000-01-01T${callStartTime}`)
      const end = new Date(`2000-01-01T${callEndTime}`)
      if (end < start) {
        end.setDate(end.getDate() + 1)
      }
      const diffMs = end.getTime() - start.getTime()
      const callDuration = Math.floor(diffMs / 1000)

      // Create call record first
      const callResponse = await cachedFetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: leadId,
          outcome: 'connected',
          notes: callNotes || null,
          call_duration: callDuration,
        }),
      })

      if (!callResponse.ok) {
        const errorData = await callResponse.json()
        throw new Error(errorData.error || 'Failed to record call')
      }

      // Handle sub-options
      if (option === 'not_interested') {
        // Not Interested → Discarded (Lost)
        await cachedFetch(`/api/leads/${leadId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: LEAD_STATUS.LOST,
            notes: 'Not interested - Lead discarded',
          }),
        })
        await fetchLead()
        setShowCallModal(false)
        resetCallForm()
        alert('Call recorded - Lead status updated to Lost (Not Interested)')
      } else if (option === 'call_later') {
        // Call Later → Create follow-up, status = contacted
        const leadDataForFollowup = lead as any
        if (!callFollowUpDate || !callFollowUpTime || !leadDataForFollowup?.assigned_to) {
          alert('Please select follow-up date and time')
          setSubmittingCall(false)
          return
        }
        const scheduledAt = new Date(`${callFollowUpDate}T${callFollowUpTime}`)
        await cachedFetch('/api/followups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lead_id: leadId,
            assigned_to: leadDataForFollowup.assigned_to,
            scheduled_at: scheduledAt.toISOString(),
            notes: `Call Later - Follow-up scheduled. ${callNotes || ''}`,
          }),
        })
        await fetchLead()
        setShowCallModal(false)
        resetCallForm()
        alert('Call recorded - Follow-up scheduled')
      } else if (option === 'interested') {
        // Interested → Show form (will be handled by separate handler)
        // For now, just close the call modal and show interested form
        setShowCallModal(false)
        // The interested form will be shown separately
        // Status will be updated to qualified after form submission
      }

      if (option !== 'interested') {
        await fetchLead()
      }
    } catch (error) {
      console.error('Failed to handle connected sub-option:', error)
      alert(error instanceof Error ? error.message : 'Failed to process call')
    } finally {
      setSubmittingCall(false)
    }
  }

  // LEAD JOURNEY: Handle Interested form submission
  async function handleInterestedFormSubmit() {
    if (!callInterestLevel) {
      alert('Please select a Lead Type')
      return
    }

    setSubmittingCall(true)
    try {
      // Update lead with interest level, product interest, budget, and status
      const updates: any = {
        interest_level: callInterestLevel,
        status: LEAD_STATUS.QUALIFIED,
      }

      if (interestedProductInterest) {
        // Store product interest in requirement or meta_data
        updates.requirement = interestedProductInterest
      }

      if (interestedBudget) {
        // Store budget in budget_range or meta_data
        updates.budget_range = interestedBudget
      }

      if (interestedPurchaseTimeline) {
        // Store purchase timeline in timeline or meta_data
        updates.timeline = interestedPurchaseTimeline
      }

      const updateResponse = await cachedFetch(`/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      if (!updateResponse.ok) {
        throw new Error('Failed to update lead')
      }

      const trimmedInterestedNotes = interestedNotes.trim()

      // Update status with notes
      await cachedFetch(`/api/leads/${leadId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: LEAD_STATUS.QUALIFIED,
          notes: `Interested - Qualified as ${callInterestLevel ? INTEREST_LEVEL_LABELS[callInterestLevel] : ''}${interestedNotes ? ` - ${interestedNotes}` : ''}`,
          save_as_lead_note: Boolean(trimmedInterestedNotes),
        }),
      })

      await fetchLead()
      setShowCallModal(false)
      resetCallForm()
      alert('Lead qualified successfully!')
    } catch (error) {
      console.error('Failed to submit interested form:', error)
      alert(error instanceof Error ? error.message : 'Failed to qualify lead')
    } finally {
      setSubmittingCall(false)
    }
  }

  // Handle qualification with interest level
  async function handleQualify() {
    if (!interestLevel) {
      alert('Please select an interest level')
      return
    }

    setSubmittingQualify(true)
    try {
      // Update lead with interest level and status
      const response = await cachedFetch(`/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interest_level: interestLevel,
          status: LEAD_STATUS.QUALIFIED,
        }),
      })

      if (response.ok) {
        const trimmedQualifyNotes = qualifyNotes.trim()

        // Update status with notes
        await cachedFetch(`/api/leads/${leadId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: LEAD_STATUS.QUALIFIED,
            notes: `Qualified as ${interestLevel ? INTEREST_LEVEL_LABELS[interestLevel] : ''}${qualifyNotes ? ` - ${qualifyNotes}` : ''}`,
            save_as_lead_note: Boolean(trimmedQualifyNotes),
          }),
        })

        await fetchLead()
        setShowQualifyModal(false)
        setInterestLevel('')
        setQualifyNotes('')
        alert('Lead qualified successfully')
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to qualify lead')
      }
    } catch (error) {
      console.error('Failed to qualify lead:', error)
      alert(error instanceof Error ? error.message : 'Failed to qualify lead')
    } finally {
      setSubmittingQualify(false)
    }
  }

  // Handle payment status update
  async function handlePaymentUpdate() {
    if (!paymentStatus) {
      alert('Please select a payment status')
      return
    }

    setSubmittingPayment(true)
    try {
      const updates: any = {
        payment_status: paymentStatus,
      }

      if (paymentAmount) {
        updates.payment_amount = parseFloat(paymentAmount)
      }
      if (advanceAmount) {
        updates.advance_amount = parseFloat(advanceAmount)
      }

      const response = await cachedFetch(`/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      if (response.ok) {
        const hadOrderFromAccepted = !!lastCreatedOrderId
        // Sync job card (order) payment status when we just created it from Accepted flow
        if (lastCreatedOrderId) {
          const orderPaymentStatus = paymentStatus === 'fully_paid' ? 'fully_paid' : paymentStatus === 'advance_received' ? 'advance_received' : 'pending'
          try {
            await cachedFetch(`/api/orders/${lastCreatedOrderId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ payment_status: orderPaymentStatus }),
            })
          } catch (e) {
            console.error('Failed to update order payment status:', e)
          }
          setLastCreatedOrderId(null)
        }

        // Update lead status based on payment
        let statusUpdate = ''
        if (paymentStatus === 'fully_paid') {
          statusUpdate = LEAD_STATUS.FULLY_PAID
          const alreadyConverted = hadOrderFromAccepted

          if (alreadyConverted) {
            // We just created job card from Accepted flow - only update status
            await cachedFetch(`/api/leads/${leadId}/status`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                status: LEAD_STATUS.FULLY_PAID,
                notes: `Payment status: Fully paid. Job card already created.`,
              }),
            })
            setShowPaymentModal(false)
            setPaymentStatus('')
            setPaymentAmount('')
            setAdvanceAmount('')
            alert('Payment recorded. Lead converted to customer and job card created.')
            window.location.href = '/customers'
          } else {
            // Convert lead to customer and create order (e.g. when opening payment from Deal Won)
            try {
              const convertResponse = await cachedFetch(`/api/leads/${leadId}/convert`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
              })

              if (!convertResponse.ok) {
                const errorData = await convertResponse.json()
                throw new Error(errorData.error || 'Failed to convert lead to customer')
              }

              const resLead = await cachedFetch(`/api/leads/${leadId}`).then(r => r.json())
              const currentStatus = resLead.lead?.status ?? resLead.status
              if (currentStatus !== LEAD_STATUS.FULLY_PAID) {
                await cachedFetch(`/api/leads/${leadId}/status`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    status: LEAD_STATUS.FULLY_PAID,
                    notes: `Payment status updated: ${paymentStatus}. Lead converted to customer.`,
                  }),
                })
              }

              alert('Payment status updated. Lead converted to customer and order created successfully!')
              window.location.href = '/customers'
            } catch (convertError) {
              console.error('Failed to convert lead:', convertError)
              await cachedFetch(`/api/leads/${leadId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  status: LEAD_STATUS.FULLY_PAID,
                  notes: `Payment status updated: ${paymentStatus}`,
                }),
              })
              throw convertError
            }
          }
        } else if (paymentStatus === 'advance_received') {
          statusUpdate = LEAD_STATUS.ADVANCE_RECEIVED
          
          // Show follow-up timer modal for partial payment
          setShowPaymentModal(false)
          setShowFollowUpModal(true)
          setFollowUpNotes('Follow-up for remaining payment - Advance received')
        } else if (paymentStatus === 'pending') {
          statusUpdate = LEAD_STATUS.PAYMENT_PENDING
          
          // Show follow-up timer modal for pending payment
          setShowPaymentModal(false)
          setShowFollowUpModal(true)
          setFollowUpNotes('Follow-up for payment - Payment pending')
        }

        if (statusUpdate && paymentStatus !== 'fully_paid') {
          await cachedFetch(`/api/leads/${leadId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: statusUpdate,
              notes: `Payment status updated: ${paymentStatus}`,
            }),
          })
        }

        if (paymentStatus !== 'fully_paid' && paymentStatus !== 'advance_received' && paymentStatus !== 'pending') {
          await fetchLead()
          setShowPaymentModal(false)
          setPaymentStatus('')
          setPaymentAmount('')
          setAdvanceAmount('')
          alert('Payment status updated successfully')
        } else if (paymentStatus === 'fully_paid') {
          // Already handled above with redirect
        }
        // For advance_received and pending, follow-up modal is shown
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update payment status')
      }
    } catch (error) {
      console.error('Failed to update payment:', error)
      alert(error instanceof Error ? error.message : 'Failed to update payment status')
    } finally {
      setSubmittingPayment(false)
    }
  }

  // Handle follow-up creation
  async function handleCreateFollowUp() {
    if (!followUpDate || !followUpTime) {
      alert('Please select both date and time for the follow-up')
      return
    }

    setSubmittingFollowUp(true)

    const leadDataForFollowUp = lead as any
    if (!userId || !leadDataForFollowUp?.assigned_to) {
      alert('Unable to create follow-up: Missing user or lead assignment')
      return
    }

    // Combine date and time
    const scheduledDateTime = new Date(`${followUpDate}T${followUpTime}`).toISOString()

    setSubmittingFollowUp(true)
    try {
      const response = await cachedFetch('/api/followups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: leadId,
          assigned_to: leadDataForFollowUp.assigned_to,
          scheduled_at: scheduledDateTime,
          notes: followUpNotes || null,
        }),
      })

      if (response.ok) {
        await fetchLead()
        setShowFollowUpModal(false)
        setFollowUpDate('')
        setFollowUpTime('')
        setFollowUpNotes('')
        // Clear payment modal state if it was triggered from payment update
        setPaymentStatus('')
        setPaymentAmount('')
        setAdvanceAmount('')
        alert('Follow-up scheduled successfully')
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create follow-up')
      }
    } catch (error) {
      console.error('Failed to create follow-up:', error)
      alert(error instanceof Error ? error.message : 'Failed to create follow-up')
    } finally {
      setSubmittingFollowUp(false)
    }
  }

  // Handle follow-up completion
  async function handleCompleteFollowUp(followUpId: string) {
    try {
      const response = await cachedFetch(`/api/followups/${followUpId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: 'Follow-up completed',
        }),
      })

      if (response.ok) {
        await fetchLead()
        alert('Follow-up marked as completed')
      } else {
        const errorData = await response.json()
        alert(errorData.error || 'Failed to complete follow-up')
      }
    } catch (error) {
      console.error('Failed to complete follow-up:', error)
      alert('Failed to complete follow-up')
    }
  }

  const overlayZ = embedded ? 'z-[100]' : 'z-40'
  const modalZ = embedded ? 'z-[110]' : 'z-50'
  /** Must sit above {@link modalZ} when embedded, or dialogs open behind the lead panel. */
  const nestedModalZ = embedded ? 'z-[120]' : 'z-50'

  if (loading) {
    if (embedded) {
      return (
        <>
          <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm ${overlayZ}`} aria-hidden />
          <div className={`fixed inset-0 flex items-center justify-center ${modalZ} pointer-events-none p-4`}>
            <div className="bg-white shadow-2xl rounded-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto pointer-events-auto p-6">
              <div className="text-lg text-gray-600">Loading...</div>
            </div>
          </div>
        </>
      )
    }
    return (
      <Layout>
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" />
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-white shadow-2xl rounded-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto pointer-events-auto p-6">
          <div className="text-lg text-gray-600">Loading...</div>
          </div>
        </div>
      </Layout>
    )
  }

  if (error || !lead) {
    if (embedded) {
      return (
        <>
          <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm ${overlayZ}`} onClick={() => onClose()} />
          <div className={`fixed inset-0 flex items-center justify-center ${modalZ} pointer-events-none p-4`}>
            <div className="bg-white shadow-2xl rounded-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto pointer-events-auto p-6">
              <div className="text-center">
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                  {error || 'Lead not found'}
                </div>
                <button
                  type="button"
                  onClick={() => onClose()}
                  className="text-indigo-600 hover:text-indigo-800"
                >
                  ← Back to Leads
                </button>
              </div>
            </div>
          </div>
        </>
      )
    }
    return (
      <Layout>
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" onClick={() => onClose()} />
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-white shadow-2xl rounded-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto pointer-events-auto p-6">
            <div className="text-center">
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error || 'Lead not found'}
            </div>
            <button
              onClick={() => onClose()}
              className="text-indigo-600 hover:text-indigo-800"
            >
              ← Back to Leads
            </button>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  const availableStatuses = getAvailableStatuses()
  const canUpdateStatus = userRole === 'tele_caller' || userRole === 'admin' || userRole === 'super_admin'
  const canDeleteLead = userRole === 'admin' || userRole === 'super_admin'

  // Raw product/interest string (requirement or meta_data) — may contain "| Car Model: X"
  function getRawProductInterest(): string {
    if (lead?.requirement) return lead.requirement.replace(/_/g, ' ')
    return getInterestedProductFromMeta(lead?.meta_data ?? null)
  }

  // Extract "Car Model: X" from string (e.g. "paint protection film | Car Model: nexon" -> "nexon")
  function extractCarModelFromString(s: string): string {
    if (!s || typeof s !== 'string') return ''
    const match = s.match(/\|\s*Car Model:\s*([^|]+)/i) || s.match(/Car Model:\s*([^|]+)/i)
    return match ? match[1].trim() : ''
  }

  // Strip "| Car Model: X" from product string
  function stripCarModelFromProductString(s: string): string {
    if (!s || typeof s !== 'string') return ''
    return s.replace(/\|\s*Car Model:\s*[^|]+/gi, '').replace(/Car Model:\s*[^|]+/gi, '').trim()
  }

  // Car model: from meta_data (direct keys or field_data), else from product string
  function getLeadCarModel(): string {
    const fromMeta = getCarModelFromMeta(lead?.meta_data ?? null)
    if (fromMeta) return fromMeta
    return extractCarModelFromString(getRawProductInterest())
  }

  // Interested product only (car model shown separately)
  function getLeadProductInterest(): string {
    return stripCarModelFromProductString(getRawProductInterest())
  }

  // Get vehicle name from meta_data or product string
  function getVehicleName() {
    const fromMeta = getCarModelFromMeta(lead?.meta_data ?? null)
    if (fromMeta) return fromMeta
    const fromProduct = extractCarModelFromString(getRawProductInterest())
    if (fromProduct) return fromProduct
    const fromRequirement = lead?.requirement ? lead.requirement.replace(/_/g, ' ') : ''
    if (fromRequirement) return fromRequirement
    return getInterestedProductFromMeta(lead?.meta_data ?? null) || ''
  }

  // Get estimated value from meta_data
  function getEstimatedValue() {
    if (lead?.meta_data?.payment_amount) {
      return `$${Number(lead.meta_data.payment_amount).toLocaleString()}`
    }
    if (lead?.meta_data?.budget_range) {
      return String(lead.meta_data.budget_range)
    }
    return null
  }

  // Get last contacted time
  function getLastContactedTime() {
    if (lead?.calls && lead.calls.length > 0) {
      const lastCall = lead.calls.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0]
      const date = new Date(lastCall.created_at)
      const now = new Date()
      const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
      if (diffDays === 0) return 'Today'
      if (diffDays === 1) return '1 day ago'
      return `${diffDays} days ago`
    }
    return null
  }

  // Get next follow-up
  function getNextFollowUp() {
    if (lead?.follow_ups && lead.follow_ups.length > 0) {
      const upcoming = lead.follow_ups
        .filter(fu => fu.status === 'pending' && new Date(fu.scheduled_at) >= new Date())
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
      if (upcoming.length > 0) {
        return new Date(upcoming[0].scheduled_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      }
    }
    return null
  }

  /**
   * Follow-up rows store a system prefix plus user text (e.g. "Follow-up scheduled after call: … . user note").
   * Notes panel should show only the user-entered part.
   */
  function extractFollowUpUserNote(raw: string | null | undefined): string | null {
    let t = (raw ?? '').trim()
    if (!t) return null
    const afterScheduledCall = t.replace(/^Follow-up scheduled after call:\s*.+?\.\s*/i, '').trim()
    if (afterScheduledCall !== t) {
      t = afterScheduledCall
    } else {
      t = t.replace(/^Call Later - Follow-up scheduled\.\s*/i, '').trim()
    }
    if (!t) return null
    if (/^Follow-up completed$/i.test(t)) return null
    return t
  }

  /** Follow-ups with user-visible note text only, newest scheduled first (for Notes panel). */
  function getFollowUpsWithNotesSorted() {
    if (!lead?.follow_ups?.length) return []
    return lead.follow_ups
      .filter((fu) => extractFollowUpUserNote(fu.notes) != null)
      .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
  }

  function getLeadNotesSorted() {
    if (!lead?.lead_notes?.length) return []
    return [...lead.lead_notes]
      .filter((n) => n.note?.trim())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }

  // Get interests from meta_data
  function getInterests() {
    if (lead?.meta_data) {
      const interests = []
      if (lead.meta_data.interests) {
        if (Array.isArray(lead.meta_data.interests)) {
          interests.push(...lead.meta_data.interests)
        } else {
          interests.push(lead.meta_data.interests)
        }
      }
      // Check for common interest fields
      if (lead.meta_data) {
        const metaData = lead.meta_data
        const interestFields = ['interest', 'preferences', 'looking_for', 'requirements']
        interestFields.forEach(field => {
          if (metaData[field]) {
            interests.push(metaData[field])
          }
        })
      }
      return interests.filter(Boolean)
    }
    return []
  }

  // Get status badge color (Figma: Negotiation #fce4e0/#dd3f3c, High #fbf4d9/#604927)
  function getStatusBadgeColor(status: string) {
    const statusLower = status.toLowerCase()
    if (statusLower.includes('review') || statusLower.includes('qualified')) {
      return 'bg-[#fbf4d9] text-[#604927]'
    }
    if (statusLower.includes('negotiation')) {
      return 'bg-[#fce4e0] text-[#dd3f3c]'
    }
    if (statusLower.includes('new')) {
      return 'bg-blue-100 text-blue-800'
    }
    if (statusLower.includes('approved') || statusLower.includes('converted') || statusLower.includes('deal_won')) {
      return 'bg-green-100 text-green-800'
    }
    return 'bg-gray-100 text-gray-800'
  }

  // Format status name
  function formatStatusName(status: string): string {
    // Use LEAD_STATUS_LABELS if available, otherwise format manually
    if (LEAD_STATUS_LABELS[status as keyof typeof LEAD_STATUS_LABELS]) {
      return LEAD_STATUS_LABELS[status as keyof typeof LEAD_STATUS_LABELS]
    }
    const statusLower = status.toLowerCase()
    if (statusLower.includes('review')) return 'In review'
    if (statusLower.includes('negotiation')) return 'Negotiation'
    if (statusLower === 'new') return 'New'
    if (statusLower === 'contacted') return 'Contacted'
    if (statusLower === 'discarded') return 'Discarded'
    if (statusLower.includes('approved') || statusLower.includes('converted') || statusLower.includes('deal_won')) return 'Approved'
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  return (
    <>
      {!embedded && (
        <div className="min-h-screen bg-gray-50 relative">
          {/* Blurred Background - Leads Page Content */}
          <div className="fixed inset-0 overflow-y-auto pointer-events-none">
            <Layout>
              <div className="p-4 md:p-6 lg:p-8 w-full">
                {/* Simplified Leads Page Background - Mimics actual leads page structure */}
                <div className="w-full">
                  {/* Header Section */}
                  <div className="mb-6">
                    <h1 className="text-2xl font-bold text-gray-900 mb-4">Leads</h1>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 h-24">
                          <div className="h-4 bg-gray-200 rounded w-20 mb-2"></div>
                          <div className="h-6 bg-gray-200 rounded w-16"></div>
                        </div>
                      ))}
                    </div>
                    {/* Filter Bar */}
                    <div className="bg-black rounded-lg p-4 mb-4">
                      <div className="flex items-center gap-4">
                        <div className="h-8 bg-gray-700 rounded w-32"></div>
                        <div className="h-8 bg-gray-700 rounded flex-1"></div>
                        <div className="h-8 bg-gray-700 rounded w-24"></div>
                      </div>
                    </div>
                  </div>
                  {/* Table/List Section */}
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-4 border-b border-gray-200">
                      <div className="grid grid-cols-7 gap-4">
                        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                          <div key={i} className="h-4 bg-gray-200 rounded"></div>
                        ))}
                      </div>
                    </div>
                    <div className="divide-y divide-gray-200">
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                        <div key={i} className="p-4 grid grid-cols-7 gap-4">
                          <div className="h-4 bg-gray-100 rounded w-24"></div>
                          <div className="h-4 bg-gray-100 rounded w-20"></div>
                          <div className="h-4 bg-gray-100 rounded w-16"></div>
                          <div className="h-4 bg-gray-100 rounded w-20"></div>
                          <div className="h-4 bg-gray-100 rounded w-24"></div>
                          <div className="h-4 bg-gray-100 rounded w-16"></div>
                          <div className="h-4 bg-gray-100 rounded w-20"></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Layout>
          </div>
        </div>
      )}

      {/* Blur Overlay */}
      <div
        className={`fixed inset-0 bg-black/20 backdrop-blur-md ${overlayZ}`}
        onClick={() => onClose()}
      />

      {/* Centered Modal - Figma design (800px, border #eaecee) */}
      <div className={`fixed inset-0 flex items-center justify-center ${modalZ} pointer-events-none p-4`}>
        <div className="bg-white shadow-2xl rounded-[12px] w-full max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col pointer-events-auto border border-[#eaecee]" style={{ fontFamily: 'Poppins, sans-serif' }}>
        {/* Header - Figma: name, vehicle, status pills, date + close */}
        <div className="sticky top-0 bg-white border-b border-[#eaecee] z-10 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-[20px] font-bold text-black leading-tight mb-0.5">{lead?.name || 'Loading...'}</h1>
              {getVehicleName() && (
                <p className="text-[14px] text-black/80 leading-[1.5] mb-3">{getVehicleName()}</p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                {lead?.status && (
                  <span className={`px-2.5 py-1 text-[10px] font-medium rounded-[3px] ${getStatusBadgeColor(lead.status)}`}>
                    {formatStatusName(lead.status)}
                  </span>
                )}
                {lead?.interest_level === 'hot' && (
                  <span className="px-2.5 py-1 text-[10px] font-medium rounded-[3px] bg-[#fbf4d9] text-[#604927] flex items-center gap-1">
                    <TrendingUp size={12} className="opacity-90" />
                    High
                  </span>
                )}
                {lead?.interest_level === 'warm' && (
                  <span className="px-2.5 py-1 text-[10px] font-medium rounded-[3px] bg-[#fbf4d9] text-[#604927]">Warm</span>
                )}
                {lead?.interest_level === 'cold' && (
                  <span className="px-2.5 py-1 text-[10px] font-medium rounded-[3px] bg-blue-100 text-blue-800">Cold</span>
                )}
                <span className="px-2.5 py-1 text-[10px] font-medium rounded-[3px] bg-red-100 text-red-800">High Priority</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-[#393941] leading-[1.5]">
                Date: {lead?.created_at ? new Date(lead.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
              </span>
              {canDeleteLead && (
                <button
                  onClick={handleDeleteLead}
                  disabled={deletingLead}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors disabled:opacity-50"
                  title="Delete lead"
                >
                  <Trash2 size={18} />
                </button>
              )}
              <button
                onClick={() => onClose()}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable body – footer stays pinned below; extra bottom padding so audio controls aren’t clipped */}
        <div className="px-6 pt-6 pb-8 overflow-y-auto overflow-x-hidden flex-1 min-h-0 overscroll-contain">
          <div className="grid gap-6 grid-cols-1 md:grid-cols-[360px_170px_170px] max-w-[800px] mx-auto">
            {/* Column 1 (360px) - Contact, Lead Details, Interests, Buttons */}
            <div className="flex flex-col gap-6">
              {/* Contact Information */}
              <div>
                <h2 className="text-[15px] font-medium text-black mb-3 flex items-center gap-2 leading-none">
                  <span className="w-6 h-6 rounded-[3px] bg-[rgba(248,229,231,0.4)] flex items-center justify-center shrink-0">
                    <User size={12} className="text-[#dd3f3c]" />
                  </span>
                  Contact Information
                </h2>
                <div className="bg-[#fafafa] rounded-[5px] p-4 min-h-[100px]">
                  {lead?.phone && (
                    <div className="flex items-start gap-2 mb-3">
                      <Phone size={15} className="text-[#717d8a] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] text-[#717d8a] leading-[1.3]">Mobile</p>
                        <p className="text-[12px] font-semibold text-black leading-[1.3]">{lead.phone.replace(/^(p|tel|phone|mobile):/i, '').trim()}</p>
                      </div>
                    </div>
                  )}
                  {(lead?.meta_data?.company || lead?.meta_data?.Company) && (
                    <>
                      <div className="border-t border-[#e0e0e0] my-2" />
                      <div className="flex items-start gap-2 mb-3">
                        <Building2 size={15} className="text-[#717d8a] shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] text-[#717d8a] leading-[1.3]">Company</p>
                          <p className="text-[12px] font-semibold text-black leading-[1.3]">{lead.meta_data?.company || lead.meta_data?.Company}</p>
                        </div>
                      </div>
                    </>
                  )}
                  {lead?.email && (
                    <div className="flex items-start gap-2 mb-3">
                      <Mail size={15} className="text-[#717d8a] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] text-[#717d8a] leading-[1.3]">Email</p>
                        <p className="text-[12px] font-semibold text-black leading-[1.3]">{lead.email}</p>
                      </div>
                    </div>
                  )}
                  {(lead?.meta_data?.location || lead?.meta_data?.city) && (
                    <div className="flex items-start gap-2">
                      <MapPin size={14} className="text-[#717d8a] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] text-[#717d8a] leading-[1.3]">Location</p>
                        <p className="text-[12px] font-semibold text-black leading-[1.3]">{lead?.meta_data?.location || (lead?.meta_data?.city && lead?.meta_data?.country ? `${lead.meta_data!.city}, ${lead.meta_data!.country}` : '-')}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Lead Details */}
              <div>
                <h2 className="text-[15px] font-medium text-black mb-3 flex items-center gap-2 leading-none">
                  <span className="w-6 h-6 rounded-[3px] bg-[rgba(248,229,231,0.4)] flex items-center justify-center shrink-0">
                    <TrendingUp size={12} className="text-[#dd3f3c]" />
                  </span>
                  Lead Details
                </h2>
                <div className="bg-[#fafafa] rounded-[5px] p-4 min-h-[100px]">
                  <div className="mb-3">
                    <p className="text-[10px] text-[#717d8a] leading-[1.3]">Source</p>
                    <p className="text-[12px] font-semibold text-black leading-[1.3] capitalize">{lead?.source || 'N/A'}</p>
                  </div>
                  <div className="border-t border-[#e0e0e0] my-2" />
                  <div className="mb-3">
                    <p className="text-[10px] text-[#717d8a] leading-[1.3]">Created At</p>
                    <p className="text-[12px] font-semibold text-black leading-[1.3]">{lead?.created_at ? new Date(lead.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'}</p>
                  </div>
                  <div className="mb-3">
                    <p className="text-[10px] text-[#717d8a] leading-[1.3]">ad_name</p>
                    <p className="text-[12px] font-semibold text-black leading-[1.3]">{lead?.ad_name || '-'}</p>
                  </div>
                  <div className="mb-3">
                    <p className="text-[10px] text-[#717d8a] leading-[1.3]">campaign_name</p>
                    <p className="text-[12px] font-semibold text-black leading-[1.3]">{lead?.campaign_name || '-'}</p>
                  </div>
                  {getEstimatedValue() && (
                    <div className="mb-3">
                      <p className="text-[10px] text-[#717d8a] leading-[1.3]">Estimated Value</p>
                      <p className="text-[12px] font-semibold text-black leading-[1.3]">{getEstimatedValue()}</p>
                    </div>
                  )}
                  {getLastContactedTime() && (
                    <div>
                      <p className="text-[10px] text-[#717d8a] leading-[1.3]">Last Contacted</p>
                      <p className="text-[12px] font-semibold text-black leading-[1.3]">{getLastContactedTime()}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Interests - pills + Car model & Interested product (same detail as before) */}
              <div>
                <h2 className="text-[15px] font-medium text-black mb-3 flex items-center gap-2 leading-none">
                  <span className="w-6 h-6 rounded-[3px] bg-[rgba(248,229,231,0.4)] flex items-center justify-center shrink-0">
                    <Gem size={12} className="text-[#dd3f3c]" />
                  </span>
                  Interests
                </h2>
                <div className="bg-[#fafafa] rounded-[5px] p-4 space-y-3">
                  {getInterests().length > 0 && (
                    <div>
                      <p className="text-[10px] text-[#717d8a] leading-[1.3] mb-2">Tags</p>
                      <div className="flex flex-wrap gap-2">
                        {getInterests().map((interest, index) => (
                          <span key={index} className="px-3 py-1.5 bg-[#e6fbd9] text-[#38a646] rounded-[3px] text-[11px] font-medium leading-none">
                            {String(interest).replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] text-[#717d8a] leading-[1.3]">Car model</p>
                    <p className="text-[12px] font-semibold text-black leading-[1.3]">{getLeadCarModel() || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#717d8a] leading-[1.3]">Interested product</p>
                    <p className="text-[12px] font-semibold text-black leading-[1.3]">{getLeadProductInterest() || '—'}</p>
                  </div>
                  {getInterests().length === 0 && !getLeadCarModel() && !getLeadProductInterest() && (
                    <p className="text-[11px] text-[#717d8a]">No interests recorded</p>
                  )}
                </div>
              </div>
            </div>

            {/* Column 2 (170px) - Assigned To + Next Follow-up */}
            <div className="flex flex-col gap-6">
              <div className="min-h-[100px]">
                <h2 className="text-[15px] font-medium text-black mb-3 flex items-center gap-2 leading-none">
                  <span className="w-6 h-6 rounded-[3px] bg-[rgba(248,229,231,0.4)] flex items-center justify-center shrink-0">
                    <User size={13} className="text-[#dd3f3c]" />
                  </span>
                  Assigned To
                </h2>
                {lead?.assigned_user ? (
                  <div className="flex items-center gap-2">
                    <div className="relative shrink-0">
                      {lead.assigned_user.profile_image_url ? (
                        <Image src={lead.assigned_user.profile_image_url} alt={lead.assigned_user.name} width={43} height={43} className="w-[43px] h-[43px] rounded-full object-cover" />
                      ) : (
                        <div className="w-[43px] h-[43px] rounded-full bg-[#ed1b24] flex items-center justify-center text-white font-bold text-sm">
                          {lead.assigned_user.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 rounded-full border-2 border-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-black leading-[1.4] truncate">{lead.assigned_user.name}</p>
                      <p className="text-[12px] text-black leading-[1.4]">Sales Executive</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-[#717d8a]">Unassigned</p>
                )}
              </div>

              <div className="min-h-[100px]">
                <h2 className="text-[15px] font-medium text-black mb-3 flex items-center gap-2 leading-none">
                  <span className="w-6 h-6 rounded-[3px] bg-[rgba(248,229,231,0.4)] flex items-center justify-center shrink-0">
                    <Calendar size={14} className="text-[#dd3f3c]" />
                  </span>
                  Next Follow-up
                </h2>
                <p className="text-[14px] text-black leading-[1.3]">
                  {(() => { const n = getNextFollowUp(); return n ? n.replace(/,/g, ' | ') : '—'; })()}
                </p>
              </div>
            </div>

            {/* Column 3 (170px) - Notes only; Recent Activity moved full-width below for audio controls */}
            <div className="relative flex flex-col gap-6">
              <div className="absolute top-0 bottom-0 right-0 w-0.5 bg-[#dd3f3c]" />
              <div className="min-h-[100px] pr-1">
                <h2 className="text-[15px] font-medium text-black mb-3 flex items-center gap-2 leading-none">
                  <span className="w-6 h-6 rounded-[3px] bg-[rgba(248,229,231,0.4)] flex items-center justify-center shrink-0">
                    <FileText size={14} className="text-[#dd3f3c]" />
                  </span>
                  Notes
                </h2>
                <div className="max-h-52 overflow-y-auto text-[11px] text-black leading-[1.4] space-y-3 pr-0.5">
                  {(() => {
                    const followUpsWithNotes = getFollowUpsWithNotesSorted()
                    const leadNotes = getLeadNotesSorted()
                    if (leadNotes.length === 0 && followUpsWithNotes.length === 0) {
                      return <p className="whitespace-pre-wrap">No notes yet.</p>
                    }
                    return (
                      <>
                        {leadNotes.map((ln) => (
                          <p key={`lead-note-${ln.id}`} className="whitespace-pre-wrap border-b border-black/5 pb-2 last:border-0 last:pb-0">
                            {ln.note}
                          </p>
                        ))}
                        {followUpsWithNotes.map((fu) => (
                          <p key={`followup-note-${fu.id}`} className="whitespace-pre-wrap border-b border-black/5 pb-2 last:border-0 last:pb-0">
                            {extractFollowUpUserNote(fu.notes) ?? ''}
                          </p>
                        ))}
                      </>
                    )
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Full width: native audio needs ~300px+; 170px column clipped all controls */}
          <div className="max-w-[800px] mx-auto mt-8 w-full border-t border-[#eaecee] pt-6 pb-2 border-l-4 border-[#dd3f3c] pl-4">
            <h2 className="text-[15px] font-medium text-black mb-3 flex items-center gap-2 leading-none">
              <span className="w-6 h-6 rounded-[3px] bg-[rgba(248,229,231,0.4)] flex items-center justify-center shrink-0">
                <TrendingUp size={12} className="text-[#dd3f3c]" />
              </span>
              Recent Activity
            </h2>
            <div className="space-y-3 text-[11px] pr-1">
              {lead?.status_history && lead.status_history.length > 0 && lead.status_history.slice(0, 8).map((history) => {
                const timeStr = formatActivityListWhen(history.created_at)
                return (
                  <div key={history.id}>
                    <p className="text-[#717d8a] leading-[1.3]">{timeStr}</p>
                    <p className="font-semibold text-black leading-[1.3]">Lead status updated to {formatStatusName(history.new_status)}</p>
                  </div>
                )
              })}
              {lead?.calls && lead.calls.length > 0 && lead.calls.slice(0, 15).map((call) => {
                const timeStr = formatActivityListWhen(call.created_at)
                const dur =
                  call.call_duration != null
                    ? `${Math.floor(call.call_duration / 60)}:${String(call.call_duration % 60).padStart(2, '0')}`
                    : null
                const startedAt = call.started_at ? new Date(call.started_at) : null
                const endedAt = call.ended_at ? new Date(call.ended_at) : null
                const timeWindow =
                  startedAt && endedAt
                    ? `${startedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${endedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
                    : null
                return (
                  <div key={call.id}>
                    <p className="text-[#717d8a] leading-[1.3]">{timeStr}</p>
                    <p className="font-semibold text-black leading-[1.3]">
                      {call.integration === 'mcube' ? 'MCUBE call' : 'Phone call'} —{' '}
                      {CALL_OUTCOME_LABELS[call.outcome as keyof typeof CALL_OUTCOME_LABELS] ?? call.outcome}
                      {dur ? ` · ${dur}` : ''}
                      {call.direction ? ` · ${call.direction}` : ''}
                      {call.dial_status ? ` · ${call.dial_status}` : ''}
                    </p>
                    <p className="text-black/80 leading-[1.3] mt-0.5">
                      {call.notes || (call.integration === 'mcube' ? 'Logged from MCUBE' : 'Discussed pricing and features')}
                    </p>
                    {timeWindow ? (
                      <p className="text-[11px] text-[#717d8a] leading-[1.3] mt-0.5">
                        Call timing: {timeWindow}
                      </p>
                    ) : null}
                    {call.integration === 'mcube' && (call.mcube_agent_name || call.disconnected_by || call.mcube_group_name) ? (
                      <p className="text-[11px] text-[#717d8a] leading-[1.3] mt-0.5">
                        {call.mcube_agent_name ? `Agent: ${call.mcube_agent_name}` : ''}
                        {call.mcube_agent_name && (call.disconnected_by || call.mcube_group_name) ? ' · ' : ''}
                        {call.disconnected_by ? `Disconnected by: ${call.disconnected_by}` : ''}
                        {call.disconnected_by && call.mcube_group_name ? ' · ' : ''}
                        {call.mcube_group_name ? `Group: ${call.mcube_group_name}` : ''}
                      </p>
                    ) : null}
                    {call.recording_url ? (
                      <div className="mt-3 w-full min-w-0 rounded-lg border border-[#e5e7eb] bg-[#f1f5f9] p-4">
                        <p className="text-[10px] font-medium text-[#4b5563] mb-3">Call recording</p>
                        <div className="w-full min-h-[64px] rounded-md bg-white p-2 shadow-sm ring-1 ring-black/5 [&_audio]:min-h-[52px]">
                          <audio
                            controls
                            preload="metadata"
                            className="block w-full min-w-0 max-w-full align-top"
                          >
                            <source src={call.recording_url} type="audio/wav" />
                            <source src={call.recording_url} type="audio/mpeg" />
                            <source src={call.recording_url} type="audio/mp4" />
                            <source src={call.recording_url} type="audio/webm" />
                            Your browser does not support audio preview.
                          </audio>
                        </div>
                        <a
                          href={call.recording_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-[#2563eb] hover:text-[#1d4ed8] underline mt-2 inline-block"
                        >
                          Open in new tab
                        </a>
                      </div>
                    ) : null}
                  </div>
                )
              })}
              {(!lead?.status_history || lead.status_history.length === 0) && (!lead?.calls || lead.calls.length === 0) && (
                <p className="text-[#717d8a]">No recent activity</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer – pinned to bottom of dialog; body scrolls above */}
        <div className="shrink-0 bg-white border-t border-[#eaecee] px-6 py-4 flex flex-wrap gap-3 rounded-b-[12px]">
          <button
            onClick={async () => {
              await fetchLead()
              await syncMcubeInboundCalls(true)
              setShowCallModal(true)
            }}
            className="h-10 px-5 rounded-[6px] bg-[#ed1b24] text-white font-bold text-[15px] leading-5 tracking-[0.3px] flex items-center justify-center gap-2 min-w-[140px]"
            style={{ fontFamily: 'Roboto, sans-serif' }}
          >
            <Phone size={16} />
            Update status
          </button>
          <button
            type="button"
            onClick={() => void handleMcubeOutbound()}
            disabled={mcubeCalling}
            className="h-10 px-5 rounded-[6px] bg-[#1a1a1a] text-white font-bold text-[15px] leading-5 tracking-[0.3px] flex items-center justify-center gap-2 min-w-[140px] disabled:opacity-50"
            style={{ fontFamily: 'Roboto, sans-serif' }}
          >
            <Phone size={16} />
            {mcubeCalling ? 'Calling…' : 'Call via MCUBE'}
          </button>
          {(lead?.status === LEAD_STATUS.QUALIFIED || lead?.status === LEAD_STATUS.QUOTATION_SHARED || lead?.status === LEAD_STATUS.QUOTATION_VIEWED || lead?.status === LEAD_STATUS.QUOTATION_ACCEPTED || lead?.status === LEAD_STATUS.QUOTATION_EXPIRED) && leadQuotations.length > 0 && (
            <Link href={`/quotations/${leadQuotations[0].id}`} className="h-10 px-5 rounded-[6px] bg-[#4eb159] text-white font-bold text-[15px] leading-5 tracking-[0.3px] flex items-center justify-center gap-2 min-w-[140px]" style={{ fontFamily: 'Roboto, sans-serif' }}>
              <Eye size={18} />
              View Quotation
            </Link>
          )}
          <button onClick={() => router.push(`/leads/${leadId}/history`)} className="h-10 px-5 rounded-[6px] bg-[#fafafa] border border-[#e0e0e0] text-black font-bold text-[15px] leading-5 tracking-[0.3px] flex items-center justify-center min-w-[140px]" style={{ fontFamily: 'Roboto, sans-serif' }}>
            View full History
          </button>
          {lead?.status === LEAD_STATUS.QUALIFIED && leadQuotations.length > 0 && (
            <button
              onClick={async () => {
                setMarkingQuotationShared(true)
                try {
                  const res = await cachedFetch(`/api/leads/${leadId}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: LEAD_STATUS.QUOTATION_SHARED, notes: 'Quotation shared with lead' }) })
                  if (res.ok) await fetchLead()
                  else { const err = await res.json(); alert(err.error || 'Failed to update status') }
                } catch (e) { console.error(e); alert('Failed to update status') }
                finally { setMarkingQuotationShared(false) }
              }}
              disabled={markingQuotationShared}
              className="h-[37px] px-5 rounded-[6px] bg-amber-600 text-white font-bold text-[15px] hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ fontFamily: 'Roboto, sans-serif' }}
            >
              <Share2 size={18} />
              {markingQuotationShared ? 'Updating...' : 'Mark as Quotation Shared'}
            </button>
          )}
          {lead?.status === LEAD_STATUS.QUALIFIED && (
            <button
              onClick={() => setShowQuotationModal(true)}
              className="h-[37px] px-5 rounded-[6px] bg-[#4eb159] text-white font-bold text-[15px] hover:bg-[#45a050] flex items-center justify-center gap-2"
              style={{ fontFamily: 'Roboto, sans-serif' }}
            >
              <FilePlus size={18} />
              {leadQuotations.length > 0 ? 'Create Another Quotation' : 'Create Quotation'}
            </button>
          )}
          {(lead?.status === LEAD_STATUS.QUOTATION_SHARED || lead?.status === LEAD_STATUS.NEGOTIATION) && (
            <button
              type="button"
              onClick={() => { setFollowUpNotes('Follow-up for quotation / negotiation'); setShowFollowUpModal(true) }}
              className="h-[37px] px-5 rounded-[6px] bg-sky-600 text-white font-bold text-[15px] hover:bg-sky-700 flex items-center justify-center gap-2"
              style={{ fontFamily: 'Roboto, sans-serif' }}
            >
              <Calendar size={18} />
              Schedule Follow-up
            </button>
          )}
        </div>
        </div>
      </div>

      {/* Modals */}
      {/* Call Outcome Modal */}
          {showCallModal && (
        <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center ${nestedModalZ}`}>
          <div className="bg-white rounded-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto shadow-2xl" style={{ fontFamily: 'Poppins, sans-serif' }}>
            {/* Red Header */}
            <div className="bg-[#de0510] text-white px-6 py-4 rounded-t-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Phone size={20} className="text-white" />
                <div>
                  <h3 className="text-lg font-semibold">Call Outcome</h3>
                  <p className="text-sm text-white/90">{lead?.name} • {lead?.phone?.replace(/^(p|tel|phone|mobile):/i, '').trim() || ''}</p>
                </div>
              </div>
          <button
                onClick={() => {
                  setShowCallModal(false)
                  resetCallForm()
                }}
                className="text-white hover:bg-white/20 rounded-full p-1 transition-colors"
              >
                <X size={20} />
          </button>
        </div>

            <div className="p-6">
              {/* Quotation Shared / Negotiation: only Accepted, Not Accepted, Negotiation */}
              {isQuotationCallFlow ? (
                <>
                  <h4 className="text-base font-medium text-gray-900 mb-4">Quotation response?</h4>
                  <div className="space-y-3 mb-6">
                    <button
                      type="button"
                      onClick={() => setQuotationCallOutcome('accepted')}
                      className={`w-full text-left px-6 py-4 rounded-xl border-2 transition-all ${
                        quotationCallOutcome === 'accepted' ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${quotationCallOutcome === 'accepted' ? 'bg-green-500' : 'bg-gray-100'}`}>
                          <CheckCircle size={24} className={quotationCallOutcome === 'accepted' ? 'text-white' : 'text-gray-400'} />
                        </div>
                        <div className="flex-1">
                          <p className={`font-semibold mb-1 ${quotationCallOutcome === 'accepted' ? 'text-green-700' : 'text-gray-900'}`}>Accepted</p>
                          <p className="text-sm text-gray-600">Mark as deal won, convert to customer & generate job card.</p>
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuotationCallOutcome('not_accepted')}
                      className={`w-full text-left px-6 py-4 rounded-xl border-2 transition-all ${
                        quotationCallOutcome === 'not_accepted' ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-red-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${quotationCallOutcome === 'not_accepted' ? 'bg-red-500' : 'bg-gray-100'}`}>
                          <ThumbsDown size={24} className={quotationCallOutcome === 'not_accepted' ? 'text-white' : 'text-gray-400'} />
                        </div>
                        <div className="flex-1">
                          <p className={`font-semibold mb-1 ${quotationCallOutcome === 'not_accepted' ? 'text-red-700' : 'text-gray-900'}`}>Not Accepted</p>
                          <p className="text-sm text-gray-600">Discard lead.</p>
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuotationCallOutcome('negotiation')}
                      className={`w-full text-left px-6 py-4 rounded-xl border-2 transition-all ${
                        quotationCallOutcome === 'negotiation' ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-amber-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${quotationCallOutcome === 'negotiation' ? 'bg-amber-500' : 'bg-gray-100'}`}>
                          <Pencil size={24} className={quotationCallOutcome === 'negotiation' ? 'text-white' : 'text-gray-400'} />
                        </div>
                        <div className="flex-1">
                          <p className={`font-semibold mb-1 ${quotationCallOutcome === 'negotiation' ? 'text-amber-700' : 'text-gray-900'}`}>Negotiation</p>
                          <p className="text-sm text-gray-600">Update quotation, then mark Accepted or Not Accepted later.</p>
                        </div>
                      </div>
                    </button>
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t">
                    <button
                      type="button"
                      onClick={() => { setShowCallModal(false); resetCallForm(); }}
                      className="px-6 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                      disabled={submittingCall}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleQuotationCallOutcomeSubmit}
                      disabled={submittingCall || !quotationCallOutcome}
                      className="px-6 py-2 text-white bg-[#de0510] rounded-lg hover:bg-[#c0040e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      {submittingCall ? 'Processing...' : 'Confirm'}
                    </button>
                  </div>
                </>
              ) : (
                <>
              {/* Question */}
              <h4 className="text-base font-medium text-gray-900 mb-4">What was the call outcome?</h4>
              {syncingInboundCalls && (
                <p className="text-xs text-gray-500 mb-3">Syncing latest MCUBE call details...</p>
              )}
              
              {/* Outcome Options */}
              <div className="space-y-3 mb-6">
                    {/* Connected - Green */}
                    {canShowConnectedOption && (
                      <button
                        type="button"
                        onClick={() => void handleConnectedClick()}
                        className={`w-full text-left px-6 py-4 rounded-xl border-2 transition-all ${
                          callOutcome === CALL_OUTCOME.CONNECTED
                            ? 'border-green-500 bg-green-50'
                            : 'border-gray-200 hover:border-green-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                            callOutcome === CALL_OUTCOME.CONNECTED ? 'bg-green-500' : 'bg-gray-100'
                          }`}>
                            <Phone size={24} className={callOutcome === CALL_OUTCOME.CONNECTED ? 'text-white' : 'text-gray-400'} />
        </div>
                          <div className="flex-1">
                            <p className={`font-semibold mb-1 ${callOutcome === CALL_OUTCOME.CONNECTED ? 'text-green-700' : 'text-gray-900'}`}>
                              Connected
                            </p>
                            <p className="text-sm text-gray-600">Successfully spoke with the lead.</p>
                          </div>
                        </div>
                      </button>
                    )}

                    {/* Not Reachable - Orange */}
                    <button
                      type="button"
                      onClick={() => setCallOutcome('not_reachable')}
                      className={`w-full text-left px-6 py-4 rounded-xl border-2 transition-all ${
                        callOutcome === CALL_OUTCOME.NOT_REACHABLE
                          ? 'border-orange-500 bg-orange-50'
                          : 'border-gray-200 hover:border-orange-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                          callOutcome === CALL_OUTCOME.NOT_REACHABLE ? 'bg-orange-500' : 'bg-gray-100'
                        }`}>
                          <Phone size={24} className={callOutcome === 'not_reachable' ? 'text-white' : 'text-gray-400'} />
                        </div>
                        <div className="flex-1">
                          <p className={`font-semibold mb-1 ${callOutcome === 'not_reachable' ? 'text-orange-700' : 'text-gray-900'}`}>
                            Not Reachable
                          </p>
                          <p className="text-sm text-gray-600">No answer or phone switched off.</p>
                        </div>
                      </div>
                    </button>

                    {/* Wrong Number - Red */}
                    <button
                      type="button"
                      onClick={() => setCallOutcome('wrong_number')}
                      className={`w-full text-left px-6 py-4 rounded-xl border-2 transition-all ${
                        callOutcome === 'wrong_number'
                          ? 'border-red-500 bg-red-50'
                          : 'border-gray-200 hover:border-red-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                          callOutcome === 'wrong_number' ? 'bg-red-500' : 'bg-gray-100'
                        }`}>
                          <X size={24} className={callOutcome === 'wrong_number' ? 'text-white' : 'text-gray-400'} />
                        </div>
                        <div className="flex-1">
                          <p className={`font-semibold mb-1 ${callOutcome === 'wrong_number' ? 'text-red-700' : 'text-gray-900'}`}>
                            Wrong Number
                          </p>
                          <p className="text-sm text-gray-600">Invalid or incorrect contact number.</p>
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Conditional Expansion Based on Outcome */}
                  {callOutcome && (
                    <div className="border-t pt-6 space-y-4 animate-slideUp">
                      {/* Connected Flow - Call timing then Sub-Options */}
                      {callOutcome === CALL_OUTCOME.CONNECTED && !connectedSubOption && (
                        <div className="space-y-6">
                          <div>
                            <h4 className="text-base font-medium text-gray-900 mb-3">Call timing</h4>
                            <p className="text-sm text-gray-600 mb-3">When did the call start and end? (Required for Interested / Not Interested)</p>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Start time</label>
                                <input
                                  type="time"
                                  value={callStartTime}
                                  onChange={(e) => setCallStartTime(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">End time</label>
                                <input
                                  type="time"
                                  value={callEndTime}
                                  onChange={(e) => setCallEndTime(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                                />
                              </div>
                            </div>
                          </div>
                          <div>
                            <h4 className="text-base font-medium text-gray-900 mb-4">What was the outcome of the call?</h4>
                            <div className="space-y-3">
                            {/* Interested */}
                            <button
                              type="button"
                              onClick={() => setConnectedSubOption('interested')}
                              className={`w-full text-left px-6 py-4 rounded-xl border-2 transition-all ${
                                (connectedSubOption as 'interested' | 'not_interested' | 'call_later' | '') === 'interested'
                                  ? 'border-green-500 bg-green-50'
                                  : 'border-gray-200 hover:border-green-300 bg-white'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                                  (connectedSubOption as 'interested' | 'not_interested' | 'call_later' | '') === 'interested' ? 'bg-green-500' : 'bg-gray-100'
                                }`}>
                                  <ThumbsUp size={24} className={(connectedSubOption as 'interested' | 'not_interested' | 'call_later' | '') === 'interested' ? 'text-white' : 'text-gray-400'} />
                                </div>
                                <div className="flex-1">
                                  <p className={`font-semibold mb-1 ${(connectedSubOption as 'interested' | 'not_interested' | 'call_later' | '') === 'interested' ? 'text-green-700' : 'text-gray-900'}`}>
                                    Interested
                                  </p>
                                  <p className="text-sm text-gray-600">Lead wants to proceed further.</p>
                                </div>
                              </div>
                            </button>

                            {/* Not Interested */}
                            <button
                              type="button"
                              onClick={() => setConnectedSubOption('not_interested')}
                              className={`w-full text-left px-6 py-4 rounded-xl border-2 transition-all ${
                                (connectedSubOption as 'interested' | 'not_interested' | 'call_later' | '') === 'not_interested'
                                  ? 'border-red-500 bg-red-50'
                                  : 'border-gray-200 hover:border-red-300 bg-white'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                                  (connectedSubOption as 'interested' | 'not_interested' | 'call_later' | '') === 'not_interested' ? 'bg-red-500' : 'bg-gray-100'
                                }`}>
                                  <ThumbsDown size={24} className={(connectedSubOption as 'interested' | 'not_interested' | 'call_later' | '') === 'not_interested' ? 'text-white' : 'text-gray-400'} />
                                </div>
                                <div className="flex-1">
                                  <p className={`font-semibold mb-1 ${(connectedSubOption as 'interested' | 'not_interested' | 'call_later' | '') === 'not_interested' ? 'text-red-700' : 'text-gray-900'}`}>
                                    Not Interested
                                  </p>
                                  <p className="text-sm text-gray-600">Lead declined the offer.</p>
                                </div>
                              </div>
                            </button>

                            {/* Call Later */}
                            <button
                              type="button"
                              onClick={() => setConnectedSubOption('call_later')}
                              className={`w-full text-left px-6 py-4 rounded-xl border-2 transition-all ${
                                (connectedSubOption as 'interested' | 'not_interested' | 'call_later' | '') === 'call_later'
                                  ? 'border-yellow-500 bg-yellow-50'
                                  : 'border-gray-200 hover:border-yellow-300 bg-white'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                                  (connectedSubOption as 'interested' | 'not_interested' | 'call_later' | '') === 'call_later' ? 'bg-yellow-500' : 'bg-gray-100'
                                }`}>
                                  <Clock size={24} className={(connectedSubOption as 'interested' | 'not_interested' | 'call_later' | '') === 'call_later' ? 'text-white' : 'text-gray-400'} />
                                </div>
                                <div className="flex-1">
                                  <p className={`font-semibold mb-1 ${(connectedSubOption as 'interested' | 'not_interested' | 'call_later' | '') === 'call_later' ? 'text-yellow-700' : 'text-gray-900'}`}>
                                    Call Later
                                  </p>
                                  <p className="text-sm text-gray-600">Schedule a follow-up call.</p>
                                </div>
                              </div>
                            </button>
                          </div>
                          </div>
                        </div>
                      )}

                      {/* Not Interested Flow */}
                      {callOutcome === CALL_OUTCOME.CONNECTED && connectedSubOption === 'not_interested' && (
                <div className="space-y-4">
                          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                            <p className="text-sm text-red-800">
                              <strong>Warning:</strong> Selecting "Not Interested" will automatically update the lead status to <strong>Lost</strong> and discard this lead.
                            </p>
                          </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                              Notes <span className="text-gray-500 text-xs">(Optional)</span>
                    </label>
                            <textarea
                              value={callNotes}
                              onChange={(e) => setCallNotes(e.target.value)}
                              rows={3}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                              placeholder="Reason for not being interested..."
                            />
                          </div>
                          <div className="flex gap-3 pt-4">
                            <button
                              type="button"
                              onClick={() => setConnectedSubOption('')}
                              className="px-6 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                            >
                              Back
                            </button>
                            <button
                              type="button"
                              onClick={() => handleConnectedSubOption('not_interested')}
                              disabled={submittingCall}
                              className="flex-1 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                            >
                              {submittingCall ? 'Discarding...' : 'Discard Lead'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Call Later Flow */}
                      {callOutcome === CALL_OUTCOME.CONNECTED && connectedSubOption === 'call_later' && (
                        <div className="space-y-4">
                          <div>
                            <DatePicker
                              value={callFollowUpDate}
                              onChange={setCallFollowUpDate}
                              label="Follow-up Date"
                            />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                              Follow-up Time
                    </label>
                            <div className="grid grid-cols-4 gap-2 mb-2">
                              {[
                                { label: '10 AM', hour24: 10 },
                                { label: '12 PM', hour24: 12 },
                                { label: '4 PM', hour24: 16 },
                                { label: '6 PM', hour24: 18 },
                              ].map((preset) => {
                                const timeValue = `${preset.hour24.toString().padStart(2, '0')}:00`
                                const isSelected = callFollowUpTime === timeValue
                                return (
                                  <button
                                    key={preset.label}
                                    type="button"
                                    onClick={() => setCallFollowUpTime(timeValue)}
                                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                      isSelected
                                        ? 'bg-[#de0510] text-white border-2 border-[#de0510]'
                                        : 'bg-white text-gray-700 border border-gray-300 hover:border-[#de0510] hover:text-[#de0510]'
                                    }`}
                                  >
                                    {preset.label}
                                  </button>
                                )
                              })}
                            </div>
                    <input
                              type="time"
                              value={callFollowUpTime}
                              onChange={(e) => setCallFollowUpTime(e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                              required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                              Notes <span className="text-gray-500 text-xs">(Optional)</span>
                    </label>
                    <textarea
                      value={callNotes}
                      onChange={(e) => setCallNotes(e.target.value)}
                      rows={3}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                              placeholder="Follow-up notes..."
                    />
                  </div>
                          <div className="flex gap-3 pt-4">
                            <button
                              type="button"
                              onClick={() => setConnectedSubOption('')}
                              className="px-6 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                            >
                              Back
                            </button>
                            <button
                              type="button"
                              onClick={() => handleConnectedSubOption('call_later')}
                              disabled={!callFollowUpDate || !callFollowUpTime || submittingCall}
                              className="flex-1 px-6 py-2 bg-[#de0510] text-white rounded-lg hover:bg-[#c0040e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                            >
                              {submittingCall ? 'Scheduling...' : 'Schedule Follow-up'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Interested Form - Qualification */}
                      {callOutcome === CALL_OUTCOME.CONNECTED && connectedSubOption === 'interested' && (
                <div className="space-y-4">
                          <h4 className="text-base font-medium text-gray-900 mb-4">Qualify the Lead</h4>
                          
                          {/* Lead Type - Buttons */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-3">
                              Lead Type <span className="text-red-500">*</span>
                            </label>
                            <div className="grid grid-cols-3 gap-3">
                              <button
                                type="button"
                                onClick={() => setCallInterestLevel('hot')}
                                className={`px-4 py-3 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${
                                  callInterestLevel === 'hot'
                                    ? 'border-[#de0510] bg-red-50 text-[#de0510]'
                                    : 'border-gray-200 hover:border-gray-300 bg-white text-gray-700'
                                }`}
                              >
                                <Flame size={18} className={callInterestLevel === 'hot' ? 'text-[#de0510]' : 'text-gray-400'} />
                                <span className="font-medium">Hot</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setCallInterestLevel('warm')}
                                className={`px-4 py-3 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${
                                  callInterestLevel === 'warm'
                                    ? 'border-[#de0510] bg-red-50 text-[#de0510]'
                                    : 'border-gray-200 hover:border-gray-300 bg-white text-gray-700'
                                }`}
                              >
                                <Zap size={18} className={callInterestLevel === 'warm' ? 'text-[#de0510]' : 'text-gray-400'} />
                                <span className="font-medium">Warm</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setCallInterestLevel('cold')}
                                className={`px-4 py-3 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${
                                  callInterestLevel === 'cold'
                                    ? 'border-[#de0510] bg-red-50 text-[#de0510]'
                                    : 'border-gray-200 hover:border-gray-300 bg-white text-gray-700'
                                }`}
                              >
                                <Snowflake size={18} className={callInterestLevel === 'cold' ? 'text-[#de0510]' : 'text-gray-400'} />
                                <span className="font-medium">Cold</span>
                              </button>
                            </div>
                          </div>

                          {/* Product Interested In */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                              Product Interested In
                    </label>
                            <input
                              type="text"
                              value={interestedProductInterest}
                              onChange={(e) => setInterestedProductInterest(e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                              placeholder="e.g., BMW X5, Luxury SUV"
                            />
                          </div>

                          {/* Budget Range */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Budget Range <span className="text-gray-500 text-xs">(Optional)</span>
                            </label>
                            <input
                              type="text"
                              value={interestedBudget}
                              onChange={(e) => setInterestedBudget(e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                              placeholder="e.g., $50,000 - $70,000"
                            />
                          </div>

                          {/* Purchase Timeline */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Purchase Timeline <span className="text-gray-500 text-xs">(Optional)</span>
                            </label>
                            <input
                              type="text"
                              value={interestedPurchaseTimeline}
                              onChange={(e) => setInterestedPurchaseTimeline(e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                              placeholder="e.g., Within 2 weeks, 1-2 months"
                            />
                          </div>

                          {/* Additional Notes */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Additional Notes <span className="text-gray-500 text-xs">(Optional)</span>
                            </label>
                            <textarea
                              value={interestedNotes}
                              onChange={(e) => setInterestedNotes(e.target.value)}
                              rows={3}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                              placeholder="Any specific requirements or preferences..."
                            />
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-3 pt-4">
                            <button
                              type="button"
                              onClick={() => setConnectedSubOption('')}
                              className="px-6 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                            >
                              Back
                            </button>
                            <button
                              type="button"
                              onClick={handleInterestedFormSubmit}
                              disabled={!callInterestLevel || submittingCall}
                              className="flex-1 px-6 py-2 bg-[#de0510] text-white rounded-lg hover:bg-[#c0040e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                            >
                              {submittingCall ? 'Qualifying...' : 'Mark as Qualified'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Not Reachable: Show Date and Time Picker */}
                      {callOutcome === 'not_reachable' && (
                        <div className="space-y-4">
                          <div>
                            <DatePicker
                              value={callFollowUpDate}
                              onChange={setCallFollowUpDate}
                              label="Follow-up Date"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Follow-up Time
                            </label>
                            <div className="grid grid-cols-4 gap-2 mb-2">
                              {[
                                { label: '10 AM', hour24: 10 },
                                { label: '12 PM', hour24: 12 },
                                { label: '4 PM', hour24: 16 },
                                { label: '6 PM', hour24: 18 },
                              ].map((preset) => {
                                const timeValue = `${preset.hour24.toString().padStart(2, '0')}:00`
                                const isSelected = callFollowUpTime === timeValue
                                return (
                                  <button
                                    key={preset.label}
                                    type="button"
                                    onClick={() => setCallFollowUpTime(timeValue)}
                                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                      isSelected
                                        ? 'bg-[#de0510] text-white border-2 border-[#de0510]'
                                        : 'bg-white text-gray-700 border border-gray-300 hover:border-[#de0510] hover:text-[#de0510]'
                                    }`}
                                  >
                                    {preset.label}
                                  </button>
                                )
                              })}
                            </div>
                            <input
                              type="time"
                              value={callFollowUpTime}
                              onChange={(e) => setCallFollowUpTime(e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Notes <span className="text-gray-500 text-xs">(Optional)</span>
                            </label>
                            <textarea
                              value={callNotes}
                              onChange={(e) => setCallNotes(e.target.value)}
                              rows={3}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                              placeholder="Follow-up notes..."
                            />
                          </div>
                          <div className="flex justify-end gap-3 pt-4 border-t">
                    <button
                      onClick={() => {
                        setShowCallModal(false)
                                resetCallForm()
                      }}
                              className="px-6 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                      disabled={submittingCall}
                    >
                      Cancel
                    </button>
                    <button
                              type="button"
                              onClick={() => handleCallStatusUpdate()}
                              disabled={submittingCall || !callOutcome || !callFollowUpDate || !callFollowUpTime}
                              className="px-6 py-2 text-white bg-[#de0510] rounded-lg hover:bg-[#c0040e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      {submittingCall ? 'Recording...' : 'Record Call'}
                    </button>
                  </div>
                </div>
                      )}

                      {/* Wrong Number: Show confirmation message */}
                      {callOutcome === CALL_OUTCOME.WRONG_NUMBER && (
                        <div className="space-y-4">
                          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                            <p className="text-sm text-red-800">
                              <strong>Warning:</strong> Selecting "Wrong Number" will automatically update the lead status to <strong>Lost</strong> and discard this lead.
                            </p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Notes <span className="text-gray-500 text-xs">(Optional)</span>
                            </label>
                            <textarea
                              value={callNotes}
                              onChange={(e) => setCallNotes(e.target.value)}
                              rows={3}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                              placeholder="Reason for wrong number..."
                            />
                          </div>
                          <div className="flex justify-end gap-3 pt-4 border-t">
                            <button
                              onClick={() => {
                                setShowCallModal(false)
                                resetCallForm()
                              }}
                              className="px-6 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                              disabled={submittingCall}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCallStatusUpdate()}
                              disabled={submittingCall || !callOutcome}
                              className="px-6 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                            >
                              {submittingCall ? 'Discarding...' : 'Discard Lead'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
              </div>
            </div>
          )}

          {/* Qualification Modal */}
          {showQualifyModal && (
        <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center ${nestedModalZ}`}>
              <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                <h3 className="text-lg font-semibold mb-4">Qualify Lead</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Interest Level
                    </label>
                    <select
                      value={interestLevel}
                      onChange={(e) => setInterestLevel(e.target.value as InterestLevel)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="">Select interest level...</option>
                      {Object.entries(INTEREST_LEVEL_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Qualification Notes
                    </label>
                    <textarea
                      value={qualifyNotes}
                      onChange={(e) => setQualifyNotes(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Additional qualification notes..."
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setShowQualifyModal(false)
                        setInterestLevel('')
                        setQualifyNotes('')
                      }}
                      className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                      disabled={submittingQualify}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleQualify}
                      disabled={submittingQualify || !interestLevel}
                      className="px-4 py-2 text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submittingQualify ? 'Qualifying...' : 'Qualify Lead'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Follow-up Schedule Modal */}
          {showFollowUpModal && (
        <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center ${nestedModalZ}`}>
              <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                <h3 className="text-lg font-semibold mb-4">Schedule Follow-up</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Date
                    </label>
                    <input
                      type="date"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Time
                    </label>
                    <input
                      type="time"
                      value={followUpTime}
                      onChange={(e) => setFollowUpTime(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Notes
                    </label>
                    <textarea
                      value={followUpNotes}
                      onChange={(e) => setFollowUpNotes(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Follow-up notes or reason..."
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setShowFollowUpModal(false)
                        setFollowUpDate('')
                        setFollowUpTime('')
                        setFollowUpNotes('')
                      }}
                      className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                      disabled={submittingFollowUp}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateFollowUp}
                      disabled={submittingFollowUp || !followUpDate || !followUpTime}
                      className="px-4 py-2 text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submittingFollowUp ? 'Scheduling...' : 'Schedule Follow-up'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Payment Status Modal */}
          {showPaymentModal && (
            <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center ${nestedModalZ}`}>
              <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                <h3 className="text-lg font-semibold mb-4">Update Payment Status</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Payment Status
                    </label>
                    <select
                      value={paymentStatus}
                      onChange={(e) => setPaymentStatus(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="">Select status...</option>
                      <option value="pending">Not paid</option>
                      <option value="advance_received">Advance paid</option>
                      <option value="fully_paid">Fully paid</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Total Payment Amount
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Advance Amount (if applicable)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={advanceAmount}
                      onChange={(e) => setAdvanceAmount(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setShowPaymentModal(false)
                        setPaymentStatus('')
                        setPaymentAmount('')
                        setAdvanceAmount('')
                      }}
                      className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                      disabled={submittingPayment}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handlePaymentUpdate}
                      disabled={submittingPayment || !paymentStatus}
                      className="px-4 py-2 text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submittingPayment ? 'Updating...' : 'Update Payment'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

      {/* Status Update Modal */}
      {showStatusUpdateModal && canUpdateStatus && lead && (
        <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center ${nestedModalZ}`}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Update Status</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Status
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value={lead.status}>
                    {LEAD_STATUS_ICONS[lead.status as keyof typeof LEAD_STATUS_ICONS]} {LEAD_STATUS_LABELS[lead.status as keyof typeof LEAD_STATUS_ICONS]} (Current)
                  </option>
                  {availableStatuses.map((status) => (
                    <option key={status} value={status}>
                      {LEAD_STATUS_ICONS[status as keyof typeof LEAD_STATUS_ICONS]} {LEAD_STATUS_LABELS[status as keyof typeof LEAD_STATUS_ICONS]}
                    </option>
                  ))}
                </select>
                {availableStatuses.length === 0 && (
                  <p className="mt-1 text-sm text-gray-500">
                    No status transitions available from current status
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={statusNotes}
                  onChange={(e) => setStatusNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Add notes about this status change..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowStatusUpdateModal(false)
                  setStatusNotes('')
                }}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await handleStatusUpdate()
                  setShowStatusUpdateModal(false)
                }}
                disabled={updatingStatus || newStatus === lead.status || availableStatuses.length === 0}
                className="px-4 py-2 text-white bg-[#ed1b24] rounded-md hover:bg-[#d11820] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updatingStatus ? 'Updating...' : 'Update Status'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Quotation Modal */}
      {showQuotationModal && lead && (
        <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center ${nestedModalZ} overflow-y-auto p-4`}>
          <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl" style={{ fontFamily: 'Poppins, sans-serif' }}>
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-green-600 to-green-700 text-white px-6 py-4 rounded-t-xl flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <FilePlus size={24} />
                <div>
                  <h3 className="text-lg font-semibold">Create Quotation</h3>
                  <p className="text-sm text-white/90">{lead.name} • {lead.phone}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowQuotationModal(false)
                  setQuotationItems([{ productId: '', name: '', description: '', quantity: 1, unitPrice: 0, total: 0 }])
                  setGstRate(18)
                  setDiscount(0)
                  setValidityDays(30)
                }}
                className="text-white hover:bg-white/20 rounded-full p-1 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Company Profile Section */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Building2 size={16} />
                  Company Profile
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-600">Company Name:</span>
                    <span className="ml-2 font-medium text-gray-900">Ultrakool</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Email:</span>
                    <span className="ml-2 font-medium text-gray-900">info@ultrakool.com</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Phone:</span>
                    <span className="ml-2 font-medium text-gray-900">+91 1234567890</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Address:</span>
                    <span className="ml-2 font-medium text-gray-900">Your Company Address</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-600">GSTIN:</span>
                    <span className="ml-2 font-medium text-gray-900">29ABCDE1234F1Z5</span>
                  </div>
                </div>
              </div>

              {/* Customer Details Section */}
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <User size={16} />
                  Customer Details
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-600">Name:</span>
                    <span className="ml-2 font-medium text-gray-900">{lead.name}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Phone:</span>
                    <span className="ml-2 font-medium text-gray-900">{lead.phone}</span>
                  </div>
                  {lead.email && (
                    <div>
                      <span className="text-gray-600">Email:</span>
                      <span className="ml-2 font-medium text-gray-900">{lead.email}</span>
                    </div>
                  )}
                  {lead.meta_data?.company && (
                    <div>
                      <span className="text-gray-600">Company:</span>
                      <span className="ml-2 font-medium text-gray-900">{lead.meta_data.company}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Quotation Items Section */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                    <ShoppingCart size={18} />
                    Quotation Items
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      setQuotationItems([...quotationItems, { productId: '', name: '', description: '', quantity: 1, unitPrice: 0, total: 0 }])
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                  >
                    <Plus size={16} />
                    Add Item
                  </button>
                </div>

                <div className="space-y-4">
                  {quotationItems.map((item, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4 bg-white">
                      <div className="flex items-start justify-between mb-3">
                        <span className="text-sm font-medium text-gray-700">Item {index + 1}</span>
                        {quotationItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newItems = quotationItems.filter((_, i) => i !== index)
                              setQuotationItems(newItems)
                            }}
                            className="text-red-600 hover:text-red-700 p-1"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Product Selection */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Product <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={item.productId}
                            onChange={(e) => {
                              const selectedProduct = products.find(p => p.id === e.target.value)
                              const newItems = [...quotationItems]
                              newItems[index] = {
                                ...newItems[index],
                                productId: e.target.value,
                                name: selectedProduct?.title || '',
                                description: selectedProduct?.description || '',
                                unitPrice: selectedProduct?.price || 0,
                                total: (selectedProduct?.price || 0) * newItems[index].quantity
                              }
                              setQuotationItems(newItems)
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                            required
                          >
                            <option value="">Select a product...</option>
                            {products.filter(p => p.is_active).map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.title} - ₹{product.price}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Description */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Description
                          </label>
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => {
                              const newItems = [...quotationItems]
                              newItems[index].description = e.target.value
                              setQuotationItems(newItems)
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                            placeholder="Product description..."
                          />
                        </div>

                        {/* Quantity */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Quantity <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => {
                              const qty = parseInt(e.target.value) || 1
                              const newItems = [...quotationItems]
                              newItems[index] = {
                                ...newItems[index],
                                quantity: qty,
                                total: newItems[index].unitPrice * qty
                              }
                              setQuotationItems(newItems)
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                            required
                          />
                        </div>

                        {/* Unit Price */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Unit Price (₹) <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) => {
                              const price = parseFloat(e.target.value) || 0
                              const newItems = [...quotationItems]
                              newItems[index] = {
                                ...newItems[index],
                                unitPrice: price,
                                total: price * newItems[index].quantity
                              }
                              setQuotationItems(newItems)
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                            required
                          />
                        </div>

                        {/* Total */}
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Total (₹)
                          </label>
                          <input
                            type="number"
                            value={item.total.toFixed(2)}
                            readOnly
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 font-semibold"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quotation Settings */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    GST Rate (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={gstRate}
                    onChange={(e) => setGstRate(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Discount (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={discount}
                    onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Validity (Days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={validityDays}
                    onChange={(e) => setValidityDays(parseInt(e.target.value) || 30)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
              </div>

              {/* Summary */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Subtotal:</span>
                    <span className="font-medium text-gray-900">
                      ₹{quotationItems.reduce((sum, item) => sum + item.total, 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Discount:</span>
                    <span className="font-medium text-gray-900">- ₹{discount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">GST ({gstRate}%):</span>
                    <span className="font-medium text-gray-900">
                      ₹{((quotationItems.reduce((sum, item) => sum + item.total, 0) - discount) * gstRate / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-300">
                    <span className="font-semibold text-gray-900">Total:</span>
                    <span className="font-bold text-lg text-green-600">
                      ₹{(
                        quotationItems.reduce((sum, item) => sum + item.total, 0) - 
                        discount + 
                        ((quotationItems.reduce((sum, item) => sum + item.total, 0) - discount) * gstRate / 100)
                      ).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setShowQuotationModal(false)
                    setQuotationItems([{ productId: '', name: '', description: '', quantity: 1, unitPrice: 0, total: 0 }])
                    setGstRate(18)
                    setDiscount(0)
                    setValidityDays(30)
                  }}
                  className="px-6 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                  disabled={submittingQuotation}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    // Validate items
                    const validItems = quotationItems.filter(item => item.productId && item.name && item.quantity > 0 && item.unitPrice > 0)
                    if (validItems.length === 0) {
                      alert('Please add at least one valid item to the quotation')
                      return
                    }

                    setSubmittingQuotation(true)
                    try {
                      const response = await cachedFetch('/api/quotations', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          lead_id: leadId,
                          items: validItems.map(item => ({
                            name: item.name,
                            description: item.description || undefined,
                            quantity: item.quantity,
                            unit_price: item.unitPrice,
                            total: item.total
                          })),
                          validity_days: validityDays,
                          discount: discount,
                          gst_rate: gstRate
                        })
                      })

                      if (response.ok) {
                        const data = await response.json()
                        setCreatedQuotationId(data.quotation?.id || null)
                        setShowQuotationModal(false)
                        setShowQuotationSuccessModal(true)
                        setQuotationItems([{ productId: '', name: '', description: '', quantity: 1, unitPrice: 0, total: 0 }])
                        setGstRate(18)
                        setDiscount(0)
                        setValidityDays(30)
                        fetchLead() // Refresh lead data
                        fetchLeadQuotations()
                      } else {
                        const error = await response.json()
                        alert(error.error || 'Failed to create quotation')
                      }
                    } catch (error) {
                      console.error('Error creating quotation:', error)
                      alert('Failed to create quotation')
                    } finally {
                      setSubmittingQuotation(false)
                    }
                  }}
                  disabled={submittingQuotation || quotationItems.filter(item => item.productId && item.name).length === 0}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {submittingQuotation ? 'Creating...' : 'Create Quotation'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quotation Success Modal */}
      {showQuotationSuccessModal && createdQuotationId && (
        <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center ${nestedModalZ}`}>
          <div className="bg-white rounded-xl w-full max-w-md mx-4 shadow-2xl" style={{ fontFamily: 'Poppins, sans-serif' }}>
            {/* Header */}
            <div className="bg-gradient-to-r from-green-600 to-green-700 text-white px-6 py-4 rounded-t-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle size={24} className="text-white" />
                <div>
                  <h3 className="text-lg font-semibold">Quotation Created!</h3>
                  <p className="text-sm text-white/90">Your quotation has been created successfully</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowQuotationSuccessModal(false)
                  setCreatedQuotationId(null)
                }}
                className="text-white hover:bg-white/20 rounded-full p-1 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              <div className="mb-6">
                <p className="text-gray-700 text-sm mb-4">
                  What would you like to do next?
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={() => {
                    router.push(`/quotations/${createdQuotationId}`)
                  }}
                  className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  <Eye size={18} />
                  View Quotation
                </button>
                <button
                  onClick={async () => {
                    const shareUrl = `${window.location.origin}/quotations/${createdQuotationId}`
                    try {
                      if (navigator.share) {
                        await navigator.share({
                          title: 'Quotation',
                          text: `Check out this quotation for ${lead?.name}`,
                          url: shareUrl
                        })
                      } else {
                        // Fallback: Copy to clipboard
                        await navigator.clipboard.writeText(shareUrl)
                        alert('Quotation link copied to clipboard!')
                      }
                    } catch (error) {
                      // If user cancels share or clipboard fails, try copy
                      try {
                        await navigator.clipboard.writeText(shareUrl)
                        alert('Quotation link copied to clipboard!')
                      } catch (copyError) {
                        console.error('Failed to copy link:', copyError)
                        alert('Failed to share quotation link')
                      }
                    }
                  }}
                  className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  <Share2 size={18} />
                  Share Quotation
                </button>
                <button
                  onClick={() => {
                    setShowQuotationSuccessModal(false)
                    setCreatedQuotationId(null)
                  }}
                  className="w-full px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
