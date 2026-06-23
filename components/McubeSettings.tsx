'use client'

import { useEffect, useState } from 'react'
import { Loader2, MessageCircle, Save } from 'lucide-react'
import { cachedFetch } from '@/lib/api-client'

interface WhatsAppTemplateOption {
  id: string
  name: string
  language: string
  status: string
}

export default function McubeSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [hideConnectedWhenLastMcubeNotConnected, setHideConnectedWhenLastMcubeNotConnected] = useState(true)
  const [failedCallWhatsappEnabled, setFailedCallWhatsappEnabled] = useState(false)
  const [failedCallWhatsappTemplateId, setFailedCallWhatsappTemplateId] = useState('')
  const [failedCallWhatsappBodyParameters, setFailedCallWhatsappBodyParameters] = useState('')
  const [templates, setTemplates] = useState<WhatsAppTemplateOption[]>([])

  useEffect(() => {
    void fetchSettings()
    void loadTemplates()
  }, [])

  async function loadTemplates() {
    try {
      const res = await cachedFetch('/api/marketing/whatsapp/templates?status=APPROVED')
      const data = await res.json()
      if (res.ok) {
        setTemplates(data.templates || data.items || [])
      }
    } catch {
      /* optional */
    }
  }

  async function fetchSettings() {
    try {
      setLoading(true)
      setError(null)
      const response = await cachedFetch('/api/integrations/mcube/settings')
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load MCUBE settings')
      }
      const s = data?.settings ?? {}
      setHideConnectedWhenLastMcubeNotConnected(Boolean(s.hideConnectedWhenLastMcubeNotConnected ?? true))
      setFailedCallWhatsappEnabled(Boolean(s.failedCallWhatsappEnabled))
      setFailedCallWhatsappTemplateId(s.failedCallWhatsappTemplateId || '')
      const bodyParams = Array.isArray(s.failedCallWhatsappBodyParameters)
        ? s.failedCallWhatsappBodyParameters.join(', ')
        : ''
      setFailedCallWhatsappBodyParameters(bodyParams)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load MCUBE settings')
    } finally {
      setLoading(false)
    }
  }

  async function saveSettings() {
    try {
      setSaving(true)
      setError(null)
      setSuccess(null)

      const bodyParams = failedCallWhatsappBodyParameters
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)

      const response = await cachedFetch('/api/integrations/mcube/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hideConnectedWhenLastMcubeNotConnected,
          failedCallWhatsappEnabled,
          failedCallWhatsappTemplateId: failedCallWhatsappTemplateId || null,
          failedCallWhatsappBodyParameters: bodyParams,
          failedCallWhatsappHeaderParameters: [],
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save MCUBE settings')
      }
      setSuccess('MCUBE settings updated')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save MCUBE settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">MCUBE Call Rules</h3>
        <p className="text-sm text-gray-600 mt-1">
          Control how call outcomes are shown in lead status updates.
        </p>
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3 mt-3">
          <strong>Per-caller MCUBE numbers:</strong> set each tele-caller&apos;s{' '}
          <strong>Phone (MCUBE executive)</strong> under Teams. Outbound calls use that user&apos;s number.
          Do not set <code className="text-xs">MCUBE_EXECUTIVE_NUMBER</code> in server env (it overrides everyone).
        </p>
      </div>

      {error && (
        <div className="p-3 rounded border border-red-200 bg-red-50 text-sm text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 rounded border border-green-200 bg-green-50 text-sm text-green-800">
          {success}
        </div>
      )}

      <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-md">
        <input
          type="checkbox"
          className="mt-1"
          checked={hideConnectedWhenLastMcubeNotConnected}
          onChange={(e) => setHideConnectedWhenLastMcubeNotConnected(e.target.checked)}
        />
        <span className="text-sm text-gray-800">
          Hide <strong>Connected</strong> in lead <strong>Update status</strong> modal when the latest
          MCUBE call was not connected.
        </span>
      </label>

      <div className="border-t border-gray-100 pt-6 space-y-4">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-[#128C7E]" />
          <h4 className="text-base font-semibold text-gray-900">Failed-call WhatsApp template</h4>
        </div>
        <p className="text-sm text-gray-600">
          When a caller dials a lead via MCUBE and the call is <strong>not answered</strong>,{' '}
          <strong>not connected</strong>, or <strong>not reachable</strong> (busy, no answer, cancel),
          automatically send the selected approved WhatsApp template to that lead.
        </p>

        <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-md">
          <input
            type="checkbox"
            className="mt-1"
            checked={failedCallWhatsappEnabled}
            onChange={(e) => setFailedCallWhatsappEnabled(e.target.checked)}
          />
          <span className="text-sm text-gray-800">
            Enable automatic WhatsApp after failed MCUBE outbound calls
          </span>
        </label>

        <label className="block text-sm">
          <span className="font-medium text-gray-800">WhatsApp template</span>
          <select
            className="mt-1 w-full max-w-md rounded-md border border-gray-300 px-3 py-2"
            value={failedCallWhatsappTemplateId}
            onChange={(e) => setFailedCallWhatsappTemplateId(e.target.value)}
            disabled={!failedCallWhatsappEnabled}
          >
            <option value="">Select approved template</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.language})
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm max-w-xl">
          <span className="font-medium text-gray-800">Template body parameters (optional)</span>
          <p className="text-xs text-gray-500 mt-0.5">
            Comma-separated values for {'{{1}}'}, {'{{2}}'}, etc. Use{' '}
            <code className="text-xs">{'{{lead_name}}'}</code> for the lead&apos;s name. If empty, the lead
            name is used for the first variable.
          </p>
          <input
            type="text"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            placeholder="{{lead_name}}"
            value={failedCallWhatsappBodyParameters}
            onChange={(e) => setFailedCallWhatsappBodyParameters(e.target.value)}
            disabled={!failedCallWhatsappEnabled}
          />
        </label>
      </div>

      <div>
        <button
          onClick={saveSettings}
          disabled={saving}
          className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save MCUBE Settings'}
        </button>
      </div>
    </div>
  )
}
