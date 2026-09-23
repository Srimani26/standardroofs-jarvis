import { useState, useEffect, useCallback } from 'react'
import LoginScreen from './components/LoginScreen'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import CommandCenter from './surfaces/CommandCenter'
import AIChat from './surfaces/AIChat'
import Projects from './surfaces/Projects'
import CodeLab from './surfaces/CodeLab'
import WorkflowBuilder from './surfaces/WorkflowBuilder'
import DailyPlanner from './surfaces/DailyPlanner'
import HabitsTracker from './surfaces/HabitsTracker'
import Journal from './surfaces/Journal'
import Analytics from './surfaces/Analytics'
import KnowledgeHub from './surfaces/KnowledgeHub'
import TechRadar from './surfaces/TechRadar'
import Inbox from './surfaces/Inbox'
import {
  LayoutDashboard, MessageSquare, Layers, Code2, Workflow,
  CalendarCheck, Target, BookOpen, BarChart3, Brain, Globe,
  Menu, X, Settings, Lock, Shield, LogOut, Eye, EyeOff, AlertTriangle,
  ChevronRight, MemoryStick, Link2, Fingerprint
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { authHeaders } from '@/lib/api'

const navItems = [
  { id: 'command', icon: <LayoutDashboard className="w-4 h-4" />, label: 'HQ', mobileLabel: 'Home' },
  { id: 'chat', icon: <MessageSquare className="w-4 h-4" />, label: 'AI Chat', mobileLabel: 'Chat' },
  { id: 'projects', icon: <Layers className="w-4 h-4" />, label: 'Projects', mobileLabel: 'Projects' },
  { id: 'inbox', icon: <Globe className="w-4 h-4" />, label: 'Inbox', mobileLabel: 'Inbox' },
  { id: 'codlab', icon: <Code2 className="w-4 h-4" />, label: 'Code Lab', mobileLabel: 'Code' },
  { id: 'automations', icon: <Workflow className="w-4 h-4" />, label: 'Automations', mobileLabel: 'Auto' },
  { id: 'knowledge', icon: <Brain className="w-4 h-4" />, label: 'Knowledge', mobileLabel: 'Learn' },
  { id: 'techrader', icon: <Globe className="w-4 h-4" />, label: 'Tech Radar', mobileLabel: 'Tech' },
  { id: 'planner', icon: <CalendarCheck className="w-4 h-4" />, label: 'Planner', mobileLabel: 'Tasks' },
  { id: 'habits', icon: <Target className="w-4 h-4" />, label: 'Habits', mobileLabel: 'Habits' },
  { id: 'journal', icon: <BookOpen className="w-4 h-4" />, label: 'Journal', mobileLabel: 'Journal' },
  { id: 'analytics', icon: <BarChart3 className="w-4 h-4" />, label: 'Analytics', mobileLabel: 'Stats' },
]

const bottomTabs = [
  { id: 'chat', icon: <MessageSquare className="w-5 h-5" />, label: 'Chat' },
  { id: 'memory', icon: <MemoryStick className="w-5 h-5" />, label: 'Memory' },
  { id: 'command', icon: <LayoutDashboard className="w-5 h-5" />, label: 'Home' },
  { id: 'connections', icon: <Link2 className="w-5 h-5" />, label: 'Connect' },
  { id: 'more', icon: <Menu className="w-5 h-5" />, label: 'More' },
]

function MemoryView() {
  const [stats, setStats] = useState<any>(null)
  const [timeline, setTimeline] = useState<any>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any>(null)
  const [tab, setTab] = useState<'timeline' | 'search' | 'stats'>('timeline')

  useEffect(() => {
    fetch('/api/memory/stats', { headers: authHeaders() }).then(r => r.json()).then(setStats).catch(() => {})
    fetch('/api/memory/timeline', { headers: authHeaders() }).then(r => r.json()).then(setTimeline).catch(() => {})
  }, [])

  const handleSearch = async () => {
    if (!searchQuery) return
    const res = await fetch(`/api/memory/search?q=${encodeURIComponent(searchQuery)}`, { headers: authHeaders() })
    const data = await res.json()
    setSearchResults(data)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['timeline', 'search', 'stats'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize",
              tab === t ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30" : "text-slate-400 hover:text-white")}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'stats' && stats && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Conversations', value: stats.totalConversations, color: 'cyan' },
            { label: 'Memories', value: stats.totalMemories, color: 'purple' },
            { label: 'Notes', value: stats.totalNotes, color: 'green' },
            { label: 'Today Activities', value: stats.todayActivities, color: 'amber' },
          ].map(s => (
            <div key={s.label} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <p className="text-2xl font-bold text-white">{s.value}</p>
              <p className="text-xs text-slate-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'search' && (
        <div className="space-y-3">
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search conversations, memories..."
            className="w-full bg-slate-800/50 border border-slate-600/50 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500" />
          {searchResults?.memories?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-slate-400 font-mono">MEMORIES ({searchResults.memories.length})</p>
              {searchResults.memories.map((m: any) => (
                <div key={m.id} className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
                  <p className="text-sm text-white">{m.content}</p>
                  <p className="text-xs text-slate-500 mt-1">{new Date(m.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'timeline' && timeline?.timeline && (
        <div className="space-y-4">
          {Object.entries(timeline.timeline).map(([day, logs]: [string, any]) => (
            <div key={day}>
              <p className="text-xs text-slate-400 font-mono mb-2">{day}</p>
              <div className="space-y-1">
                {logs.map((log: any) => (
                  <div key={log.id} className="flex items-center gap-3 bg-slate-800/30 rounded-lg p-2">
                    <div className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{log.action}</p>
                      {log.details && <p className="text-xs text-slate-400 truncate">{log.details}</p>}
                    </div>
                    <p className="text-[10px] text-slate-500 shrink-0">{new Date(log.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ConnectionsView() {
  const [connections, setConnections] = useState<any[]>([])
  const [repos, setRepos] = useState<any[]>([])

  useEffect(() => {
    fetch('/api/connections', { headers: authHeaders() }).then(r => r.json()).then(d => setConnections(d.connections || [])).catch(() => {})
    fetch('/api/github/repos', { headers: authHeaders() }).then(r => r.json()).then(d => setRepos(d.repos || [])).catch(() => {})
  }, [])

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-white">System Connections</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {connections.map((c: any) => (
          <div key={c.name} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-center gap-3">
            <span className="text-2xl">{c.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{c.name}</p>
              <p className="text-xs text-slate-400">{c.detail}</p>
            </div>
            <div className={cn("w-2.5 h-2.5 rounded-full shrink-0",
              c.status === 'connected' ? 'bg-emerald-400' : c.status === 'degraded' ? 'bg-amber-400' : 'bg-slate-500')} />
          </div>
        ))}
      </div>
      {repos.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-white mt-4">GitHub Repositories</h3>
          <div className="space-y-2">
            {repos.map((r: any) => (
              <a key={r.name} href={r.url} target="_blank" rel="noopener"
                className="block bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 hover:border-cyan-500/30 transition-all">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-white">{r.name}</p>
                  {r.language && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">{r.language}</span>}
                  {r.stars > 0 && <span className="text-[10px] text-amber-400">★ {r.stars}</span>}
                </div>
                {r.description && <p className="text-xs text-slate-400 mt-1 line-clamp-1">{r.description}</p>}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('jarvis_token') || '')
  const [username, setUsername] = useState(() => localStorage.getItem('jarvis_user') || '')
  const [activeTab, setActiveTab] = useState('command')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')
  const [showNewPw, setShowNewPw] = useState(false)
  const [providers, setProviders] = useState<any[]>([])
  const [selectedProvider, setSelectedProvider] = useState('openai')
  const [newKey, setNewKey] = useState('')
  const [keyMsg, setKeyMsg] = useState('')
  const [keyBusy, setKeyBusy] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [inviteCode, setInviteCode] = useState('')

  const loadProviders = useCallback(() => {
    fetch('/api/settings/keys', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setProviders(d.providers || []))
      .catch(() => {})
  }, [token])

  const loadInviteCode = useCallback(() => {
    fetch('/api/auth/invite-code', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : {}) as Promise<{ inviteCode?: string }>)
      .then(d => setInviteCode(d.inviteCode || ''))
      .catch(() => {})
  }, [token])

  useEffect(() => {
    if (!settingsOpen) return
    loadProviders()
    loadInviteCode()
  }, [settingsOpen, loadProviders, loadInviteCode])

  const saveProviderKey = async () => {
    if (!newKey.trim()) return
    setKeyBusy(true)
    setKeyMsg('')
    try {
      const res = await fetch('/api/settings/keys', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: selectedProvider, key: newKey.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setKeyMsg(`✅ ${selectedProvider} connected — JARVIS now has a backup AI link`)
      setNewKey('')
      loadProviders()
    } catch (err: any) {
      setKeyMsg(`⚠️ ${err.message}`)
    } finally {
      setKeyBusy(false)
    }
  }

  const removeProviderKey = async (provider: string) => {
    await fetch(`/api/settings/keys/${provider}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    loadProviders()
  }

  useEffect(() => {
    if (token) {
      fetch('/api/auth/status', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => {
          if (!d.authenticated) {
            localStorage.removeItem('jarvis_token')
            localStorage.removeItem('jarvis_user')
            setToken('')
            setUsername('')
            setAuthenticated(false)
          }
        })
        .catch(() => {
          localStorage.removeItem('jarvis_token')
          localStorage.removeItem('jarvis_user')
          setToken('')
          setUsername('')
          setAuthenticated(false)
        })
    }
  }, [])

  const handleLogin = (newToken: string, user: string) => {
    setToken(newToken)
    setUsername(user)
    localStorage.setItem('jarvis_token', newToken)
    localStorage.setItem('jarvis_user', user)
    setAuthenticated(true)
  }

  const handleLogout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }) } catch {}
    localStorage.removeItem('jarvis_token')
    localStorage.removeItem('jarvis_user')
    setToken('')
    setUsername('')
    setAuthenticated(false)
  }

  const handleChangePassword = async () => {
    setPwError('')
    setPwSuccess('')
    if (!currentPw || !newPw) { setPwError('Fill all fields'); return }
    if (newPw.length < 6) { setPwError('Min 6 characters'); return }
    if (newPw !== confirmPw) { setPwError('Passwords do not match'); return }
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, currentPassword: currentPw, newPassword: newPw }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPwSuccess('Password changed! All sessions invalidated.')
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
      setTimeout(() => handleLogout(), 2000)
    } catch (err: any) { setPwError(err.message) }
  }

  const handleNavigate = (tab: string) => { setActiveTab(tab); setMobileMenuOpen(false) }
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  if (!authenticated) return <LoginScreen onLogin={handleLogin} />

  return (
    <div className="min-h-screen bg-slate-950 text-white safe-area-bottom">
      {/* Top Bar — Desktop */}
      <div className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50 hidden md:block">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => handleNavigate('command')}>
            <div className="relative w-9 h-9 rounded-lg bg-cyan-500/15 flex items-center justify-center">
              <span className="text-lg">⚡</span>
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-wide">J.A.R.V.I.S.</h1>
              <p className="text-[10px] text-cyan-400/60 font-mono">v2.0 — Next-Gen AI</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {navItems.map(item => (
              <button key={item.id} onClick={() => handleNavigate(item.id)}
                className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all",
                  activeTab === item.id ? "bg-cyan-500/10 text-cyan-400" : "text-slate-400 hover:text-white")}>
                {item.icon} <span className="hidden lg:inline">{item.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 font-mono">{username}</span>
            <button onClick={() => setSettingsOpen(true)} className="p-2 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10"><Settings className="w-4 h-4" /></button>
            <button onClick={handleLogout} className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10"><Lock className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {/* Mobile Top Bar */}
      <div className="md:hidden sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2" onClick={() => handleNavigate('command')}>
            <span className="text-lg">⚡</span>
            <div>
              <h1 className="text-sm font-semibold">J.A.R.V.I.S.</h1>
              <p className="text-[9px] text-cyan-400/60 font-mono">v2.0</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSettingsOpen(true)} className="p-2 text-slate-400"><Settings className="w-4 h-4" /></button>
            <button onClick={handleLogout} className="p-2 text-slate-400"><Lock className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {/* Mobile More Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-slate-950/95 backdrop-blur-xl overflow-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">All Surfaces</h2>
              <button onClick={() => setMobileMenuOpen(false)} className="p-2 text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {navItems.map(item => (
                <button key={item.id} onClick={() => handleNavigate(item.id)}
                  className={cn("flex flex-col items-center gap-2 p-4 rounded-2xl transition-all",
                    activeTab === item.id ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30" : "bg-slate-800/50 text-slate-400 hover:text-white")}>
                  {item.icon}
                  <span className="text-xs font-medium">{item.mobileLabel}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 pb-24 md:pb-4">
        {activeTab === 'command' && <CommandCenter onNavigate={handleNavigate} />}
        {activeTab === 'chat' && <AIChat />}
        {activeTab === 'projects' && <Projects />}
        {activeTab === 'inbox' && <Inbox />}
        {activeTab === 'codlab' && <CodeLab />}
        {activeTab === 'automations' && <WorkflowBuilder />}
        {activeTab === 'knowledge' && <KnowledgeHub />}
        {activeTab === 'techrader' && <TechRadar />}
        {activeTab === 'planner' && <DailyPlanner />}
        {activeTab === 'habits' && <HabitsTracker />}
        {activeTab === 'journal' && <Journal />}
        {activeTab === 'analytics' && <Analytics />}
        {activeTab === 'memory' && <MemoryView />}
        {activeTab === 'connections' && <ConnectionsView />}
        {activeTab === 'more' && (
          <div className="grid grid-cols-3 gap-3">
            {navItems.map(item => (
              <button key={item.id} onClick={() => handleNavigate(item.id)}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-slate-800/50 text-slate-400 hover:text-white transition-all">
                {item.icon}
                <span className="text-xs font-medium">{item.mobileLabel}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Nav — Mobile */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-950/90 backdrop-blur-xl border-t border-slate-800/50 safe-area-bottom">
        <div className="flex items-center justify-around py-2 px-2">
          {bottomTabs.map(tab => (
            <button key={tab.id} onClick={() => {
              if (tab.id === 'more') setMobileMenuOpen(true)
              else handleNavigate(tab.id)
            }}
              className={cn("flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all",
                activeTab === tab.id ? "text-cyan-400" : "text-slate-500")}>
              {tab.icon}
              <span className="text-[9px] font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-slate-700/50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Shield className="w-5 h-5 text-cyan-400" /> Security Settings
            </DialogTitle>
            <DialogDescription className="text-slate-400">Change password, manage 2FA, view sessions</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="bg-slate-800/50 rounded-xl p-3 flex items-center gap-3">
              <Fingerprint className="w-5 h-5 text-cyan-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Two-Factor Auth</p>
                <p className="text-xs text-slate-400">Extra security layer for login</p>
              </div>
              <span className="text-xs text-emerald-400">Available</span>
            </div>

            <div className="bg-slate-800/50 rounded-xl p-3 flex items-start gap-3">
              <Link2 className="w-5 h-5 text-cyan-400 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">Invite Code</p>
                <p className="text-xs text-slate-400">Share this to let someone create an account</p>
                <p className="text-sm font-mono text-cyan-300 mt-1 break-all">
                  {inviteCode || '••••••••••'}
                </p>
              </div>
              {inviteCode && (
                <button
                  onClick={() => navigator.clipboard?.writeText(inviteCode).then(() => setKeyMsg('✅ Invite code copied')).catch(() => {})}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 px-2 py-1 shrink-0">
                  Copy
                </button>
              )}
            </div>

            <div className="border-t border-slate-700/50 pt-4">
              <p className="text-xs text-slate-400 font-mono mb-2">AI PROVIDERS — BACKUP MODELS (24/7 UPTIME)</p>
              <div className="space-y-2">
                {providers.map((p: any) => (
                  <div key={p.id} className="flex items-center gap-2 bg-slate-800/50 rounded-lg p-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white font-medium">{p.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        {p.configured ? p.masked : `not connected · ${p.models}`}
                      </p>
                    </div>
                    {p.configured ? (
                      <button onClick={() => removeProviderKey(p.id)} className="text-[10px] text-red-400 hover:text-red-300 px-2 py-1">Remove</button>
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-slate-600" />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)}
                  className="bg-slate-800/50 border border-slate-600/50 rounded-lg px-2 py-2 text-xs text-white">
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="gemini">Gemini</option>
                </select>
                <input type="password" value={newKey} onChange={e => { setNewKey(e.target.value); setKeyMsg('') }}
                  placeholder="Paste API key"
                  className="flex-1 min-w-0 bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500/50" />
                <button onClick={saveProviderKey} disabled={keyBusy || !newKey.trim()}
                  className="px-3 py-2 rounded-lg bg-cyan-600 text-white text-xs font-semibold disabled:opacity-40">
                  {keyBusy ? '...' : 'Add'}
                </button>
              </div>
              {keyMsg && <p className="text-[10px] text-slate-300 mt-2 font-mono">{keyMsg}</p>}
            </div>

            <div className="border-t border-slate-700/50 pt-4 space-y-3">
              <label className="text-xs text-slate-400 font-mono">CHANGE PASSWORD</label>
              <input type="password" value={currentPw} onChange={e => { setCurrentPw(e.target.value); setPwError(''); setPwSuccess('') }}
                placeholder="Enter current password"
                className="w-full bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-500/50" />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-400 font-mono">NEW PASSWORD</label>
              <div className="relative">
                <input type={showNewPw ? 'text' : 'password'} value={newPw}
                  onChange={e => { setNewPw(e.target.value); setPwError(''); setPwSuccess('') }}
                  placeholder="Min 6 characters"
                  className="w-full bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-2 pr-10 text-sm text-white font-mono focus:outline-none focus:border-cyan-500/50" />
                <button onClick={() => setShowNewPw(!showNewPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                  {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-400 font-mono">CONFIRM NEW PASSWORD</label>
              <input type="password" value={confirmPw}
                onChange={e => { setConfirmPw(e.target.value); setPwError(''); setPwSuccess('') }}
                placeholder="Confirm new password"
                className="w-full bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-500/50" />
            </div>
            {pwError && <div className="flex items-center gap-2 text-red-400 text-xs font-mono"><AlertTriangle className="w-3 h-3" />{pwError}</div>}
            {pwSuccess && <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono">✅ {pwSuccess}</div>}
            <button onClick={handleChangePassword}
              className="w-full py-2.5 rounded-lg bg-cyan-600 text-white font-semibold text-sm hover:bg-cyan-700 transition-all">
              Change Password
            </button>

            <div className="border-t border-slate-700/50 pt-4 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white font-medium">Logged in as</p>
                  <p className="text-xs text-slate-400 font-mono">{username}</p>
                </div>
                <button onClick={handleLogout} className="flex items-center gap-2 text-red-400 text-sm hover:text-red-300">
                  <LogOut className="w-4 h-4" /> Logout
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
