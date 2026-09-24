import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Search, Mic, Bot, User, Sparkles, ArrowUpRight, RotateCcw, Loader2, AlertTriangle, Cpu, RefreshCw, Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { authHeaders, jsonAuthHeaders } from '@/lib/api'
import { Select, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/select'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  /** Which model answered, when the reply came from a live model. */
  source?: string
  /** True when this bubble is a connection notice, not an answer. */
  error?: boolean
  detail?: string
  setupHint?: string
  /** Real actions the assistant took while answering this message. */
  toolsUsed?: Array<{ name: string; ok: boolean; summary: string }>
  /** Set when the conversation's model had to be abandoned — shown, never silent. */
  switchedFrom?: string
}

const QUICK_ACTIONS = [
  { icon: '🤖', label: 'Write a Python automation', query: 'Write a Python script that monitors Google Ads campaign performance every hour and sends me a Telegram alert if CPC goes above ₹50' },
  { icon: '🔍', label: 'Research latest AI tools', query: 'What are the best AI tools for automating business workflows in 2026? Compare n8n, Zapier, and Make.com for an AI automation engineer.' },
  { icon: '💡', label: 'Design an automation', query: 'I run a roofing business called Standard Roofs. Design an end-to-end AI automation that qualifies leads from my website, adds them to Zoho CRM, and sends a personalized WhatsApp message.' },
  { icon: '🏗️', label: 'Help with my SaaS', query: 'I\'m building Sri AI Business OS with Next.js + FastAPI + SQLite + n8n. The prototype is 92% complete. Help me plan the remaining 8% and prepare for production deployment.' },
]

function generateId() {
  return Math.random().toString(36).substring(2, 10)
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function renderMarkdown(text: string) {
  // Split by code blocks first
  const parts = text.split(/(```[\s\S]*?```)/g)
  return parts.map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const lines = part.slice(3, -3)
      const langMatch = lines.match(/^(\w+)\n/)
      const lang = langMatch ? langMatch[1] : ''
      const code = langMatch ? lines.slice(langMatch[0].length) : lines
      return (
        <div key={i} className="my-2 rounded-lg overflow-hidden border border-border">
          {lang && (
            <div className="px-3 py-1 bg-muted/50 text-[10px] text-muted-foreground font-mono border-b border-border">
              {lang}
            </div>
          )}
          <pre className="p-3 bg-background/80 overflow-x-auto">
            <code className="text-[11px] text-foreground/80 font-mono whitespace-pre leading-relaxed">{code}</code>
          </pre>
        </div>
      )
    }

    // Regular text with inline formatting
    return (
      <div key={i} className="space-y-1">
        {part.split('\n').map((line, j) => {
          if (!line.trim()) return <div key={j} className="h-1.5" />

          // Bullet points
          if (line.match(/^\s*[-•]\s/)) {
            return <li key={j} className="ml-4 text-sm leading-relaxed list-disc text-foreground/90">{line.replace(/^\s*[-•]\s/, '')}</li>
          }
          // Numbered lists
          if (line.match(/^\s*\d+\.\s/)) {
            return <li key={j} className="ml-4 text-sm leading-relaxed list-decimal text-foreground/90">{line.replace(/^\s*\d+\.\s/, '')}</li>
          }
          // Headers
          if (line.startsWith('### ')) return <h4 key={j} className="text-sm font-bold text-foreground mt-3">{line.slice(4)}</h4>
          if (line.startsWith('## ')) return <h3 key={j} className="text-sm font-bold text-foreground mt-3">{line.slice(3)}</h3>
          if (line.startsWith('# ')) return <h2 key={j} className="text-sm font-bold text-foreground mt-3">{line.slice(2)}</h2>

          // Bold + inline code
          const rendered = line.split(/(\*\*.*?\*\*|`[^`]+`)/g).map((part, k) => {
            if (part.startsWith('**') && part.endsWith('**'))
              return <strong key={k} className="text-foreground font-semibold">{part.slice(2, -2)}</strong>
            if (part.startsWith('`') && part.endsWith('`'))
              return <code key={k} className="px-1 py-0.5 bg-muted rounded text-[11px] text-primary">{part.slice(1, -1)}</code>
            return part
          })

          return <p key={j} className="text-sm leading-relaxed text-foreground/90">{rendered}</p>
        })}
      </div>
    )
  })
}

export default function AIChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const [jarvisMode, setJarvisMode] = useState<'active' | 'sleeping'>('active')
  const [models, setModels] = useState<Array<{ id: string; name: string; healthy: boolean; latencyMs?: number | null }>>([])
  const [modelsAnswering, setModelsAnswering] = useState('')
  const [selectedModel, setSelectedModel] = useState('auto')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<any>(null)

  const GREETING: Message = {
    id: generateId(),
    role: 'assistant',
    content: "Greetings, Master Sri. I am **J.A.R.V.I.S.** — your personal AI command center.\n\nI am online, and I now read and write your real data. Here's what I can actually do:\n\n- 🧠 **Remember** — I read your saved memories, notes, reminders and habits, and I can save new ones for you\n- 📝 **Act, not just answer** — create notes, set reminders, log habits, record metrics on request\n- 💻 **Write real code** — Python, TypeScript, Deluge, Apps Script, React, Next.js, FastAPI\n- ⚙️ **Build automations** — n8n workflows, Zoho CRM, Google Ads pipelines\n- 🐛 **Debug & fix** — paste any error, I'll trace and fix it\n- 🌦️ **Live data** — weather for any city, current headlines, what you've been working on\n\n**Where I'm honestly limited:** I can't send email or read your Gmail until you connect it in the Connections Hub, I can't see your calendar, and I can't reach you on my own — no notification channel is set up, so reminders I create wait for you in the app.\n\n**What shall we build today, Master?**",
    timestamp: new Date(),
  }

  // Restore the conversation Sri was in the middle of, so a reload does not
  // throw away his history.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/ai/history?limit=40', { headers: authHeaders() })
        const body = await res.json().catch(() => ({}))
        const restored: Message[] = (body?.messages || [])
          .filter((msg: any) => msg?.role === 'user' || msg?.role === 'assistant')
          .map((msg: any) => ({
            id: generateId(),
            role: msg.role as 'user' | 'assistant',
            content: String(msg.content || ''),
            timestamp: new Date(msg.createdAt || Date.now()),
          }))
        if (cancelled) return
        setMessages(restored.length ? restored : [GREETING])
      } catch {
        if (!cancelled) setMessages([GREETING])
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Which models are actually live right now — served from the server's own
  // live probe, so a model appears here only if it genuinely answered.
  useEffect(() => {
    fetch('/api/ai/models')
      .then(r => r.json())
      .then(d => {
        const list = d?.models || []
        setModels(list)
        const up = list.filter((m: any) => m.healthy).length
        setModelsAnswering(`${up}/${list.length}`)
      })
      .catch(() => {})
  }, [])

  const selectedLabel = selectedModel === 'auto'
    ? 'Auto'
    : (models.find(mm => mm.id === selectedModel)?.name || selectedModel)

  const resetChat = useCallback(async () => {
    fetch('/api/ai/history', { method: 'DELETE', headers: authHeaders() }).catch(() => {})
    setMessages([{
      id: generateId(),
      role: 'assistant',
      content: 'Systems reset, Master. A fresh slate — what would you like me to work on?',
      timestamp: new Date(),
    }])
  }, [])

  // Init voice recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (SpeechRecognition) {
      setVoiceSupported(true)
      const recognition = new SpeechRecognition()
      recognition.continuous = false
      recognition.interimResults = true
      recognition.lang = 'en-US'
      recognition.onresult = (event: any) => {
        let transcript = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript
        }
        setInput(transcript)
        if (event.results[event.results.length - 1].isFinal) {
          setIsListening(false)
          setTimeout(() => sendMessage(transcript), 300)
        }
      }
      recognition.onerror = () => setIsListening(false)
      recognition.onend = () => setIsListening(false)
      recognitionRef.current = recognition
    }
  }, [])

  const toggleVoice = () => {
    if (!recognitionRef.current) return
    if (isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    } else {
      recognitionRef.current.start()
      setIsListening(true)
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const sendMessage = useCallback(async (text: string, opts?: { skipUserEcho?: boolean }) => {
    if (!text.trim() || isTyping) return

    const lower = text.trim().toLowerCase()

    // Sleep/wake commands — instant, no API call needed
    const wakePatterns = ['hey jarvis', 'wake up', 'wake', 'jarvis wake', 'hello jarvis', 'activate', 'jarvis activate', 'online jarvis', 'jarvis online']
    const sleepPatterns = ['rest', 'go to rest', 'go to sleep', 'sleep', 'jarvis rest', 'jarvis sleep', 'you can rest', 'go sleep', 'standby']

    if (wakePatterns.some(p => lower.includes(p))) {
      setJarvisMode('active')
      setMessages(prev => [...prev, {
        id: generateId(), role: 'user', content: text.trim(), timestamp: new Date(),
      }, {
        id: generateId(), role: 'assistant', content: "**Systems online, Master.** ⚡\n\nJ.A.R.V.I.S. is fully awake and ready to execute your commands. All systems operational.\n\nWhat shall we accomplish today?", timestamp: new Date(),
      }])
      setInput('')
      return
    }

    if (sleepPatterns.some(p => lower.includes(p))) {
      setJarvisMode('sleeping')
      setMessages(prev => [...prev, {
        id: generateId(), role: 'user', content: text.trim(), timestamp: new Date(),
      }, {
        id: generateId(), role: 'assistant', content: "Entering **standby mode**, Master. 🌙\n\nCore systems on low power. I'll be monitoring in the background.\n\nSay **\"Hey JARVIS\"** or **\"Wake up\"** to bring me back online anytime.", timestamp: new Date(),
      }])
      setInput('')
      return
    }

    // If sleeping, wake up automatically on any message
    if (jarvisMode === 'sleeping') {
      setJarvisMode('active')
    }

    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    }

    const newMessages = opts?.skipUserEcho ? messages : [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setIsTyping(true)

    const assistantId = generateId()

    const updateAssistant = (
      content: string,
      source?: string,
      extra?: { toolsUsed?: Message['toolsUsed']; switchedFrom?: string },
    ) => {
      setMessages(prev => {
        const updated = [...prev]
        const lastIdx = updated.findIndex(m => m.id === assistantId)
        const patch = {
          content,
          source,
          error: false,
          detail: undefined,
          setupHint: undefined,
          toolsUsed: extra?.toolsUsed,
          switchedFrom: extra?.switchedFrom || undefined,
        }
        if (lastIdx >= 0) {
          updated[lastIdx] = { ...updated[lastIdx], ...patch }
        } else {
          updated.push({ id: assistantId, role: 'assistant', timestamp: new Date(), ...patch })
        }
        return updated
      })
    }

    // A failed call must never masquerade as an answer from J.A.R.V.I.S.
    // Surface the real reason and the way to fix it instead.
    const failAssistant = (content: string, detail?: string, setupHint?: string) => {
      setMessages(prev => {
        const updated = [...prev]
        const idx = updated.findIndex(mm => mm.id === assistantId)
        const notice: Message = {
          id: assistantId, role: 'assistant', content, timestamp: new Date(), error: true, detail, setupHint,
        }
        if (idx >= 0) updated[idx] = notice
        else updated.push(notice)
        return updated
      })
    }

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          messages: newMessages
            .filter(msg => !msg.error)
            .map(msg => ({ role: msg.role, content: msg.content })),
          model: selectedModel === 'auto' ? undefined : selectedModel,
          sessionId: 'main',
        }),
      })

      const data = await response.json().catch(() => null)

      if (!response.ok || !data) {
        throw new Error(data?.error || `Server error (${response.status})`)
      }

      if (data.content) {
        updateAssistant(data.content, data.source, {
          toolsUsed: data.toolsUsed,
          switchedFrom: data.switchedFrom,
        })
        return
      }

      throw new Error(data.error || 'Empty response from AI')
    } catch (error: any) {
      // One automatic retry
      try {
        const retryRes = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: jsonAuthHeaders(),
          body: JSON.stringify({
            messages: newMessages
              .filter(msg => !msg.error)
              .map(msg => ({ role: msg.role, content: msg.content })),
            model: selectedModel === 'auto' ? undefined : selectedModel,
            sessionId: 'main',
          }),
        })
        const retryData = await retryRes.json().catch(() => null)
        if (retryRes.ok && retryData?.content) {
          updateAssistant(retryData.content, retryData.source, {
            toolsUsed: retryData.toolsUsed,
            switchedFrom: retryData.switchedFrom,
          })
          return
        }
      } catch {}

      failAssistant(
        'Connection failed — no AI model answered.',
        error?.message || 'Unknown error',
        'Retry below. If it keeps failing, check Settings - AI Providers.',
      )
    } finally {
      setIsTyping(false)
      inputRef.current?.focus()
    }
  }, [messages, isTyping, selectedModel])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const lastUserText = [...messages].reverse().find(msg => msg.role === 'user' && !msg.error)?.content || ''

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] sm:h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center jarvis-glow">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">J.A.R.V.I.S. AI</h2>
            <p className="text-xs text-primary/60 font-mono">
              {jarvisMode === 'sleeping'
                ? '🌙 Standby Mode — Say "Hey JARVIS" to wake'
                : isTyping
                  ? 'Thinking…'
                  : `Online • ${selectedModel === 'auto' && modelsAnswering ? `Auto (${modelsAnswering} live)` : selectedLabel}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger className="h-9 w-[7.5rem] sm:w-[11rem] rounded-lg border border-border bg-muted/40 px-2.5 text-xs">
              <span className="flex items-center gap-1.5 min-w-0">
                <Cpu className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="truncate">{selectedLabel}</span>
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto — failover chain</SelectItem>
              {models.map(mm => (
                <SelectItem key={mm.id} value={mm.id}>{mm.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={resetChat}
            title="Clear conversation"
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-all"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 scrollbar-thin">
        {messages.length <= 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
            {QUICK_ACTIONS.map((action, i) => (
              <button
                key={i}
                onClick={() => sendMessage(action.query)}
                className="jarvis-card p-3 text-left hover:border-primary/30 transition-all group"
              >
                <span className="text-lg">{action.icon}</span>
                <p className="text-xs text-foreground mt-1.5 font-medium">{action.label}</p>
                <ArrowUpRight className="w-3 h-3 text-primary/40 group-hover:text-primary mt-1 transition-colors" />
              </button>
            ))}
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex gap-3 max-w-[90%] sm:max-w-[85%]',
              msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''
            )}
          >
            <div className={cn(
              'w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center',
              msg.role === 'user' ? 'bg-primary/20' : 'bg-muted'
            )}>
              {msg.role === 'user'
                ? <User className="w-3.5 h-3.5 text-primary" />
                : <Bot className="w-3.5 h-3.5 text-foreground" />
              }
            </div>
            <div className={cn(
              'rounded-2xl px-4 py-3 min-w-0',
              msg.role === 'user'
                ? 'bg-primary/15 text-foreground rounded-tr-sm'
                : msg.error
                  ? 'bg-amber-500/10 border border-amber-500/30 rounded-tl-sm'
                  : 'jarvis-card rounded-tl-sm'
            )}>
              {msg.error ? (
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-amber-200">{msg.content}</p>
                  </div>
                  {msg.detail && (
                    <p className="text-[11px] font-mono text-muted-foreground break-words pl-6">{msg.detail}</p>
                  )}
                  {msg.setupHint && (
                    <p className="text-[11px] text-muted-foreground pl-6">{msg.setupHint}</p>
                  )}
                  <div className="pl-6">
                    <button
                      onClick={() => lastUserText && sendMessage(lastUserText, { skipUserEcho: true })}
                      disabled={isTyping || !lastUserText}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-40 text-[11px] font-semibold text-amber-100 transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" /> Retry
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">{renderMarkdown(msg.content)}</div>
              )}

              {/* Actions actually taken, recorded server-side — proof rather
                  than a claim. */}
              {!!msg.toolsUsed?.length && (
                <div className="mt-2.5 pt-2.5 border-t border-border/50 space-y-1">
                  <p className="text-[10px] font-semibold text-primary/70 uppercase tracking-wide">Actions taken</p>
                  {msg.toolsUsed.map((t, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[11px]">
                      {t.ok
                        ? <Check className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />
                        : <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />}
                      <span className={t.ok ? 'text-foreground/70' : 'text-amber-300'}>{t.summary}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* A model switch is announced, never silent. */}
              {msg.switchedFrom && (
                <p className="text-[10px] text-amber-300/80 mt-2 flex items-start gap-1">
                  <RefreshCw className="w-3 h-3 mt-px shrink-0" />
                  <span>{msg.switchedFrom} stopped responding, so this reply came from {msg.source}. The conversation continues there.</span>
                </p>
              )}

              <p className="text-[10px] text-muted-foreground mt-2 opacity-60">
                {formatTime(msg.timestamp)}{msg.source ? ` · ${msg.source}` : ''}
              </p>
            </div>
          </div>
        ))}

        {isTyping && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex gap-3 max-w-[85%]">
            <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <Bot className="w-3.5 h-3.5 text-foreground" />
            </div>
            <div className="jarvis-card rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="jarvis-card p-3">
        <div className="flex items-end gap-2">
          <button className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all flex-shrink-0 mb-0.5">
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={toggleVoice}
            className={cn(
              'p-2 rounded-lg transition-all flex-shrink-0 mb-0.5',
              isListening
                ? 'text-red-400 bg-red-500/15 animate-pulse'
                : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
            )}
            title={voiceSupported ? 'Voice input (tap to speak)' : 'Voice not supported in this browser'}
          >
            <Mic className="w-4 h-4" />
          </button>
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={jarvisMode === 'sleeping' ? 'Say "Hey JARVIS" to wake up...' : 'Ask me to write code, build automations, debug errors...'}
              disabled={jarvisMode === 'sleeping'}
              rows={1}
              className={cn(
                "w-full bg-background/50 border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-primary/50 transition-colors",
                jarvisMode === 'sleeping' && "opacity-40 cursor-not-allowed"
              )}
              style={{ minHeight: '40px', maxHeight: '120px' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement
                target.style.height = 'auto'
                target.style.height = Math.min(target.scrollHeight, 120) + 'px'
              }}
            />
          </div>
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isTyping}
            className={cn(
              'p-2.5 rounded-xl transition-all flex-shrink-0 mb-0.5',
              input.trim() && !isTyping
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 jarvis-glow'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {isTyping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 text-center opacity-50">
          <Sparkles className="w-3 h-3 inline mr-1" />
          Reads your memories, notes &amp; reminders • {models.length ? `${models.filter(m => m.healthy).length} live models, auto-failover` : 'Multi-model failover'} • Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
