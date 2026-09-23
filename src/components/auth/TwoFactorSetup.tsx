import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Shield, Smartphone, Check, Eye, EyeOff, Copy, ArrowRight } from 'lucide-react'

interface TwoFactorSetupProps {
  username: string
  password: string
  onComplete: (token: string) => void
  onSkip: () => void
}

export function TwoFactorSetup({ username, password, onComplete, onSkip }: TwoFactorSetupProps) {
  const [step, setStep] = useState<'intro' | 'qr' | 'verify' | 'success'>('intro')
  const [secret, setSecret] = useState('')
  const [qrCodeData, setQrCodeData] = useState('')
  const [token, setToken] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const generateSecret = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/2fa/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSecret(data.secret)
      setQrCodeData(data.qrCodeUrl)
      setStep('qr')
    } catch (err: any) { setError(err.message) }
    finally { setLoading(false) }
  }

  const verifyToken = async () => {
    if (token.length !== 6) return
    setLoading(true)
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, token }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setStep('success')
      setTimeout(() => onComplete(token), 2000)
    } catch (err: any) { setError(err.message); setToken('') }
    finally { setLoading(false) }
  }

  const copySecret = () => { navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  if (step === 'intro') return (
    <div className="w-full max-w-sm space-y-4">
      <div className="text-center space-y-3">
        <div className="w-16 h-16 mx-auto rounded-full bg-cyan-500/10 flex items-center justify-center">
          <Shield className="w-8 h-8 text-cyan-400" />
        </div>
        <h2 className="text-xl font-bold text-white">Secure Your Account</h2>
        <p className="text-sm text-slate-400">Add two-factor authentication for maximum security. Use Google Authenticator or Authy.</p>
      </div>
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0"><Shield className="w-4 h-4 text-green-400" /></div>
            <div><p className="text-sm font-medium text-white">Protection Level: Maximum</p><p className="text-xs text-slate-400">Password + 2FA = virtually unhackable</p></div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0"><Smartphone className="w-4 h-4 text-blue-400" /></div>
            <div><p className="text-sm font-medium text-white">Works on Any Device</p><p className="text-xs text-slate-400">Phone, tablet, or computer</p></div>
          </div>
        </CardContent>
      </Card>
      <div className="flex gap-3">
        <Button onClick={onSkip} variant="outline" className="flex-1 border-slate-600 text-slate-400">Skip</Button>
        <Button onClick={generateSecret} disabled={loading} className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white">
          {loading ? 'Generating...' : 'Enable 2FA'} <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  )

  if (step === 'qr') return (
    <div className="w-full max-w-sm space-y-4">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold text-white">Scan QR Code</h2>
        <p className="text-sm text-slate-400">Open your authenticator app and scan this</p>
      </div>
      <div className="bg-white p-4 rounded-xl mx-auto w-fit">
        <img src={qrCodeData} alt="2FA QR Code" className="w-48 h-48" />
      </div>
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardContent className="p-3">
          <p className="text-xs text-slate-400 mb-2">Or enter manually:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-cyan-400 font-mono break-all bg-slate-900/50 p-2 rounded">{showSecret ? secret : '••••••••••••••••'}</code>
            <button onClick={() => setShowSecret(!showSecret)} className="text-slate-400 hover:text-white p-1">{showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
            <button onClick={copySecret} className="text-slate-400 hover:text-white p-1">{copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}</button>
          </div>
        </CardContent>
      </Card>
      <div className="space-y-2">
        <Input type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={token}
          onChange={e => { const v = e.target.value.replace(/\D/g, ''); setToken(v); if (v.length === 6) setTimeout(verifyToken, 100) }}
          className="text-center text-2xl tracking-[0.5em] font-mono bg-slate-800/50 border-slate-600/50 text-white h-14" />
        {error && <p className="text-red-400 text-xs text-center">{error}</p>}
      </div>
      <Button onClick={verifyToken} disabled={token.length !== 6 || loading} className="w-full bg-cyan-600 hover:bg-cyan-700 text-white">
        {loading ? 'Verifying...' : 'Verify & Enable'}
      </Button>
    </div>
  )

  if (step === 'success') return (
    <div className="text-center space-y-4 py-8">
      <div className="w-16 h-16 mx-auto rounded-full bg-green-500/20 flex items-center justify-center animate-pulse"><Check className="w-8 h-8 text-green-400" /></div>
      <h2 className="text-xl font-bold text-white">2FA Enabled!</h2>
      <p className="text-sm text-slate-400">Your account is maximally secured</p>
      <p className="text-xs text-slate-500">Redirecting...</p>
    </div>
  )

  return null
}
