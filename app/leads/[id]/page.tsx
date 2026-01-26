'use client'

import { useEffect, useState } from 'react'
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
  const [callDuration, setCallDuration] = useState('')
  const [submittingCall, setSubmittingCall] = useState(false)
  
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

    setSubmittingCall(true)
    try {
      // Create call record
      const callResponse = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: leadId,
          outcome: callOutcome,
          notes: callNotes || null,
          call_duration: callDuration ? parseInt(callDuration) : null,
        }),
      })

      if (!callResponse.ok) {
        const errorData = await callResponse.json()
        throw new Error(errorData.error || 'Failed to record call')
      }

      // Auto-transition based on call outcome
      let nextStatus: string | null = null
      let transitionNotes = ''
      let shouldCreateFollowUp = false
      let followUpScheduledAt: string | null = null

      switch (callOutcome) {
        case 'connected':
          // If new lead, move to qualified (user will then set interest level)
          if (lead?.status === LEAD_STATUS.NEW) {
            nextStatus = LEAD_STATUS.QUALIFIED
            transitionNotes = 'Connected on first call - Ready to qualify'
          }
          break
        case 'not_reachable':
        case 'call_later':
          // Schedule follow-up automatically (default to 24 hours later)
          shouldCreateFollowUp = true
          const followUpDate = new Date()
          followUpDate.setHours(followUpDate.getHours() + 24)
          followUpScheduledAt = followUpDate.toISOString()
          transitionNotes = 'Follow-up scheduled due to call outcome'
          break
        case 'wrong_number':
          // Discard lead - mark as lost
          nextStatus = LEAD_STATUS.LOST
          transitionNotes = 'Wrong number - Lead discarded'
          break
      }

      // Create follow-up if needed
      if (shouldCreateFollowUp && followUpScheduledAt && userId && lead?.assigned_to) {
        try {
          await fetch('/api/followups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lead_id: leadId,
              assigned_to: lead.assigned_to,
              scheduled_at: followUpScheduledAt,
              notes: `Auto-scheduled follow-up after call: ${CALL_OUTCOME_LABELS[callOutcome]}`,
            }),
          })
        } catch (followUpError) {
          console.error('Failed to create automatic follow-up:', followUpError)
          // Don't fail the call recording if follow-up creation fails
        }
      }

      // Update status if needed
      if (nextStatus && nextStatus !== lead?.status) {
        const statusResponse = await fetch(`/api/leads/${leadId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: nextStatus,
            notes: transitionNotes,
          }),
        })

        if (!statusResponse.ok) {
          console.error('Failed to update status after call')
        }
      }

      // Refresh lead data
      await fetchLead()
      setShowCallModal(false)
      setCallOutcome('')
      setCallNotes('')
      setCallDuration('')
      alert('Call recorded successfully' + (nextStatus ? ` - Status updated to ${LEAD_STATUS_LABELS[nextStatus as keyof typeof LEAD_STATUS_LABELS]}` : ''))
    } catch (error) {
      console.error('Failed to record call:', error)
      alert(error instanceof Error ? error.message : 'Failed to record call')
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
    const statusLower = status.toLowerCase()
    if (statusLower.includes('review')) return 'In review'
    if (statusLower.includes('negotiation')) return 'Negotiation'
    if (statusLower === 'new') return 'New'
    if (statusLower.includes('approved') || statusLower.includes('converted') || statusLower.includes('deal_won')) return 'Approved'
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  return (
    <Layout>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
        onClick={() => router.push('/leads')}
      />
      
      {/* Centered Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
        <div className="bg-white shadow-2xl rounded-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto pointer-events-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 z-10">
          <div className="px-6 py-4 flex items-start justify-between">
            <div className="flex items-start gap-4 flex-1">
              {/* Profile Picture */}
              <div className="w-16 h-16 rounded-full bg-[#ed1b24] flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
                {lead?.name?.charAt(0).toUpperCase() || 'L'}
              </div>
              
              {/* Name and Vehicle */}
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-gray-900 mb-1">{lead?.name || 'Loading...'}</h1>
                {getVehicleName() && (
                  <p className="text-lg text-gray-600 mb-3">{getVehicleName()}</p>
                )}
                
                {/* Status Tags */}
                <div className="flex items-center gap-2 flex-wrap">
                  {lead?.status && (
                    <span className={`px-3 py-1 text-sm font-semibold rounded-full ${getStatusBadgeColor(lead.status)}`}>
                      {formatStatusName(lead.status)}
                    </span>
                  )}
                  {lead?.interest_level === 'hot' && (
                    <span className="px-3 py-1 text-sm font-semibold rounded-full bg-red-100 text-red-800">
                      Hot
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            {/* Close Button */}
            <button
              onClick={() => router.push('/leads')}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          {/* Contact Information */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Contact Information</h2>
            <div className="space-y-2">
              {lead?.phone && (
                <div className="flex items-center gap-2 text-gray-700">
                  <span className="font-medium">Phone:</span>
                  <span>{lead.phone.replace(/^(p|tel|phone|mobile):/i, '').trim()}</span>
                </div>
              )}
              {lead?.email && (
                <div className="flex items-center gap-2 text-gray-700">
                  <span className="font-medium">Email:</span>
                  <span>{lead.email}</span>
                </div>
              )}
            </div>
          </div>

          {/* Assigned To */}
          {lead?.assigned_user && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Assigned To</h2>
              <div className="flex items-center gap-3">
                {lead.assigned_user.profile_image_url ? (
                  <Image
                    src={lead.assigned_user.profile_image_url}
                    alt={lead.assigned_user.name}
                    width={40}
                    height={40}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#ed1b24] flex items-center justify-center text-white font-medium">
                    {lead.assigned_user.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-medium text-gray-900">{lead.assigned_user.name}</p>
                  <p className="text-sm text-gray-500">{lead.assigned_user.email}</p>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          {lead?.meta_data?.notes && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Notes</h2>
              <p className="text-gray-700 bg-gray-50 p-3 rounded-md">{lead.meta_data.notes}</p>
            </div>
          )}

          {/* Lead Details */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Lead Details</h2>
            <div className="space-y-2 text-gray-700">
              <div className="flex justify-between">
                <span className="font-medium">Source:</span>
                <span className="capitalize">{lead?.source || 'N/A'}</span>
              </div>
              {getEstimatedValue() && (
                <div className="flex justify-between">
                  <span className="font-medium">Estimated Value:</span>
                  <span>{getEstimatedValue()}</span>
                </div>
              )}
              {lead?.created_at && (
                <div className="flex justify-between">
                  <span className="font-medium">Created At:</span>
                  <span>{new Date(lead.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}</span>
                </div>
              )}
              {getLastContactedTime() && (
                <div className="flex justify-between">
                  <span className="font-medium">Last Contacted:</span>
                  <span>{getLastContactedTime()}</span>
                </div>
              )}
            </div>
          </div>

          {/* Next Follow-up */}
          {getNextFollowUp() && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Next Follow-up</h2>
              <p className="text-gray-700">{getNextFollowUp()}</p>
            </div>
          )}

          {/* Interests */}
          {getInterests().length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Interests</h2>
              <div className="flex flex-wrap gap-2">
                {getInterests().map((interest, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
                  >
                    {String(interest).replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recent Activity */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Recent Activity</h2>
            <div className="space-y-3">
              {/* Status History */}
              {lead?.status_history && lead.status_history.length > 0 && (
                <div className="space-y-2">
                  {lead.status_history.slice(0, 3).map((history) => (
                    <div key={history.id} className="text-sm text-gray-600 border-l-2 border-gray-300 pl-3 py-1">
                      <p>
                        Status changed to <span className="font-medium">{formatStatusName(history.new_status)}</span>
                        {history.changed_by_user && (
                          <span> by {history.changed_by_user.name}</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(history.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Call History */}
              {lead?.calls && lead.calls.length > 0 && (
                <div className="space-y-2">
                  {lead.calls.slice(0, 3).map((call) => (
                    <div key={call.id} className="text-sm text-gray-600 border-l-2 border-blue-300 pl-3 py-1">
                      <p>
                        Call: <span className="font-medium capitalize">{call.outcome.replace('_', ' ')}</span>
                        {call.called_by_user && (
                          <span> by {call.called_by_user.name}</span>
                        )}
                      </p>
                      {call.notes && (
                        <p className="text-xs text-gray-500 mt-1">{call.notes}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(call.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex gap-3">
          <button
            onClick={() => setShowCallModal(true)}
            className="flex-1 bg-[#ed1b24] text-white px-4 py-2 rounded-md hover:bg-[#d11820] font-medium transition-colors"
          >
            Contact Lead
          </button>
          <button
            onClick={() => setShowFollowUpModal(true)}
            className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 font-medium transition-colors"
          >
            Schedule Follow-up
          </button>
          <button
            onClick={() => setShowStatusUpdateModal(true)}
            className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 font-medium transition-colors"
          >
            Update Status
          </button>
        </div>
        </div>
      </div>

      {/* Modals */}
      {/* Call Status Modal */}
          {showCallModal && (
            <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                <h3 className="text-lg font-semibold mb-4">Record Call Status</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Call Outcome
                    </label>
                    <select
                      value={callOutcome}
                      onChange={(e) => setCallOutcome(e.target.value as keyof typeof CALL_OUTCOME)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="">Select outcome...</option>
                      {Object.entries(CALL_OUTCOME_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Call Duration (seconds)
                    </label>
                    <input
                      type="number"
                      value={callDuration}
                      onChange={(e) => setCallDuration(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Notes
                    </label>
                    <textarea
                      value={callNotes}
                      onChange={(e) => setCallNotes(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Call notes..."
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setShowCallModal(false)
                        setCallOutcome('')
                        setCallNotes('')
                        setCallDuration('')
                      }}
                      className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                      disabled={submittingCall}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCallStatusUpdate}
                      disabled={submittingCall || !callOutcome}
                      className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submittingCall ? 'Recording...' : 'Record Call'}
                    </button>
                  </div>
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
    </Layout>
  )
}
