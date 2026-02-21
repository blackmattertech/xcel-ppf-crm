'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Search, Loader2, Send, Users, MessageSquare } from 'lucide-react'
import type { LeadRecipient } from '../_lib/types'
import type { ChatMessage } from '../_lib/types'
import { normalizePhoneForChat } from '../_lib/utils'

export default function ChatWithLeadsPage() {
  const [leads, setLeads] = useState<LeadRecipient[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLead, setSelectedLead] = useState<LeadRecipient | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sendStatus, setSendStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [search, setSearch] = useState('')
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null)
  const [messagesError, setMessagesError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/marketing/whatsapp/config')
      .then((res) => (res.ok ? res.json() : { configured: false }))
      .then((data) => setApiConfigured(!!data?.configured))
      .catch(() => setApiConfigured(false))
  }, [])

  useEffect(() => {
    setLoading(true)
    fetch('/api/leads')
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 403 ? "You don't have access to leads." : 'Failed to load leads')
        return res.json()
      })
      .then((data) => {
        const list: LeadRecipient[] = (data.leads || []).map((l: { id: string; name?: string; phone?: string }) => ({
          id: l.id,
          name: l.name || '—',
          phone: l.phone || '',
          type: 'lead' as const,
        })).filter((r: LeadRecipient) => normalizePhoneForChat(r.phone).length >= 10)
        setLeads(list)
      })
      .catch(() => setLeads([]))
      .finally(() => setLoading(false))
  }, [])

  const fetchMessages = useCallback((leadId: string, phone: string) => {
    setLoadingMessages(true)
    setMessagesError(null)
    const normalized = normalizePhoneForChat(phone)
    fetch(`/api/marketing/whatsapp/chat?leadId=${encodeURIComponent(leadId)}&phone=${encodeURIComponent(normalized)}`)
      .then((res) => (res.ok ? res.json() : { messages: [] }))
      .then((data) => setMessages(data.messages || []))
      .catch(() => { setMessages([]); setMessagesError('Failed to load conversation') })
      .finally(() => setLoadingMessages(false))
  }, [])

  useEffect(() => {
    if (!selectedLead) {
      setMessages([])
      return
    }
    fetchMessages(selectedLead.id, selectedLead.phone)
  }, [selectedLead?.id, selectedLead?.phone, fetchMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const filteredLeads = useMemo(() => {
    if (!search.trim()) return leads
    const q = search.toLowerCase()
    return leads.filter((l) => l.name.toLowerCase().includes(q) || l.phone.includes(q))
  }, [leads, search])

  const lastIncomingMetaId = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.direction === 'in' && m.meta_message_id)
    return last?.meta_message_id ?? undefined
  }, [messages])

  const handleSend = async () => {
    if (!selectedLead || !message.trim() || sending) return
    const text = message.trim()
    setSending(true)
    setSendStatus('idle')
    setMessage('')
    const contextMessageId = lastIncomingMetaId
    try {
      const res = await fetch('/api/marketing/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: [{ phone: selectedLead.phone, name: selectedLead.name }],
          message: text,
          defaultCountryCode: '91',
          leadId: selectedLead.id,
          ...(contextMessageId && { contextMessageId }),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSendStatus('error')
        setMessage(text)
        return
      }
      setSendStatus('success')
      if (data.message) setMessages((prev) => [...prev, data.message])
      else fetchMessages(selectedLead.id, selectedLead.phone)
    } catch {
      setSendStatus('error')
      setMessage(text)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex flex-col md:flex-row h-[calc(100vh-14rem)] min-h-[420px]">
        <div className="w-full md:w-80 border-r border-gray-200 flex flex-col bg-gray-50/50">
          <div className="p-3 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leads..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-[#25D366]/30 focus:border-[#25D366] outline-none transition"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[#25D366]" />
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">No leads with valid phone numbers.</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {filteredLeads.map((lead) => (
                  <li key={lead.id}>
                    <button
                      type="button"
                      onClick={() => { setSelectedLead(lead); setSendStatus('idle'); setMessagesError(null) }}
                      className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                        selectedLead?.id === lead.id ? 'bg-[#25D366]/10 border-l-2 border-[#25D366]' : 'hover:bg-gray-100'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-[#25D366]/20 flex items-center justify-center shrink-0">
                        <Users className="h-5 w-5 text-[#25D366]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 truncate">{lead.name}</p>
                        <p className="text-xs text-gray-500 truncate">{lead.phone}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex-1 flex flex-col bg-[#e5ddd5]/30 min-h-[280px]">
          {!apiConfigured ? (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-gray-500 text-sm">
              WhatsApp API is not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN to chat with leads.
            </div>
          ) : !selectedLead ? (
            <div className="flex-1 flex items-center justify-center p-6 text-center">
              <div>
                <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Select a lead to start chatting</p>
              </div>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-gray-200 bg-white/80 backdrop-blur-sm flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#25D366]/20 flex items-center justify-center shrink-0">
                  <Users className="h-4 w-4 text-[#25D366]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 truncate">{selectedLead.name}</p>
                  <p className="text-xs text-gray-500 truncate">{selectedLead.phone}</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 min-h-0">
                {loadingMessages ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-[#25D366]" />
                  </div>
                ) : messagesError ? (
                  <p className="text-xs text-amber-600 text-center py-4">{messagesError}. Ensure database migration 019 (whatsapp_messages) has been run.</p>
                ) : messages.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">No messages yet. Say hi — messages you send and lead replies will appear here.</p>
                ) : (
                  <>
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.direction === 'out' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-lg px-3 py-2 shadow-sm ${
                            msg.direction === 'out'
                              ? 'bg-[#D9FDD3] text-gray-900 rounded-br-md'
                              : 'bg-white text-gray-900 rounded-bl-md border border-gray-200'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                          <p className={`text-[10px] mt-0.5 ${msg.direction === 'out' ? 'text-gray-500' : 'text-gray-400'}`}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>
              <div className="p-3 bg-white border-t border-gray-200">
                <div className="flex gap-2">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                    placeholder="Type a message..."
                    rows={2}
                    className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm resize-none focus:ring-2 focus:ring-[#25D366]/30 focus:border-[#25D366] outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!message.trim() || sending}
                    className="shrink-0 rounded-xl bg-[#25D366] text-white p-2.5 hover:bg-[#20bd5a] disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center"
                  >
                    {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  </button>
                </div>
                {sendStatus === 'success' && <p className="text-xs text-green-600 mt-1">Sent</p>}
                {sendStatus === 'error' && <p className="text-xs text-red-600 mt-1">Failed to send. Check WhatsApp config and phone number.</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
