import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Search, Mic, Bot, User, Sparkles, ArrowUpRight, RotateCcw, Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { jsonAuthHeaders } from '@/lib/api'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    setMessages([{
      id: generateId(),
      role: 'assistant',
      content: "Greetings, Master Sri. I am **J.A.R.V.I.S.** — your personal AI command center.\n\nI am fully online and at your service. Here's what I can do for you:\n\n- 💻 **Write any code** — Python, TypeScript, Deluge, Apps Script, React, Next.js, FastAPI\n- ⚙️ **Build automations** — n8n workflows, Zoho CRM, Google Ads pipelines\n- 🐛 **Debug & fix** — paste any error, I'll trace and fix it\n- 🏗️ **Design systems** — architecture, APIs, databases, workflows\n- 📧 **Manage email** — read, send, organize your Gmail\n- 📅 **Your schedule** — check calendar, plan meetings\n- 🌐 **Research** — find best tools, frameworks, techniques\n- 💰 **Business** — strategy, automation, revenue optimization\n\n**Your wish is my command, Master. What shall we build today?**",
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

  const sendMessage = useCallback(async (text: string) => {
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

    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setIsTyping(true)

    const assistantId = generateId()

    const updateAssistant = (content: string) => {
      setMessages(prev => {
        const updated = [...prev]
        const lastIdx = updated.findIndex(m => m.id === assistantId)
        if (lastIdx >= 0) {
          updated[lastIdx] = { ...updated[lastIdx], content }
        } else {
          updated.push({ id: assistantId, role: 'assistant', content, timestamp: new Date() })
        }
        return updated
      })
    }

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      })

      const data = await response.json().catch(() => null)

      if (!response.ok || !data) {
        throw new Error(data?.error || `Server error (${response.status})`)
      }

      if (data.content) {
        if (data.source === 'local-fallback' && data.setupHint) {
          updateAssistant(`${data.content}\n\n---\n**⚙️ Setup needed, Master:** ${data.setupHint}`)
        } else {
          updateAssistant(data.content)
        }
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
            messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          }),
        })
        const retryData = await retryRes.json().catch(() => null)
        if (retryRes.ok && retryData?.content) {
          updateAssistant(retryData.content)
          return
        }
      } catch {}

      updateAssistant(`⚠️ **I hit a snag, Master:** ${error.message}\n\nTry again in a moment — I'm always here.`)
    } finally {
      setIsTyping(false)
      inputRef.current?.focus()
    }
  }, [messages, isTyping])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

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
              {jarvisMode === 'sleeping' ? '🌙 Standby Mode — Say "Hey JARVIS" to wake' : isTyping ? 'Thinking...' : 'Online • Multi-AI Active'}
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setMessages([{
              id: generateId(),
              role: 'assistant',
              content: "Systems reset, Master. A fresh slate — what would you like me to work on?",
              timestamp: new Date(),
            }])
          }}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-all"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
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
              'rounded-2xl px-4 py-3',
              msg.role === 'user'
                ? 'bg-primary/15 text-foreground rounded-tr-sm'
                : 'jarvis-card rounded-tl-sm'
            )}>
              <div className="space-y-1">{renderMarkdown(msg.content)}</div>
              <p className="text-[10px] text-muted-foreground mt-2 opacity-60">{formatTime(msg.timestamp)}</p>
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
          Multi-AI Engine (Claude → GPT-4o → Gemini) • Always Online • Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
