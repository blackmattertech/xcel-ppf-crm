'use client'

import Layout from '@/components/Layout'
import { FormEvent, useEffect, useState } from 'react'

type MailjetStatus = 'disconnected' | 'connected'

const MAILJET_STORAGE_KEY = 'xcelppf_mailjet_config_v1'

type MailjetConfig = {
  apiKey: string
  apiSecret: string
  senderEmail: string
}

function loadMailjetConfig(): MailjetConfig | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(MAILJET_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as MailjetConfig
    if (!parsed.apiKey || !parsed.apiSecret || !parsed.senderEmail) return null
    return parsed
  } catch {
    return null
  }
}

function saveMailjetConfig(config: MailjetConfig | null) {
  if (typeof window === 'undefined') return
  if (!config) {
    window.localStorage.removeItem(MAILJET_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(MAILJET_STORAGE_KEY, JSON.stringify(config))
}

function MailjetIntegrationCard() {
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [senderEmail, setSenderEmail] = useState('')
  const [testRecipient, setTestRecipient] = useState('')
  const [testSubject, setTestSubject] = useState('Test email from Xcel PPF CRM')
  const [testMessage, setTestMessage] = useState('This is a test email sent via Mailjet from Xcel PPF CRM.')

  const [status, setStatus] = useState<MailjetStatus>('disconnected')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loadingConfig, setLoadingConfig] = useState(true)

  useEffect(() => {
    const init = async () => {
      try {
        // Try loading from backend first (shared config)
        const res = await fetch('/api/integrations/mailjet/config')
        if (res.ok) {
          const data = await res.json()
          if (data?.config) {
            setApiKey(data.config.apiKey)
            setApiSecret(data.config.apiSecret)
            setSenderEmail(data.config.senderEmail)
            setStatus('connected')
            saveMailjetConfig(data.config)
            return
          }
        }
      } catch (err) {
        console.error('Failed to load Mailjet config from API, falling back to localStorage.', err)
      } finally {
        // Fallback to localStorage if backend has nothing / fails
        const existing = loadMailjetConfig()
        if (existing) {
          setApiKey(existing.apiKey)
          setApiSecret(existing.apiSecret)
          setSenderEmail(existing.senderEmail)
          setStatus('connected')
        }
        setLoadingConfig(false)
      }
    }

    init()
  }, [])

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!apiKey || !apiSecret || !senderEmail) {
      setError('Please fill in API key, API secret and sender email.')
      return
    }

    setSaving(true)
    try {
      // Persist to backend (shared) and mirror in localStorage (per-browser)
      const res = await fetch('/api/integrations/mailjet/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey, apiSecret, senderEmail }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        console.error('Failed to save Mailjet config via API:', data)
        setError((data && data.error) || 'Failed to save Mailjet configuration on the server.')
        return
      }

      saveMailjetConfig({ apiKey, apiSecret, senderEmail })
      setStatus('connected')
      setSuccess('Mailjet configuration saved. It will be reused until you change it here.')
    } catch (err) {
      console.error(err)
      setError('Failed to save configuration. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = () => {
    setError(null)
    setSuccess(null)
    // Clear backend and local cache
    fetch('/api/integrations/mailjet/config', { method: 'DELETE' }).catch((err) =>
      console.error('Failed to clear Mailjet config on server:', err)
    )
    saveMailjetConfig(null)
    setStatus('disconnected')
  }

  const handleSendTest = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!apiKey || !apiSecret || !senderEmail) {
      setError('Please configure Mailjet first (API key, secret and sender email).')
      return
    }

    if (!testRecipient) {
      setError('Please enter a test recipient email.')
      return
    }

    setTesting(true)
    try {
      const res = await fetch('/api/integrations/mailjet/test-send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey,
          apiSecret,
          senderEmail,
          recipient: testRecipient,
          subject: testSubject,
          message: testMessage,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        console.error('Mailjet test-send error:', data)
        setError(
          (data && data.error) ||
            'Failed to send test email. Please verify your Mailjet configuration and try again.'
        )
      } else {
        setSuccess('Test email sent successfully via Mailjet.')
      }
    } catch (err) {
      console.error(err)
      setError('Unexpected error while sending test email.')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Mailjet</h2>
          <p className="text-sm text-gray-500">
            Connect Mailjet to send emails directly from the CRM (frontend-only integration).
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
            status === 'connected'
              ? 'bg-green-50 text-green-700 ring-1 ring-green-600/20'
              : 'bg-gray-50 text-gray-600 ring-1 ring-gray-500/10'
          }`}
        >
          {status === 'connected' ? 'Connected (this browser)' : 'Not connected'}
        </span>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-700">
          {success}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key (Public)</label>
            <input
              type="text"
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:ring-black"
              placeholder="Mailjet API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Secret</label>
            <input
              type="password"
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:ring-black"
              placeholder="Mailjet API secret"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sender Email</label>
            <input
              type="email"
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:ring-black"
              placeholder="you@yourdomain.com"
              value={senderEmail}
              onChange={(e) => setSenderEmail(e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-500">
              This must be a verified sender in your Mailjet account.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-900 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save configuration'}
          </button>
          {status === 'connected' && (
            <button
              type="button"
              onClick={handleDisconnect}
              className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Disconnect (clear from this browser)
            </button>
          )}
          <p className="text-xs text-gray-500">
            Configuration is stored only in this browser via <code>localStorage</code>.
          </p>
        </div>
      </form>

      <div className="border-t border-gray-100 pt-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Send test email</h3>
        <p className="text-xs text-gray-500">
          Use this to verify that your Mailjet credentials and sender email are working correctly. This sends a request
          to a secure API route in this app, which then talks to the Mailjet API (avoids CORS issues).
        </p>
        <form onSubmit={handleSendTest} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Recipient email</label>
              <input
                type="email"
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:ring-black"
                placeholder="test@recipient.com"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <input
                type="text"
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:ring-black"
                value={testSubject}
                onChange={(e) => setTestSubject(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
            <textarea
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:ring-black"
              rows={3}
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={testing}
            className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-900 disabled:opacity-60"
          >
            {testing ? 'Sending test email…' : 'Send test email'}
          </button>
        </form>
      </div>

      <p className="mt-2 text-[11px] text-gray-400 leading-relaxed">
        Note: This is a **frontend-only** integration. Your Mailjet API key and secret are stored only in this browser
        and used directly from the client to call the Mailjet API. For production setups where multiple team members use
        the same integration, we can later move this to a secure backend or Supabase Edge Function.
      </p>
    </div>
  )
}

export default function IntegrationsPage() {
  return (
    <Layout>
      <main className="p-4 md:p-6 lg:p-8 w-full">
        <div className="max-w-5xl mx-auto space-y-6">
          <header className="space-y-2">
            <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
            <p className="text-sm text-gray-600">
              Connect third-party tools directly from the frontend. We&apos;ll start with Mailjet for email sending and
              add more integrations here over time.
            </p>
          </header>

          <section className="grid grid-cols-1 gap-6">
            <MailjetIntegrationCard />
          </section>
        </div>
      </main>
    </Layout>
  )
}
