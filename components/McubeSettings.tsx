'use client'

import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Image as ImageIcon,
  LayoutTemplate,
  Loader2,
  MessageCircle,
  MessageSquare,
  Save,
  Video,
} from 'lucide-react'
import { cachedFetch } from '@/lib/api-client'

type MessageType = 'template' | 'text' | 'image' | 'video'

interface WhatsAppTemplateOption {
  id: string
  name: string
  language: string
  status: string
}

const DEFAULT_TEXT_MESSAGE =
  'Hi {{lead_name}}, we tried calling you but could not reach you. Please reply when you are available.'

export default function McubeSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [hideConnectedWhenLastMcubeNotConnected, setHideConnectedWhenLastMcubeNotConnected] = useState(true)
  const [failedCallWhatsappEnabled, setFailedCallWhatsappEnabled] = useState(false)
  const [messageType, setMessageType] = useState<MessageType>('template')
  const [failedCallWhatsappTemplateId, setFailedCallWhatsappTemplateId] = useState('')
  const [failedCallWhatsappBodyParameters, setFailedCallWhatsappBodyParameters] = useState('')
  const [messageBody, setMessageBody] = useState(DEFAULT_TEXT_MESSAGE)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [mediaMimeType, setMediaMimeType] = useState<string | null>(null)
  const [mediaFileName, setMediaFileName] = useState<string | null>(null)
  const [mediaMetaId, setMediaMetaId] = useState<string | null>(null)
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
      setMessageType(
        s.failedCallWhatsappMessageType === 'text' ||
          s.failedCallWhatsappMessageType === 'image' ||
          s.failedCallWhatsappMessageType === 'video'
          ? s.failedCallWhatsappMessageType
          : 'template'
      )
      setFailedCallWhatsappTemplateId(s.failedCallWhatsappTemplateId || '')
      const bodyParams = Array.isArray(s.failedCallWhatsappBodyParameters)
        ? s.failedCallWhatsappBodyParameters.join(', ')
        : ''
      setFailedCallWhatsappBodyParameters(bodyParams)
      setMessageBody(s.failedCallWhatsappMessageBody || DEFAULT_TEXT_MESSAGE)
      setMediaUrl(s.failedCallWhatsappMediaUrl || null)
      setMediaMimeType(s.failedCallWhatsappMediaMimeType || null)
      setMediaFileName(s.failedCallWhatsappMediaFileName || null)
      setMediaMetaId(s.failedCallWhatsappMediaMetaId || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load MCUBE settings')
    } finally {
      setLoading(false)
    }
  }

  async function uploadMedia(file: File, mediaType: 'image' | 'video') {
    setUploading(true)
    setError(null)
    try {
      const signRes = await cachedFetch('/api/marketing/whatsapp/upload-media/signed-url', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type }),
      })
      const signData = (await signRes.json()) as {
        signedUrl?: string
        path?: string
        error?: string
      }
      if (!signRes.ok || !signData.path || !signData.signedUrl) {
        throw new Error(signData.error || 'Failed to create upload URL')
      }

      const storageUpload = await fetch(signData.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      })
      if (!storageUpload.ok) throw new Error('Failed to upload file to storage')

      const res = await cachedFetch('/api/marketing/whatsapp/upload-media', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath: signData.path,
          mimeType: file.type,
          fileName: file.name,
        }),
      })
      const data = (await res.json()) as {
        url?: string
        handle?: string
        id?: string
        error?: string
      }
      if (!res.ok) throw new Error(data.error || 'Upload failed')

      const publicUrl = data.url?.trim()
      if (!publicUrl) {
        throw new Error('Upload succeeded but no public media URL was returned')
      }

      setMediaUrl(publicUrl)
      setMediaMimeType(file.type || null)
      setMediaFileName(file.name)
      setMediaMetaId(data.handle || data.id || null)
      setMessageType(mediaType)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function handleMessageTypeChange(mt: MessageType) {
    setMessageType(mt)
    if (mt === 'text' && !messageBody.trim()) {
      setMessageBody(DEFAULT_TEXT_MESSAGE)
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
          failedCallWhatsappMessageType: messageType,
          failedCallWhatsappTemplateId:
            messageType === 'template' ? failedCallWhatsappTemplateId || null : null,
          failedCallWhatsappBodyParameters: messageType === 'template' ? bodyParams : [],
          failedCallWhatsappHeaderParameters: [],
          failedCallWhatsappMessageBody:
            messageType === 'text' || messageType === 'image' || messageType === 'video'
              ? messageBody.trim() || null
              : null,
          failedCallWhatsappMediaUrl:
            messageType === 'image' || messageType === 'video' ? mediaUrl : null,
          failedCallWhatsappMediaMimeType:
            messageType === 'image' || messageType === 'video' ? mediaMimeType : null,
          failedCallWhatsappMediaFileName:
            messageType === 'image' || messageType === 'video' ? mediaFileName : null,
          failedCallWhatsappMediaMetaId:
            messageType === 'image' || messageType === 'video' ? mediaMetaId : null,
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
          <h4 className="text-base font-semibold text-gray-900">Failed-call WhatsApp message</h4>
        </div>
        <p className="text-sm text-gray-600">
          When a caller dials a lead via MCUBE and the call is <strong>not answered</strong>,{' '}
          <strong>not connected</strong>, or <strong>not reachable</strong>, automatically send the
          configured WhatsApp message. Use <code className="text-xs">{'{{lead_name}}'}</code> — it is
          replaced with the lead&apos;s name when the message sends.
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

        <div className={`space-y-4 ${failedCallWhatsappEnabled ? '' : 'opacity-60 pointer-events-none'}`}>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: 'template' as const, label: 'Template', icon: LayoutTemplate },
                { id: 'text' as const, label: 'Text', icon: MessageSquare },
                { id: 'image' as const, label: 'Image', icon: ImageIcon },
                { id: 'video' as const, label: 'Video', icon: Video },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleMessageTypeChange(id)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium capitalize ${
                  messageType === id
                    ? 'border-[#128C7E] bg-[#128C7E]/10 text-[#128C7E]'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {(messageType === 'text' || messageType === 'image' || messageType === 'video') && (
            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Text, image, and video only work if the lead messaged you in the last 24 hours. Use{' '}
              <strong>Template</strong> for cold leads.
            </div>
          )}

          {messageType === 'template' && (
            <>
              <label className="block text-sm">
                <span className="font-medium text-gray-800">WhatsApp template</span>
                <select
                  className="mt-1 w-full max-w-md rounded-md border border-gray-300 px-3 py-2"
                  value={failedCallWhatsappTemplateId}
                  onChange={(e) => setFailedCallWhatsappTemplateId(e.target.value)}
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
                  Comma-separated for {'{{1}}'}, {'{{2}}'}, etc. Use{' '}
                  <code className="text-xs">{'{{lead_name}}'}</code> for lead name. Default: lead name
                  for first variable.
                </p>
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                  placeholder="{{lead_name}}"
                  value={failedCallWhatsappBodyParameters}
                  onChange={(e) => setFailedCallWhatsappBodyParameters(e.target.value)}
                />
              </label>
            </>
          )}

          {messageType === 'text' && (
            <label className="block text-sm max-w-xl">
              <span className="font-medium text-gray-800">Message text</span>
              <p className="text-xs text-gray-500 mt-0.5">
                <code className="text-xs">{'{{lead_name}}'}</code> is replaced with the lead&apos;s name
                automatically when the call fails.
              </p>
              <textarea
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                rows={4}
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                placeholder={DEFAULT_TEXT_MESSAGE}
              />
            </label>
          )}

          {(messageType === 'image' || messageType === 'video') && (
            <div className="space-y-3 max-w-xl">
              <label className="block text-sm">
                <span className="font-medium text-gray-800">
                  {messageType === 'image' ? 'Image' : 'Video'} file <span className="text-red-600">*</span>
                </span>
                <input
                  type="file"
                  className="mt-2 block w-full text-sm"
                  accept={messageType === 'image' ? 'image/*' : 'video/*'}
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void uploadMedia(f, messageType)
                    e.target.value = ''
                  }}
                />
              </label>
              {uploading && (
                <p className="inline-flex items-center gap-2 text-xs text-gray-600">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Uploading…
                </p>
              )}
              {!uploading && mediaUrl && (
                <p className="text-xs text-emerald-700">
                  Uploaded ✓ {mediaFileName || 'media ready'}
                </p>
              )}

              <label className="block text-sm">
                <span className="font-medium text-gray-800">Caption (optional)</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Use <code className="text-xs">{'{{lead_name}}'}</code> for lead name.
                </p>
                <textarea
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                  rows={3}
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  placeholder="Hi {{lead_name}}, we tried calling you…"
                />
              </label>
            </div>
          )}
        </div>
      </div>

      <div>
        <button
          onClick={saveSettings}
          disabled={saving || uploading}
          className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save MCUBE Settings'}
        </button>
      </div>
    </div>
  )
}
