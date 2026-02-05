'use client'

import { useState } from 'react'
import {
  Sparkles,
  X,
  User,
  Phone,
  Mail,
  MapPin,
  DollarSign,
  Calendar,
  FileText,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Check,
  AlertCircle,
} from 'lucide-react'

interface NewLeadFormProps {
  onClose: () => void
}

interface FormData {
  name: string
  phone: string
  email: string
  source: 'meta' | 'manual' | 'form' | 'whatsapp' | 'ivr' | ''
  interest_level: 'hot' | 'warm' | 'cold' | ''
  budget_range: string
  requirement: string
  timeline: string
  campaign_id: string
  campaign_name: string
  adset_id: string
  ad_id: string
  ad_name: string
  form_id: string
  form_name: string
}

interface FormErrors {
  name?: string
  phone?: string
  email?: string
  source?: string
}

export default function NewLeadForm({ onClose }: NewLeadFormProps) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    phone: '',
    email: '',
    source: '',
    interest_level: '',
    budget_range: '',
    requirement: '',
    timeline: '',
    campaign_id: '',
    campaign_name: '',
    adset_id: '',
    ad_id: '',
    ad_name: '',
    form_id: '',
    form_name: '',
  })

  const [errors, setErrors] = useState<FormErrors>({})
  const [showOptionalFields, setShowOptionalFields] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Validation functions
  const validateName = (name: string): string | undefined => {
    if (!name.trim()) return 'Name is required'
    return undefined
  }

  const validatePhone = (phone: string): string | undefined => {
    if (!phone.trim()) return 'Phone is required'
    // Basic phone validation - allows various formats
    const phoneRegex = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/
    if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
      return 'Invalid phone number format'
    }
    return undefined
  }

  const validateEmail = (email: string): string | undefined => {
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return 'Invalid email format'
    }
    return undefined
  }

  const validateSource = (source: string): string | undefined => {
    if (!source) return 'Lead source is required'
    return undefined
  }

  // Real-time validation
  const handleFieldChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))

    // Clear error for this field
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[field as keyof FormErrors]
        return newErrors
      })
    }

    // Validate on change
    let error: string | undefined
    switch (field) {
      case 'name':
        error = validateName(value)
        break
      case 'phone':
        error = validatePhone(value)
        break
      case 'email':
        error = validateEmail(value)
        break
      case 'source':
        error = validateSource(value)
        break
    }

    if (error) {
      setErrors((prev) => ({ ...prev, [field]: error }))
    }
  }

  // Check if field is valid
  const isFieldValid = (field: keyof FormData): boolean => {
    const value = formData[field]
    if (field === 'name') return !validateName(value as string) && value.trim() !== ''
    if (field === 'phone') return !validatePhone(value as string) && value.trim() !== ''
    if (field === 'email') return !validateEmail(value as string) && (value === '' || value.trim() !== '')
    if (field === 'source') return !validateSource(value as string) && value !== ''
    return true
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    // Validate all required fields
    const newErrors: FormErrors = {}
    const nameError = validateName(formData.name)
    const phoneError = validatePhone(formData.phone)
    const emailError = validateEmail(formData.email)
    const sourceError = validateSource(formData.source)

    if (nameError) newErrors.name = nameError
    if (phoneError) newErrors.phone = phoneError
    if (emailError) newErrors.email = emailError
    if (sourceError) newErrors.source = sourceError

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      setIsSubmitting(false)
      return
    }

    try {
      // Prepare meta_data
      const metaData: Record<string, any> = {}
      if (formData.source === 'meta') {
        if (formData.campaign_id) metaData.campaign_id = formData.campaign_id
        if (formData.campaign_name) metaData.campaign_name = formData.campaign_name
        if (formData.adset_id) metaData.adset_id = formData.adset_id
        if (formData.ad_id) metaData.ad_id = formData.ad_id
        if (formData.ad_name) metaData.ad_name = formData.ad_name
      }
      if (formData.source === 'form') {
        if (formData.form_id) metaData.form_id = formData.form_id
        if (formData.form_name) metaData.form_name = formData.form_name
      }

      const leadData: any = {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        source: formData.source as 'meta' | 'manual' | 'form' | 'whatsapp' | 'ivr',
        interest_level: formData.interest_level || null,
        budget_range: formData.budget_range.trim() || null,
        requirement: formData.requirement.trim() || null,
        timeline: formData.timeline.trim() || null,
        campaign_id: formData.campaign_id.trim() || null,
        campaign_name: formData.campaign_name.trim() || null,
        adset_id: formData.adset_id.trim() || null,
        ad_id: formData.ad_id.trim() || null,
        ad_name: formData.ad_name.trim() || null,
        form_id: formData.form_id.trim() || null,
        form_name: formData.form_name.trim() || null,
        meta_data: Object.keys(metaData).length > 0 ? metaData : null,
      }

      // Only include email if it's not empty
      if (formData.email.trim()) {
        leadData.email = formData.email.trim()
      }

      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(leadData),
      })

      if (response.ok) {
        alert('Lead created successfully!')
        onClose()
        // Reload the page to show the new lead
        window.location.reload()
      } else {
        const errorData = await response.json()
        alert(errorData.error || 'Failed to create lead')
      }
    } catch (error) {
      console.error('Error creating lead:', error)
      alert('Failed to create lead. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Blurred Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />

      {/* Full Page Form Container */}
      <div className="relative min-h-screen flex items-start justify-center p-4 pt-8 pb-8 pointer-events-none">
        <div
          className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col animate-slideUp my-8 pointer-events-auto overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-[#de0510] to-[#ff1a24] text-white p-6 sticky top-0 z-10 rounded-t-3xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sparkles className="animate-pulse" size={24} />
                <div>
                  <h2 className="text-2xl font-semibold">New Lead</h2>
                  <p className="text-sm text-white/90">Create a new lead in the system</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-xl transition-colors"
                aria-label="Close"
              >
                <X size={24} />
              </button>
            </div>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto max-h-[calc(95vh-200px)]">
            <div className="p-6 space-y-6">
              {/* Required Fields Section */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 bg-[#de0510] rounded-full"></div>
                  <h3 className="text-lg font-semibold text-[#242d35]">Required Information</h3>
                </div>

                <div className="space-y-4">
                  {/* Full Name */}
                  <div>
                    <label className="block text-sm font-medium text-[#242d35] mb-2">
                      Full Name <span className="text-[#de0510]">*</span>
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#717d8a] z-10" size={20} />
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => handleFieldChange('name', e.target.value)}
                        placeholder="Enter lead's full name"
                        className={`w-full pl-11 pr-10 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#de0510] transition-all ${
                          errors.name
                            ? 'border-red-500'
                            : isFieldValid('name')
                            ? 'border-green-500'
                            : 'border-[#eaecee]'
                        }`}
                      />
                      {isFieldValid('name') && (
                        <Check className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-500" size={20} />
                      )}
                    </div>
                    {errors.name && (
                      <div className="flex items-center gap-1 mt-1 text-sm text-red-500">
                        <AlertCircle size={16} />
                        <span>{errors.name}</span>
                      </div>
                    )}
                  </div>

                  {/* Phone Number */}
                  <div>
                    <label className="block text-sm font-medium text-[#242d35] mb-2">
                      Phone Number <span className="text-[#de0510]">*</span>
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#717d8a] z-10" size={20} />
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => handleFieldChange('phone', e.target.value)}
                        placeholder="+1 (555) 000-0000"
                        className={`w-full pl-11 pr-10 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#de0510] transition-all ${
                          errors.phone
                            ? 'border-red-500'
                            : isFieldValid('phone')
                            ? 'border-green-500'
                            : 'border-[#eaecee]'
                        }`}
                      />
                      {isFieldValid('phone') && (
                        <Check className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-500" size={20} />
                      )}
                    </div>
                    {errors.phone && (
                      <div className="flex items-center gap-1 mt-1 text-sm text-red-500">
                        <AlertCircle size={16} />
                        <span>{errors.phone}</span>
                      </div>
                    )}
                  </div>

                  {/* Email Address */}
                  <div>
                    <label className="block text-sm font-medium text-[#242d35] mb-2">
                      Email Address <span className="text-gray-400 text-xs">(Optional)</span>
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#717d8a] z-10" size={20} />
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleFieldChange('email', e.target.value)}
                        placeholder="lead@example.com"
                        className={`w-full pl-11 pr-10 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#de0510] transition-all ${
                          errors.email
                            ? 'border-red-500'
                            : isFieldValid('email') && formData.email
                            ? 'border-green-500'
                            : 'border-[#eaecee]'
                        }`}
                      />
                      {isFieldValid('email') && formData.email && (
                        <Check className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-500" size={20} />
                      )}
                    </div>
                    {errors.email && (
                      <div className="flex items-center gap-1 mt-1 text-sm text-red-500">
                        <AlertCircle size={16} />
                        <span>{errors.email}</span>
                      </div>
                    )}
                  </div>

                  {/* Lead Source */}
                  <div>
                    <label className="block text-sm font-medium text-[#242d35] mb-2">
                      Lead Source <span className="text-[#de0510]">*</span>
                    </label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#717d8a] z-10" size={20} />
                      <select
                        value={formData.source}
                        onChange={(e) => handleFieldChange('source', e.target.value)}
                        className={`w-full pl-11 pr-10 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] transition-all appearance-none bg-white ${
                          errors.source ? 'border-red-500' : 'border-[#eaecee]'
                        }`}
                      >
                        <option value="">Select lead source</option>
                        <option value="manual">📝 Manual Entry</option>
                        <option value="meta">📱 Meta Ads</option>
                        <option value="form">📋 Web Form</option>
                        <option value="whatsapp">💬 WhatsApp</option>
                        <option value="ivr">📞 IVR Call</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[#717d8a] pointer-events-none" size={20} />
                    </div>
                    {errors.source && (
                      <div className="flex items-center gap-1 mt-1 text-sm text-red-500">
                        <AlertCircle size={16} />
                        <span>{errors.source}</span>
                      </div>
                    )}
                  </div>

                  {/* Interest Level */}
                  <div>
                    <label className="block text-sm font-medium text-[#242d35] mb-2">
                      Interest Level <span className="text-gray-400 text-xs">(Optional)</span>
                    </label>
                    <div className="relative">
                      <TrendingUp className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#717d8a] z-10" size={20} />
                      <select
                        value={formData.interest_level}
                        onChange={(e) => handleFieldChange('interest_level', e.target.value)}
                        className="w-full pl-11 pr-10 py-3 border border-[#eaecee] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#de0510] transition-all appearance-none bg-white"
                      >
                        <option value="">Select interest level</option>
                        <option value="hot">🔥 Hot - Ready to buy</option>
                        <option value="warm">⚡ Warm - Interested</option>
                        <option value="cold">❄️ Cold - Just browsing</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[#717d8a] pointer-events-none" size={20} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Optional Fields Section */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowOptionalFields(!showOptionalFields)}
                  className="w-full flex items-center justify-between p-4 bg-[#f5f5f5] hover:bg-[#eaecee] rounded-xl transition-all"
                >
                  <span className="text-base font-semibold text-[#242d35]">Additional Details (Optional)</span>
                  {showOptionalFields ? (
                    <ChevronUp className="text-[#717d8a]" size={20} />
                  ) : (
                    <ChevronDown className="text-[#717d8a]" size={20} />
                  )}
                </button>

                {showOptionalFields && (
                  <div className="mt-4 space-y-4 animate-slideUp">
                    {/* Budget Range */}
                    <div>
                      <label className="block text-sm font-medium text-[#242d35] mb-2">Budget Range</label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#717d8a] z-10" size={20} />
                        <input
                          type="text"
                          value={formData.budget_range}
                          onChange={(e) => handleFieldChange('budget_range', e.target.value)}
                          placeholder="e.g., $10,000 - $50,000"
                          className="w-full pl-11 pr-4 py-3 border border-[#eaecee] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#de0510] transition-all"
                        />
                      </div>
                    </div>

                    {/* Expected Timeline */}
                    <div>
                      <label className="block text-sm font-medium text-[#242d35] mb-2">Expected Timeline</label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#717d8a] z-10" size={20} />
                        <input
                          type="text"
                          value={formData.timeline}
                          onChange={(e) => handleFieldChange('timeline', e.target.value)}
                          placeholder="e.g., 2-3 months, Q2 2025"
                          className="w-full pl-11 pr-4 py-3 border border-[#eaecee] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#de0510] transition-all"
                        />
                      </div>
                    </div>

                    {/* Requirements / Notes */}
                    <div>
                      <label className="block text-sm font-medium text-[#242d35] mb-2">Requirements / Notes</label>
                      <div className="relative">
                        <FileText className="absolute left-3 top-3 text-[#717d8a] z-10" size={20} />
                        <textarea
                          value={formData.requirement}
                          onChange={(e) => handleFieldChange('requirement', e.target.value)}
                          placeholder="Enter any specific requirements or notes about this lead..."
                          rows={4}
                          className="w-full pl-11 pr-4 py-3 border border-[#eaecee] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#de0510] transition-all resize-none"
                        />
                      </div>
                    </div>

                    {/* Meta Ads Fields */}
                    {formData.source === 'meta' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-[#eaecee]">
                        <div>
                          <label className="block text-sm font-medium text-[#242d35] mb-2">Campaign ID</label>
                          <input
                            type="text"
                            value={formData.campaign_id}
                            onChange={(e) => handleFieldChange('campaign_id', e.target.value)}
                            placeholder="Campaign ID"
                            className="w-full px-4 py-3 border border-[#eaecee] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#de0510] transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[#242d35] mb-2">Campaign Name</label>
                          <input
                            type="text"
                            value={formData.campaign_name}
                            onChange={(e) => handleFieldChange('campaign_name', e.target.value)}
                            placeholder="Campaign Name"
                            className="w-full px-4 py-3 border border-[#eaecee] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#de0510] transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[#242d35] mb-2">Ad Set ID</label>
                          <input
                            type="text"
                            value={formData.adset_id}
                            onChange={(e) => handleFieldChange('adset_id', e.target.value)}
                            placeholder="Ad Set ID"
                            className="w-full px-4 py-3 border border-[#eaecee] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#de0510] transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[#242d35] mb-2">Ad ID</label>
                          <input
                            type="text"
                            value={formData.ad_id}
                            onChange={(e) => handleFieldChange('ad_id', e.target.value)}
                            placeholder="Ad ID"
                            className="w-full px-4 py-3 border border-[#eaecee] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#de0510] transition-all"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-[#242d35] mb-2">Ad Name</label>
                          <input
                            type="text"
                            value={formData.ad_name}
                            onChange={(e) => handleFieldChange('ad_name', e.target.value)}
                            placeholder="Ad Name"
                            className="w-full px-4 py-3 border border-[#eaecee] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#de0510] transition-all"
                          />
                        </div>
                      </div>
                    )}

                    {/* Form Fields */}
                    {formData.source === 'form' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-[#eaecee]">
                        <div>
                          <label className="block text-sm font-medium text-[#242d35] mb-2">Form ID</label>
                          <input
                            type="text"
                            value={formData.form_id}
                            onChange={(e) => handleFieldChange('form_id', e.target.value)}
                            placeholder="Form ID"
                            className="w-full px-4 py-3 border border-[#eaecee] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#de0510] transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[#242d35] mb-2">Form Name</label>
                          <input
                            type="text"
                            value={formData.form_name}
                            onChange={(e) => handleFieldChange('form_name', e.target.value)}
                            placeholder="Form Name"
                            className="w-full px-4 py-3 border border-[#eaecee] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#de0510] transition-all"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </form>

          {/* Footer */}
          <div className="bg-[#fafafa] border-t border-[#eaecee] p-6 sticky bottom-0 rounded-b-3xl">
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 bg-white border border-[#eaecee] text-[#242d35] rounded-xl hover:bg-[#f5f5f5] transition-all font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-[#de0510] text-white rounded-xl hover:bg-[#c0040e] transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Creating...' : 'Create Lead'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
