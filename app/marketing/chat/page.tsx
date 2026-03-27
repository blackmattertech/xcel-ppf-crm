'use client'

import { useState, useEffect, useMemo, useCallback, useRef, type ChangeEvent } from 'react'
import { Search, Loader2, Send, Users, MessageSquare, Paperclip, FileText, Image as ImageIcon, Video } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { LeadRecipient } from '../_lib/types'
import type { CustomerRecipient } from '../_lib/types'
import type { ChatMessage } from '../_lib/types'
import type { ConversationSummary } from '../_lib/types'
import { normalizePhoneForChat, normalizePhoneForStorage } from '../_lib/utils'
import { cachedFetch } from '@/lib/api-client'

const ENABLE_ATTACHMENTS = process.env.NEXT_PUBLIC_INBOX_ATTACHMENTS_ENABLED === 'true'
const ENABLE_QUICK_REPLIES = process.env.NEXT_PUBLIC_INBOX_QUICK_REPLIES_ENABLED === 'true'
const QUICK_REPLIES = [
  'Thanks for reaching out. Our team will get back to you shortly.',
  'Can you please share your preferred time for a callback?',
  'Noted. We will send the details in a moment.',
]

export default function ChatWithLeadsPage() {
  const [contacts, setContacts] = useState<Array<LeadRecipient | CustomerRecipient>>([])
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedContact, setSelectedContact] = useState<(LeadRecipient | CustomerRecipient) | null>(null)
  const [selectedConversationKey, setSelectedConversationKey] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sendStatus, setSendStatus] = useState<'idle' | 'success' | 'error' | 'save_failed'>('idle')
  const [sendError, setSendError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null)
  const [waProfile, setWaProfile] = useState<{ waba_name: string | null; phone_number_display: string | null; phone_number_id: string | null } | null>(null)
  const [messagesError, setMessagesError] = useState<string | null>(null)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [attachment, setAttachment] = useState<{
    url: string
    mimeType?: string
    fileName?: string
    sizeBytes?: number
    messageType: 'image' | 'video' | 'document'
  } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const sendingRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [templates, setTemplates] = useState<Array<{
    id: string
    name: string
    language: string
    body_text?: string
    header_text?: string | null
    footer_text?: string | null
  }>>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [sendingTemplate, setSendingTemplate] = useState(false)

  const templateNameFromBody = useCallback((body: string): string | null => {
    const match = body.match(/^\[Template:\s*(.+?)\](?:\n|$)/i)
    return match?.[1]?.trim() || null
  }, [])

  const parseTemplateBody = useCallback((raw: string): {
    name: string | null
    header: string | null
    body: string | null
    footer: string | null
  } => {
    const name = templateNameFromBody(raw)
    const headerMatch = raw.match(/(?:^|\n)Header:\s*(.+?)(?:\n|$)/i)
    const bodyMatch = raw.match(/(?:^|\n)Body:\s*([\s\S]*?)(?:\nFooter:|$)/i)
    const footerMatch = raw.match(/(?:^|\n)Footer:\s*(.+?)(?:\n|$)/i)
    return {
      name,
      header: headerMatch?.[1]?.trim() || null,
      body: bodyMatch?.[1]?.trim() || null,
      footer: footerMatch?.[1]?.trim() || null,
    }
  }, [templateNameFromBody])

  useEffect(() => {
    cachedFetch('/api/marketing/whatsapp/config')
      .then((res) => (res.ok ? res.json() : { configured: false }))
      .then((data) => {
        setApiConfigured(!!data?.configured)
        setWaProfile(data?.profile ?? null)
      })
      .catch(() => setApiConfigured(false))
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      cachedFetch('/api/leads').then((res) => (res.ok ? res.json() : { leads: [] })),
      cachedFetch('/api/customers').then((res) => (res.ok ? res.json() : { customers: [] })),
      cachedFetch('/api/marketing/whatsapp/chat?mode=conversations').then((res) => (res.ok ? res.json() : { conversations: [] })),
      cachedFetch('/api/marketing/whatsapp/templates?status=approved').then((res) => (res.ok ? res.json() : { templates: [] })),
    ])
      .then(([leadsData, customersData, convData, templatesData]) => {
        const leadList: LeadRecipient[] = (leadsData.leads || []).map((l: { id: string; name?: string; phone?: string }) => ({
          id: l.id,
          name: l.name || '—',
          phone: l.phone || '',
          type: 'lead' as const,
        })).filter((r: LeadRecipient) => normalizePhoneForChat(r.phone).length >= 10)
        const customerList: CustomerRecipient[] = (customersData.customers || []).map((c: { id: string; name?: string; phone?: string }) => ({
          id: c.id,
          name: c.name || '—',
          phone: c.phone || '',
          type: 'customer' as const,
        })).filter((r: CustomerRecipient) => normalizePhoneForChat(r.phone).length >= 10)
        const dedup = new Map<string, LeadRecipient | CustomerRecipient>()
        for (const c of [...leadList, ...customerList]) {
          const key = normalizePhoneForStorage(c.phone)
          if (!dedup.has(key)) dedup.set(key, c)
        }
        setContacts(Array.from(dedup.values()))
        setConversations(convData.conversations || [])
        setTemplates((templatesData.templates || []).map((t: { id: string; name: string; language?: string; body_text?: string; header_text?: string | null; footer_text?: string | null }) => ({
          id: t.id,
          name: t.name,
          language: t.language || 'en',
          body_text: t.body_text,
          header_text: t.header_text ?? null,
          footer_text: t.footer_text ?? null,
        })))
      })
      .catch(() => { setContacts([]); setConversations([]) })
      .finally(() => setLoading(false))
  }, [])

  const fetchMessages = useCallback((phone: string, conversationKey?: string) => {
    setLoadingMessages(true)
    setMessagesError(null)
    const normalized = normalizePhoneForChat(phone)
    const url = conversationKey
      ? `/api/marketing/whatsapp/chat?conversationKey=${encodeURIComponent(conversationKey)}`
      : `/api/marketing/whatsapp/chat?phone=${encodeURIComponent(normalized)}`
    cachedFetch(url)
      .then((res) => (res.ok ? res.json() : { messages: [] }))
      .then((data) => setMessages(data.messages || []))
      .catch(() => { setMessages([]); setMessagesError('Failed to load conversation') })
      .finally(() => setLoadingMessages(false))
  }, [])

  useEffect(() => {
    if (!selectedContact) {
      setMessages([])
      return
    }
    fetchMessages(selectedContact.phone, selectedConversationKey ?? undefined)
    if (selectedConversationKey) {
      cachedFetch('/api/marketing/whatsapp/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_read', conversationKey: selectedConversationKey }),
      }).catch(() => {})
    }

    const supabase = createClient()
    const storedPhone = normalizePhoneForStorage(selectedContact.phone)
    const handleChange = (payload: { eventType: string; new: unknown }) => {
      const row = payload.new as unknown as ChatMessage
      if (payload.eventType === 'INSERT') {
        setMessages((prev) => {
          if (prev.some((m) => m.id === row.id)) return prev
          return [...prev, row].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        })
      } else if (payload.eventType === 'UPDATE') {
        setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...row } : m)))
      }
    }
    const ch1 = supabase
      .channel(`whatsapp-contact-${selectedContact.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_messages', filter: `phone=eq.${storedPhone}` }, handleChange)
      .subscribe()
    const ch2 = supabase
      .channel(`whatsapp-phone-${storedPhone}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_messages', filter: `phone=eq.${storedPhone}` }, handleChange)
      .subscribe()

    return () => {
      supabase.removeChannel(ch1)
      supabase.removeChannel(ch2)
    }
  }, [selectedContact?.id, selectedContact?.phone, selectedConversationKey, fetchMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const filteredContacts = useMemo(() => {
    if (!search.trim()) return contacts
    const q = search.toLowerCase()
    return contacts.filter((l) => l.name.toLowerCase().includes(q) || l.phone.includes(q))
  }, [contacts, search])

  const filteredConversations = useMemo(() => {
    if (!search.trim()) return conversations
    const q = search.toLowerCase()
    return conversations.filter((c) =>
      c.phone.includes(q) ||
      (c.lead_name || '').toLowerCase().includes(q) ||
      (c.last_message?.body || '').toLowerCase().includes(q)
    )
  }, [conversations, search])

  const lastIncomingMetaId = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.direction === 'in' && m.meta_message_id)
    return last?.meta_message_id ?? undefined
  }, [messages])

  const uploadAttachment = async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    setUploadingAttachment(true)
    try {
      const res = await cachedFetch('/api/marketing/whatsapp/upload-media', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Upload failed')
      const mime = file.type || data.mimeType || ''
      const type: 'image' | 'video' | 'document' =
        mime.startsWith('image/') ? 'image' :
        mime.startsWith('video/') ? 'video' : 'document'
      setAttachment({
        url: data.url,
        mimeType: mime,
        fileName: file.name,
        sizeBytes: file.size,
        messageType: type,
      })
      setSendStatus('idle')
      setSendError(null)
    } catch (e) {
      setSendStatus('error')
      setSendError(e instanceof Error ? e.message : 'Attachment upload failed')
    } finally {
      setUploadingAttachment(false)
    }
  }

  const handleFileSelected = async (evt: ChangeEvent<HTMLInputElement>) => {
    const file = evt.target.files?.[0]
    if (!file) return
    await uploadAttachment(file)
    evt.target.value = ''
  }

  const handleSend = async () => {
    if (!selectedContact || (!message.trim() && !attachment) || sending || sendingRef.current) return
    sendingRef.current = true
    const text = message.trim()
    setSending(true)
    setSendStatus('idle')
    setSendError(null)
    setMessage('')
    const contextMessageId = lastIncomingMetaId
    try {
      const res = await cachedFetch('/api/marketing/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: [{ phone: selectedContact.phone, name: selectedContact.name }],
          message: text || (attachment?.messageType === 'document' ? 'Document' : ''),
          defaultCountryCode: '91',
          ...(selectedContact.type === 'lead' ? { leadId: selectedContact.id } : {}),
          messageType: attachment?.messageType ?? 'text',
          ...(attachment ? {
            attachment: {
              url: attachment.url,
              mimeType: attachment.mimeType,
              fileName: attachment.fileName,
              sizeBytes: attachment.sizeBytes,
            },
          } : {}),
          ...(contextMessageId && { contextMessageId }),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSendStatus('error')
        setSendError(data?.error || data?.detail || `Request failed (${res.status})`)
        setMessage(text)
        return
      }
      const firstResult = data.results?.[0]
      const sendSucceeded = data.sent === 1 && firstResult?.success !== false
      if (!sendSucceeded && firstResult?.error) {
        setSendStatus('error')
        setSendError(firstResult.error)
        setMessage(text)
        return
      }
      setSendStatus(data.saveFailed ? 'save_failed' : 'success')
      setSaveError(data.saveFailed ? [data.saveErrorCode, data.saveErrorMessage].filter(Boolean).join(': ') || null : null)
      setAttachment(null)
      if (data.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.message.id)) return prev
          return [...prev, data.message].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        })
      } else fetchMessages(selectedContact.phone, selectedConversationKey ?? undefined)
    } catch (e) {
      setSendStatus('error')
      setSendError(e instanceof Error ? e.message : 'Network or server error')
      setMessage(text)
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  const handleSendTemplate = async () => {
    if (!selectedContact || !selectedTemplateId || sendingTemplate) return
    setSendingTemplate(true)
    setSendStatus('idle')
    setSendError(null)
    try {
      const selectedTemplate = templates.find((t) => t.id === selectedTemplateId)
      if (!selectedTemplate) throw new Error('Select a valid template')
      const res = await cachedFetch('/api/marketing/whatsapp/send-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          recipients: [{ phone: selectedContact.phone, name: selectedContact.name }],
          defaultCountryCode: '91',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to send template')
      }
      setSendStatus('success')
      setSelectedTemplateId('')
      fetchMessages(selectedContact.phone, selectedConversationKey ?? undefined)
    } catch (e) {
      setSendStatus('error')
      setSendError(e instanceof Error ? e.message : 'Template send failed')
    } finally {
      setSendingTemplate(false)
    }
  }

  const listItems = useMemo(() => {
    const convMap = new Map(filteredConversations.map((c) => [c.conversation_key, c]))
    const base = filteredContacts.map((c) => {
      const key = normalizePhoneForStorage(c.phone)
      return { key, contact: c, conversation: convMap.get(key) || null }
    })
    for (const conv of filteredConversations) {
      if (!base.some((b) => b.key === conv.conversation_key)) {
        base.push({
          key: conv.conversation_key,
          contact: {
            id: conv.lead_id || conv.conversation_key,
            name: conv.lead_name || conv.phone,
            phone: conv.phone,
            type: 'lead' as const,
          },
          conversation: conv,
        })
      }
    }
    return base
  }, [filteredContacts, filteredConversations])

  const templateLookup = useMemo(() => {
    const byName = new Map<string, { body_text?: string; header_text?: string | null; footer_text?: string | null }>()
    for (const t of templates) byName.set(t.name.toLowerCase(), t)
    return byName
  }, [templates])

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex flex-col md:flex-row h-[calc(100vh-7rem)] min-h-[520px]">
        <div className="w-full md:w-80 border-r border-gray-200 flex flex-col bg-gray-50/50">
          <div className="p-3 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leads/customers..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-[#25D366]/30 focus:border-[#25D366] outline-none transition"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[#25D366]" />
              </div>
            ) : listItems.length > 0 ? (
              <ul className="divide-y divide-gray-100">
                {listItems.map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedContact(item.contact)
                        setSelectedConversationKey(item.key)
                        setSendStatus('idle')
                        setSendError(null)
                        setMessagesError(null)
                        setSaveError(null)
                      }}
                      className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                        selectedConversationKey === item.key ? 'bg-[#25D366]/10 border-l-2 border-[#25D366]' : 'hover:bg-gray-100'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-[#25D366]/20 flex items-center justify-center shrink-0">
                        <Users className="h-5 w-5 text-[#25D366]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-gray-900 truncate">{item.contact.name || item.contact.phone}</p>
                          {item.conversation && item.conversation.unread_count > 0 && (
                            <span className="min-w-5 h-5 px-1 rounded-full bg-[#25D366] text-white text-[10px] flex items-center justify-center">
                              {item.conversation.unread_count}
                            </span>
                          )}
                        </div>
                        {item.conversation ? (
                          <div className="text-xs text-gray-500 truncate">
                            {templateNameFromBody(item.conversation.last_message?.body || '')
                              ? `[Template: ${templateNameFromBody(item.conversation.last_message?.body || '')}]`
                              : (item.conversation.last_message?.body || item.contact.phone)}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 truncate">{item.contact.phone} • {item.contact.type}</p>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-4 text-center text-sm text-gray-500">No leads/customers with valid phone numbers.</div>
            )}
          </div>
        </div>
        <div className="flex-1 flex flex-col bg-[#e5ddd5]/30 min-h-[280px]">
          {!apiConfigured ? (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-gray-500 text-sm">
              WhatsApp API is not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN to chat with leads.
            </div>
          ) : !selectedContact ? (
            <div className="flex-1 flex items-center justify-center p-6 text-center">
              <div>
                <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Select a lead/customer to start chatting</p>
              </div>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-gray-200 bg-white/80 backdrop-blur-sm flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#25D366]/20 flex items-center justify-center shrink-0 font-semibold text-[#25D366]">
                  {selectedContact.name?.trim()?.charAt(0)?.toUpperCase() || 'W'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 truncate">{selectedContact.name}</p>
                  <p className="text-xs text-gray-500 truncate">{selectedContact.phone} • {selectedContact.type} • WhatsApp</p>
                  {(waProfile?.waba_name || waProfile?.phone_number_display) && (
                    <p className="text-[11px] text-emerald-700 truncate">
                      {waProfile?.waba_name || 'Business'}{waProfile?.phone_number_display ? ` • ${waProfile.phone_number_display}` : ''}
                    </p>
                  )}
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
                          {msg.message_type === 'image' && msg.attachment_url && (
                            <a href={msg.attachment_url} target="_blank" rel="noreferrer" className="block mb-2">
                              <img src={msg.attachment_url} alt="attachment" className="max-h-52 rounded-md object-cover" />
                            </a>
                          )}
                          {msg.message_type === 'video' && msg.attachment_url && (
                            <video controls className="max-h-52 rounded-md mb-2">
                              <source src={msg.attachment_url} />
                            </video>
                          )}
                          {msg.message_type === 'document' && msg.attachment_url && (
                            <div className="mb-2">
                              <a href={msg.attachment_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs text-blue-700 underline">
                                <FileText className="h-3.5 w-3.5" />
                                {msg.attachment_file_name || 'Open document'}
                              </a>
                              {/\.(pdf)(\?|$)/i.test(msg.attachment_url) && (
                                <iframe title="Document preview" src={msg.attachment_url} className="w-full h-40 rounded-md border border-gray-200 mt-2 bg-white" />
                              )}
                            </div>
                          )}
                          {msg.message_type === 'document' && !msg.attachment_url && (
                            <div className="mb-2 inline-flex items-center gap-2 text-xs text-gray-600 bg-gray-100 rounded-md px-2 py-1">
                              <FileText className="h-3.5 w-3.5" />
                              Document received
                            </div>
                          )}
                          {(() => {
                            const parsed = parseTemplateBody(msg.body)
                            const tplName = parsed.name
                            const tpl = tplName ? templateLookup.get(tplName.toLowerCase()) : null
                            const isTemplateLike = !!tplName
                            if (isTemplateLike) {
                              const cardHeader =
                                parsed.header ||
                                (tpl?.header_text?.trim() || tplName).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                              const cardBody =
                                parsed.body ||
                                tpl?.body_text?.trim() ||
                                'Template message'
                              const cardFooter = parsed.footer || tpl?.footer_text?.trim() || null
                              return (
                                <div className="rounded-md bg-[#1f2c34] text-[#e9edef] px-3 py-2 mt-1">
                                  <p className="font-semibold text-sm">
                                    {cardHeader}
                                  </p>
                                  <p className="text-sm mt-1 whitespace-pre-wrap leading-relaxed">
                                    {cardBody}
                                  </p>
                                  {cardFooter && (
                                    <p className="text-xs text-[#aebac1] mt-2">{cardFooter}</p>
                                  )}
                                </div>
                              )
                            }
                            return <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                          })()}
                          <div className="flex items-center justify-end gap-1.5 mt-0.5">
                            <p className={`text-[10px] ${msg.direction === 'out' ? 'text-gray-500' : 'text-gray-400'}`}>
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            {msg.direction === 'out' && (
                              <span
                                className={`text-[10px] ${msg.status === 'read' ? 'text-red-600' : 'text-gray-500'}`}
                                title={msg.status ?? 'sent'}
                              >
                                {msg.status === 'read' || msg.status === 'delivered' ? '✓✓' : '✓'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>
              <div className="p-3 bg-white border-t border-gray-200">
                {attachment && (
                  <div className="mb-2 text-xs rounded-md border border-gray-200 bg-gray-50 px-3 py-2 flex items-center justify-between gap-2">
                    <span className="truncate">
                      {attachment.messageType === 'image' && <ImageIcon className="inline h-3.5 w-3.5 mr-1" />}
                      {attachment.messageType === 'video' && <Video className="inline h-3.5 w-3.5 mr-1" />}
                      {attachment.messageType === 'document' && <FileText className="inline h-3.5 w-3.5 mr-1" />}
                      {attachment.fileName || 'Attachment ready'}
                    </span>
                    <button type="button" onClick={() => setAttachment(null)} className="text-red-600">Remove</button>
                  </div>
                )}
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
                    disabled={(!message.trim() && !attachment) || sending || uploadingAttachment}
                    className="shrink-0 rounded-xl bg-[#25D366] text-white p-2.5 hover:bg-[#20bd5a] disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center"
                  >
                    {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <select
                    className="text-xs border border-gray-200 rounded-md px-2 py-1 flex-1 min-w-0"
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                  >
                    <option value="">Send approved template...</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.language})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleSendTemplate}
                    disabled={!selectedTemplateId || sendingTemplate}
                    className="text-xs px-2 py-1 rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {sendingTemplate ? 'Sending...' : 'Send template'}
                  </button>
                </div>
                {ENABLE_ATTACHMENTS && (
                  <div className="mt-2 flex items-center gap-2">
                    <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingAttachment}
                      className="text-xs px-2 py-1 rounded-md border border-gray-200 hover:bg-gray-50 inline-flex items-center gap-1"
                    >
                      {uploadingAttachment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                      Attach
                    </button>
                    {ENABLE_QUICK_REPLIES && (
                      <select
                        className="text-xs border border-gray-200 rounded-md px-2 py-1"
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) setMessage((prev) => (prev ? `${prev}\n${e.target.value}` : e.target.value))
                          e.target.value = ''
                        }}
                      >
                        <option value="">Quick replies</option>
                        {QUICK_REPLIES.map((q) => <option key={q} value={q}>{q}</option>)}
                      </select>
                    )}
                  </div>
                )}
                {sendStatus === 'success' && <p className="text-xs text-green-600 mt-1">Sent</p>}
                {sendStatus === 'save_failed' && (
                  <p className="text-xs text-amber-600 mt-1">
                    Sent to WhatsApp but not saved to history.
                    {saveError && <span className="block mt-0.5 font-mono text-[10px]">{saveError}</span>}
                    {!saveError && ' Run migration 019 (whatsapp_messages) on your Supabase project.'}
                  </p>
                )}
                {sendStatus === 'error' && (
                  <p className="text-xs text-red-600 mt-1">
                    {sendError || 'Failed to send. Check WhatsApp config and phone number.'}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
