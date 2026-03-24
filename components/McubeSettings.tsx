'use client'

import { useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { cachedFetch } from '@/lib/api-client'

export default function McubeSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [hideConnectedWhenLastMcubeNotConnected, setHideConnectedWhenLastMcubeNotConnected] = useState(true)

  useEffect(() => {
    void fetchSettings()
  }, [])

  async function fetchSettings() {
    try {
      setLoading(true)
      setError(null)
      const response = await cachedFetch('/api/integrations/mcube/settings')
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load MCUBE settings')
      }
      setHideConnectedWhenLastMcubeNotConnected(
        Boolean(data?.settings?.hideConnectedWhenLastMcubeNotConnected ?? true)
      )
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
      const response = await cachedFetch('/api/integrations/mcube/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hideConnectedWhenLastMcubeNotConnected }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save MCUBE settings')
      }
      setSuccess('MCUBE status behavior updated')
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
    <div className="bg-white rounded-lg shadow p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">MCUBE Call Rules</h3>
        <p className="text-sm text-gray-600 mt-1">
          Control how call outcomes are shown in lead status updates.
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
