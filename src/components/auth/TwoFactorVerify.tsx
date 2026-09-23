import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Shield, AlertTriangle, Clock, Fingerprint } from 'lucide-react'

interface TwoFactorVerifyProps {
  username: string
  onSuccess: (token: string) => void
  onBack: () => void
}

export function TwoFactorVerify({ username, onSuccess, onBack }: TwoFactorVerifyProps) {
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [locked, setLocked] = useState(false)
  const [lockTimer, setLockTimer] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (locked && lockTimer > 0) {
      const i = setInterval(() => setLockTimer(p => { if (p <= 1) { setLocked(false); setAttempts(0); return 0 } return p - 1 }), 1000)
      return () => clearInterval(i)
    }
  }, [locked, lockTimer])

  const verify = async () => {
    if (token.length !== 6 || loading || locked) return
    setLoading(true)
    try {
      const res = await fetch('/api/auth/2fa/verify-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, token }),
      })
      const data = await res.json()
      if (!res.ok) {
        const a = attempts + 1
        setAttempts(a)
        if (a >= 5) { setLocked(true); setLockTimer(300); setError('Too many attempts. Locked 5 min.') }
        else setError(`Invalid code. ${5 - a} attempts left.`)
        setToken('')
        return
      }
      onSuccess(data.token)
    } catch (err: any) { setError(err.message || 'Failed'); setToken('') }
    finally { setLoading(false) }
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
            <div><p className="text-sm font-medium text-white">Second Factor Required</p><p className="text-xs text-slate-400">Code changes every 30 seconds</p></div>
          </div>
          <Input ref={inputRef} type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={token}
            onChange={e => { const v = e.target.value.replace(/\D/g, ''); setToken(v); if (v.length === 6) setTimeout(verify, 100) }}
            disabled={locked}
            className="text-center text-2xl tracking-[0.5em] font-mono bg-slate-900/50 border-slate-600/50 text-white h-14" />
          {error && <div className="flex items-center gap-2 text-red-400 text-xs mt-2"><AlertTriangle className="w-3 h-3" />{error}</div>}
          {locked && <div className="flex items-center gap-2 text-amber-400 text-xs mt-2"><Clock className="w-3 h-3" />Locked {Math.floor(lockTimer / 60)}:{String(lockTimer % 60).padStart(2, '0')}</div>}
        </CardContent>
      </Card>
      <Button onClick={verify} disabled={token.length !== 6 || loading || locked} className="w-full bg-cyan-600 hover:bg-cyan-700 text-white h-12">
        {loading ? 'Verifying...' : 'Verify Identity'}
      </Button>
      <Button onClick={onBack} variant="ghost" className="w-full text-slate-400">← Back to Login</Button>
    </div>
  )
}
