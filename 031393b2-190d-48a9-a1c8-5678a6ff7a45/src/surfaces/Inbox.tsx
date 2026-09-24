import { useState, useEffect } from 'react'
import { Mail, Calendar, Send, RefreshCw, Clock, User, ExternalLink, Loader2, AlertCircle, Inbox as InboxIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { authHeaders, jsonAuthHeaders } from '@/lib/api'

interface Email {
  id: string
  subject: string
  from: string
  snippet: string
  date: string
  isUnread: boolean
  labels: string[]
}

interface CalendarEvent {
  id: string
  summary: string
  start: string
  end: string
  location?: string
  status: string
}

export default function Inbox() {
  const [emails, setEmails] = useState<Email[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [calendarError, setCalendarError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'emails' | 'calendar'>('emails')
  const [composing, setComposing] = useState(false)
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const fetchEmails = async () => {
    try {
      setEmailError(null)
      const res = await fetch('/api/gmail/inbox', { headers: authHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setEmailError(data.error || `HTTP ${res.status}`)
        return
      }

      // Server returns { raw: "JSON string" } — parse client-side
      let messages: any[] = []
      const raw = data.raw || data.emails
      if (typeof raw === 'string') {
        try {
          // Handle truncation markers from SDK
          const cleaned = raw.replace(/\[TRUNCATED.*?\]$/, '').trim()
          const parsed = JSON.parse(cleaned)
          messages = parsed.messages || parsed.data?.messages || []
        } catch {
          // Try double-parsed
          try {
            const parsed = JSON.parse(JSON.parse(raw))
            messages = parsed.messages || []
          } catch {}
        }
      } else if (raw?.messages) {
        messages = raw.messages
      }

      setEmails(messages.map((m: any) => ({
        id: m.messageId || m.id || '',
        subject: m.subject || m.preview?.subject || m.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || '(no subject)',
        from: m.sender || m.from || m.payload?.headers?.find((h: any) => h.name === 'From')?.value || 'Unknown',
        snippet: m.preview?.body || m.snippet || m.messageText?.replace(/<[^>]+>/g, '').slice(0, 120) || '',
        date: m.messageTimestamp || m.date || m.internalDate || '',
        isUnread: (m.labelIds || []).includes('UNREAD'),
        labels: m.labelIds || [],
      })))
    } catch (e: any) {
      setEmailError(e.message)
    }
  }

  const fetchCalendar = async () => {
    try {
      setCalendarError(null)
      const res = await fetch('/api/calendar/upcoming', { headers: authHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCalendarError(data.error || `HTTP ${res.status}`)
        return
      }
      const items = data.events?.items || data.events?.data?.items || []
      setEvents(items.map((e: any) => ({
        id: e.id || '',
        summary: e.summary || '(no title)',
        start: e.start?.dateTime || e.start?.date || '',
        end: e.end?.dateTime || e.end?.date || '',
        location: e.location,
        status: e.status || 'confirmed',
      })))
    } catch (e: any) {
      setCalendarError(e.message)
    }
  }

  const refresh = async () => {
    setLoading(true)
    await Promise.all([fetchEmails(), fetchCalendar()])
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  const sendEmail = async () => {
    if (!to || !subject) return
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ to, subject, html: body }),
      })
      if (res.ok) {
        setComposing(false)
        setTo('')
        setSubject('')
        setBody('')
      } else {
        const data = await res.json().catch(() => ({}))
        setSendError(data.error || `Could not send (HTTP ${res.status})`)
      }
    } catch (e: any) {
      setSendError(e.message || 'Could not send message')
    }
    setSending(false)
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    try {
      const d = new Date(dateStr)
      const now = new Date()
      const diffMs = now.getTime() - d.getTime()
      const diffH = diffMs / (1000 * 60 * 60)
      if (diffH < 1) return `${Math.floor(diffMs / 60000)}m ago`
      if (diffH < 24) return `${Math.floor(diffH)}h ago`
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    } catch { return dateStr }
  }

  const formatEventTime = (dateStr: string) => {
    if (!dateStr) return ''
    try {
      return new Date(dateStr).toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
      })
    } catch { return dateStr }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <span className="text-xl">📬</span> Inbox
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {emails.length} emails • {events.length} upcoming events
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setComposing(!composing)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 text-primary text-xs font-medium hover:bg-primary/25 transition-colors"
          >
            <Send className="w-3 h-3" /> Compose
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-all"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Compose Modal */}
      {composing && (
        <div className="jarvis-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">New Email</h3>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="To: email@example.com"
            className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your email..."
            rows={4}
            className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-primary/50"
          />
          <div className="flex gap-2">
            <button
              onClick={sendEmail}
              disabled={!to || !subject || sending}
              className={cn(
                'px-4 py-1.5 rounded-lg text-xs font-medium transition-colors',
                to && subject && !sending
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
            <button
              onClick={() => setComposing(false)}
              className="px-4 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
          {sendError && (
            <div className="flex items-start gap-2 text-amber-400 text-[11px] bg-amber-500/10 p-2 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{sendError}</span>
            </div>
          )}
        </div>
      )}

      {/* Tab Selector */}
      <div className="flex gap-2">
        {[
          { id: 'emails' as const, icon: <Mail className="w-3.5 h-3.5" />, label: `Emails (${emails.length})` },
          { id: 'calendar' as const, icon: <Calendar className="w-3.5 h-3.5" />, label: `Calendar (${events.length})` },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              activeTab === tab.id
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'bg-muted/50 text-muted-foreground hover:text-foreground border border-transparent'
            )}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Emails Tab */}
      {activeTab === 'emails' && (
        <div className="space-y-2">
          {emailError && (
            <div className="jarvis-card p-4 flex items-center gap-3 text-amber-400">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium">Gmail not connected yet</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{emailError}</p>
                <p className="text-[10px] text-primary mt-1">Click the Connect button in the chat to authorize Gmail access.</p>
              </div>
            </div>
          )}

          {loading && emails.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          )}

          {!loading && !emailError && emails.length === 0 && (
            <div className="jarvis-card p-8 text-center">
              <InboxIcon className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-foreground font-medium">No emails found</p>
              <p className="text-xs text-muted-foreground mt-1">Connect Gmail to see your inbox here</p>
            </div>
          )}

          {emails.map((email) => (
            <div key={email.id} className={cn('jarvis-card p-3 hover:border-primary/20 transition-all cursor-pointer', email.isUnread && 'border-l-2 border-l-primary')}>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                  <User className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn('text-xs font-medium truncate', email.isUnread ? 'text-foreground' : 'text-foreground/80')}>
                      {email.from}
                    </p>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatDate(email.date)}</span>
                  </div>
                  <p className="text-xs text-foreground mt-0.5 truncate">{email.subject}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{email.snippet}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Calendar Tab */}
      {activeTab === 'calendar' && (
        <div className="space-y-2">
          {calendarError && (
            <div className="jarvis-card p-4 flex items-center gap-3 text-amber-400">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium">Google Calendar not connected yet</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{calendarError}</p>
                <p className="text-[10px] text-primary mt-1">Click the Connect button in the chat to authorize Calendar access.</p>
              </div>
            </div>
          )}

          {loading && events.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          )}

          {!loading && !calendarError && events.length === 0 && (
            <div className="jarvis-card p-8 text-center">
              <Calendar className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-foreground font-medium">No upcoming events</p>
              <p className="text-xs text-muted-foreground mt-1">Connect Google Calendar to see your schedule</p>
            </div>
          )}

          {events.map((event) => (
            <div key={event.id} className="jarvis-card p-3 hover:border-primary/20 transition-all">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">{event.summary}</p>
                  <p className="text-[10px] text-primary mt-0.5">{formatEventTime(event.start)}</p>
                  {event.location && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">📍 {event.location}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
