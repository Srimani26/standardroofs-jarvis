import { useCallback, useEffect, useState } from 'react'
import {
  Shield, KeyRound, Eye, EyeOff, LogOut, MonitorSmartphone, Loader2,
  CheckCircle2, AlertTriangle, Cpu, MessageSquare, Brain, BookOpen,
  Activity, User as UserIcon, Crown, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { apiFetch, jsonAuthHeaders } from '@/lib/api'

interface Session {
  id: string
  deviceInfo: string
  ipAddress: string | null
  createdAt: string
  expiresAt: string
  current: boolean
}

interface Me {
  user: { username: string; createdAt: string; twoFactorEnabled: boolean; failedAttempts: number }
  sessions: Session[]
  providers: Array<{ id: string; name: string; configured: boolean }>
  stats: { conversations: number; memories: number; notes: number; activities: number }
}

function formatDate(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function relative(iso: string) {
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return '—'
  const mins = Math.round((Date.now() - d) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('jarvis-card rounded-2xl p-4 sm:p-5', className)}>{children}</div>
}

function SectionTitle({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2.5 mb-4">
      <div className="text-cyan-400 mt-0.5">{icon}</div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
      </div>
    </div>
  )
}

function Field({
  label, value, onChange, placeholder, show, onToggle,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  show?: boolean
  onToggle?: () => void
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] tracking-wider text-slate-400 font-mono uppercase">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full bg-slate-900/60 border border-slate-700/60 rounded-xl px-3 py-2.5 pr-10 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/60"
        />
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={show ? 'Hide password' : 'Show password'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  )
}

export default function Profile({ onLogout }: { onLogout: () => void }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [pwBusy, setPwBusy] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')

  const [signingOut, setSigningOut] = useState(false)
  const [signOutMsg, setSignOutMsg] = useState('')
  const [tfaPw, setTfaPw] = useState('')
  const [tfaBusy, setTfaBusy] = useState(false)
  const [tfaError, setTfaError] = useState('')
  const [tfaMsg, setTfaMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      setMe(await apiFetch('/api/auth/me'))
    } catch (err: any) {
      setLoadError(err?.message || 'Could not load profile')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function changePassword() {
    setPwError(''); setPwSuccess('')
    if (!currentPw || !newPw || !confirmPw) { setPwError('Fill in all three fields'); return }
    if (newPw.length < 6) { setPwError('New password must be at least 6 characters'); return }
    if (newPw === currentPw) { setPwError('New password must be different from the current one'); return }
    if (newPw !== confirmPw) { setPwError('New passwords do not match'); return }

    setPwBusy(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`)
      setPwSuccess(body?.message || 'Password changed')
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
      void load()
    } catch (err: any) {
      setPwError(err?.message || 'Could not change password')
    } finally {
      setPwBusy(false)
    }
  }

  async function signOutOthers() {
    setSigningOut(true); setSignOutMsg('')
    try {
      const body = await apiFetch('/api/auth/logout-others', { method: 'POST' })
      setSignOutMsg(`Signed out ${body?.signedOut ?? 0} device(s). This device stays logged in.`)
      void load()
    } catch (err: any) {
      setSignOutMsg(err?.message || 'Could not sign out other devices')
    } finally {
      setSigningOut(false)
    }
  }

  async function disableTwoFactor() {
    if (!tfaPw || tfaBusy || !me) return
    setTfaBusy(true); setTfaError(''); setTfaMsg('')
    try {
      const res = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: me.user.username, password: tfaPw }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`)
      setTfaPw('')
      setTfaMsg(body?.message || 'Two-factor authentication is off.')
      void load()
    } catch (err: any) {
      setTfaError(err?.message || 'Could not turn off 2FA')
    } finally {
      setTfaBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading profile…
      </div>
    )
  }

  if (loadError || !me) {
    return (
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <Card className="border-red-500/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white font-medium">Could not load your profile</p>
              <p className="text-xs text-slate-400 mt-1 break-words">{loadError}</p>
              <button
                onClick={() => void load()}
                className="mt-3 px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-xs font-semibold"
              >
                Retry
              </button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  const initial = (me.user.username || 'S').charAt(0).toUpperCase()
  const others = me.sessions.filter(s => !s.current)
  const stats = [
    { label: 'Conversations', value: me.stats.conversations, icon: <MessageSquare className="w-3.5 h-3.5" /> },
    { label: 'Memories', value: me.stats.memories, icon: <Brain className="w-3.5 h-3.5" /> },
    { label: 'Notes', value: me.stats.notes, icon: <BookOpen className="w-3.5 h-3.5" /> },
    { label: 'Activities', value: me.stats.activities, icon: <Activity className="w-3.5 h-3.5" /> },
  ]

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4 animate-jarvis-fade-in">
      {/* Identity */}
      <Card className="jarvis-glow">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/30 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center">
              <span className="text-2xl font-bold text-cyan-300 jarvis-text-glow">{initial}</span>
            </div>
            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 border-2 border-slate-950 animate-jarvis-pulse" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-white break-all">{me.user.username}</h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-[10px] font-mono text-cyan-300">
                <Crown className="w-3 h-3" /> MASTER
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Owner of J.A.R.V.I.S. · Standard Roofs · joined {formatDate(me.user.createdAt)}
            </p>
            <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-slate-500">
              <span className="flex items-center gap-1">
                <Shield className="w-3 h-3 text-emerald-400" />
                {me.user.twoFactorEnabled ? '2FA ON' : '2FA OFF'}
              </span>
              <span className="flex items-center gap-1">
                <MonitorSmartphone className="w-3 h-3 text-cyan-400" />
                {me.sessions.length} session{me.sessions.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          {stats.map(s => (
            <div key={s.label} className="bg-slate-900/50 rounded-xl p-2.5 border border-slate-800/60">
              <div className="flex items-center gap-1.5 text-cyan-400">{s.icon}</div>
              <p className="text-lg font-semibold text-white mt-1 tabular-nums">{s.value}</p>
              <p className="text-[10px] text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Change password */}
      <Card>
        <SectionTitle
          icon={<KeyRound className="w-4 h-4" />}
          title="Change password"
          hint="Works from any device, any time. Other devices are signed out automatically."
        />
        <div className="space-y-3">
          <Field label="Current password" value={currentPw} onChange={v => { setCurrentPw(v); setPwError(''); setPwSuccess('') }} placeholder="Enter current password" show={showPw} onToggle={() => setShowPw(s => !s)} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="New password" value={newPw} onChange={v => { setNewPw(v); setPwError(''); setPwSuccess('') }} placeholder="Min 6 characters" show={showPw} />
            <Field label="Confirm new password" value={confirmPw} onChange={v => { setConfirmPw(v); setPwError(''); setPwSuccess('') }} placeholder="Repeat new password" show={showPw} />
          </div>

          {pwError && (
            <div className="flex items-start gap-2 text-red-400 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span className="break-words">{pwError}</span>
            </div>
          )}
          {pwSuccess && (
            <div className="flex items-start gap-2 text-emerald-400 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span className="break-words">{pwSuccess}</span>
            </div>
          )}

          <button
            onClick={changePassword}
            disabled={pwBusy}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            {pwBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            {pwBusy ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </Card>

      {/* Sessions */}
      <Card>
        <SectionTitle
          icon={<MonitorSmartphone className="w-4 h-4" />}
          title="Active sessions"
          hint="Every device with a valid J.A.R.V.I.S. login."
        />
        <div className="space-y-2">
          {me.sessions.length === 0 && (
            <p className="text-xs text-slate-500">No stored sessions yet.</p>
          )}
          {me.sessions.map(s => (
            <div key={s.id} className="flex items-center gap-3 bg-slate-900/50 rounded-xl p-3 border border-slate-800/60">
              <Cpu className={cn('w-4 h-4 shrink-0', s.current ? 'text-emerald-400' : 'text-slate-500')} />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-white truncate">
                  {s.deviceInfo}
                  {s.current && <span className="ml-2 text-[10px] text-emerald-400 font-mono">THIS DEVICE</span>}
                </p>
                <p className="text-[10px] text-slate-500 font-mono">
                  started {relative(s.createdAt)} · expires {formatDate(s.expiresAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
        {others.length > 0 && (
          <button
            onClick={signOutOthers}
            disabled={signingOut}
            className="mt-3 w-full sm:w-auto px-3 py-2 rounded-xl border border-red-500/30 text-red-300 hover:bg-red-500/10 disabled:opacity-40 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            {signingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
            Sign out other devices ({others.length})
          </button>
        )}
        {signOutMsg && <p className="mt-2 text-[11px] text-slate-400 break-words">{signOutMsg}</p>}
      </Card>

      {/* AI providers */}
      <Card>
        <SectionTitle
          icon={<Brain className="w-4 h-4" />}
          title="AI providers"
          hint="Your own keys are the backup chain — with a key saved, chat never depends on a shared pool."
        />
        <div className="space-y-2">
          {me.providers.map(p => (
            <div key={p.id} className="flex items-center gap-3 bg-slate-900/50 rounded-xl p-3 border border-slate-800/60">
              <span className={cn('w-2 h-2 rounded-full shrink-0', p.configured ? 'bg-emerald-400' : 'bg-slate-600')} />
              <span className="text-xs text-white flex-1">{p.name}</span>
              <span className={cn('text-[10px] font-mono', p.configured ? 'text-emerald-400' : 'text-slate-500')}>
                {p.configured ? 'CONNECTED' : 'NOT SET'}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
          <ChevronRight className="w-3 h-3" />
          Add or remove keys in <span className="text-slate-300">Settings</span> (gear icon, top bar).
        </div>
      </Card>

      {/* Two-factor authentication */}
      <Card>
        <SectionTitle
          icon={<Shield className="w-4 h-4" />}
          title="Two-factor authentication"
          hint={me.user.twoFactorEnabled
            ? 'ON — a 6-digit authenticator code is required at every login.'
            : 'OFF — your password alone opens J.A.R.V.I.S.'}
        />
        {me.user.twoFactorEnabled ? (
          <div className="space-y-3">
            <Field
              label="Confirm your password to turn 2FA off"
              value={tfaPw}
              onChange={v => { setTfaPw(v); setTfaError(''); setTfaMsg('') }}
              placeholder="Account password"
              show={showPw}
              onToggle={() => setShowPw(s => !s)}
            />
            {tfaError && (
              <div className="flex items-start gap-2 text-red-400 text-xs">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span className="break-words">{tfaError}</span>
              </div>
            )}
            {tfaMsg && (
              <div className="flex items-start gap-2 text-emerald-400 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span className="break-words">{tfaMsg}</span>
              </div>
            )}
            <button
              onClick={disableTwoFactor}
              disabled={!tfaPw || tfaBusy}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-amber-500/40 text-amber-200 hover:bg-amber-500/10 disabled:opacity-40 text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              {tfaBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              Turn off 2FA
            </button>
            <p className="text-[11px] text-slate-500">
              Lost your authenticator app? This is the same recovery you get on the login screen — your password always works.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">
              Nothing to disable right now. To turn it on, complete the 2FA setup shown after your next sign-in.
            </p>
          </div>
        )}
      </Card>

      {/* Sign out */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <div className="flex items-start gap-2.5 min-w-0">
            <UserIcon className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm text-white font-medium">Signed in as {me.user.username}</p>
              <p className="text-[11px] text-slate-500">Signing out clears the session from this device only.</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-red-600/90 hover:bg-red-600 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" /> Log out
          </button>
        </div>
      </Card>
    </div>
  )
}
