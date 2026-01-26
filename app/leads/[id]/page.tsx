'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Layout from '@/components/Layout'
import Image from 'next/image'
import { 
  LEAD_STATUS, 
  LEAD_STATUS_LABELS, 
  LEAD_STATUS_FLOW, 
  LEAD_STATUS_ICONS,
  INTEREST_LEVEL,
  INTEREST_LEVEL_LABELS,
  CALL_OUTCOME,
  CALL_OUTCOME_LABELS
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
  FileText
} from 'lucide-react'

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
}

export default function LeadDetailPage() {
  const router = useRouter()
  const params = useParams()
  const leadId = params.id as string
  const [lead, setLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [userRole, setUserRole] = useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [newStatus, setNewStatus] = useState('')
  const [statusNotes, setStatusNotes] = useState('')
  
  // Call status update
  const [showCallModal, setShowCallModal] = useState(false)
  const [callOutcome, setCallOutcome] = useState<keyof typeof CALL_OUTCOME | ''>('')
  const [callNotes, setCallNotes] = useState('')
  const [callStartTime, setCallStartTime] = useState('')
  const [callEndTime, setCallEndTime] = useState('')
  const [callInterestLevel, setCallInterestLevel] = useState<keyof typeof INTEREST_LEVEL | ''>('')
  const [callFollowUpDate, setCallFollowUpDate] = useState('')
  const [callFollowUpTime, setCallFollowUpTime] = useState('')
  const [submittingCall, setSubmittingCall] = useState(false)
  
  // LEAD JOURNEY: Connected flow sub-options
  const [connectedSubOption, setConnectedSubOption] = useState<'interested' | 'not_interested' | 'call_later' | ''>('')
  const [interestedProductInterest, setInterestedProductInterest] = useState('')
  const [interestedBudget, setInterestedBudget] = useState('')
  const [interestedPurchaseTimeline, setInterestedPurchaseTimeline] = useState('')
  const [interestedNotes, setInterestedNotes] = useState('')
  
  // Qualification
  const [showQualifyModal, setShowQualifyModal] = useState(false)
  const [interestLevel, setInterestLevel] = useState<keyof typeof INTEREST_LEVEL | ''>('')
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
  const [showStatusUpdateModal, setShowStatusUpdateModal] = useState(false)

  useEffect(() => {
    checkAuth()
    fetchLead()
  }, [leadId])

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
      const roleName = Array.isArray(userData.roles) 
        ? userData.roles[0]?.name 
        : (userData.roles as any)?.name
      setUserRole(roleName)
      setUserId(user.id)
    }
  }

  async function fetchLead() {
    try {
      const response = await fetch(`/api/leads/${leadId}`)
      if (response.ok) {
        const data = await response.json()
        setLead(data.lead)
        setNewStatus(data.lead.status)
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to fetch lead')
        if (response.status === 404) {
          setError('Lead not found')
        } else if (response.status === 403) {
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

  async function handleStatusUpdate() {
    if (!newStatus || newStatus === lead?.status) {
      return
    }

    setUpdatingStatus(true)
    try {
      const response = await fetch(`/api/leads/${leadId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: newStatus,
          notes: statusNotes || null,
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
    if (callOutcome === 'connected') {
      if (!callStartTime || !callEndTime) {
        alert('Please select both start and end time for the call')
        return
      }
    } else if (callOutcome === 'not_reachable' || callOutcome === 'call_later') {
      if (!callFollowUpDate || !callFollowUpTime) {
        alert('Please select follow-up date and time')
        return
      }
    }

    setSubmittingCall(true)
    try {
      // Calculate call duration for connected calls
      let callDuration: number | null = null
      if (callOutcome === 'connected' && callStartTime && callEndTime) {
        const start = new Date(`2000-01-01T${callStartTime}`)
        const end = new Date(`2000-01-01T${callEndTime}`)
        if (end < start) {
          end.setDate(end.getDate() + 1)
        }
        const diffMs = end.getTime() - start.getTime()
        callDuration = Math.floor(diffMs / 1000)
      }

      // Create call record
      const callResponse = await fetch('/api/calls', {
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
      if (callOutcome === 'wrong_number') {
        // Update status to lost
        const statusResponse = await fetch(`/api/leads/${leadId}/status`, {
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
      if (callOutcome === 'connected' && callInterestLevel && lead) {
        try {
          const updateResponse = await fetch(`/api/leads/${leadId}`, {
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
      if ((callOutcome === 'not_reachable' || callOutcome === 'call_later') && callFollowUpDate && callFollowUpTime && lead?.assigned_to) {
        // Combine date and time
        const scheduledAt = new Date(`${callFollowUpDate}T${callFollowUpTime}`)
        
        try {
          const followUpResponse = await fetch('/api/followups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lead_id: leadId,
              assigned_to: lead.assigned_to,
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
      if (callOutcome === 'connected' && lead?.status === LEAD_STATUS.NEW) {
        try {
          await fetch(`/api/leads/${leadId}/status`, {
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
  }

  // LEAD JOURNEY: Handle Connected sub-option selection
  async function handleConnectedSubOption(option: 'interested' | 'not_interested' | 'call_later') {
    if (!callStartTime || !callEndTime) {
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
      const callResponse = await fetch('/api/calls', {
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
        await fetch(`/api/leads/${leadId}/status`, {
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
        if (!callFollowUpDate || !callFollowUpTime || !lead?.assigned_to) {
          alert('Please select follow-up date and time')
          setSubmittingCall(false)
          return
        }
        const scheduledAt = new Date(`${callFollowUpDate}T${callFollowUpTime}`)
        await fetch('/api/followups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lead_id: leadId,
            assigned_to: lead.assigned_to,
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

      const updateResponse = await fetch(`/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      if (!updateResponse.ok) {
        throw new Error('Failed to update lead')
      }

      // Update status with notes
      await fetch(`/api/leads/${leadId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: LEAD_STATUS.QUALIFIED,
          notes: `Interested - Qualified as ${INTEREST_LEVEL_LABELS[callInterestLevel]}${interestedNotes ? ` - ${interestedNotes}` : ''}`,
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
      const response = await fetch(`/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interest_level: interestLevel,
          status: LEAD_STATUS.QUALIFIED,
        }),
      })

      if (response.ok) {
        // Update status with notes
        await fetch(`/api/leads/${leadId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: LEAD_STATUS.QUALIFIED,
            notes: `Qualified as ${INTEREST_LEVEL_LABELS[interestLevel]}${qualifyNotes ? ` - ${qualifyNotes}` : ''}`,
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

      const response = await fetch(`/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      if (response.ok) {
        // Update lead status based on payment
        let statusUpdate = ''
        if (paymentStatus === 'fully_paid') {
          statusUpdate = LEAD_STATUS.FULLY_PAID
          
          // Convert lead to customer and create order
          try {
            // Convert to customer and create order (this will handle status internally)
            const convertResponse = await fetch(`/api/leads/${leadId}/convert`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            })

            if (!convertResponse.ok) {
              const errorData = await convertResponse.json()
              throw new Error(errorData.error || 'Failed to convert lead to customer')
            }

            // Now update status to FULLY_PAID (only if not already FULLY_PAID)
            const currentLead = await fetch(`/api/leads/${leadId}`).then(r => r.json())
            if (currentLead.status !== LEAD_STATUS.FULLY_PAID) {
              await fetch(`/api/leads/${leadId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  status: LEAD_STATUS.FULLY_PAID,
                  notes: `Payment status updated: ${paymentStatus}. Lead converted to customer.`,
                }),
              })
            }

            alert('Payment status updated. Lead converted to customer and order created successfully!')
            // Redirect to customers page or orders page
            window.location.href = '/customers'
          } catch (convertError) {
            console.error('Failed to convert lead:', convertError)
            // Still update status even if conversion fails
            await fetch(`/api/leads/${leadId}/status`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                status: LEAD_STATUS.FULLY_PAID,
                notes: `Payment status updated: ${paymentStatus}`,
              }),
            })
            throw convertError
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
          await fetch(`/api/leads/${leadId}/status`, {
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

    if (!userId || !lead?.assigned_to) {
      alert('Unable to create follow-up: Missing user or lead assignment')
      return
    }

    // Combine date and time
    const scheduledDateTime = new Date(`${followUpDate}T${followUpTime}`).toISOString()

    setSubmittingFollowUp(true)
    try {
      const response = await fetch('/api/followups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: leadId,
          assigned_to: lead.assigned_to,
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
      const response = await fetch(`/api/followups/${followUpId}`, {
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

  if (loading) {
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
    return (
      <Layout>
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" onClick={() => router.push('/leads')} />
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-white shadow-2xl rounded-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto pointer-events-auto p-6">
            <div className="text-center">
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error || 'Lead not found'}
            </div>
            <button
              onClick={() => router.push('/leads')}
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

  // Get vehicle name from requirement or meta_data
  function getVehicleName() {
    if (lead?.requirement) return lead.requirement
    if (lead?.meta_data) {
      const vehicle = lead.meta_data['what_services_are_you_looking_for?'] || 
                     lead.meta_data['what_services_are_you_looking_for'] ||
                     lead.meta_data['vehicle'] ||
                     lead.meta_data['car_model'] ||
                     null
      if (vehicle) {
        return String(vehicle).replace(/_/g, ' ')
      }
    }
    return null
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
      const interestFields = ['interest', 'preferences', 'looking_for', 'requirements']
      interestFields.forEach(field => {
        if (lead.meta_data[field]) {
          interests.push(lead.meta_data[field])
        }
      })
      return interests.filter(Boolean)
    }
    return []
  }

  // Get status badge color
  function getStatusBadgeColor(status: string) {
    const statusLower = status.toLowerCase()
    if (statusLower.includes('review') || statusLower.includes('qualified')) {
      return 'bg-yellow-100 text-yellow-800'
    }
    if (statusLower.includes('negotiation')) {
      return 'bg-orange-100 text-orange-800'
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
    <div className="min-h-screen bg-gray-50 relative">
      {/* Blurred Background - Leads Page Content */}
      <div className="fixed inset-0 overflow-y-auto pointer-events-none">
    <Layout>
          <div className="p-6">
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

      {/* Blur Overlay */}
      <div 
        className="fixed inset-0 bg-black/20 backdrop-blur-md z-40"
        onClick={() => router.push('/leads')}
      />
      
      {/* Centered Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none p-4">
        <div className="bg-white shadow-2xl rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col pointer-events-auto" style={{ fontFamily: 'Poppins, sans-serif' }}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 z-10 px-8 py-6">
          <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
              {/* Name and Vehicle */}
              <h1 className="text-2xl font-bold text-gray-900 mb-2">{lead?.name || 'Loading...'}</h1>
                {getVehicleName() && (
                <p className="text-base text-gray-600 mb-4">{getVehicleName()}</p>
                )}
                
                {/* Status Tags */}
                <div className="flex items-center gap-2 flex-wrap">
                  {lead?.status && (
                    <span className={`px-3 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(lead.status)}`}>
                      {formatStatusName(lead.status)}
                    </span>
                  )}
                  {lead?.interest_level === 'hot' && (
                    <span className="px-3 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800 flex items-center gap-1">
                      <Flame size={12} />
                      Hot
                    </span>
                  )}
                  {lead?.interest_level === 'warm' && (
                    <span className="px-3 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                      Warm
                    </span>
                  )}
                  {lead?.interest_level === 'cold' && (
                    <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                      Cold
                    </span>
                  )}
                  {/* High Priority Tag */}
                  <span className="px-3 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                    High Priority
                  </span>
              </div>
            </div>
            
            {/* Close Button */}
            <button
              onClick={() => router.push('/leads')}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            >
                <X size={20} />
            </button>
          </div>
        </div>

        {/* Content - Two Column Layout */}
        <div className="px-8 py-6 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Main Details */}
            <div className="lg:col-span-2 space-y-6">
          {/* Contact Information */}
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <User size={18} className="text-gray-600" />
                  Contact Information
                </h2>
                <div className="space-y-4">
              {lead?.phone && (
                    <div className="flex items-center gap-3 text-gray-700">
                      <Phone size={16} className="text-gray-400" />
                      <span className="text-sm">{lead.phone.replace(/^(p|tel|phone|mobile):/i, '').trim()}</span>
                </div>
              )}
              {lead?.email && (
                    <div className="flex items-center gap-3 text-gray-700">
                      <Mail size={16} className="text-gray-400" />
                      <span className="text-sm">{lead.email}</span>
                </div>
              )}
                  {lead?.meta_data?.company && (
                    <div className="flex items-center gap-3 text-gray-700">
                      <Building2 size={16} className="text-gray-400" />
                      <span className="text-sm">{lead.meta_data.company}</span>
            </div>
                  )}
                  {lead?.meta_data?.location && (
                    <div className="flex items-center gap-3 text-gray-700">
                      <MapPin size={16} className="text-gray-400" />
                      <span className="text-sm">{lead.meta_data.location}</span>
                  </div>
                )}
                </div>
              </div>

          {/* Lead Details */}
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText size={18} className="text-gray-600" />
                  Lead Details
                </h2>
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-gray-700">
                    <TrendingUp size={16} className="text-gray-400" />
                    <span className="text-sm">
                      <span className="font-medium">Source: </span>
                <span className="capitalize">{lead?.source || 'N/A'}</span>
                    </span>
              </div>
              {getEstimatedValue() && (
                    <div className="flex items-center gap-3 text-gray-700">
                      <DollarSign size={16} className="text-gray-400" />
                      <span className="text-sm">
                        <span className="font-medium">Estimated Value: </span>
                  <span>{getEstimatedValue()}</span>
                      </span>
                </div>
              )}
              {lead?.created_at && (
                    <div className="flex items-center gap-3 text-gray-700">
                      <Calendar size={16} className="text-gray-400" />
                      <span className="text-sm">
                        <span className="font-medium">Created At: </span>
                  <span>{new Date(lead.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}</span>
                      </span>
                </div>
              )}
              {getLastContactedTime() && (
                    <div className="flex items-center gap-3 text-gray-700">
                      <Clock size={16} className="text-gray-400" />
                      <span className="text-sm">
                        <span className="font-medium">Last Contacted: </span>
                  <span>{getLastContactedTime()}</span>
                      </span>
                </div>
              )}
            </div>
          </div>

          {/* Interests */}
          {getInterests().length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Gem size={18} className="text-gray-600" />
                    Interests
                  </h2>
              <div className="flex flex-wrap gap-2">
                {getInterests().map((interest, index) => (
                  <span
                    key={index}
                        className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium"
                  >
                    {String(interest).replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}

              {/* Assigned To */}
              {lead?.assigned_user && (
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h2 className="text-base font-semibold text-gray-900 mb-4">Assigned To</h2>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      {lead.assigned_user.profile_image_url ? (
                        <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                          <Image
                            src={lead.assigned_user.profile_image_url}
                            alt={lead.assigned_user.name}
                            width={40}
                            height={40}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[#de0510] flex items-center justify-center text-white font-medium flex-shrink-0">
                          {lead.assigned_user.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {/* Online Status Indicator */}
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 text-sm">{lead.assigned_user.name}</p>
                      <p className="text-xs text-gray-500">Sales Executive</p>
                      <div className="flex items-center gap-1 mt-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-xs text-green-600">Online</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              {(lead?.meta_data?.notes || lead?.requirement) && (
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h2 className="text-base font-semibold text-gray-900 mb-4">Notes</h2>
                  <p className="text-sm text-gray-700 bg-gray-50 p-4 rounded-lg">
                    {lead.meta_data?.notes || lead.requirement || '-'}
                  </p>
                </div>
              )}

              {/* Next Follow-up */}
              {getNextFollowUp() && (
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h2 className="text-base font-semibold text-gray-900 mb-4">Next Follow-up</h2>
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-yellow-600" />
                    <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                      {getNextFollowUp()}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Recent Activity */}
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Recent Activity</h2>
                <div className="space-y-5">
              {/* Status History */}
              {lead?.status_history && lead.status_history.length > 0 && (
                    <>
                      {lead.status_history.slice(0, 3).map((history, index) => {
                        const date = new Date(history.created_at)
                        const now = new Date()
                        const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
                        const timeStr = diffDays === 0 
                          ? `Today, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
                          : diffDays === 1 
                          ? '1 day ago'
                          : `${diffDays} days ago`
                        
                        return (
                          <div key={history.id} className="relative pl-4">
                            <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${
                              index === 0 ? 'bg-green-500' : 
                              index === 1 ? 'bg-blue-500' : 
                              'bg-gray-400'
                            }`}></div>
                            <div className="text-sm text-gray-700">
                              <p className="font-medium text-gray-900 mb-1">
                                {timeStr}
                              </p>
                              <p className="text-xs text-gray-600">
                                Lead status updated to <span className="font-medium">{formatStatusName(history.new_status)}</span>
                                {history.notes && (
                                  <span className="block mt-1">{history.notes}</span>
                        )}
                      </p>
                    </div>
                </div>
                        )
                      })}
                    </>
              )}
              
              {/* Call History */}
              {lead?.calls && lead.calls.length > 0 && (
                    <>
                      {lead.calls.slice(0, 3).map((call, index) => {
                        const date = new Date(call.created_at)
                        const now = new Date()
                        const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
                        const timeStr = diffDays === 0 
                          ? `Today, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
                          : diffDays === 1 
                          ? '1 day ago'
                          : `${diffDays} days ago`
                        
                        return (
                          <div key={call.id} className="relative pl-4">
                            <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${
                              call.outcome === 'connected' ? 'bg-green-500' : 
                              call.outcome === 'not_reachable' ? 'bg-yellow-500' : 
                              'bg-gray-400'
                            }`}></div>
                            <div className="text-sm text-gray-700">
                              <p className="font-medium text-gray-900 mb-1">
                                {timeStr}
                              </p>
                              <p className="text-xs text-gray-600">
                                {call.outcome === 'connected' 
                                  ? `Phone call with customer - ${call.notes || 'Discussed details'}`
                                  : call.outcome === 'not_reachable'
                                  ? `Call attempted - Not reachable`
                                  : `Email sent with product brochure and pricing details`
                                }
                      </p>
                    </div>
                </div>
                        )
                      })}
                    </>
                  )}
                  
                  {(!lead?.status_history || lead.status_history.length === 0) && 
                   (!lead?.calls || lead.calls.length === 0) && (
                    <p className="text-sm text-gray-500 text-center py-4">No recent activity</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-8 py-6 flex gap-4 rounded-b-2xl">
          <button
            onClick={() => setShowCallModal(true)}
            className="flex-1 bg-[#de0510] text-white px-6 py-3.5 rounded-xl hover:bg-[#c0040e] font-medium transition-colors flex items-center justify-center gap-2 shadow-lg"
          >
            <Phone size={18} />
            Make Call
          </button>
          <button
            onClick={() => router.push(`/leads/${leadId}/history`)}
            className="flex-1 bg-white text-gray-700 px-6 py-3.5 rounded-xl border-2 border-gray-300 hover:bg-gray-50 hover:border-gray-400 font-medium transition-colors"
          >
            View Full History
          </button>
        </div>
        </div>
      </div>

      {/* Modals */}
      {/* Call Outcome Modal */}
      {showCallModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
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
              {/* Question */}
              <h4 className="text-base font-medium text-gray-900 mb-4">What was the call outcome?</h4>
              
              {/* Outcome Options */}
              <div className="space-y-3 mb-6">
                    {/* Connected - Green */}
                    <button
                      type="button"
                      onClick={() => setCallOutcome('connected')}
                      className={`w-full text-left px-6 py-4 rounded-xl border-2 transition-all ${
                        callOutcome === 'connected'
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-200 hover:border-green-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                          callOutcome === 'connected' ? 'bg-green-500' : 'bg-gray-100'
                        }`}>
                          <Phone size={24} className={callOutcome === 'connected' ? 'text-white' : 'text-gray-400'} />
      </div>
                        <div className="flex-1">
                          <p className={`font-semibold mb-1 ${callOutcome === 'connected' ? 'text-green-700' : 'text-gray-900'}`}>
                            Connected
                          </p>
                          <p className="text-sm text-gray-600">Successfully spoke with the lead.</p>
                        </div>
                      </div>
                    </button>

                    {/* Not Reachable - Orange */}
                    <button
                      type="button"
                      onClick={() => setCallOutcome('not_reachable')}
                      className={`w-full text-left px-6 py-4 rounded-xl border-2 transition-all ${
                        callOutcome === 'not_reachable'
                          ? 'border-orange-500 bg-orange-50'
                          : 'border-gray-200 hover:border-orange-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                          callOutcome === 'not_reachable' ? 'bg-orange-500' : 'bg-gray-100'
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
                      {/* Connected Flow - Show Sub-Options */}
                      {callOutcome === 'connected' && !connectedSubOption && (
                        <div>
                          <h4 className="text-base font-medium text-gray-900 mb-4">What was the outcome of the call?</h4>
                          <div className="space-y-3">
                            {/* Interested */}
                            <button
                              type="button"
                              onClick={() => setConnectedSubOption('interested')}
                              className={`w-full text-left px-6 py-4 rounded-xl border-2 transition-all ${
                                connectedSubOption === 'interested'
                                  ? 'border-green-500 bg-green-50'
                                  : 'border-gray-200 hover:border-green-300 bg-white'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                                  connectedSubOption === 'interested' ? 'bg-green-500' : 'bg-gray-100'
                                }`}>
                                  <ThumbsUp size={24} className={connectedSubOption === 'interested' ? 'text-white' : 'text-gray-400'} />
                                </div>
                                <div className="flex-1">
                                  <p className={`font-semibold mb-1 ${connectedSubOption === 'interested' ? 'text-green-700' : 'text-gray-900'}`}>
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
                                connectedSubOption === 'not_interested'
                                  ? 'border-red-500 bg-red-50'
                                  : 'border-gray-200 hover:border-red-300 bg-white'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                                  connectedSubOption === 'not_interested' ? 'bg-red-500' : 'bg-gray-100'
                                }`}>
                                  <ThumbsDown size={24} className={connectedSubOption === 'not_interested' ? 'text-white' : 'text-gray-400'} />
                                </div>
                                <div className="flex-1">
                                  <p className={`font-semibold mb-1 ${connectedSubOption === 'not_interested' ? 'text-red-700' : 'text-gray-900'}`}>
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
                                connectedSubOption === 'call_later'
                                  ? 'border-yellow-500 bg-yellow-50'
                                  : 'border-gray-200 hover:border-yellow-300 bg-white'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                                  connectedSubOption === 'call_later' ? 'bg-yellow-500' : 'bg-gray-100'
                                }`}>
                                  <Clock size={24} className={connectedSubOption === 'call_later' ? 'text-white' : 'text-gray-400'} />
                                </div>
                                <div className="flex-1">
                                  <p className={`font-semibold mb-1 ${connectedSubOption === 'call_later' ? 'text-yellow-700' : 'text-gray-900'}`}>
                                    Call Later
                                  </p>
                                  <p className="text-sm text-gray-600">Schedule a follow-up call.</p>
                                </div>
                              </div>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Not Interested Flow */}
                      {callOutcome === 'connected' && connectedSubOption === 'not_interested' && (
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
                      {callOutcome === 'connected' && connectedSubOption === 'call_later' && (
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
                      {callOutcome === 'connected' && connectedSubOption === 'interested' && (
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
                      {callOutcome === 'wrong_number' && (
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
            </div>
          </div>
        </div>
      )}

          {/* Qualification Modal */}
          {showQualifyModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                <h3 className="text-lg font-semibold mb-4">Qualify Lead</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Interest Level
                    </label>
                    <select
                      value={interestLevel}
                      onChange={(e) => setInterestLevel(e.target.value as keyof typeof INTEREST_LEVEL)}
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
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
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
            <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
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
                      <option value="pending">Payment Pending - Remind</option>
                      <option value="advance_received">Advance Received - Track Balance</option>
                      <option value="fully_paid">✔ Fully Paid - Complete</option>
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
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[60]">
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
    </div>
  )
}
