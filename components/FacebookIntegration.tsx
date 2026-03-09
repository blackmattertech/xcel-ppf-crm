'use client'

import { useState, useEffect } from 'react'
import { CheckCircle2, XCircle, ExternalLink, Loader2, RefreshCw, ChevronDown } from 'lucide-react'

interface FacebookConfig {
  id: string
  pageId: string | null
  pageName: string | null
  adAccountId: string | null
  adAccountName: string | null
  businessId: string | null
  businessName: string | null
  isExpired: boolean
  expiresAt: string | null
  isActive: boolean
  connectedAt: string
}

export default function FacebookIntegration() {
  const [config, setConfig] = useState<FacebookConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ synced: number; skipped: number; failed: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAdAccountPicker, setShowAdAccountPicker] = useState(false)
  const [adAccounts, setAdAccounts] = useState<Array<{ id: string; name: string }>>([])
  const [loadingAdAccounts, setLoadingAdAccounts] = useState(false)
  const [changingAdAccount, setChangingAdAccount] = useState(false)

  useEffect(() => {
    fetchConfig()
  }, [])

  async function fetchConfig() {
    try {
      setLoading(true)
      const response = await fetch('/api/integrations/facebook/config')
      if (response.ok) {
        const data = await response.json()
        setConfig(data.config)
      } else {
        setError('Failed to load Facebook connection status')
      }
    } catch (error) {
      console.error('Failed to fetch Facebook config:', error)
      setError('Failed to load Facebook connection status')
    } finally {
      setLoading(false)
    }
  }

  async function handleConnect() {
    try {
      setConnecting(true)
      setError(null)

      // Get auth URL
      const response = await fetch('/api/integrations/facebook/connect')
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string; detail?: string }
        const msg = errorData.detail ? `${errorData.error}: ${errorData.detail}` : (errorData.error || 'Failed to initiate connection')
        throw new Error(msg)
      }

      const { authUrl } = await response.json()

      // Open Facebook OAuth in new window
      const width = 600
      const height = 700
      const left = window.screen.width / 2 - width / 2
      const top = window.screen.height / 2 - height / 2

      const popup = window.open(
        authUrl,
        'Facebook Login',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
      )

      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for this site.')
      }

      // Poll for popup closure or message
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed)
          setConnecting(false)
          // Refresh config after popup closes
          setTimeout(() => {
            fetchConfig()
          }, 1000)
        }
      }, 500)

      // Listen for messages from popup (if using postMessage)
      window.addEventListener('message', (event) => {
        if (event.data.type === 'FACEBOOK_CONNECTED') {
          clearInterval(checkClosed)
          popup.close()
          setConnecting(false)
          fetchConfig()
        }
      })
    } catch (error) {
      console.error('Failed to connect Facebook:', error)
      setError(error instanceof Error ? error.message : 'Failed to connect Facebook account')
      setConnecting(false)
    }
  }

  async function handleSyncLeads() {
    try {
      setSyncing(true)
      setError(null)
      setSyncResult(null)
      const response = await fetch('/api/integrations/facebook/leads/sync', { method: 'POST' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Failed to sync leads from Meta')
      }
      setSyncResult({
        synced: data.synced ?? 0,
        skipped: data.skipped ?? 0,
        failed: data.failed ?? 0,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync leads from Meta')
    } finally {
      setSyncing(false)
    }
  }

  async function loadAdAccounts() {
    try {
      setLoadingAdAccounts(true)
      const res = await fetch('/api/integrations/facebook/ad-accounts')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to load ad accounts')
      setAdAccounts(data.adAccounts ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ad accounts')
      setAdAccounts([])
    } finally {
      setLoadingAdAccounts(false)
    }
  }

  async function handleChangeAdAccount(adAccountId: string, adAccountName: string) {
    try {
      setChangingAdAccount(true)
      setError(null)
      const res = await fetch('/api/integrations/facebook/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adAccountId, adAccountName }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to update ad account')
      setConfig((prev) => prev ? { ...prev, adAccountId, adAccountName } : null)
      setShowAdAccountPicker(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change ad account')
    } finally {
      setChangingAdAccount(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm('Are you sure you want to disconnect your Facebook Business account? This will stop syncing leads from Facebook.')) {
      return
    }

    try {
      setDisconnecting(true)
      setError(null)

      const response = await fetch('/api/integrations/facebook/config', {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to disconnect')
      }

      setConfig(null)
    } catch (error) {
      console.error('Failed to disconnect Facebook:', error)
      setError(error instanceof Error ? error.message : 'Failed to disconnect Facebook account')
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
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            Facebook Business Integration
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Connect your Facebook Business account to manage Meta Ads, view ad performance, and sync leads from Facebook Lead Ads
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

          {config.isExpired && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800">
                Your Facebook connection has expired. Please reconnect to continue syncing leads.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
            {config.pageName && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Facebook Page</p>
                <p className="text-sm font-medium text-gray-900">{config.pageName}</p>
                {config.pageId && (
                  <p className="text-xs text-gray-500 mt-1">ID: {config.pageId}</p>
                )}
              </div>
            )}

            {config.adAccountName && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Ad Account</p>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{config.adAccountName}</p>
                    {config.adAccountId && (
                      <p className="text-xs text-gray-500 mt-1">ID: {config.adAccountId}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdAccountPicker(true)
                      loadAdAccounts()
                    }}
                    disabled={config.isExpired}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Change <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
                {showAdAccountPicker && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-xs text-gray-600 mb-2">Select an ad account:</p>
                    {loadingAdAccounts ? (
                      <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading...
                      </div>
                    ) : adAccounts.length === 0 ? (
                      <p className="text-sm text-gray-500 py-2">No ad accounts found.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {adAccounts.map((acc) => (
                          <button
                            key={acc.id}
                            type="button"
                            onClick={() => handleChangeAdAccount(acc.id, acc.name)}
                            disabled={changingAdAccount || acc.id === config.adAccountId}
                            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                              acc.id === config.adAccountId
                                ? 'bg-blue-100 text-blue-800 font-medium'
                                : 'hover:bg-gray-200 text-gray-900'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {acc.name}
                            {acc.id === config.adAccountId && ' (current)'}
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowAdAccountPicker(false)}
                      className="mt-2 text-xs text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}

            {config.businessName && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Business</p>
                <p className="text-sm font-medium text-gray-900">{config.businessName}</p>
                {config.businessId && (
                  <p className="text-xs text-gray-500 mt-1">ID: {config.businessId}</p>
                )}
              </div>
            )}

            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Connected</p>
              <p className="text-sm font-medium text-gray-900">
                {new Date(config.connectedAt).toLocaleDateString()}
              </p>
              {config.expiresAt && (
                <p className="text-xs text-gray-500 mt-1">
                  Expires: {new Date(config.expiresAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>

          {syncResult && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-800">
                Sync complete: <strong>{syncResult.synced}</strong> new lead(s) imported, {syncResult.skipped} already in CRM.
                {syncResult.failed > 0 && ` ${syncResult.failed} failed.`}
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 pt-4 border-t border-gray-200 flex-wrap">
            <button
              onClick={handleSyncLeads}
              disabled={syncing || config.isExpired}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {syncing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Syncing from Meta...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Sync leads from Meta
                </>
              )}
            </button>
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

            {config.isExpired && (
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {connecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Reconnecting...
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4" />
                    Reconnect
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="pt-4">
          <div className="flex items-center gap-2 text-gray-500 mb-4">
            <XCircle className="w-5 h-5" />
            <span>Not Connected</span>
          </div>

          <button
            onClick={handleConnect}
            disabled={connecting}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {connecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <ExternalLink className="w-4 h-4" />
                Connect Facebook Business Account
              </>
            )}
          </button>

          <p className="text-xs text-gray-500 mt-3">
            You'll be redirected to Facebook to authorize access to your Business account, pages, and ad accounts.
          </p>
        </div>
      )}
    </div>
  )
}
