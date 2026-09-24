import { useState } from 'react'
import { Eye, EyeOff, Shield, AlertTriangle, Lock, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TwoFactorSetup } from './auth/TwoFactorSetup'
import { TwoFactorVerify } from './auth/TwoFactorVerify'

interface LoginScreenProps {
  onLogin: (token: string, username: string) => void
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [twofaStep, setTwofaStep] = useState<'none' | 'setup' | 'verify'>('none')
  const [tempToken, setTempToken] = useState('')
  const [lockTimer, setLockTimer] = useState(0)

  const switchMode = (next: 'login' | 'register' | 'reset') => {
    setMode(next)
    setError('')
    setNotice('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return
    if (mode === 'register' && password !== confirmPw) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    setError('')
    setNotice('')

    try {
      if (mode === 'register') {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, inviteCode: inviteCode.trim() }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || `Could not create account (HTTP ${res.status})`)
        setTwofaStep('setup')
      } else if (mode === 'reset') {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, newPassword: password, inviteCode: inviteCode.trim() }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || `Could not reset password (HTTP ${res.status})`)
        setPassword('')
        setConfirmPw('')
        setMode('login')
        setNotice(data.message || 'Password reset. You can log in now.')
      } else {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, deviceInfo: navigator.userAgent }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (res.status === 423) {
            const match = String(data.error || '').match(/(\d+)\s*minutes/)
            if (match) setLockTimer(parseInt(match[1]) * 60)
          }
          throw new Error(data.error || `Login failed (HTTP ${res.status})`)
        }
        if (data.requires2fa) {
          setTempToken(data.tempToken)
          setTwofaStep('verify')
        } else {
          onLogin(data.token, username)
        }
      }
    } catch (err: any) {
      setError(err.message || 'Connection failed')
    } finally {
      setLoading(false)
    }
  }

  if (twofaStep === 'setup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        <TwoFactorSetup username={username} password={password} onComplete={() => { setTwofaStep('none'); setMode('login'); setNotice('2FA enabled successfully! Please log in.') }} onSkip={() => { setTwofaStep('none'); setMode('login'); setNotice('Account created. You can log in now.') }} />
      </div>
    )
  }

  if (twofaStep === 'verify') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        <TwoFactorVerify
          username={username}
          tempToken={tempToken}
          onSuccess={(token) => onLogin(token, username)}
          onBack={() => { setTwofaStep('none'); setTempToken('') }}
          onRecovered={(message) => {
            setTwofaStep('none')
            setTempToken('')
            setMode('login')
            setNotice(message)
          }}
        />
      </div>
    )
  }

  const isRegister = mode === 'register'
  const isReset = mode === 'reset'
  const needsConfirm = isRegister || isReset
  const canSubmit = Boolean(username && password) && (!needsConfirm || password === confirmPw) && !loading && lockTimer === 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="relative w-20 h-20 mx-auto">
            <div className="absolute inset-0 bg-cyan-500/20 rounded-2xl animate-pulse" />
            <div className="relative w-full h-full bg-slate-800/80 rounded-2xl flex items-center justify-center border border-cyan-500/30">
              <span className="text-3xl">⚡</span>
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-slate-900 animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-wider">J.A.R.V.I.S.</h1>
            <p className="text-xs text-cyan-400/60 font-mono mt-1">Next-Gen AI Command Center</p>
          </div>
        </div>

        {/* Login Card */}
        <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-xl">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isReset && (
                <div className="flex gap-2 mb-2">
                  <Button type="button" size="sm" variant={mode === 'login' ? 'default' : 'ghost'}
                    onClick={() => switchMode('login')}
                    className="flex-1 text-xs">Login</Button>
                  <Button type="button" size="sm" variant={isRegister ? 'default' : 'ghost'}
                    onClick={() => switchMode('register')}
                    className="flex-1 text-xs">Register</Button>
                </div>
              )}

              {isReset && (
                <p className="text-xs text-slate-400 leading-relaxed">
                  Reset your password with the invite code. You&apos;ll be able to log in right after.
                </p>
              )}

              <div className="space-y-2">
                <Label className="text-xs text-slate-400 font-mono">USERNAME</Label>
                <Input type="text" value={username} onChange={e => setUsername(e.target.value)}
                  placeholder="Enter username" autoComplete="username"
                  className="bg-slate-900/50 border-slate-600/50 text-white font-mono" />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-400 font-mono">{isReset ? 'NEW PASSWORD' : 'PASSWORD'}</Label>
                <div className="relative">
                  <Input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder={isReset ? 'New password (min 8 chars)' : 'Enter password'}
                    autoComplete={isRegister || isReset ? 'new-password' : 'current-password'}
                    className="bg-slate-900/50 border-slate-600/50 text-white font-mono pr-10" />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {needsConfirm && (
                <div className="space-y-2">
                  <Label className="text-xs text-slate-400 font-mono">CONFIRM PASSWORD</Label>
                  <Input type={showPw ? 'text' : 'password'} value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                    placeholder="Re-enter password" autoComplete="new-password"
                    className="bg-slate-900/50 border-slate-600/50 text-white font-mono" />
                </div>
              )}

              {(isRegister || isReset) && (
                <div className="space-y-2">
                  <Label className="text-xs text-slate-400 font-mono">INVITE CODE</Label>
                  <Input type="text" value={inviteCode} onChange={e => setInviteCode(e.target.value)}
                    placeholder="Found in JARVIS → Settings"
                    className="bg-slate-900/50 border-slate-600/50 text-white font-mono" />
                  <p className="text-[10px] text-slate-500">
                    This JARVIS is private. The invite code keeps your mail, calendar and repos off-limits to strangers.
                  </p>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 text-red-400 text-xs font-mono bg-red-500/10 p-2 rounded-lg">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {notice && (
                <div className="flex items-start gap-2 text-emerald-400 text-xs font-mono bg-emerald-500/10 p-2 rounded-lg">
                  <Shield className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>{notice}</span>
                </div>
              )}

              {lockTimer > 0 && (
                <div className="flex items-center gap-2 text-amber-400 text-xs font-mono bg-amber-500/10 p-2 rounded-lg">
                  <Lock className="w-3 h-3 shrink-0" /> Account locked. Try again in {Math.ceil(lockTimer / 60)} min.
                </div>
              )}

              <Button type="submit" disabled={!canSubmit}
                className="w-full bg-cyan-600 hover:bg-cyan-700 text-white h-11 font-semibold">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Shield className="w-4 h-4 mr-2" />}
                {mode === 'login' ? 'Access JARVIS' : isRegister ? 'Create Account' : 'Reset Password'}
              </Button>

              <div className="text-center">
                {mode === 'login' ? (
                  <button type="button" onClick={() => switchMode('reset')}
                    className="text-[11px] text-slate-400 hover:text-cyan-400 font-mono transition-colors">
                    Forgot password?
                  </button>
                ) : (
                  <button type="button" onClick={() => switchMode('login')}
                    className="text-[11px] text-slate-400 hover:text-cyan-400 font-mono transition-colors">
                    ← Back to login
                  </button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-[10px] text-slate-500 font-mono">
          Private install • Invite code required to add accounts
        </p>
      </div>
    </div>
  )
}
