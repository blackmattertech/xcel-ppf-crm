'use client'

import { useState, useEffect, useMemo, useCallback, useRef, type ChangeEvent } from 'react'
import Link from 'next/link'
import {
  Search,
  Loader2,
  Send,
  Users,
  MessageSquare,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Video,
  X,
  ExternalLink,
  ArrowLeft,
  PlusCircle,
  Trash2,
  CornerUpLeft,
  MoreVertical,
  Forward,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { LeadRecipient } from '../_lib/types'
import type { CustomerRecipient } from '../_lib/types'
import type { ChatMessage } from '../_lib/types'
import type { ConversationSummary } from '../_lib/types'
import { normalizePhoneForChat, normalizePhoneForStorage } from '../_lib/utils'
import { cachedFetch, invalidateApiCache } from '@/lib/api-client'
import { ForwardMessageDialog } from './forward-message-dialog'

const ENABLE_ATTACHMENTS = process.env.NEXT_PUBLIC_INBOX_ATTACHMENTS_ENABLED === 'true'
const ENABLE_QUICK_REPLIES = process.env.NEXT_PUBLIC_INBOX_QUICK_REPLIES_ENABLED === 'true'
const QUICK_REPLIES = [
  'Thanks for reaching out. Our team will get back to you shortly.',
  'Can you please share your preferred time for a callback?',
  'Noted. We will send the details in a moment.',
]

/** Index conversations by key, phone, and normalized conversation_key so CRM rows match API list order. */
function buildConversationLookup(conversations: ConversationSummary[]): Map<string, ConversationSummary> {
  const map = new Map<string, ConversationSummary>()
  for (const c of conversations) {
    map.set(c.conversation_key, c)
    map.set(normalizePhoneForStorage(c.phone), c)
    map.set(normalizePhoneForStorage(c.conversation_key), c)
  }
  return map
}

function findConversationForNormalizedKey(
  normalizedKey: string,
  conversations: ConversationSummary[]
): ConversationSummary | null {
  for (const c of conversations) {
    if (c.conversation_key === normalizedKey) return c
    if (normalizePhoneForStorage(c.phone) === normalizedKey) return c
    if (normalizePhoneForStorage(c.conversation_key) === normalizedKey) return c
  }
  return null
}

function lastActivityMs(conv: ConversationSummary | null | undefined): number {
  const raw = conv?.last_message?.created_at
  if (!raw) return 0
  const t = new Date(raw).getTime()
  return Number.isFinite(t) ? t : 0
}

/** Short preview for reply banner (WhatsApp requires wamid; preview is UI-only). */
function replyPreviewForMessage(msg: ChatMessage): string {
  const mt = msg.message_type ?? 'text'
  if (mt === 'image') return msg.body?.trim() || 'Photo'
  if (mt === 'video') return msg.body?.trim() || 'Video'
  if (mt === 'document') return msg.attachment_file_name?.trim() || msg.body?.trim() || 'Document'
  const t = msg.body?.trim() || ''
  if (t.length > 100) return `${t.slice(0, 100)}…`
  return t || '(Message)'
}

/** Match Meta wamids across webhook/API/realtime (trim only; IDs are case-sensitive). */
function normalizeWamid(id: string | null | undefined): string {
  return (id ?? '').trim()
}

/** Resolve parent message; Meta may differ slightly in wamid string vs stored `meta_message_id`. */
function findQuotedMessage(messages: ChatMessage[], replyId: string): ChatMessage | undefined {
  const rid = normalizeWamid(replyId)
  if (!rid) return undefined
  const exact = messages.find((m) => normalizeWamid(m.meta_message_id) === rid)
  if (exact) return exact
  if (rid.length < 20) return undefined
  const tail = rid.slice(-20)
  return messages.find((m) => {
    const mid = normalizeWamid(m.meta_message_id)
    if (!mid || mid.length < 20) return false
    return mid.endsWith(tail) || rid.endsWith(mid.slice(-20))
  })
}

/**
 * When parent row is missing: Meta `context.from` is who sent the quoted message.
 * Same digits as contact → customer wrote the quoted bubble; otherwise → business (you).
 */
function inferQuotedIsUsFromContext(contactPhone: string, replyContextFrom?: string | null): boolean | null {
  if (!replyContextFrom?.trim()) return null
  return normalizePhoneForStorage(contactPhone) !== normalizePhoneForStorage(replyContextFrom)
}

/** Same query shape as GET /api/marketing/whatsapp/chat for messages (includes leadId when applicable). */
function buildThreadMessagesUrl(phone: string, conversationKey: string | undefined, leadIdForApi: string | undefined): string {
  if (conversationKey) {
    return `/api/marketing/whatsapp/chat?conversationKey=${encodeURIComponent(conversationKey)}`
  }
  const qs = new URLSearchParams()
  qs.set('phone', normalizePhoneForChat(phone))
  if (leadIdForApi && /^[0-9a-f-]{36}$/i.test(leadIdForApi)) {
    qs.set('leadId', leadIdForApi)
  }
  return `/api/marketing/whatsapp/chat?${qs.toString()}`
}

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
  const [showContactPanel, setShowContactPanel] = useState(false)
  const [leadDetailsLoading, setLeadDetailsLoading] = useState(false)
  const [leadDetailsError, setLeadDetailsError] = useState<string | null>(null)
  const [leadDetails, setLeadDetails] = useState<Record<string, unknown> | null>(null)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [attachment, setAttachment] = useState<{
    url: string
    mimeType?: string
    fileName?: string
    sizeBytes?: number
    messageType: 'image' | 'video' | 'document'
  } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const threadSelectAllRef = useRef<HTMLInputElement>(null)
  const sendingRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  /** ETag from GET /chat?mode=conversations for silent If-None-Match refreshes. */
  const conversationsEtagRef = useRef<string | null>(null)
  /** ETag from GET /chat (messages) for conditional thread reloads (status / read receipts). */
  const messagesEtagRef = useRef<string | null>(null)
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
  /** Numbers started from "New chat" (not in leads/customers API). */
  const [manualContacts, setManualContacts] = useState<CustomerRecipient[]>([])
  const [showNewChat, setShowNewChat] = useState(false)
  const [newChatPhone, setNewChatPhone] = useState('')
  const [newChatName, setNewChatName] = useState('')
  const [newChatError, setNewChatError] = useState<string | null>(null)
  /** Multi-select rows in the sidebar to delete CRM message history for those threads. */
  const [bulkSelectMode, setBulkSelectMode] = useState(false)
  const [selectedChatKeys, setSelectedChatKeys] = useState<string[]>([])
  const [deleteChatsBusy, setDeleteChatsBusy] = useState(false)
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null)
  /** Reply target: Meta message id for Cloud API `context.message_id`, plus UI preview. */
  const [replyToMessage, setReplyToMessage] = useState<{
    metaMessageId: string
    messageDbId: string
    direction: 'in' | 'out'
    preview: string
  } | null>(null)
  /** Brief ring when jumping to a message from a quoted reply. */
  const [jumpHighlightId, setJumpHighlightId] = useState<string | null>(null)
  /** Per-message overflow menu (Reply / Forward / Delete). */
  const [openMessageMenuId, setOpenMessageMenuId] = useState<string | null>(null)
  /** Multi-select messages in the open thread for delete or forward. */
  const [threadMsgSelectMode, setThreadMsgSelectMode] = useState(false)
  const [selectedThreadMsgIds, setSelectedThreadMsgIds] = useState<string[]>([])
  const [forwardDialogOpen, setForwardDialogOpen] = useState(false)
  const [messagesToForward, setMessagesToForward] = useState<ChatMessage[]>([])
  const [forwardSearch, setForwardSearch] = useState('')
  const [forwardSelectedPhoneKeys, setForwardSelectedPhoneKeys] = useState<string[]>([])
  const [forwardBusy, setForwardBusy] = useState(false)
  const [deleteThreadMsgsBusy, setDeleteThreadMsgsBusy] = useState(false)

  const scrollToQuotedMessage = useCallback((messageDbId: string) => {
    const el = document.getElementById(`inbox-msg-${messageDbId}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setJumpHighlightId(messageDbId)
    window.setTimeout(() => setJumpHighlightId((id) => (id === messageDbId ? null : id)), 2200)
  }, [])

  const openContactPanel = async () => {
    if (!selectedContact) return
    setShowContactPanel(true)
    setLeadDetailsError(null)
    if (selectedContact.type !== 'lead') {
      setLeadDetails(null)
      return
    }
    setLeadDetailsLoading(true)
    try {
      const res = await cachedFetch(`/api/leads/${encodeURIComponent(selectedContact.id)}`)
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to load lead details')
      setLeadDetails((data?.lead as Record<string, unknown>) ?? null)
    } catch (e) {
      setLeadDetails(null)
      setLeadDetailsError(e instanceof Error ? e.message : 'Failed to load lead details')
    } finally {
      setLeadDetailsLoading(false)
    }
  }

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

  const syncConversationsFromServer = useCallback(() => {
    invalidateApiCache('GET:/api/marketing/whatsapp/chat')
    const headers: Record<string, string> = {}
    if (conversationsEtagRef.current) {
      headers['If-None-Match'] = conversationsEtagRef.current
    }
    return fetch('/api/marketing/whatsapp/chat?mode=conversations', { credentials: 'include', headers })
      .then((res) => {
        if (res.status === 304) return null
        if (!res.ok) return null
        const etag = res.headers.get('etag')
        if (etag) conversationsEtagRef.current = etag
        return res.json()
      })
      .then((data: { conversations?: ConversationSummary[] } | null) => {
        if (data?.conversations) setConversations(data.conversations)
      })
      .catch(() => {})
  }, [])

  const syncThreadMessagesSilent = useCallback(() => {
    if (!selectedContact) return
    const leadId =
      selectedContact.type === 'lead' && /^[0-9a-f-]{36}$/i.test(selectedContact.id)
        ? selectedContact.id
        : undefined
    const url = buildThreadMessagesUrl(selectedContact.phone, selectedConversationKey ?? undefined, leadId)
    invalidateApiCache('GET:/api/marketing/whatsapp/chat')
    const headers: Record<string, string> = {}
    if (messagesEtagRef.current) {
      headers['If-None-Match'] = messagesEtagRef.current
    }
    fetch(url, { credentials: 'include', headers })
      .then((res) => {
        if (res.status === 304) return null
        if (!res.ok) return null
        const etag = res.headers.get('etag')
        if (etag) messagesEtagRef.current = etag
        return res.json()
      })
      .then((data: { messages?: ChatMessage[] } | null) => {
        if (data?.messages) setMessages(data.messages)
      })
      .catch(() => {})
  }, [selectedContact, selectedConversationKey])

  const fetchMessages = useCallback(() => {
    if (!selectedContact) return
    setLoadingMessages(true)
    setMessagesError(null)
    const leadId =
      selectedContact.type === 'lead' && /^[0-9a-f-]{36}$/i.test(selectedContact.id)
        ? selectedContact.id
        : undefined
    const url = buildThreadMessagesUrl(selectedContact.phone, selectedConversationKey ?? undefined, leadId)
    messagesEtagRef.current = null
    invalidateApiCache('GET:/api/marketing/whatsapp/chat')
    fetch(url, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('bad')
        const etag = res.headers.get('etag')
        if (etag) messagesEtagRef.current = etag
        return res.json()
      })
      .then((data) => setMessages(data.messages || []))
      .catch(() => {
        setMessages([])
        setMessagesError('Failed to load conversation')
      })
      .finally(() => setLoadingMessages(false))
  }, [selectedContact, selectedConversationKey])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      cachedFetch('/api/leads').then((res) => (res.ok ? res.json() : { leads: [] })),
      cachedFetch('/api/customers').then((res) => (res.ok ? res.json() : { customers: [] })),
      fetch('/api/marketing/whatsapp/chat?mode=conversations', { credentials: 'include' }).then(async (res) => {
        const etag = res.headers.get('etag')
        if (etag) conversationsEtagRef.current = etag
        return res.ok ? res.json() : { conversations: [] }
      }),
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

  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | undefined
    const supabase = createClient()
    const scheduleSidebarSync = () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        syncConversationsFromServer()
      }, 320)
    }
    const channel = supabase
      .channel('inbox-sidebar-conversations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_messages' },
        scheduleSidebarSync
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('[marketing/chat] Sidebar realtime — check migration 040 (whatsapp_messages publication)')
        }
      })
    return () => {
      if (debounce) clearTimeout(debounce)
      supabase.removeChannel(channel)
    }
  }, [syncConversationsFromServer])

  useEffect(() => {
    if (!selectedContact) {
      setMessages([])
      messagesEtagRef.current = null
      return
    }
    fetchMessages()
    if (selectedConversationKey) {
      cachedFetch('/api/marketing/whatsapp/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_read', conversationKey: selectedConversationKey }),
      }).catch(() => {})
    }

    const supabase = createClient()
    const storedPhone = normalizePhoneForStorage(selectedContact.phone)
    const leadId =
      selectedContact.type === 'lead' && /^[0-9a-f-]{36}$/i.test(selectedContact.id) ? selectedContact.id : null

    const mergeMessageRow = (existing: ChatMessage, incoming: Record<string, unknown>): ChatMessage => {
      const patch = Object.fromEntries(
        Object.entries(incoming).filter(([, v]) => v !== undefined)
      ) as Partial<ChatMessage>
      return { ...existing, ...patch }
    }

    let threadEtagSyncDebounce: ReturnType<typeof setTimeout> | undefined
    const scheduleThreadEtagSync = () => {
      if (threadEtagSyncDebounce) clearTimeout(threadEtagSyncDebounce)
      threadEtagSyncDebounce = setTimeout(() => {
        syncThreadMessagesSilent()
      }, 280)
    }

    const handleChange = (payload: { eventType: string; new: unknown }) => {
      const raw = payload.new as Record<string, unknown>
      const row = {
        ...(raw as unknown as ChatMessage),
        reply_to_meta_message_id: (raw.reply_to_meta_message_id as string | null | undefined) ?? null,
        reply_context_from: (raw.reply_context_from as string | null | undefined) ?? null,
      } as ChatMessage
      if (!row?.id) return
      if (payload.eventType === 'INSERT') {
        setMessages((prev) => {
          if (prev.some((m) => m.id === row.id)) return prev
          return [...prev, row].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        })
        scheduleThreadEtagSync()
      } else if (payload.eventType === 'UPDATE') {
        setMessages((prev) =>
          prev.map((m) => (m.id === row.id ? mergeMessageRow(m, row as unknown as Record<string, unknown>) : m))
        )
        scheduleThreadEtagSync()
      }
    }

    const channelName = `whatsapp-inbox-${storedPhone}-${selectedConversationKey ?? 'nock'}-${leadId ?? 'nolead'}`
    let channel = supabase.channel(channelName)
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'whatsapp_messages', filter: `phone=eq.${storedPhone}` },
      handleChange
    )
    // Rows may store legacy phone vs conversation_key differently; status updates still match by conversation_key.
    if (selectedConversationKey) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_messages', filter: `conversation_key=eq.${selectedConversationKey}` },
        handleChange
      )
    }
    if (leadId) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_messages', filter: `lead_id=eq.${leadId}` },
        handleChange
      )
    }
    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        console.warn('[marketing/chat] Realtime subscription error — check DB migration 040 (whatsapp_messages in supabase_realtime publication)')
      }
    })

    return () => {
      if (threadEtagSyncDebounce) clearTimeout(threadEtagSyncDebounce)
      supabase.removeChannel(channel)
    }
  }, [selectedContact?.id, selectedContact?.phone, selectedContact?.type, selectedConversationKey, fetchMessages, syncThreadMessagesSilent])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    setReplyToMessage(null)
    setJumpHighlightId(null)
    setThreadMsgSelectMode(false)
    setSelectedThreadMsgIds([])
    setOpenMessageMenuId(null)
    setForwardDialogOpen(false)
    setMessagesToForward([])
    setForwardSearch('')
    setForwardSelectedPhoneKeys([])
  }, [selectedContact?.id, selectedContact?.phone, selectedConversationKey])

  useEffect(() => {
    if (!openMessageMenuId) return
    const onDown = (e: MouseEvent) => {
      const el = e.target as Element | null
      if (el?.closest?.('[data-message-menu-root]')) return
      setOpenMessageMenuId(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [openMessageMenuId])

  useEffect(() => {
    const el = threadSelectAllRef.current
    if (!el) return
    el.indeterminate = selectedThreadMsgIds.length > 0 && selectedThreadMsgIds.length < messages.length
  }, [selectedThreadMsgIds.length, messages.length])

  /** Manual "new chat" entries override same phone from leads/customers for display. */
  const mergedContacts = useMemo(() => {
    const map = new Map<string, LeadRecipient | CustomerRecipient>()
    for (const c of manualContacts) {
      map.set(normalizePhoneForStorage(c.phone), c)
    }
    for (const c of contacts) {
      const k = normalizePhoneForStorage(c.phone)
      if (!map.has(k)) map.set(k, c)
    }
    return Array.from(map.values())
  }, [contacts, manualContacts])

  const filteredContacts = useMemo(() => {
    if (!search.trim()) return mergedContacts
    const q = search.toLowerCase()
    return mergedContacts.filter((l) => l.name.toLowerCase().includes(q) || l.phone.includes(q))
  }, [mergedContacts, search])

  const filteredConversations = useMemo(() => {
    if (!search.trim()) return conversations
    const q = search.toLowerCase()
    return conversations.filter((c) =>
      c.phone.includes(q) ||
      (c.lead_name || '').toLowerCase().includes(q) ||
      (c.last_message?.body || '').toLowerCase().includes(q)
    )
  }, [conversations, search])

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
    try {
      const res = await cachedFetch('/api/marketing/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: [{ phone: selectedContact.phone, name: selectedContact.name }],
          message:
            text ||
            (attachment?.messageType === 'document'
              ? attachment.fileName?.replace(/\.[^.]+$/, '') || attachment.fileName || 'Document'
              : ''),
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
          ...(replyToMessage?.metaMessageId ? { contextMessageId: replyToMessage.metaMessageId } : {}),
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
      setReplyToMessage(null)
      if (data.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.message.id)) return prev
          return [...prev, data.message].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        })
        syncThreadMessagesSilent()
        syncConversationsFromServer()
      } else {
        fetchMessages()
        syncConversationsFromServer()
      }
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
    setReplyToMessage(null)
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
      fetchMessages()
      syncConversationsFromServer()
    } catch (e) {
      setSendStatus('error')
      setSendError(e instanceof Error ? e.message : 'Template send failed')
    } finally {
      setSendingTemplate(false)
    }
  }

  const listItems = useMemo(() => {
    const convLookup = buildConversationLookup(filteredConversations)
    const base: Array<{
      key: string
      contact: LeadRecipient | CustomerRecipient
      conversation: ConversationSummary | null
    }> = []

    for (const c of filteredContacts) {
      const key = normalizePhoneForStorage(c.phone)
      const conversation =
        convLookup.get(key) ?? findConversationForNormalizedKey(key, filteredConversations)
      base.push({ key, contact: c, conversation: conversation ?? null })
    }

    const covered = new Set<string>()
    for (const b of base) {
      covered.add(b.key)
      if (b.conversation) {
        covered.add(b.conversation.conversation_key)
        covered.add(normalizePhoneForStorage(b.conversation.phone))
        covered.add(normalizePhoneForStorage(b.conversation.conversation_key))
      }
    }

    for (const conv of filteredConversations) {
      const nk = normalizePhoneForStorage(conv.phone)
      const nck = normalizePhoneForStorage(conv.conversation_key)
      if (
        covered.has(conv.conversation_key) ||
        covered.has(nk) ||
        covered.has(nck)
      ) {
        continue
      }
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
      covered.add(conv.conversation_key)
      covered.add(nk)
      covered.add(nck)
    }

    base.sort((a, b) => {
      const ta = lastActivityMs(a.conversation ?? undefined)
      const tb = lastActivityMs(b.conversation ?? undefined)
      if (tb !== ta) return tb - ta
      return (a.contact.name || '').localeCompare(b.contact.name || '', undefined, { sensitivity: 'base' })
    })

    return base
  }, [filteredContacts, filteredConversations])

  const visibleChatKeys = useMemo(() => listItems.map((i) => i.key), [listItems])

  const toggleChatKey = useCallback((key: string) => {
    setSelectedChatKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }, [])

  const allVisibleChatsSelected =
    visibleChatKeys.length > 0 && visibleChatKeys.every((k) => selectedChatKeys.includes(k))

  useEffect(() => {
    const el = selectAllCheckboxRef.current
    if (!el) return
    const n = visibleChatKeys.filter((k) => selectedChatKeys.includes(k)).length
    el.indeterminate = n > 0 && n < visibleChatKeys.length
  }, [visibleChatKeys, selectedChatKeys])

  const toggleSelectAllVisibleChats = useCallback(() => {
    setSelectedChatKeys((prev) => {
      if (visibleChatKeys.length === 0) return prev
      if (visibleChatKeys.every((k) => prev.includes(k))) {
        return prev.filter((k) => !visibleChatKeys.includes(k))
      }
      return [...new Set([...prev, ...visibleChatKeys])]
    })
  }, [visibleChatKeys])

  const exitBulkSelectMode = useCallback(() => {
    setBulkSelectMode(false)
    setSelectedChatKeys([])
  }, [])

  const handleBulkDeleteChats = useCallback(async () => {
    if (selectedChatKeys.length === 0) return
    if (
      !window.confirm(
        `Delete ${selectedChatKeys.length} chat(s)? Stored message history for these conversations will be removed from the CRM (this does not delete WhatsApp on anyone's phone).`
      )
    ) {
      return
    }
    setDeleteChatsBusy(true)
    try {
      const res = await fetch('/api/marketing/whatsapp/chat', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ conversationKeys: selectedChatKeys }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data?.error || 'Failed to delete')

      const keySet = new Set(selectedChatKeys.map((k) => normalizePhoneForStorage(k)))
      setConversations((prev) =>
        prev.filter(
          (c) =>
            !keySet.has(normalizePhoneForStorage(c.conversation_key)) &&
            !keySet.has(normalizePhoneForStorage(c.phone))
        )
      )
      setManualContacts((prev) => prev.filter((m) => !keySet.has(normalizePhoneForStorage(m.phone))))
      if (selectedConversationKey && keySet.has(normalizePhoneForStorage(selectedConversationKey))) {
        setSelectedContact(null)
        setSelectedConversationKey(null)
        setMessages([])
      }
      setMessagesError(null)
      setSendStatus('idle')
      setSendError(null)
      conversationsEtagRef.current = null
      invalidateApiCache('GET:/api/marketing/whatsapp/chat')
      await syncConversationsFromServer()
      exitBulkSelectMode()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleteChatsBusy(false)
    }
  }, [selectedChatKeys, selectedConversationKey, syncConversationsFromServer, exitBulkSelectMode])

  const templateLookup = useMemo(() => {
    const byName = new Map<string, { body_text?: string; header_text?: string | null; footer_text?: string | null }>()
    for (const t of templates) byName.set(t.name.toLowerCase(), t)
    return byName
  }, [templates])

  const exitThreadMsgSelectMode = useCallback(() => {
    setThreadMsgSelectMode(false)
    setSelectedThreadMsgIds([])
  }, [])

  const toggleThreadMsgSelection = useCallback((id: string) => {
    setSelectedThreadMsgIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  const selectAllThreadMessages = useCallback(() => {
    setSelectedThreadMsgIds(messages.map((m) => m.id))
  }, [messages])

  const buildForwardTextForMessage = useCallback(
    (msg: ChatMessage): string => {
      const raw = msg.body?.trim() ?? ''
      if (templateNameFromBody(raw)) {
        const parsed = parseTemplateBody(raw)
        return [parsed.header, parsed.body, parsed.footer].filter(Boolean).join('\n') || raw
      }
      return raw
    },
    [templateNameFromBody, parseTemplateBody]
  )

  const handleDeleteThreadMessages = useCallback(async () => {
    if (selectedThreadMsgIds.length === 0) return
    if (
      !window.confirm(
        `Remove ${selectedThreadMsgIds.length} message(s) from CRM history only? This does not delete messages on anyone's WhatsApp app.`
      )
    ) {
      return
    }
    setDeleteThreadMsgsBusy(true)
    try {
      const res = await fetch('/api/marketing/whatsapp/chat', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ messageIds: selectedThreadMsgIds }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data?.error || 'Delete failed')
      setMessages((prev) => prev.filter((m) => !selectedThreadMsgIds.includes(m.id)))
      exitThreadMsgSelectMode()
      conversationsEtagRef.current = null
      invalidateApiCache('GET:/api/marketing/whatsapp/chat')
      await syncConversationsFromServer()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleteThreadMsgsBusy(false)
    }
  }, [selectedThreadMsgIds, exitThreadMsgSelectMode, syncConversationsFromServer])

  const executeForward = useCallback(async () => {
    if (forwardSelectedPhoneKeys.length === 0 || messagesToForward.length === 0) return
    const sorted = [...messagesToForward].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    const needMedia = sorted.some((m) => (m.message_type ?? 'text') !== 'text')
    if (needMedia && !ENABLE_ATTACHMENTS) {
      alert(
        'Forwarding images, video, or documents requires attachments. Set NEXT_PUBLIC_INBOX_ATTACHMENTS_ENABLED=true and server INBOX_ATTACHMENTS_ENABLED if applicable.'
      )
      return
    }
    setForwardBusy(true)
    try {
      for (const phoneKey of forwardSelectedPhoneKeys) {
        const contact = mergedContacts.find((c) => normalizePhoneForStorage(c.phone) === phoneKey)
        if (!contact) continue
        const leadId =
          contact.type === 'lead' && /^[0-9a-f-]{36}$/i.test(contact.id) ? contact.id : undefined
        for (const msg of sorted) {
          const mt = msg.message_type ?? 'text'
          const textBody = buildForwardTextForMessage(msg)
          if (mt === 'text') {
            const res = await cachedFetch('/api/marketing/whatsapp/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recipients: [{ phone: contact.phone, name: contact.name }],
                message: textBody || '(Message)',
                defaultCountryCode: '91',
                ...(leadId ? { leadId } : {}),
                messageType: 'text',
              }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error((data as { error?: string })?.error || 'Forward failed')
          } else {
            const url = msg.attachment_url
            if (!url) {
              const res = await cachedFetch('/api/marketing/whatsapp/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  recipients: [{ phone: contact.phone, name: contact.name }],
                  message: textBody || replyPreviewForMessage(msg) || '(Message)',
                  defaultCountryCode: '91',
                  ...(leadId ? { leadId } : {}),
                  messageType: 'text',
                }),
              })
              const data = await res.json().catch(() => ({}))
              if (!res.ok) throw new Error((data as { error?: string })?.error || 'Forward failed')
            } else {
              const caption =
                textBody.trim() ||
                (mt === 'document' ? msg.attachment_file_name?.trim() || 'Document' : replyPreviewForMessage(msg))
              const res = await cachedFetch('/api/marketing/whatsapp/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  recipients: [{ phone: contact.phone, name: contact.name }],
                  message: caption,
                  defaultCountryCode: '91',
                  ...(leadId ? { leadId } : {}),
                  messageType: mt,
                  attachment: {
                    url,
                    mimeType: msg.attachment_mime_type ?? undefined,
                    fileName: msg.attachment_file_name ?? undefined,
                    sizeBytes: msg.attachment_size_bytes ?? undefined,
                  },
                }),
              })
              const data = await res.json().catch(() => ({}))
              if (!res.ok) throw new Error((data as { error?: string })?.error || 'Forward failed')
            }
          }
          await new Promise((r) => setTimeout(r, 120))
        }
      }
      setForwardDialogOpen(false)
      setForwardSearch('')
      setForwardSelectedPhoneKeys([])
      setMessagesToForward([])
      exitThreadMsgSelectMode()
      invalidateApiCache('GET:/api/marketing/whatsapp/chat')
      await syncConversationsFromServer()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Forward failed')
    } finally {
      setForwardBusy(false)
    }
  }, [
    forwardSelectedPhoneKeys,
    messagesToForward,
    mergedContacts,
    buildForwardTextForMessage,
    syncConversationsFromServer,
    exitThreadMsgSelectMode,
  ])

  const startNewConversation = useCallback(() => {
    setNewChatError(null)
    const digits = newChatPhone.replace(/\D/g, '')
    if (digits.length < 10) {
      setNewChatError('Enter a valid mobile number (at least 10 digits).')
      return
    }
    const normalized = normalizePhoneForStorage(newChatPhone)
    const contact: CustomerRecipient = {
      id: `inbox-direct-${normalized}`,
      name: newChatName.trim() || 'New chat',
      phone: newChatPhone.trim(),
      type: 'customer',
    }
    setManualContacts((prev) => {
      const next = prev.filter((p) => normalizePhoneForStorage(p.phone) !== normalized)
      return [...next, contact]
    })
    setSelectedContact(contact)
    setSelectedConversationKey(normalized)
    setNewChatPhone('')
    setNewChatName('')
    setShowNewChat(false)
    setSendStatus('idle')
    setSendError(null)
    setMessagesError(null)
    setSaveError(null)
  }, [newChatPhone, newChatName])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/marketing/whatsapp"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          Back to WhatsApp
        </Link>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex min-h-[min(520px,calc(100dvh-8.5rem))] flex-col md:h-[calc(100vh-8.5rem)] md:min-h-[520px] md:flex-row">
        <div className="w-full md:w-80 border-r border-gray-200 flex flex-col bg-gray-50/50">
          <div className="p-3 border-b border-gray-200 space-y-3">
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
            <div>
              <button
                type="button"
                onClick={() => {
                  setShowNewChat((v) => !v)
                  setNewChatError(null)
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#25D366]/40 bg-[#25D366]/10 px-3 py-2 text-sm font-semibold text-emerald-900 transition hover:bg-[#25D366]/15"
              >
                <PlusCircle className="h-4 w-4 shrink-0" />
                New conversation
              </button>
              {showNewChat && (
                <div className="mt-3 space-y-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                  <label className="block text-xs font-medium text-gray-600">Mobile number</label>
                  <input
                    type="tel"
                    value={newChatPhone}
                    onChange={(e) => setNewChatPhone(e.target.value)}
                    placeholder="e.g. 9876543210 or +91 98765 43210"
                    className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:border-[#25D366] focus:outline-none focus:ring-1 focus:ring-[#25D366]/30"
                    autoComplete="tel"
                  />
                  <label className="block text-xs font-medium text-gray-600">Display name (optional)</label>
                  <input
                    type="text"
                    value={newChatName}
                    onChange={(e) => setNewChatName(e.target.value)}
                    placeholder="Contact name"
                    className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:border-[#25D366] focus:outline-none focus:ring-1 focus:ring-[#25D366]/30"
                  />
                  {newChatError && <p className="text-xs text-red-600">{newChatError}</p>}
                  <button
                    type="button"
                    onClick={startNewConversation}
                    className="w-full rounded-lg bg-[#25D366] py-2 text-sm font-semibold text-white transition hover:bg-[#20BA5A]"
                  >
                    Start messaging
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                if (bulkSelectMode) exitBulkSelectMode()
                else setBulkSelectMode(true)
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              {bulkSelectMode ? 'Done selecting' : 'Select chats to delete'}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[#25D366]" />
              </div>
            ) : listItems.length > 0 ? (
              <>
                {bulkSelectMode && (
                  <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 shrink-0">
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-700">
                      <input
                        ref={selectAllCheckboxRef}
                        type="checkbox"
                        checked={allVisibleChatsSelected}
                        onChange={toggleSelectAllVisibleChats}
                        className="rounded border-gray-300"
                      />
                      Select all ({visibleChatKeys.length})
                    </label>
                    <button
                      type="button"
                      disabled={selectedChatKeys.length === 0 || deleteChatsBusy}
                      onClick={handleBulkDeleteChats}
                      className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-800 disabled:opacity-40"
                    >
                      {deleteChatsBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5 shrink-0" />
                      )}
                      Delete ({selectedChatKeys.length})
                    </button>
                  </div>
                )}
                <ul className="divide-y divide-gray-100 flex-1 min-h-0">
                  {listItems.map((item) => (
                    <li key={item.key} className="flex items-stretch">
                      {bulkSelectMode && (
                        <label
                          className="flex shrink-0 cursor-pointer items-center pl-3 pr-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selectedChatKeys.includes(item.key)}
                            onChange={() => toggleChatKey(item.key)}
                            className="rounded border-gray-300"
                          />
                        </label>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (bulkSelectMode) {
                            toggleChatKey(item.key)
                            return
                          }
                          setSelectedContact(item.contact)
                          setSelectedConversationKey(item.key)
                          setSendStatus('idle')
                          setSendError(null)
                          setMessagesError(null)
                          setSaveError(null)
                        }}
                        className={`min-w-0 flex-1 text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                          selectedConversationKey === item.key ? 'bg-[#25D366]/10 border-l-2 border-[#25D366]' : 'hover:bg-gray-100'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-full bg-[#25D366]/20 flex items-center justify-center shrink-0">
                          <Users className="h-5 w-5 text-[#25D366]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-gray-900 truncate">{item.contact.name || item.contact.phone}</p>
                            {!bulkSelectMode && item.conversation && item.conversation.unread_count > 0 && (
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
              </>
            ) : (
              <div className="p-4 text-center text-sm text-gray-500">
                No matches. Use <span className="font-medium text-gray-700">New conversation</span> above to message a number.
              </div>
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
                <p className="text-gray-500 text-sm">Select a lead/customer to start chatting, or use New conversation to enter a number.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-gray-200 bg-white/80 backdrop-blur-sm flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#25D366]/20 flex items-center justify-center shrink-0 font-semibold text-[#25D366]">
                  {selectedContact.name?.trim()?.charAt(0)?.toUpperCase() || 'W'}
                </div>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={openContactPanel}
                    className="font-medium text-gray-900 truncate hover:underline text-left"
                    title="View contact details"
                  >
                    {selectedContact.name}
                  </button>
                  <p className="text-xs text-gray-500 truncate">{selectedContact.phone} • {selectedContact.type} • WhatsApp</p>
                  {(waProfile?.waba_name || waProfile?.phone_number_display) && (
                    <p className="text-[11px] text-emerald-700 truncate">
                      {waProfile?.waba_name || 'Business'}{waProfile?.phone_number_display ? ` • ${waProfile.phone_number_display}` : ''}
                    </p>
                  )}
                </div>
              </div>
              {threadMsgSelectMode && (
                <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-amber-200 bg-amber-50/95 text-xs sm:text-sm shrink-0">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-gray-800">
                    <input
                      ref={threadSelectAllRef}
                      type="checkbox"
                      className="rounded border-gray-300"
                      checked={messages.length > 0 && selectedThreadMsgIds.length === messages.length}
                      onChange={() => {
                        if (messages.length === 0) return
                        if (selectedThreadMsgIds.length === messages.length) {
                          setSelectedThreadMsgIds([])
                        } else {
                          selectAllThreadMessages()
                        }
                      }}
                    />
                    Select all ({messages.length})
                  </label>
                  <button
                    type="button"
                    disabled={selectedThreadMsgIds.length === 0}
                    onClick={() => {
                      const picked = messages.filter((m) => selectedThreadMsgIds.includes(m.id))
                      if (picked.length === 0) return
                      setMessagesToForward(picked)
                      setForwardSearch('')
                      setForwardSelectedPhoneKeys([])
                      setForwardDialogOpen(true)
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 py-1 font-semibold text-emerald-900 disabled:opacity-40"
                  >
                    <Forward className="h-3.5 w-3.5 shrink-0" />
                    Forward ({selectedThreadMsgIds.length})
                  </button>
                  <button
                    type="button"
                    disabled={selectedThreadMsgIds.length === 0 || deleteThreadMsgsBusy}
                    onClick={handleDeleteThreadMessages}
                    className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 font-semibold text-red-800 disabled:opacity-40"
                  >
                    {deleteThreadMsgsBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 shrink-0" />
                    )}
                    Delete ({selectedThreadMsgIds.length})
                  </button>
                  <button
                    type="button"
                    onClick={exitThreadMsgSelectMode}
                    className="ml-auto rounded-md px-2 py-1 font-medium text-gray-600 hover:bg-amber-100/80"
                  >
                    Cancel
                  </button>
                </div>
              )}
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
                        id={`inbox-msg-${msg.id}`}
                        className={`group flex w-full scroll-mt-4 transition-shadow duration-300 ${
                          msg.direction === 'out' ? 'justify-end' : 'justify-start'
                        } ${
                          jumpHighlightId === msg.id
                            ? 'ring-2 ring-[#25D366] ring-offset-2 shadow-md rounded-lg'
                            : ''
                        }`}
                      >
                        {threadMsgSelectMode && (
                          <label className="shrink-0 self-start pt-2 pr-1">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300"
                              checked={selectedThreadMsgIds.includes(msg.id)}
                              onChange={() => toggleThreadMsgSelection(msg.id)}
                            />
                          </label>
                        )}
                        <div className="flex min-w-0 max-w-[min(96%,100%)] flex-row items-start gap-0.5">
                          <div className="relative shrink-0" data-message-menu-root>
                            <button
                              type="button"
                              className="rounded-md p-1 text-gray-500 opacity-50 transition-opacity group-hover:opacity-100 hover:bg-black/5 focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                              aria-label="Message actions"
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenMessageMenuId((id) => (id === msg.id ? null : msg.id))
                              }}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                            {openMessageMenuId === msg.id && (
                              <ul
                                className={`absolute top-full z-50 mt-0.5 min-w-[168px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg ${
                                  msg.direction === 'out' ? 'right-0' : 'left-0'
                                }`}
                              >
                                <li>
                                  <button
                                    type="button"
                                    disabled={!msg.meta_message_id}
                                    title={!msg.meta_message_id ? 'WhatsApp message id missing — cannot reply' : undefined}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45"
                                    onClick={() => {
                                      if (!msg.meta_message_id) return
                                      setReplyToMessage({
                                        metaMessageId: msg.meta_message_id,
                                        messageDbId: msg.id,
                                        direction: msg.direction,
                                        preview: replyPreviewForMessage(msg),
                                      })
                                      setOpenMessageMenuId(null)
                                    }}
                                  >
                                    <CornerUpLeft className="h-4 w-4 shrink-0" />
                                    Reply
                                  </button>
                                </li>
                                <li>
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
                                    onClick={() => {
                                      setThreadMsgSelectMode(true)
                                      setSelectedThreadMsgIds((prev) => (prev.includes(msg.id) ? prev : [...prev, msg.id]))
                                      setOpenMessageMenuId(null)
                                    }}
                                  >
                                    <Forward className="h-4 w-4 shrink-0" />
                                    Forward
                                  </button>
                                </li>
                                <li>
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                                    onClick={() => {
                                      setThreadMsgSelectMode(true)
                                      setSelectedThreadMsgIds([msg.id])
                                      setOpenMessageMenuId(null)
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 shrink-0" />
                                    Delete
                                  </button>
                                </li>
                              </ul>
                            )}
                          </div>
                          <div
                            className={`max-w-[85%] rounded-lg px-3 py-2 shadow-sm ${
                              replyToMessage?.messageDbId === msg.id ? 'ring-2 ring-emerald-500 ring-offset-1' : ''
                            } ${
                              msg.direction === 'out'
                                ? 'bg-[#D9FDD3] text-gray-900 rounded-br-md'
                                : 'bg-white text-gray-900 rounded-bl-md border border-gray-200'
                            }`}
                          >
                          {(normalizeWamid(msg.reply_to_meta_message_id) || msg.reply_context_from?.trim()) && (() => {
                            const replyId = normalizeWamid(msg.reply_to_meta_message_id)
                            const quoted = replyId ? findQuotedMessage(messages, replyId) : undefined
                            const inferredUs =
                              quoted == null && selectedContact
                                ? inferQuotedIsUsFromContext(selectedContact.phone, msg.reply_context_from)
                                : null
                            const quotedIsUs =
                              quoted != null ? quoted.direction === 'out' : inferredUs === null ? true : inferredUs
                            const label =
                              quoted != null
                                ? quoted.direction === 'out'
                                  ? waProfile?.waba_name?.trim() || 'You'
                                  : selectedContact?.name?.trim() || 'Customer'
                                : quotedIsUs
                                  ? waProfile?.waba_name?.trim() || 'You'
                                  : selectedContact?.name?.trim() || 'Customer'
                            const preview = quoted
                              ? replyPreviewForMessage(quoted)
                              : 'Earlier message'
                            const canJump = !!quoted?.id
                            // Same nested quote strip for customer and business messages (WhatsApp-style); only accent follows who wrote the quoted text.
                            return (
                              <button
                                type="button"
                                disabled={!canJump}
                                onClick={() => quoted && scrollToQuotedMessage(quoted.id)}
                                title={canJump ? 'Jump to quoted message' : 'Original message not in this thread'}
                                className={`mb-2 w-full rounded-md text-left overflow-hidden border border-gray-200/90 border-l-[3px] shadow-sm bg-[#f0f2f5] hover:bg-[#e8eaed] ${
                                  quotedIsUs ? 'border-l-[#25D366]' : 'border-l-red-600'
                                } ${canJump ? 'cursor-pointer active:scale-[0.99]' : 'cursor-default opacity-95'} pl-2.5 pr-2 py-1.5`}
                              >
                                <p
                                  className={`text-[13px] font-semibold leading-tight ${
                                    quotedIsUs ? 'text-[#1f9d55]' : 'text-red-800'
                                  }`}
                                >
                                  {label}
                                </p>
                                <p className="text-[13px] text-gray-600 line-clamp-4 leading-snug mt-0.5">
                                  {preview}
                                </p>
                              </button>
                            )
                          })()}
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
                                title="From WhatsApp: Sent = accepted; Delivered = reached their phone; Read = they opened the chat on WhatsApp (not when you view this screen). If Read never appears, their read receipts may be off or Meta did not send a read event."
                              >
                                {msg.status === 'failed'
                                  ? 'Failed'
                                  : msg.status === 'read'
                                    ? 'Read'
                                    : msg.status === 'delivered'
                                      ? 'Delivered'
                                      : 'Sent'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>
              <div className="p-3 bg-white border-t border-gray-200">
                {replyToMessage && (
                  <div className="mb-2 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/90 px-3 py-2 text-xs">
                    <CornerUpLeft className="h-4 w-4 shrink-0 text-emerald-700 mt-0.5" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-emerald-900">
                        {replyToMessage.direction === 'in' ? 'Replying to customer' : 'Replying to your message'}
                      </p>
                      <p className="text-emerald-900/80 line-clamp-2">{replyToMessage.preview}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyToMessage(null)}
                      className="rounded-md p-1 text-emerald-800 hover:bg-emerald-100"
                      aria-label="Cancel reply"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
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
                <p className="text-[10px] text-gray-400 mt-2 leading-snug">
                  Status updates come from Meta webhooks. &quot;Read&quot; only appears when the <strong className="font-medium text-gray-500">customer</strong> opens your message on WhatsApp — not when you open this inbox. Read receipts can be disabled on their phone.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
      </div>
      <ForwardMessageDialog
        open={forwardDialogOpen}
        onClose={() => {
          if (forwardBusy) return
          setForwardDialogOpen(false)
          setForwardSearch('')
          setForwardSelectedPhoneKeys([])
          setMessagesToForward([])
        }}
        recipients={mergedContacts}
        search={forwardSearch}
        onSearchChange={setForwardSearch}
        selectedPhoneKeys={forwardSelectedPhoneKeys}
        onTogglePhone={(key) => {
          setForwardSelectedPhoneKeys((prev) =>
            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
          )
        }}
        onSelectAllVisible={(keys) => {
          setForwardSelectedPhoneKeys((prev) => [...new Set([...prev, ...keys])])
        }}
        onDeselectVisible={(keys) => {
          const drop = new Set(keys)
          setForwardSelectedPhoneKeys((prev) => prev.filter((k) => !drop.has(k)))
        }}
        onClearSelection={() => setForwardSelectedPhoneKeys([])}
        onForward={executeForward}
        busy={forwardBusy}
        messagesCount={messagesToForward.length}
      />
      {showContactPanel && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/20"
            onClick={() => setShowContactPanel(false)}
            aria-label="Close details panel"
          />
          <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-white border-l border-gray-200 shadow-xl p-5 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Contact details</h3>
              <button
                type="button"
                onClick={() => setShowContactPanel(false)}
                className="rounded-md p-1 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="h-5 w-5 text-gray-600" />
              </button>
            </div>

            <div className="space-y-2 text-sm">
              <p><span className="text-gray-500">Name:</span> <span className="font-medium">{selectedContact?.name || '—'}</span></p>
              <p><span className="text-gray-500">Phone:</span> <span className="font-medium">{selectedContact?.phone || '—'}</span></p>
              <p><span className="text-gray-500">Type:</span> <span className="font-medium capitalize">{selectedContact?.type || '—'}</span></p>
            </div>

            {selectedContact?.type === 'lead' && (
              <div className="mt-4">
                {leadDetailsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading lead details...
                  </div>
                ) : leadDetailsError ? (
                  <p className="text-sm text-red-600">{leadDetailsError}</p>
                ) : (
                  <div className="space-y-2 text-sm">
                    <p><span className="text-gray-500">Status:</span> <span className="font-medium">{String(leadDetails?.status ?? '—')}</span></p>
                    <p><span className="text-gray-500">Email:</span> <span className="font-medium">{String(leadDetails?.email ?? '—')}</span></p>
                    <p><span className="text-gray-500">Source:</span> <span className="font-medium">{String(leadDetails?.source ?? '—')}</span></p>
                    <p><span className="text-gray-500">Interest:</span> <span className="font-medium">{String(leadDetails?.interest_level ?? '—')}</span></p>
                    <p><span className="text-gray-500">Requirement:</span> <span className="font-medium">{String(leadDetails?.requirement ?? '—')}</span></p>
                    <p><span className="text-gray-500">Timeline:</span> <span className="font-medium">{String(leadDetails?.timeline ?? '—')}</span></p>
                    <p><span className="text-gray-500">Created:</span> <span className="font-medium">{leadDetails?.created_at ? new Date(String(leadDetails.created_at)).toLocaleString() : '—'}</span></p>
                    {selectedContact?.id && (
                      <Link
                        href={`/leads/${selectedContact.id}`}
                        className="inline-flex items-center gap-1 mt-2 text-emerald-700 hover:text-emerald-800 font-medium"
                      >
                        Open full lead page
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
