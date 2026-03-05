'use client'

import { useState, useEffect } from 'react'
import { CheckCircle2, XCircle, Loader2, MessageCircle, ExternalLink } from 'lucide-react'

interface WhatsAppConfig {
  id: string
  wabaId: string
  wabaName: string | null
  phoneNumberId: string
  phoneNumberDisplay: string | null
  isExpired: boolean
  expiresAt: string | null
  isActive: boolean
  connectedAt: string
}

export default function WhatsAppIntegration() {
  const [config, setConfig] = useState<WhatsAppConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    wabaId: '',
    phoneNumberId: '',
    accessToken: '',
    wabaName: '',
    phoneNumberDisplay: '',
  })

  useEffect(() => {
    fetchConfig()
  }, [])

  async function fetchConfig() {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/integrations/whatsapp/config')
      if (response.ok) {
        const data = await response.json()
        setConfig(data.config)
      } else {
        setError('Failed to load WhatsApp connection status')
      }
    } catch (err) {
      console.error('Failed to fetch WhatsApp config:', err)
      setError('Failed to load WhatsApp connection status')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    const { wabaId, phoneNumberId, accessToken } = formData
    if (!wabaId.trim() || !phoneNumberId.trim() || !accessToken.trim()) {
      setError('WABA ID, Phone Number ID, and Access Token are required.')
      return
    }

    try {
      setSaving(true)
      setError(null)

      const response = await fetch('/api/integrations/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wabaId: wabaId.trim(),
          phoneNumberId: phoneNumberId.trim(),
          accessToken: accessToken.trim(),
          wabaName: formData.wabaName.trim() || undefined,
          phoneNumberDisplay: formData.phoneNumberDisplay.trim() || undefined,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || data.detail || 'Failed to save WhatsApp connection')
      }

      setFormData({ wabaId: '', phoneNumberId: '', accessToken: '', wabaName: '', phoneNumberDisplay: '' })
      setShowForm(false)
      fetchConfig()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link WhatsApp account')
    } finally {
      setSaving(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm('Are you sure you want to disconnect your WhatsApp Business account? Bulk messaging and templates will stop working until you reconnect.')) {
      return
    }

    try {
      setDisconnecting(true)
      setError(null)

      const response = await fetch('/api/integrations/whatsapp/config', { method: 'DELETE' })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to disconnect')
      }

      setConfig(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect WhatsApp account')
    } finally {
      setDisconnecting(false)
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
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-green-600" />
            WhatsApp Business Integration
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Link your WhatsApp Business Account to send messages, manage templates, and use Bulk WhatsApp from the CRM
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {config ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-medium">Connected</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">WABA ID</p>
              <p className="text-sm font-mono text-gray-900">{config.wabaId}</p>
              {config.wabaName && (
                <p className="text-xs text-gray-500 mt-1">{config.wabaName}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Phone Number ID</p>
              <p className="text-sm font-mono text-gray-900">{config.phoneNumberId}</p>
              {config.phoneNumberDisplay && (
                <p className="text-xs text-gray-500 mt-1">{config.phoneNumberDisplay}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Connected</p>
              <p className="text-sm font-medium text-gray-900">
                {new Date(config.connectedAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
            <a
              href="https://business.facebook.com/wa/manage/phone-numbers/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <ExternalLink className="w-4 h-4" />
              Manage in Meta Business Suite
            </a>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {disconnecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4" />
                  Disconnect
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="pt-4">
          <div className="flex items-center gap-2 text-gray-500 mb-4">
            <XCircle className="w-5 h-5" />
            <span>Not Connected</span>
          </div>

          {showForm ? (
            <div className="space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-sm text-gray-700">
                Enter your WhatsApp Business Account details from Meta for Developers → Your App → WhatsApp → API Setup.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">WABA ID (Business Account ID) *</label>
                <input
                  type="text"
                  value={formData.wabaId}
                  onChange={(e) => setFormData((f) => ({ ...f, wabaId: e.target.value }))}
                  placeholder="e.g. 123456789012345"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number ID *</label>
                <input
                  type="text"
                  value={formData.phoneNumberId}
                  onChange={(e) => setFormData((f) => ({ ...f, phoneNumberId: e.target.value }))}
                  placeholder="e.g. 987654321098765"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Access Token *</label>
                <input
                  type="password"
                  value={formData.accessToken}
                  onChange={(e) => setFormData((f) => ({ ...f, accessToken: e.target.value }))}
                  placeholder="Permanent access token from Meta"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use a System User token with whatsapp_business_management and whatsapp_business_messaging permissions.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Linking...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Link WhatsApp Account
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowForm(false)
                    setError(null)
                  }}
                  disabled={saving}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={() => setShowForm(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                Link WhatsApp Business Account
              </button>
              <p className="text-xs text-gray-500 mt-3">
                Get your WABA ID, Phone Number ID, and Access Token from Meta for Developers → Your App → WhatsApp → API Setup.
                Or use Business settings → Accounts → WhatsApp Accounts.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
