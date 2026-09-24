import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Shield, AlertTriangle, Clock, Fingerprint, LifeBuoy } from 'lucide-react'

interface TwoFactorVerifyProps {
  username: string
  /**
   * Short-lived token handed back by /auth/login. The server verifies the code
   * against this session — without it every code is rejected.
   */
  tempToken: string
  onSuccess: (token: string) => void
  onBack: () => void
  /** Called after 2FA is turned off via the recovery form. */
  onRecovered: (message: string) => void
}

export function TwoFactorVerify({ username, tempToken, onSuccess, onBack, onRecovered }: TwoFactorVerifyProps) {
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [locked, setLocked] = useState(false)
  const [lockTimer, setLockTimer] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const [showRecovery, setShowRecovery] = useState(false)
  const [recoveryPw, setRecoveryPw] = useState('')
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [recoveryError, setRecoveryError] = useState('')

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (locked && lockTimer > 0) {
      const i = setInterval(() => setLockTimer(p => { if (p <= 1) { setLocked(false); setAttempts(0); return 0 } return p - 1 }), 1000)
      return () => clearInterval(i)
    }
  }, [locked, lockTimer])

  // Accept the code explicitly: the auto-submit fires from inside onChange,
  // where the `token` state variable is still the previous render's value.
  const verify = async (codeOverride?: string) => {
    const value = (codeOverride ?? token).replace(/\D/g, '')
    if (value.length !== 6 || loading || locked) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/2fa/verify-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, token: value, tempToken }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = String(data?.error || '')
        // A dead verification session is NOT a wrong code — don't burn attempts
        // on it and don't pretend the code was incorrect.
        if (/session|expired/i.test(msg)) {
          setError('Your verification session expired. Go back and sign in again.')
          setToken('')
          return
        }
        const a = attempts + 1
        setAttempts(a)
        if (a >= 5) { setLocked(true); setLockTimer(300); setError('Too many attempts. Locked 5 min.') }
        else setError(`${msg || 'Invalid code'}. ${5 - a} attempt${5 - a === 1 ? '' : 's'} left.`)
        setToken('')
        return
      }
      if (!data?.token) throw new Error('Server returned no session token')
      onSuccess(data.token)
    } catch (err: any) {
      setError(err?.message || 'Verification failed')
      setToken('')
    } finally {
      setLoading(false)
    }
  }

  const disableTwoFactor = async () => {
    if (!recoveryPw || recoveryBusy) return
    setRecoveryBusy(true)
    setRecoveryError('')
    try {
      const res = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: recoveryPw }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
      setRecoveryPw('')
      onRecovered(data?.message || 'Two-factor authentication is off. Log in with your password.')
    } catch (err: any) {
      setRecoveryError(err?.message || 'Could not turn off 2FA')
    } finally {
      setRecoveryBusy(false)
    }
  }

  return (
    <div className="w-full max-w-sm space-y-4">
      <div className="text-center space-y-3">
        <div className="w-16 h-16 mx-auto rounded-full bg-cyan-500/10 flex items-center justify-center">
          <Fingerprint className="w-8 h-8 text-cyan-400" />
        </div>
        <h2 className="text-xl font-bold text-white">Identity Verification</h2>
        <p className="text-sm text-slate-400">Enter the 6-digit code from your authenticator app</p>
      </div>

      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Shield className="w-5 h-5 text-cyan-400" />
            <div>
              <p className="text-sm font-medium text-white">Second Factor Required</p>
              <p className="text-xs text-slate-400">Code changes every 30 seconds</p>
            </div>
          </div>
          <Input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={token}
            onChange={e => { const v = e.target.value.replace(/\D/g, ''); setToken(v); setError(''); if (v.length === 6) setTimeout(() => verify(v), 100) }}
            disabled={locked}
            className="text-center text-2xl tracking-[0.5em] font-mono bg-slate-900/50 border-slate-600/50 text-white h-14"
          />
          {error && (
            <div className="flex items-start gap-2 text-red-400 text-xs mt-2">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {locked && (
            <div className="flex items-center gap-2 text-amber-400 text-xs mt-2">
              <Clock className="w-3 h-3" />Locked {Math.floor(lockTimer / 60)}:{String(lockTimer % 60).padStart(2, '0')}
            </div>
          )}
        </CardContent>
      </Card>

      <Button onClick={() => verify()} disabled={token.length !== 6 || loading || locked} className="w-full bg-cyan-600 hover:bg-cyan-700 text-white h-12">
        {loading ? 'Verifying...' : 'Verify Identity'}
      </Button>
      <Button onClick={onBack} variant="ghost" className="w-full text-slate-400">← Back to Login</Button>

      {!showRecovery ? (
        <button
          type="button"
          onClick={() => setShowRecovery(true)}
          className="w-full text-[11px] text-slate-500 hover:text-cyan-400 font-mono transition-colors flex items-center justify-center gap-1.5"
        >
          <LifeBuoy className="w-3 h-3" /> Lost your authenticator? Turn 2FA off
        </button>
      ) : (
        <Card className="bg-slate-800/50 border-amber-500/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-2">
              <LifeBuoy className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">Turn off two-factor</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Confirm your account password. Your authenticator entry stops being required.
                </p>
              </div>
            </div>
            <Input
              type="password"
              value={recoveryPw}
              onChange={e => { setRecoveryPw(e.target.value); setRecoveryError('') }}
              onKeyDown={e => { if (e.key === 'Enter') disableTwoFactor() }}
              placeholder="Account password"
              autoComplete="current-password"
              className="bg-slate-900/50 border-slate-600/50 text-white font-mono"
            />
            {recoveryError && (
              <div className="flex items-start gap-2 text-red-400 text-xs">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                <span>{recoveryError}</span>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                onClick={disableTwoFactor}
                disabled={!recoveryPw || recoveryBusy}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white h-10"
              >
                {recoveryBusy ? 'Turning off...' : 'Turn off 2FA'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => { setShowRecovery(false); setRecoveryPw(''); setRecoveryError('') }}
                className="text-slate-400"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
