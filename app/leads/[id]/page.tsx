'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Layout from '@/components/Layout'
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
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-lg">Loading...</div>
        </div>
      </Layout>
    )
  }

  if (error || !lead) {
    return (
      <Layout>
        <div className="p-8">
          <div className="max-w-4xl mx-auto">
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error || 'Lead not found'}
            </div>
            <Link
              href="/leads"
              className="text-indigo-600 hover:text-indigo-800"
            >
              ← Back to Leads
            </Link>
          </div>
        </div>
      </Layout>
    )
  }

  const availableStatuses = getAvailableStatuses()
  const canUpdateStatus = userRole === 'tele_caller' || userRole === 'admin' || userRole === 'super_admin'

  return (
    <Layout>
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <Link
              href="/leads"
              className="text-indigo-600 hover:text-indigo-800 mb-4 inline-block"
            >
              ← Back to Leads
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 mt-2">Lead Details</h1>
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Lead Information</h2>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Lead ID</label>
                  <p className="mt-1 text-sm text-gray-900">{lead.lead_id}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Status</label>
                  <p className="mt-1">
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 capitalize">
                      {lead.status.replace('_', ' ')}
                    </span>
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <p className="mt-1 text-sm text-gray-900">{lead.name}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Phone</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {lead.phone?.replace(/^(p|tel|phone|mobile):/i, '').trim() || lead.phone}
                  </p>
                </div>
                {lead.email && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <p className="mt-1 text-sm text-gray-900">{lead.email}</p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Source</label>
                  <p className="mt-1 text-sm text-gray-900 capitalize">{lead.source}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Assigned To</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {lead.assigned_user?.name || 'Unassigned'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Created At</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {new Date(lead.created_at).toLocaleString()}
                  </p>
                </div>
                {lead.requirement && (
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700">Requirement</label>
                    <p className="mt-1 text-sm text-gray-900">{lead.requirement}</p>
                  </div>
                )}
                {lead.interest_level && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Interest Level</label>
                    <p className="mt-1 text-sm text-gray-900 capitalize">{lead.interest_level}</p>
                  </div>
                )}
                {lead.budget_range && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Budget Range</label>
                    <p className="mt-1 text-sm text-gray-900">{lead.budget_range}</p>
                  </div>
                )}
                {lead.timeline && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Timeline</label>
                    <p className="mt-1 text-sm text-gray-900">{lead.timeline}</p>
                  </div>
                )}
                {/* Campaign Information */}
                {(lead.campaign_name || lead.ad_name || lead.adset_name || lead.form_name) && (
                  <>
                    {lead.campaign_name && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Campaign</label>
                        <p className="mt-1 text-sm text-gray-900">{lead.campaign_name}</p>
                      </div>
                    )}
                    {lead.ad_name && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Ad</label>
                        <p className="mt-1 text-sm text-gray-900">{lead.ad_name}</p>
                      </div>
                    )}
                    {lead.adset_name && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Ad Set</label>
                        <p className="mt-1 text-sm text-gray-900">{lead.adset_name}</p>
                      </div>
                    )}
                    {lead.form_name && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Form</label>
                        <p className="mt-1 text-sm text-gray-900">{lead.form_name}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Meta Data Section */}
          {lead.meta_data && Object.keys(lead.meta_data).length > 0 && (
            <div className="bg-white rounded-lg shadow overflow-hidden mt-6">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">📊 Meta Data / Additional Information</h2>
              </div>
              <div className="px-6 py-4">
                <div className="space-y-3">
                  {Object.entries(lead.meta_data).map(([key, value]) => {
                    // Skip null, undefined, or empty values
                    if (value === null || value === undefined || value === '') {
                      return null
                    }

                    // Handle nested objects and arrays
                    let displayValue: string
                    if (typeof value === 'object') {
                      if (Array.isArray(value)) {
                        displayValue = JSON.stringify(value, null, 2)
                      } else {
                        displayValue = JSON.stringify(value, null, 2)
                      }
                    } else {
                      displayValue = String(value)
                    }

                    // Format key name (convert snake_case to Title Case)
                    const formattedKey = key
                      .replace(/_/g, ' ')
                      .replace(/\b\w/g, (l) => l.toUpperCase())

                    return (
                      <div key={key} className="border-b border-gray-200 pb-3 last:border-0">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {formattedKey}
                        </label>
                        {typeof value === 'object' ? (
                          <pre className="mt-1 text-sm text-gray-900 bg-gray-50 p-3 rounded border border-gray-200 overflow-x-auto">
                            {displayValue}
                          </pre>
                        ) : (
                          <p className="mt-1 text-sm text-gray-900 break-words">{displayValue}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* First Contact / Call Status Section */}
          {canUpdateStatus && (lead.status === LEAD_STATUS.NEW || lead.status === LEAD_STATUS.QUALIFIED) && (
            <div className="bg-white rounded-lg shadow overflow-hidden mt-6">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">📞 Sales Rep Calls Lead</h2>
                <p className="text-sm text-gray-500 mt-1">First Contact Attempt - Update Call Status</p>
              </div>
              <div className="px-6 py-4">
                <button
                  onClick={() => setShowCallModal(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                >
                  Record Call
                </button>
              </div>
            </div>
          )}

          {/* Qualification Section */}
          {canUpdateStatus && lead.status === LEAD_STATUS.QUALIFIED && !lead.interest_level && (
            <div className="bg-white rounded-lg shadow overflow-hidden mt-6">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">✅ Qualify Lead</h2>
                <p className="text-sm text-gray-500 mt-1">Set interest level to proceed</p>
              </div>
              <div className="px-6 py-4">
                <button
                  onClick={() => setShowQualifyModal(true)}
                  className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
                >
                  Qualify Lead
                </button>
              </div>
            </div>
          )}

          {/* Payment Status Section */}
          {canUpdateStatus && (lead.status === LEAD_STATUS.DEAL_WON || lead.status === LEAD_STATUS.PAYMENT_PENDING || lead.status === LEAD_STATUS.ADVANCE_RECEIVED) && (
            <div className="bg-white rounded-lg shadow overflow-hidden mt-6">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">💰 Payment Status</h2>
              </div>
              <div className="px-6 py-4">
                <button
                  onClick={() => setShowPaymentModal(true)}
                  className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700"
                >
                  Update Payment Status
                </button>
              </div>
            </div>
          )}

          {/* Status Update Section */}
          {canUpdateStatus && (
            <div className="bg-white rounded-lg shadow overflow-hidden mt-6">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Update Status</h2>
              </div>
              <div className="px-6 py-4 space-y-4">
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
                      {LEAD_STATUS_ICONS[lead.status as keyof typeof LEAD_STATUS_ICONS]} {LEAD_STATUS_LABELS[lead.status as keyof typeof LEAD_STATUS_LABELS]} (Current)
                    </option>
                    {availableStatuses.map((status) => (
                      <option key={status} value={status}>
                        {LEAD_STATUS_ICONS[status as keyof typeof LEAD_STATUS_ICONS]} {LEAD_STATUS_LABELS[status as keyof typeof LEAD_STATUS_LABELS]}
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
                <button
                  onClick={handleStatusUpdate}
                  disabled={updatingStatus || newStatus === lead.status || availableStatuses.length === 0}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {updatingStatus ? 'Updating...' : 'Update Status'}
                </button>
              </div>
            </div>
          )}

          {/* Status History */}
          {lead.status_history && lead.status_history.length > 0 && (
            <div className="bg-white rounded-lg shadow overflow-hidden mt-6">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Status History</h2>
              </div>
              <div className="px-6 py-4">
                <div className="space-y-3">
                  {lead.status_history.map((history) => (
                    <div key={history.id} className="border-l-2 border-indigo-500 pl-4 py-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {history.old_status 
                              ? `${LEAD_STATUS_LABELS[history.old_status as keyof typeof LEAD_STATUS_LABELS]} → ${LEAD_STATUS_LABELS[history.new_status as keyof typeof LEAD_STATUS_LABELS]}`
                              : `Status set to ${LEAD_STATUS_LABELS[history.new_status as keyof typeof LEAD_STATUS_LABELS]}`
                            }
                          </p>
                          {history.notes && (
                            <p className="text-sm text-gray-600 mt-1">{history.notes}</p>
                          )}
                          {history.changed_by_user && (
                            <p className="text-xs text-gray-500 mt-1">
                              Changed by: {history.changed_by_user.name}
                            </p>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {new Date(history.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Calls History */}
          {lead.calls && lead.calls.length > 0 && (
            <div className="bg-white rounded-lg shadow overflow-hidden mt-6">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Call History</h2>
              </div>
              <div className="px-6 py-4">
                <div className="space-y-3">
                  {lead.calls.map((call) => (
                    <div key={call.id} className="border-b border-gray-200 pb-3 last:border-0">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-medium text-gray-900 capitalize">
                            {call.outcome.replace('_', ' ')}
                          </p>
                          {call.disposition && (
                            <p className="text-sm text-gray-600 mt-1">{call.disposition}</p>
                          )}
                          {call.notes && (
                            <p className="text-sm text-gray-600 mt-1">{call.notes}</p>
                          )}
                          {call.called_by_user && (
                            <p className="text-xs text-gray-500 mt-1">
                              Called by: {call.called_by_user.name}
                            </p>
                          )}
                          {call.call_duration && (
                            <p className="text-xs text-gray-500 mt-1">
                              Duration: {call.call_duration} seconds
                            </p>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {new Date(call.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Follow-ups Section */}
          <div className="bg-white rounded-lg shadow overflow-hidden mt-6">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">📅 Follow-ups</h2>
                <p className="text-sm text-gray-500 mt-1">Schedule and manage follow-up calls</p>
              </div>
              {canUpdateStatus && (
                <button
                  onClick={() => setShowFollowUpModal(true)}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 text-sm"
                >
                  Schedule Follow-up
                </button>
              )}
            </div>
            <div className="px-6 py-4">
              {lead.follow_ups && lead.follow_ups.length > 0 ? (
                <div className="space-y-3">
                  {lead.follow_ups
                    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
                    .map((followUp) => {
                      const isOverdue = followUp.status === 'pending' && new Date(followUp.scheduled_at) < new Date()
                      const isUpcoming = followUp.status === 'pending' && new Date(followUp.scheduled_at) >= new Date()
                      
                      return (
                        <div 
                          key={followUp.id} 
                          className={`border-l-4 ${
                            followUp.status === 'done' 
                              ? 'border-green-500 bg-green-50' 
                              : isOverdue 
                              ? 'border-red-500 bg-red-50' 
                              : isUpcoming 
                              ? 'border-blue-500 bg-blue-50' 
                              : 'border-gray-300 bg-gray-50'
                          } p-4 rounded`}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <span className={`px-2 py-1 text-xs font-semibold rounded ${
                                  followUp.status === 'done' 
                                    ? 'bg-green-100 text-green-800' 
                                    : isOverdue 
                                    ? 'bg-red-100 text-red-800' 
                                    : 'bg-blue-100 text-blue-800'
                                }`}>
                                  {followUp.status === 'done' 
                                    ? '✅ Completed' 
                                    : isOverdue 
                                    ? '⚠️ Overdue' 
                                    : '📅 Upcoming'}
                                </span>
                                <span className="text-xs text-gray-500 capitalize">
                                  {followUp.status.replace('_', ' ')}
                                </span>
                              </div>
                              <p className="text-sm font-medium text-gray-900">
                                Scheduled: {new Date(followUp.scheduled_at).toLocaleString()}
                              </p>
                              {followUp.completed_at && (
                                <p className="text-sm text-gray-600 mt-1">
                                  Completed: {new Date(followUp.completed_at).toLocaleString()}
                                </p>
                              )}
                              {followUp.notes && (
                                <p className="text-sm text-gray-600 mt-2">{followUp.notes}</p>
                              )}
                              {followUp.assigned_user && (
                                <p className="text-xs text-gray-500 mt-2">
                                  Assigned to: {followUp.assigned_user.name}
                                </p>
                              )}
                            </div>
                            {canUpdateStatus && followUp.status === 'pending' && (
                              <button
                                onClick={() => handleCompleteFollowUp(followUp.id)}
                                className="ml-4 px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                              >
                                Mark Done
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">No follow-ups scheduled</p>
              )}
            </div>
          </div>

          {/* Call Status Modal */}
          {showCallModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
        </div>
      </div>
    </Layout>
  )
}
