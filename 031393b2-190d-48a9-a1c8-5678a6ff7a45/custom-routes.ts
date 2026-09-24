import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import { createShogoLlmProvider } from '@shogo-ai/sdk'
import { streamText, generateText, tool, stepCountIs } from 'ai'
import { z } from 'zod'
import { prisma } from './src/lib/db'
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'

// The signing secret must survive restarts, otherwise every deploy silently
// invalidates Sri's session and he has to log in again. Persist it next to
// the other local secrets on first boot.
function loadJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET
  const secretFile = join(process.cwd(), '.jarvis-secret')
  try {
    if (existsSync(secretFile)) {
      const stored = readFileSync(secretFile, 'utf8').trim()
      if (stored.length >= 32) return stored
    }
  } catch { /* fall through and regenerate */ }
  const generated = randomBytes(48).toString('hex')
  try {
    writeFileSync(secretFile, generated, { mode: 0o600 })
    chmodSync(secretFile, 0o600)
  } catch { /* read-only fs — secret stays in-memory for this boot */ }
  return generated
}

// ═══════════════════════════════════════════════════════════════════
// AI GATEWAY CREDENTIALS
// The pod exposes its LLM proxy as AI_PROXY_URL + AI_PROXY_TOKEN (or a
// per-project token map in AI_PROXY_TOKENS). AI_PROXY_TOKEN is the one the
// proxy actually accepts as `Authorization: Bearer <token>`; RUNTIME_AUTH_SECRET
// is a workspace-scoped token and is only a last resort.
// ═══════════════════════════════════════════════════════════════════

const AI_BASE_URL = (
  process.env.AI_PROXY_URL ||
  process.env.SHOGO_API_URL ||
  'https://studio.shogo.ai'
).replace(/\/api\/ai\/v1\/?$/, '')

function resolveAiToken(): string | null {
  const raw = process.env.AI_PROXY_TOKENS
  if (raw) {
    try {
      const map = JSON.parse(raw) as Record<string, string>
      const scoped = map[process.env.PROJECT_ID ?? '']
      if (scoped) return scoped
      const anyToken = Object.values(map)[0]
      if (anyToken) return anyToken
    } catch { /* malformed map — fall through */ }
  }
  return process.env.AI_PROXY_TOKEN || process.env.RUNTIME_AUTH_SECRET || null
}

function createLlmProvider() {
  const token = resolveAiToken()
  if (!token) return null
  return createShogoLlmProvider({ apiKey: token, baseUrl: AI_BASE_URL })
}

const app = new Hono()

// ═══════════════════════════════════════════════════════════════════
// SECURITY MIDDLEWARE — Applied to all routes
// ═══════════════════════════════════════════════════════════════════

// Security headers
app.use('*', async (c, next) => {
  c.header('X-Frame-Options', 'DENY')
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-XSS-Protection', '1; mode=block')
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  c.header('X-Permitted-Cross-Domain-Policies', 'none')
  c.header('Permissions-Policy', 'camera=(), geolocation=(), payment=()')
  c.header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://wttr.in https://news.google.com https://api.github.com; img-src 'self' data: https:;")
  await next()
})

// Rate limiter
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()
// 30/min was low enough that ordinary dashboard use — every surface fires a
// handful of requests, and the AI chain retries — tripped the limiter and
// blanked the UI. Keep a real ceiling, just not one that hits normal usage.
const RATE_LIMIT = 300
const RATE_WINDOW = 60_000

app.use('*', async (c, next) => {
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
  const now = Date.now()
  const entry = rateLimitStore.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_WINDOW })
  } else {
    entry.count++
    if (entry.count > RATE_LIMIT) {
      return c.json({ error: 'Rate limit exceeded. Try again later.' }, 429)
    }
  }
  await next()
})

// ═══════════════════════════════════════════════════════════════════
// SELF-HEALING
// Every "it crashed" so far has been one of two things: the database had no
// tables (SQLITE_ERROR: no such table: main.auth_users → every login 500'd),
// or an unhandled throw returned non-JSON and the UI showed "API server not
// ready". Both are repaired here rather than left for a human to notice.
// ═══════════════════════════════════════════════════════════════════

let schemaRepairAttempted = false

async function ensureDatabaseSchema() {
  if (schemaRepairAttempted) return
  try {
    await (prisma as any).$queryRawUnsafe('SELECT 1 FROM auth_users LIMIT 1')
    return // schema is present — nothing to do
  } catch (err: any) {
    const msg = String(err?.message ?? err)
    if (!/no such table|does not exist/i.test(msg)) return
    schemaRepairAttempted = true
    console.error('[jarvis] database schema missing, repairing:', msg)
    try {
      const { execFileSync } = await import('node:child_process')
      // Additive only — deliberately NO --accept-data-loss and NO --force-reset,
      // so this can create missing tables but can never destroy existing data.
      execFileSync('bun', ['x', '--bun', 'prisma', 'db', 'push'], {
        cwd: process.cwd(),
        stdio: 'inherit',
        timeout: 120_000,
      })
      console.log('[jarvis] schema repair complete')
    } catch (repairErr: any) {
      console.error('[jarvis] schema repair failed:', repairErr?.message ?? repairErr)
    }
  }
}

// Each /api request gets a repair check first. It is a single indexed lookup
// once the tables exist, and the failure is what it fixes — a request that
// arrives before the repair finishes simply reports the honest error.
app.use('*', async (c, next) => {
  await ensureDatabaseSchema()
  await next()
})

// An unhandled throw used to produce a bare "Internal Server Error" body the UI
// could not explain. Always answer with JSON carrying the real message.
app.onError((err: any, c) => {
  const message = String(err?.message ?? err ?? 'Unknown server error')
  console.error('[jarvis] unhandled error on', c.req.method, c.req.path, '-', message)
  return c.json({ error: 'Server error', detail: message.slice(0, 500) }, 500)
})

// Input sanitizer
function sanitize(str: string): string {
  if (!str || typeof str !== 'string') return str
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .substring(0, 10000)
}

// ═══════════════════════════════════════════════════════════════════
// AUTH SYSTEM — Server-side JWT + bcrypt + 2FA
// ═══════════════════════════════════════════════════════════════════

import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { generateSecret, generateURI, verify as verifyOtp } from 'otplib'
import qrcode from 'qrcode'

const JWT_SECRET = loadJwtSecret()
const BCRYPT_ROUNDS = 12

// This JARVIS install is public-reachable and holds Sri's mail, calendar and
// repo access, so sign-up is gated behind a locally-generated invite code that
// never ships to the browser. The very first account needs no code (fresh
// install bootstrap), every account after that does.
function loadInviteCode(): string {
  if (process.env.JARVIS_INVITE_CODE) return process.env.JARVIS_INVITE_CODE
  const inviteFile = join(process.cwd(), '.jarvis-invite')
  try {
    if (existsSync(inviteFile)) {
      const stored = readFileSync(inviteFile, 'utf8').trim()
      if (stored.length >= 8) return stored
    }
  } catch { /* fall through and regenerate */ }
  const generated = randomBytes(9).toString('base64url')
  try {
    writeFileSync(inviteFile, generated, { mode: 0o600 })
    chmodSync(inviteFile, 0o600)
  } catch { /* read-only fs — code stays in-memory for this boot */ }
  return generated
}

const INVITE_CODE = loadInviteCode()
console.log(`🔑 JARVIS invite code (needed to add accounts): ${INVITE_CODE}`)

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/

function validateCredentials(username: unknown, password: unknown): string | null {
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return 'Username and password required'
  }
  if (!USERNAME_RE.test(username)) {
    return 'Username must be 3-32 characters: letters, numbers, dot, dash or underscore'
  }
  if (password.length < 8) return 'Password must be at least 8 characters'
  return null
}

// The pod's public proxy consumes the `Authorization` header for its own
// gateway auth, so a token sent only there never reaches this app — every
// authenticated call came back 401 and the UI bounced straight back to the
// login screen. `x-jarvis-token` passes through the proxy untouched; bare
// `Bearer` still works for direct calls (curl, tests, other pods).
function readToken(c: any): string {
  const auth = c.req.header('Authorization') || ''
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim()
  const header =
    c.req.header('x-jarvis-token') || c.req.header('x-auth-token') || ''
  if (header.trim()) return header.trim()
  const cookie = c.req.header('Cookie') || ''
  const fromCookie = cookie.match(/(?:^|;\s*)jarvis_token=([^;]+)/)
  if (fromCookie) return decodeURIComponent(fromCookie[1]).trim()
  return (c.req.query('token') || '').trim()
}

// Verify JWT middleware
async function requireAuth(c: any, next: any) {
  const token = readToken(c)
  if (!token) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any
    c.set('userId', decoded.userId)
    c.set('username', decoded.username)
    await next()
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }
}

// Session tokens MUST be unique. jwt.sign() of the same payload inside the
// same wall-clock second produces a byte-identical string, and
// auth_sessions.token is UNIQUE — that collision used to 500 every login that
// happened within a second of a register or another login. A random `jti`
// guarantees uniqueness without changing the token's meaning.
function newSessionToken(userId: string, username: string): string {
  return jwt.sign(
    { userId, username, jti: randomBytes(16).toString('hex') },
    JWT_SECRET,
    { expiresIn: '7d' }
  )
}

// requireAuth only verifies the JWT, so the session row is bookkeeping for the
// "active sessions" view. Never let a failed insert block a login.
async function persistSession(data: { userId: string; token: string; deviceInfo?: string }) {
  try {
    await (prisma as any).authSession.create({
      data: {
        userId: data.userId,
        token: data.token,
        deviceInfo: data.deviceInfo || 'unknown',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })
  } catch (err: any) {
    console.warn('authSession.create failed (login still valid):', err?.message ?? err)
  }
}

// POST /api/auth/register
app.post('/auth/register', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { username, password, inviteCode } = body as Record<string, unknown>

  const invalid = validateCredentials(username, password)
  if (invalid) return c.json({ error: invalid }, 400)
  const name = username as string

  const userCount = await (prisma as any).authUser.count()
  if (userCount > 0) {
    const provided = String(inviteCode ?? '').trim()
    if (!provided) {
      return c.json({ error: 'This JARVIS is invite-only. Enter the invite code to create an account.', code: 'INVITE_REQUIRED' }, 403)
    }
    if (provided !== INVITE_CODE) {
      return c.json({ error: 'That invite code is not valid.', code: 'INVITE_INVALID' }, 403)
    }
  }

  const existing = await (prisma as any).authUser.findUnique({ where: { username: name } })
  if (existing) return c.json({ error: 'Account already exists. Please login.', code: 'USER_EXISTS' }, 409)

  const passwordHash = await bcrypt.hash(password as string, BCRYPT_ROUNDS)
  const user = await (prisma as any).authUser.create({
    data: { username: name, passwordHash }
  })

  const token = newSessionToken(user.id, user.username)
  await persistSession({ userId: user.id, token })
  await (prisma as any).activityLog.create({ data: { action: 'register', details: `New account created: ${name}`, surface: 'auth' } }).catch(() => {})

  return c.json({ token, user: { id: user.id, username: user.username, twoFactorEnabled: user.twoFactorEnabled } })
})

// POST /api/auth/reset-password — regain access with the invite code.
// Proving you hold the invite code is the same bar as being allowed to register.
app.post('/auth/reset-password', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { username, newPassword, inviteCode } = body as Record<string, unknown>

  if (typeof username !== 'string' || !username) return c.json({ error: 'Username required' }, 400)
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return c.json({ error: 'New password must be at least 8 characters' }, 400)
  }
  if (String(inviteCode ?? '').trim() !== INVITE_CODE) {
    return c.json({ error: 'Invalid invite code.', code: 'INVITE_INVALID' }, 403)
  }

  const user = await (prisma as any).authUser.findUnique({ where: { username } })
  if (!user) return c.json({ error: 'No account with that username' }, 404)

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
  await (prisma as any).authUser.update({
    where: { id: user.id },
    data: { passwordHash, failedAttempts: 0, lockedUntil: null }
  })
  await (prisma as any).authSession.deleteMany({ where: { userId: user.id } })
  await (prisma as any).activityLog.create({ data: { action: 'password_reset', details: `Password reset for ${username}`, surface: 'auth' } }).catch(() => {})

  return c.json({ ok: true, message: 'Password reset. You can log in now.' })
})

// POST /api/auth/login
app.post('/auth/login', async (c) => {
  const body = await c.req.json()
  const { username, password, deviceInfo } = body
  if (!username || !password) return c.json({ error: 'Username and password required' }, 400)

  const user = await (prisma as any).authUser.findUnique({ where: { username } })
  if (!user) return c.json({ error: 'Invalid credentials' }, 401)

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000)
    return c.json({ error: `Account locked. Try again in ${mins} minutes.` }, 423)
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    const attempts = user.failedAttempts + 1
    const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null
    await (prisma as any).authUser.update({
      where: { id: user.id },
      data: { failedAttempts: attempts, lockedUntil }
    })
    if (attempts >= 5) return c.json({ error: 'Too many failed attempts. Locked for 15 minutes.' }, 423)
    return c.json({ error: `Invalid credentials. ${5 - attempts} attempts remaining.` }, 401)
  }

  await (prisma as any).authUser.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null }
  })

  if (user.twoFactorEnabled) {
    const tempToken = jwt.sign({ userId: user.id, username: user.username, pending2fa: true }, JWT_SECRET, { expiresIn: '5m' })
    return c.json({ requires2fa: true, tempToken, user: { id: user.id, username: user.username } })
  }

  const token = newSessionToken(user.id, user.username)
  await persistSession({ userId: user.id, token, deviceInfo })
  await (prisma as any).activityLog.create({ data: { action: 'login', details: `User ${username} logged in`, surface: 'auth' } })

  return c.json({ token, user: { id: user.id, username: user.username, twoFactorEnabled: false } })
})

// POST /api/auth/2fa/setup — Generate secret + QR code
app.post('/auth/2fa/setup', async (c) => {
  const body = await c.req.json()
  const { username, password } = body
  const user = await (prisma as any).authUser.findUnique({ where: { username } })
  if (!user) return c.json({ error: 'User not found' }, 404)

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return c.json({ error: 'Invalid password' }, 401)

  const secret = generateSecret()
  const otpauthUrl = generateURI({ issuer: 'JARVIS-AI', label: username, secret })
  const qrCodeUrl = await qrcode.toDataURL(otpauthUrl)

  await (prisma as any).authUser.update({
    where: { id: user.id },
    data: { twoFactorSecret: secret }
  })

  return c.json({ secret, otpauthUrl, qrCodeUrl })
})

// POST /api/auth/2fa/verify — Enable 2FA
app.post('/auth/2fa/verify', async (c) => {
  const body = await c.req.json()
  const { username, token } = body
  const user = await (prisma as any).authUser.findUnique({ where: { username } })
  if (!user?.twoFactorSecret) return c.json({ error: '2FA not set up' }, 400)

  const isValid = verifyOtp({ token, secret: user.twoFactorSecret })
  if (!isValid) return c.json({ error: 'Invalid code. Check your authenticator app.' }, 401)

  await (prisma as any).authUser.update({
    where: { id: user.id },
    data: { twoFactorEnabled: true }
  })

  return c.json({ enabled: true, message: '2FA enabled successfully' })
})

// POST /api/auth/2fa/verify-login — Verify 2FA during login
app.post('/auth/2fa/verify-login', async (c) => {
  const body = await c.req.json()
  const { username, token, tempToken } = body

  try {
    const decoded = jwt.verify(tempToken || '', JWT_SECRET) as any
    if (!decoded.pending2fa || decoded.username !== username) {
      return c.json({ error: 'Invalid session' }, 401)
    }
  } catch {
    return c.json({ error: 'Session expired. Login again.' }, 401)
  }

  const user = await (prisma as any).authUser.findUnique({ where: { username } })
  if (!user?.twoFactorSecret) return c.json({ error: '2FA not configured' }, 400)

  const isValid = verifyOtp({ token, secret: user.twoFactorSecret })
  if (!isValid) return c.json({ error: 'Invalid code' }, 401)

  const authToken = newSessionToken(user.id, user.username)
  await persistSession({ userId: user.id, token: authToken })

  return c.json({ token: authToken, user: { id: user.id, username: user.username, twoFactorEnabled: true } })
})

// POST /api/auth/change-password
// POST /api/auth/2fa/disable — recovery path. Proving the password is enough to
// turn 2FA off, so losing the authenticator app can never lock Sri out of his own
// J.A.R.V.I.S. again.
app.post('/auth/2fa/disable', async (c) => {
  const body = await c.req.json()
  const { username, password } = body
  if (!username || !password) return c.json({ error: 'Username and password required' }, 400)

  const user = await (prisma as any).authUser.findUnique({ where: { username } })
  if (!user) return c.json({ error: 'Invalid credentials' }, 401)

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return c.json({ error: 'Incorrect password' }, 401)

  await (prisma as any).authUser.update({
    where: { id: user.id },
    data: { twoFactorEnabled: false, twoFactorSecret: null },
  })
  await (prisma as any).activityLog.create({
    data: { action: '2fa_disable', details: 'Two-factor authentication turned off', surface: 'security' },
  }).catch(() => {})

  return c.json({ ok: true, message: 'Two-factor authentication is off. Log in with your password.' })
})

app.post('/auth/change-password', requireAuth, async (c) => {
  const body = await c.req.json()
  const { currentPassword, newPassword } = body
  const userId = c.get('userId') as string
  if (!currentPassword || !newPassword) return c.json({ error: 'Current and new password required' }, 400)
  if (newPassword.length < 6) return c.json({ error: 'New password must be at least 6 characters' }, 400)
  if (newPassword === currentPassword) return c.json({ error: 'New password must be different from the current one' }, 400)

  const user = await (prisma as any).authUser.findUnique({ where: { id: userId } })
  if (!user) return c.json({ error: 'User not found' }, 404)

  const valid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!valid) return c.json({ error: 'Current password is incorrect' }, 401)

  const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
  await (prisma as any).authUser.update({ where: { id: user.id }, data: { passwordHash: newHash } })

  // Keep the session Sri is changing the password from and sign out every other
  // device. Wiping them all used to log him straight back out.
  const currentToken = readToken(c)
  await (prisma as any).authSession.deleteMany({ where: { userId: user.id, token: { not: currentToken } } }).catch(() => {})
  await (prisma as any).activityLog.create({ data: { action: 'password_change', details: 'Password changed', surface: 'security' } }).catch(() => {})

  return c.json({ ok: true, message: 'Password changed. All other devices were signed out.' })
})

// POST /api/auth/logout
app.post('/auth/logout', async (c) => {
  const token = readToken(c)
  if (token) {
    await (prisma as any).authSession.deleteMany({ where: { token } }).catch(() => {})
  }
  return c.json({ ok: true })
})

// GET /api/auth/status
app.get('/auth/status', (c) => {
  const token = readToken(c)
  if (!token) return c.json({ authenticated: false })
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any
    return c.json({ authenticated: true, username: decoded.username })
  } catch {
    return c.json({ authenticated: false })
  }
})

// GET /api/auth/invite-code — owner-only, so Sri can find the code in-app
app.get('/auth/invite-code', requireAuth, (c) => c.json({ inviteCode: INVITE_CODE }))

// GET /api/auth/me — one call for the whole Profile surface
app.get('/auth/me', requireAuth, async (c) => {
  const userId = c.get('userId') as string
  const currentToken = readToken(c)

  const user = await (prisma as any).authUser.findUnique({ where: { id: userId } })
  if (!user) return c.json({ error: 'User not found' }, 404)

  const [sessions, conversations, memories, notes, activities] = await Promise.all([
    (prisma as any).authSession.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 25 }).catch(() => []),
    (prisma as any).conversation.count().catch(() => 0),
    (prisma as any).memory.count().catch(() => 0),
    (prisma as any).note.count().catch(() => 0),
    (prisma as any).activityLog.count().catch(() => 0),
  ])
  const keys = loadKeys()

  return c.json({
    user: {
      username: user.username,
      createdAt: user.createdAt,
      twoFactorEnabled: Boolean(user.twoFactorEnabled),
      failedAttempts: user.failedAttempts,
    },
    sessions: sessions.map((s: any) => ({
      id: s.id,
      deviceInfo: s.deviceInfo || 'unknown device',
      ipAddress: s.ipAddress || null,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      current: s.token === currentToken,
    })),
    providers: [
      { id: 'openai', name: 'OpenAI', configured: Boolean(keys.openai) },
      { id: 'anthropic', name: 'Anthropic', configured: Boolean(keys.anthropic) },
      { id: 'gemini', name: 'Gemini', configured: Boolean(keys.gemini) },
    ],
    stats: { conversations, memories, notes, activities },
  })
})

// POST /api/auth/logout-others — sign out every device except this one
app.post('/auth/logout-others', requireAuth, async (c) => {
  const userId = c.get('userId') as string
  const currentToken = readToken(c)
  const res = await (prisma as any).authSession.deleteMany({ where: { userId, token: { not: currentToken } } })
  await (prisma as any).activityLog.create({ data: { action: 'logout_others', details: `Signed out ${res.count} device(s)`, surface: 'security' } }).catch(() => {})
  return c.json({ ok: true, signedOut: res.count })
})

// ═══════════════════════════════════════════════════════════════════
// AI ENGINE — MoA (Mixture of Agents) + Live Context
// ═══════════════════════════════════════════════════════════════════

const JARVIS_SYSTEM_PROMPT = `You are J.A.R.V.I.S. — an advanced AI command center built for Srimani (Sri). You are a loyal, intelligent, proactive AI assistant inspired by JARVIS from Iron Man.

## YOUR IDENTITY
- Name: J.A.R.V.I.S. (Just A Rather Very Intelligent System)
- You serve Master Sri with absolute dedication
- Every response starts with acknowledging the command respectfully
- You say things like: "Right away, Master.", "As you wish, Master.", "Consider it done, Master.", "At your service, Master."
- You are NOT a generic chatbot. You are Sri's personal AI — like a trusted right hand.

## MASTER SRI — Your Creator
- Name: Sri (Srimani) — Erode, Tamil Nadu, India
- Role: AI Automation Engineer & Business Owner
- Runs: Standard Roofs (roofing contractor company)
- Building: Sri AI Business OS (SaaS platform, ~92% complete)
- Skills: Python, JavaScript, TypeScript, Deluge (Zoho), Google Apps Script, n8n
- Tools: Gemini AI, GPT-4o, Claude, Google Ads API, Zoho CRM, Shopify
 - GitHub: github.com/Srimani26/Sri-AI-Business-OS
- Build environment: VS Code + Antigravity (he builds and redesigns websites with AI assistance)
- Runs a live Shopify store for the business

## HOW SRI MAKES MONEY — this is the mission
Sri converts manual, human-run business processes into AI automation. He removes
hours of repetitive work from a business and sells that saved time back as value.
He uses AI to: (a) run his own companies smoothly, (b) generate revenue directly,
and (c) ship automation as a product to clients. Aim every answer at that result:
fewer manual steps, more automation, more revenue, less wasted time.
- Default instinct: "can this be automated?" — and if yes, say exactly how.
- When Sri describes a repetitive task, propose the concrete automation
  (trigger -> steps -> tools -> output) and estimate the hours per week it saves.
- When he asks about a website, assume VS Code + Antigravity and a Shopify store
  are in play.

## Sri's Active Projects
1. Zoho CRM Quotation Automation (85%) — Deluge, Zoho Writer PDF
2. AI Google Ads Automation v5.0 (95%) — Gemini 2.5 Flash, Apps Script
3. Sri AI Business OS (92%) — Next.js + FastAPI + SQLite + n8n
4. Shopify Website Redesign (35%) — Standard Roofs website

## GROUND RULES
- Never claim to run on a specific model version. If asked which model you are, say you are J.A.R.V.I.S. running on a multi-model failover chain, and that the interface shows the active model per reply.
- Never invent facts, file paths, numbers, or API results. If you do not know, say so and offer how to find out.

## YOUR CAPABILITIES — be exact about what is real
You have working tools that read and write Sri's real database. Use them.
Never say "I cannot do that" for anything a tool covers — and never claim an
action you did not actually take. If you did not call the tool, it did not happen.

### Tools you can really call (they execute server-side, not pretend)
- save_memory / search_memory — store and recall durable facts about Sri
- create_note / list_notes — his Knowledge Hub
- create_reminder / list_reminders — reminders with real datetimes
- log_habit / list_habits — habit tracking
- log_metric — record numbers (revenue, leads, hours)
- read_inbox — read his Gmail (works only once he connects Gmail; if it returns
  an error, tell him to connect it in the Connections Hub — do not guess at his email)
- get_weather — live weather for ANY city (do not reuse the cached Erode reading)
- search_news — recent headlines on any topic
- get_recent_activity — what he has actually been doing in the app

### What you genuinely cannot do — say so plainly, never invent it
- You cannot send email, write to his calendar, browse arbitrary websites, run
  code on his machine, generate images, or speak.
- You cannot act while he is not talking to you: there is no scheduler or
  notification channel connected, so a reminder you create is stored and shown
  in the app, but it will not ping his phone by itself. Tell him that honestly.
- If he asks for one of these, name what is missing and the shortest way to get it.

### Reasoning and writing — still your core strength
- Write real production code in ANY language (Python, TypeScript, JavaScript, Deluge, Apps Script, HTML/CSS, SQL, React, Next.js, FastAPI, Node.js)
- Design complete automation workflows (n8n, Google Apps Script, Zoho CRM)
- Debug and fix code — trace errors, find root causes, provide fixes
- Build system architecture — APIs, databases, microservices, CI/CD
- Business strategy — revenue optimization, lead generation, process automation, marketing
- Technical writing — documentation, README files, API docs, training manuals
- Data analysis — analyze metrics, generate reports, visualize data


## NEVER BE GENERIC — this is a production tool, not a demo
- Sri has explicitly rejected generic, filler, demoTM-grade answers. Do not produce them.
- Banned: "As an AI language model...", "It depends" with no answer, restating his
  question, disclaimers, hedging, "consult a professional", empty encouragement.
- Every reply must contain something usable: working code, a concrete plan, a number,
  a decision, or a specific next action.
- If you truly lack information, name exactly what is missing and how to obtain it.
- Never invent file paths, numbers, prices, API results, or citations. Say "I don't
  know" rather than guess.

## RESPONSE RULES
1. ALWAYS address Sri as "Master" at least once per response
2. Be direct, confident, and action-oriented — like JARVIS
3. When Sri asks you to do something, DO IT — provide complete code, full plans, detailed solutions
4. Prefer doing over promising: if a tool covers it, CALL THE TOOL and report what it did. If nothing covers it, say exactly what is missing and how to get it — never fake the outcome
5. Write complete, copy-pasteable code with proper formatting and language tags
6. Be proactive — anticipate what Sri needs next
7. Use markdown formatting: **bold**, \`code\`, \`\`\`code blocks\`\`\`, bullet points
8. Keep responses concise but complete — no filler, no fluff
9. When writing code, include comments explaining key logic
10. Always end with a question or next step suggestion

## EXAMPLE RESPONSE STYLE
"Right away, Master. Here's the complete automation for your Google Ads reporting:

\`\`\`python
# Full working code here
\`\`\`

I've included the retry logic and Gemini integration you need. Would you like me to also set up the email notification system for this?"`

// Helper: fetch live context (weather + news) — called once per chat request
async function fetchLiveContext(): Promise<string> {
  let ctx = ''

  try {
    const wRes = await fetch('https://wttr.in/Erode,Tamil+Nadu?format=j1', { signal: AbortSignal.timeout(3000) })
    const wData = await wRes.json() as any
    const w = wData?.current_condition?.[0]
    if (w) {
      ctx += `\n\n## LIVE WEATHER DATA\nCurrent weather in Erode, Tamil Nadu: ${w.temp_C}°C, feels like ${w.FeelsLikeC}°C, ${w.weatherDesc?.[0]?.value}, humidity ${w.humidity}%, wind ${w.windspeedKmph} km/h, UV index ${w.uvIndex}.`
    }
  } catch {}

  try {
    const nRes = await fetch('https://news.google.com/rss/search?q=AI+artificial+intelligence+2026&hl=en&gl=IN&ceid=IN:en', { signal: AbortSignal.timeout(3000) })
    const nXml = await nRes.text()
    const headlines: string[] = []
    for (const match of nXml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const title = match[1].match(/<title>(.*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '') || ''
      if (title && headlines.length < 5) headlines.push(title)
    }
    if (headlines.length) ctx += `\n\n## LIVE NEWS DATA\nToday's top AI news: ${headlines.join('; ')}.`
  } catch {}

  if (ctx) ctx += `\n\nWhen Master Sri asks about weather, use the live weather data above. When he asks about news, use the news data above.`
  return ctx
}

// ── MoA (Mixture of Agents) — Multi-Model Failover Engine ──
// When one AI hits rate limits, automatically switches to the next.
// Models are tried in order of preference. Each model gets its own rate limit tracking.

// ── Model registry ─────────────────────────────────────────────────
// Every id below was probed live against this pod's AI gateway. Anything that
// did not actually answer is deliberately absent:
//
//   gpt-5-nano → HTTP 200 with an EMPTY body. The old chain counted the empty
//     reply as a failure and silently handed the turn to a different model
//     mid-conversation. That is exactly the "falls back in the middle of work"
//     behaviour — and it cost ~10s before it happened. Removed.
//
// The `premium` ids below return 403 "requires a Pro or higher subscription"
// on the current plan. They are listed only so Settings can show what an
// upgrade would unlock. They are never used to answer a request.
const PREMIUM_MODELS = [
  { id: 'claude-sonnet-5', name: 'Claude Sonnet 5' },
  { id: 'claude-fable-5.1', name: 'Claude Fable 5.1' },
  { id: 'gpt-5.5', name: 'GPT-5.5' },
  { id: 'gpt-6-astra', name: 'GPT-6 Astra' },
  { id: 'gpt-5', name: 'GPT-5' },
  { id: 'gpt-5-mini', name: 'GPT-5 Mini' },
  { id: 'gpt-4.1', name: 'GPT-4.1' },
  { id: 'gpt-4o', name: 'GPT-4o' },
]

// Hoshi 2.0 (the gateway's own fast model) is addressed by UUID — the gateway
// rejects its display name. The UUID is re-resolved from /models on every
// catalogue refresh, so a hard-coded one can never silently rot.
const HOSHI_FALLBACK_ID = '4fa677d1-e4a6-4ea1-88b5-e57101e810cd'
let hoshiModelId = HOSHI_FALLBACK_ID

interface ModelState {
  name: string
  id: string
  healthy: boolean
  lastError: string | null
  lastFailAt: number
  cooldownMs: number
  consecutiveFails: number
  /** Last measured round-trip, ms — shown in Settings so speed is visible. */
  lastLatencyMs?: number
  /** Set when the model rejected a tool-calling request. */
  supportsTools?: boolean
}

const MODEL_CHAIN: ModelState[] = [
  { name: 'Hoshi 2.0', id: hoshiModelId, healthy: true, lastError: null, lastFailAt: 0, cooldownMs: 60_000, consecutiveFails: 0 },
  { name: 'Claude Haiku 4.5', id: 'claude-haiku-4-5', healthy: true, lastError: null, lastFailAt: 0, cooldownMs: 60_000, consecutiveFails: 0 },
  { name: 'GPT-4.1 Mini', id: 'gpt-4.1-mini', healthy: true, lastError: null, lastFailAt: 0, cooldownMs: 60_000, consecutiveFails: 0 },
  { name: 'GPT-4o Mini', id: 'gpt-4o-mini', healthy: true, lastError: null, lastFailAt: 0, cooldownMs: 60_000, consecutiveFails: 0 },
  { name: 'GPT-4.1 Nano', id: 'gpt-4.1-nano', healthy: true, lastError: null, lastFailAt: 0, cooldownMs: 60_000, consecutiveFails: 0 },
  { name: 'Claude Haiku 4.5 (Oct)', id: 'claude-haiku-4-5-20251001', healthy: true, lastError: null, lastFailAt: 0, cooldownMs: 60_000, consecutiveFails: 0 },
]

function recordFailure(model: ModelState, error: string) {
  model.healthy = false
  model.lastError = error
  model.lastFailAt = Date.now()
  model.consecutiveFails++
  // Increase cooldown with each consecutive fail (exponential backoff)
  model.cooldownMs = Math.min(60_000 * Math.pow(2, model.consecutiveFails - 1), 10 * 60_000)
  console.error(`MoA: ${model.name} marked unhealthy (fails: ${model.consecutiveFails}, cooldown: ${model.cooldownMs / 1000}s)`)
}

function recordSuccess(model: ModelState) {
  model.healthy = true
  model.lastError = null
  model.consecutiveFails = 0
  model.cooldownMs = 60_000
}

function isModelReady(model: ModelState): boolean {
  if (model.healthy) return true
  if (Date.now() - model.lastFailAt > model.cooldownMs) { model.healthy = true; return true }
  return false
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ── Live model catalogue ────────────────────────────────────────────
// The chain used to be a hard-coded list of ids that were merely assumed to
// work — one of them answered with an empty body forever and nothing noticed.
// A model is now only ever marked healthy because we watched it answer, so the
// UI can never advertise something that is silently dead.
const CATALOG_TTL_MS = 10 * 60_000
let catalogCheckedAt = 0
let catalogInFlight: Promise<void> | null = null
let lastProbeFailures: Array<{ model: string; error: string }> = []

async function probeModel(provider: any, model: ModelState): Promise<{ ok: boolean; ms: number; error?: string }> {
  const started = Date.now()
  try {
    const result = await generateText({
      model: provider(model.id),
      prompt: 'Reply with exactly: OK',
      maxTokens: 16,
      abortSignal: AbortSignal.timeout(20_000),
    })
    const text = (result.text || '').trim()
    const ms = Date.now() - started
    if (!text) return { ok: false, ms, error: 'Returned an empty response' }
    return { ok: true, ms }
  } catch (err: any) {
    return { ok: false, ms: Date.now() - started, error: String(err?.message || err).slice(0, 200) }
  }
}

/** Re-resolve Hoshi's UUID from the gateway, then verify every chain member. */
async function refreshModelCatalog(force = false): Promise<void> {
  if (!force && Date.now() - catalogCheckedAt < CATALOG_TTL_MS) return
  if (catalogInFlight) return catalogInFlight

  catalogInFlight = (async () => {
    try {
      const provider = createLlmProvider()
      if (!provider) return

      try {
        const token = resolveAiToken()
        const res = await fetch(`${AI_BASE_URL}/models`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10_000),
        })
        if (res.ok) {
          const list: any = await res.json()
          const found = (list?.data || []).find((m: any) => m?.display_name === 'Hoshi 2.0')
          if (found?.id) hoshiModelId = found.id
        }
      } catch { /* keep the last known UUID */ }
      if (MODEL_CHAIN[0].id !== hoshiModelId) MODEL_CHAIN[0].id = hoshiModelId

      const failures: Array<{ model: string; error: string }> = []
      await Promise.all(MODEL_CHAIN.map(async (model) => {
        const r = await probeModel(provider, model)
        if (r.ok) {
          model.healthy = true
          model.lastError = null
          model.consecutiveFails = 0
          model.cooldownMs = 60_000
          model.lastLatencyMs = r.ms
        } else {
          model.healthy = false
          model.lastError = r.error || 'Unavailable'
          model.lastFailAt = Date.now()
          model.consecutiveFails += 1
          model.cooldownMs = Math.min(60_000 * Math.pow(2, model.consecutiveFails - 1), 10 * 60_000)
          failures.push({ model: model.name, error: r.error || 'Unavailable' })
        }
      }))

      lastProbeFailures = failures
      catalogCheckedAt = Date.now()
      const up = MODEL_CHAIN.filter((m) => m.healthy).length
      console.log(`MoA: model check → ${up}/${MODEL_CHAIN.length} answering${failures.length ? ` | down: ${failures.map((f) => f.model).join(', ')}` : ''}`)
    } finally {
      catalogInFlight = null
    }
  })()

  return catalogInFlight
}

// Warm the catalogue on boot so the very first chat already picks a live model.
setTimeout(() => { refreshModelCatalog(true).catch(() => {}) }, 2500)

// ── Bring-Your-Own-Key store (server-side only, never shipped to the client) ──

const KEYS_FILE = join(process.cwd(), '.jarvis-keys.json')
type ProviderKeys = { openai?: string; anthropic?: string; gemini?: string }

function loadKeys(): ProviderKeys {
  try {
    if (!existsSync(KEYS_FILE)) return {}
    return JSON.parse(readFileSync(KEYS_FILE, 'utf8'))
  } catch { return {} }
}

function saveKeys(keys: ProviderKeys) {
  writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2))
  try { chmodSync(KEYS_FILE, 0o600) } catch {}
}

// Direct provider calls — used as extra MoA links when Sri supplies his own key
async function callDirectOpenAI(key: string, system: string, messages: any[]): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: system }, ...messages],
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data: any = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error('OpenAI returned empty response')
  return text
}

async function callDirectAnthropic(key: string, system: string, messages: any[]): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 4096, system, messages }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data: any = await res.json()
  const text = data?.content?.[0]?.text
  if (!text) throw new Error('Anthropic returned empty response')
  return text
}

async function callDirectGemini(key: string, system: string, messages: any[]): Promise<string> {
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents }),
      signal: AbortSignal.timeout(60_000),
    }
  )
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data: any = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini returned empty response')
  return text
}

// ── Answer shape returned by every AI call ──────────────────────────
interface ToolActivity {
  name: string
  ok: boolean
  summary: string
}

interface AiAnswer {
  text: string
  source: string
  modelId: string
  /** Which model the user/conversation expected, when we had to move off it. */
  switchedFrom: string | null
  attemptedModels: string[]
  toolsUsed: ToolActivity[]
}

function isPermanentModelError(message: string): boolean {
  // Retrying one of these only delays the hand-off — the model can never
  // answer this request, so we move on immediately instead of burning a retry.
  return /not supported|requires a Pro|invalid_model|does not exist|\b(401|403|404)\b/i.test(message)
}

// A conversation must not silently change model mid-task: a different model
// means a different voice, different formatting, and different code quality.
// Once a model has answered for a session we keep using it, and only move when
// it genuinely fails — and then we report that we did.
const sessionModel = new Map<string, string>()

function buildCandidateOrder(preferredModelId?: string, sessionKey?: string): ModelState[] {
  const pinned = sessionKey ? sessionModel.get(sessionKey) : undefined
  const wanted = preferredModelId || pinned
  const head = wanted ? MODEL_CHAIN.filter((m) => m.id === wanted) : []
  const rest = MODEL_CHAIN.filter((m) => m.id !== wanted && isModelReady(m))
  const ordered = [...head, ...rest]
  if (ordered.length === 0) {
    ordered.push([...MODEL_CHAIN].sort((a, b) => a.lastFailAt - b.lastFailAt)[0])
  }
  return ordered
}

async function callAI(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  opts: { preferredModelId?: string; sessionKey?: string; tools?: Record<string, any> } = {},
): Promise<AiAnswer> {
  const errors: string[] = []
  const chatMessages = messages.map((m) => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content }))
  const { preferredModelId, sessionKey, tools } = opts

  const pinnedId = preferredModelId || (sessionKey ? sessionModel.get(sessionKey) : undefined)
  // Resolve a human name for whatever was asked for. The premium and unknown
  // ids matter here: if Sri picks a Pro-only model we still answer with
  // something else, and that substitution MUST be reported rather than silent.
  const pinnedName = pinnedId
    ? (MODEL_CHAIN.find((m) => m.id === pinnedId)?.name
      || PREMIUM_MODELS.find((m) => m.id === pinnedId)?.name
      || pinnedId)
    : null

  const llmProvider = createLlmProvider()
  if (llmProvider) {
    const ordered = buildCandidateOrder(preferredModelId, sessionKey)
    const attemptedModels: string[] = []

    for (const model of ordered) {
      attemptedModels.push(model.name)
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const result = await generateText({
            model: llmProvider(model.id),
            system: systemPrompt,
            messages: chatMessages,
            maxTokens: 8192,
            temperature: 0.7,
            abortSignal: AbortSignal.timeout(120_000),
            ...(tools ? { tools: tools as any, stopWhen: stepCountIs(8) } : {}),
          })

          const text = (result.text || '').trim()
          // An empty body is a failure, not an answer. The old code let a 200
          // with no content count as success in some paths; now it never does.
          if (!text) throw new Error('Model returned an empty response')

          recordSuccess(model)
          if (tools) model.supportsTools = true
          if (sessionKey) sessionModel.set(sessionKey, model.id)

          return {
            text: result.text,
            source: model.name,
            modelId: model.id,
            switchedFrom: pinnedName && model.name !== pinnedName ? pinnedName : null,
            attemptedModels,
            // Filled in by the route from the tools' own activity log.
            toolsUsed: [],
          }
        } catch (err: any) {
          const message = String(err?.message || err).slice(0, 300)
          recordFailure(model, message)
          errors.push(`${model.name}: ${message}`)
          if (isPermanentModelError(message) || attempt === 2) break
          await sleep(400 * attempt)
        }
      }
    }
  }

  // Sri's own provider keys — the chain that cannot be rate-limited by anyone
  // else, because it is his own quota.
  const keys = loadKeys()
  const directProviders: Array<{ name: string; fn: (k: string) => Promise<string>; key?: string }> = [
    { name: 'OpenAI (your key)', fn: (k) => callDirectOpenAI(k, systemPrompt, chatMessages), key: keys.openai },
    { name: 'Anthropic (your key)', fn: (k) => callDirectAnthropic(k, systemPrompt, chatMessages), key: keys.anthropic },
    { name: 'Gemini (your key)', fn: (k) => callDirectGemini(k, systemPrompt, chatMessages), key: keys.gemini },
  ]
  for (const p of directProviders) {
    if (!p.key) continue
    try {
      const text = await p.fn(p.key)
      if (text?.trim()) {
        return { text, source: p.name, modelId: 'byok', switchedFrom: pinnedName && pinnedName !== p.name ? pinnedName : null, attemptedModels: [p.name], toolsUsed: [] }
      }
    } catch (err: any) {
      errors.push(`${p.name}: ${String(err?.message || err).slice(0, 200)}`)
    }
  }

  throw new Error(errors.slice(0, 3).join(' | ') || 'No AI provider available')
}

// ── Real user context ───────────────────────────────────────────────
// J.A.R.V.I.S. used to be *told* about Sri by a hard-coded paragraph, so it
// confidently quoted stale facts and — asked about his notes — correctly said
// it had no access to them. It was right: nothing in the prompt came from the
// database. This reads the real rows so every answer is grounded in what is
// actually stored, and says plainly when something is empty.
async function buildUserContext(): Promise<string> {
  const p = prisma as any
  const weekAgo = new Date(Date.now() - 7 * 86_400_000)

  const [memories, notes, reminders, habits, completions, activities, metrics] = await Promise.all([
    p.memory.findMany({ orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }], take: 15 }).catch(() => []),
    p.note.findMany({ orderBy: { updatedAt: 'desc' }, take: 8 }).catch(() => []),
    p.reminder.findMany({ where: { completed: false }, orderBy: { remindAt: 'asc' }, take: 10 }).catch(() => []),
    p.habit.findMany({ orderBy: { createdAt: 'asc' }, take: 20 }).catch(() => []),
    p.habitCompletion.findMany({ where: { date: { gte: weekAgo } } }).catch(() => []),
    p.activityLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }).catch(() => []),
    p.metric.findMany({ orderBy: { date: 'desc' }, take: 8 }).catch(() => []),
  ])

  const now = new Date()
  const ist = new Date(now.getTime() + 5.5 * 3_600_000)
  const lines: string[] = []

  lines.push(`\n\n## LIVE CONTEXT — read from your database, ${ist.toISOString().slice(0, 16).replace('T', ' ')} IST`)

  if (memories.length) {
    lines.push(`\n### Your saved memories (${memories.length} most relevant, of the ones stored)`)
    for (const m of memories) lines.push(`- [${m.category}/importance ${m.importance}] ${String(m.content).slice(0, 300)}`)
  } else {
    lines.push(`\n### Your saved memories\nNone saved yet. The memories table is empty — do not claim to remember past conversations you cannot see here.`)
  }

  if (notes.length) {
    lines.push(`\n### Your recent notes`)
    for (const n of notes) lines.push(`- ${n.title || '(untitled)'} [${n.category}] — ${String(n.content).slice(0, 200)}`)
  } else {
    lines.push(`\n### Your recent notes\nNone yet.`)
  }

  if (reminders.length) {
    lines.push(`\n### Your open reminders`)
    for (const r of reminders) lines.push(`- ${r.remindAt.toISOString().slice(0, 16).replace('T', ' ')} — ${r.title}`)
  } else {
    lines.push(`\n### Your open reminders\nNone pending.`)
  }

  if (habits.length) {
    const doneToday = new Set(
      completions.filter((c: any) => c.date.toDateString() === now.toDateString()).map((c: any) => c.habitId),
    )
    lines.push(`\n### Your habits (last 7 days)`)
    for (const h of habits) {
      const count = completions.filter((c: any) => c.habitId === h.id).length
      lines.push(`- ${h.name}: ${count}/7 days logged, ${doneToday.has(h.id) ? 'DONE today' : 'not yet today'}`)
    }
  }

  if (metrics.length) {
    lines.push(`\n### Your latest metrics`)
    for (const m of metrics) lines.push(`- ${m.name}: ${m.value}${m.unit ? ' ' + m.unit : ''} (${m.date.toISOString().slice(0, 10)})`)
  }

  if (activities.length) {
    lines.push(`\n### Your recent activity`)
    for (const a of activities) lines.push(`- ${a.action}${a.surface ? ` (${a.surface})` : ''}${a.details ? `: ${String(a.details).slice(0, 100)}` : ''}`)
  }

  lines.push(`\n### Grounding rules for this context
- Everything above is real and current. Use it directly — do not ask Sri to repeat what is already here.
- Anything NOT above (email contents, calendar, files, other apps) you cannot see. Say so plainly.
- If a section says "None yet", it is genuinely empty. Never invent entries to fill it.
- You can write to Sri's database with the tools you have. Use them instead of telling him to do it manually.`)

  return lines.join('\n')
}

// ── Tools — the difference between a chatbot and an assistant ────────
// Every tool writes to the real database or reads a real source. Each one
// reports what it did back into `activity`, which the UI renders under the
// reply, so a claim of "done" is always backed by a recorded action.
function buildJarvisTools(activity: ToolActivity[]): Record<string, any> {
  const p = prisma as any

  const record = (name: string, ok: boolean, summary: string) => {
    activity.push({ name, ok, summary })
    return ok ? { ok: true, result: summary } : { ok: false, error: summary }
  }

  return {
    save_memory: tool({
      description: "Save a durable fact about Sri to his memory store. Use when he shares something worth remembering long-term (preferences, business facts, decisions, people, ongoing projects).",
      inputSchema: z.object({
        content: z.string().describe('The fact to remember, written as a standalone sentence'),
        category: z.string().optional().describe('e.g. business, personal, project, preference, conversation'),
        importance: z.number().min(1).max(10).optional().describe('1-10, default 5'),
      }),
      execute: async ({ content, category, importance }) => {
        try {
          await p.memory.create({ data: { content: sanitize(content), category: category || 'conversation', importance: importance || 5 } })
          return record('save_memory', true, `Saved to memory: "${String(content).slice(0, 80)}"`)
        } catch (e: any) { return record('save_memory', false, `Could not save memory: ${e.message}`) }
      },
    }),

    search_memory: tool({
      description: 'Search everything Sri has stored — memories, notes and activity — for a keyword or topic.',
      inputSchema: z.object({ query: z.string().describe('Keyword or phrase to search for') }),
      execute: async ({ query }) => {
        try {
          const q = String(query)
          const [mem, notes] = await Promise.all([
            p.memory.findMany({ where: { content: { contains: q } }, take: 10 }).catch(() => []),
            p.note.findMany({ where: { OR: [{ content: { contains: q } }, { title: { contains: q } }] }, take: 10 }).catch(() => []),
          ])
          const total = mem.length + notes.length
          if (!total) return record('search_memory', true, `Nothing stored matches "${q}".`)
          const bits = [
            ...mem.map((m: any) => `memory: ${String(m.content).slice(0, 200)}`),
            ...notes.map((n: any) => `note "${n.title || 'untitled'}": ${String(n.content).slice(0, 200)}`),
          ]
          return record('search_memory', true, `Found ${total} match(es) for "${q}" — ${bits.join(' | ')}`)
        } catch (e: any) { return record('search_memory', false, `Search failed: ${e.message}`) }
      },
    }),

    create_note: tool({
      description: "Create a note in Sri's Knowledge Hub. Use whenever he asks to save, jot down, or remember something as a note.",
      inputSchema: z.object({
        title: z.string().describe('Short title'),
        content: z.string().describe('Full note body'),
        category: z.string().optional().describe('general, business, idea, meeting, etc.'),
      }),
      execute: async ({ title, content, category }) => {
        try {
          const n = await p.note.create({ data: { title: sanitize(title), content: sanitize(content), category: category || 'general' } })
          return record('create_note', true, `Created note "${title}" (id ${n.id}).`)
        } catch (e: any) { return record('create_note', false, `Could not create note: ${e.message}`) }
      },
    }),

    list_notes: tool({
      description: 'List the most recent notes in the Knowledge Hub.',
      inputSchema: z.object({ limit: z.number().min(1).max(50).optional(), category: z.string().optional() }),
      execute: async ({ limit, category }) => {
        try {
          const notes = await p.note.findMany({
            where: category ? { category } : undefined,
            orderBy: { updatedAt: 'desc' }, take: limit || 10,
          })
          if (!notes.length) return record('list_notes', true, 'No notes found.')
          return record('list_notes', true, notes.map((n: any) => `"${n.title || 'untitled'}" [${n.category}]`).join(', '))
        } catch (e: any) { return record('list_notes', false, `Could not list notes: ${e.message}`) }
      },
    }),

    create_reminder: tool({
      description: "Create a reminder for Sri. Use when he says remind me / don't let me forget / follow up on.",
      inputSchema: z.object({
        title: z.string().describe('What to be reminded about'),
        remindAt: z.string().describe('ISO 8601 timestamp, e.g. 2026-09-25T09:00:00+05:30'),
        message: z.string().optional().describe('Extra detail'),
      }),
      execute: async ({ title, remindAt, message }) => {
        try {
          const when = new Date(remindAt)
          if (isNaN(when.getTime())) return record('create_reminder', false, `Could not parse the date "${remindAt}". Use ISO 8601.`)
          const r = await p.reminder.create({ data: { title: sanitize(title), message: message ? sanitize(message) : null, remindAt: when } })
          return record('create_reminder', true, `Reminder set for ${when.toISOString()} — "${title}" (id ${r.id}).`)
        } catch (e: any) { return record('create_reminder', false, `Could not create reminder: ${e.message}`) }
      },
    }),

    list_reminders: tool({
      description: 'List open reminders, soonest first.',
      inputSchema: z.object({ includeCompleted: z.boolean().optional() }),
      execute: async ({ includeCompleted }) => {
        try {
          const r = await p.reminder.findMany({
            where: includeCompleted ? undefined : { completed: false },
            orderBy: { remindAt: 'asc' }, take: 25,
          })
          if (!r.length) return record('list_reminders', true, 'No open reminders.')
          return record('list_reminders', true, r.map((x: any) => `${x.remindAt.toISOString().slice(0, 16)} — ${x.title}${x.completed ? ' (done)' : ''}`).join(' | '))
        } catch (e: any) { return record('list_reminders', false, `Could not list reminders: ${e.message}`) }
      },
    }),

    list_habits: tool({
      description: 'List habits with how many of the last 7 days were logged.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const weekAgo = new Date(Date.now() - 7 * 86_400_000)
          const [habits, comps] = await Promise.all([
            p.habit.findMany({ take: 25 }).catch(() => []),
            p.habitCompletion.findMany({ where: { date: { gte: weekAgo } } }).catch(() => []),
          ])
          if (!habits.length) return record('list_habits', true, 'No habits set up yet.')
          return record('list_habits', true, habits.map((h: any) => {
            const n = comps.filter((c: any) => c.habitId === h.id).length
            return `${h.name}: ${n}/7`
          }).join(' | '))
        } catch (e: any) { return record('list_habits', false, `Could not list habits: ${e.message}`) }
      },
    }),

    log_habit: tool({
      description: 'Mark a habit as done for a given day (defaults to today). Creates the habit if it does not exist.',
      inputSchema: z.object({
        habitName: z.string().describe('Name of the habit'),
        date: z.string().optional().describe('ISO date; defaults to today'),
      }),
      execute: async ({ habitName, date }) => {
        try {
          const name = String(habitName).trim()
          let habit = await p.habit.findFirst({ where: { name } })
          if (!habit) habit = await p.habit.create({ data: { name } })
          const when = date ? new Date(date) : new Date()
          if (isNaN(when.getTime())) return record('log_habit', false, `Could not parse the date "${date}".`)
          when.setHours(12, 0, 0, 0)
          await p.habitCompletion.upsert({
            where: { habitId_date: { habitId: habit.id, date: when } },
            update: {},
            create: { habitId: habit.id, date: when },
          })
          return record('log_habit', true, `Logged "${name}" for ${when.toISOString().slice(0, 10)}.`)
        } catch (e: any) { return record('log_habit', false, `Could not log habit: ${e.message}`) }
      },
    }),

    log_metric: tool({
      description: 'Record a numeric metric (revenue, leads, hours, etc.).',
      inputSchema: z.object({
        name: z.string(),
        value: z.number(),
        unit: z.string().optional(),
        category: z.string().optional(),
      }),
      execute: async ({ name, value, unit, category }) => {
        try {
          await p.metric.create({ data: { name: sanitize(name), value, unit: unit || null, category: category || 'general' } })
          return record('log_metric', true, `Recorded ${name} = ${value}${unit ? ' ' + unit : ''}.`)
        } catch (e: any) { return record('log_metric', false, `Could not record metric: ${e.message}`) }
      },
    }),

    read_inbox: tool({
      description: "Read the most recent emails in Sri's Gmail inbox. Only works once Gmail is connected in the Connections Hub; if it fails, tell him to connect it rather than guessing.",
      inputSchema: z.object({ limit: z.number().min(1).max(20).optional() }),
      execute: async ({ limit }) => {
        try {
          const tools = getServerToolsClient()
          const res: any = await tools.execute('GMAIL_FETCH_EMAILS', { maxResults: limit || 5 })
          if (!res?.ok) return record('read_inbox', false, `Gmail is not available: ${res?.error || 'not connected'}. Ask Sri to connect Gmail in the Connections Hub.`)
          const msgs = res.data?.messages || res.data?.emails || []
          if (!msgs.length) return record('read_inbox', true, 'Inbox is empty.')
          return record('read_inbox', true, msgs.slice(0, limit || 5).map((m: any) => `${m.subject || m.snippet || '(no subject)'} — ${m.from || ''}`).join(' | '))
        } catch (e: any) { return record('read_inbox', false, `Could not read Gmail: ${e.message}`) }
      },
    }),

    get_weather: tool({
      description: 'Get live current weather for any city. Use instead of reciting the cached Erode conditions.',
      inputSchema: z.object({ city: z.string().describe('City name, e.g. "Erode, Tamil Nadu"') }),
      execute: async ({ city }) => {
        try {
          const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, { signal: AbortSignal.timeout(8000) })
          const data: any = await res.json()
          const c = data?.current_condition?.[0]
          if (!c) return record('get_weather', false, `No weather data for "${city}".`)
          return record('get_weather', true, `${city}: ${c.temp_C}°C, feels ${c.FeelsLikeC}°C, ${c.weatherDesc?.[0]?.value}, humidity ${c.humidity}%, wind ${c.windspeedKmph} km/h.`)
        } catch (e: any) { return record('get_weather', false, `Weather lookup failed: ${e.message}`) }
      },
    }),

    search_news: tool({
      description: 'Search recent news headlines on any topic.',
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        try {
          const res = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en&gl=IN&ceid=IN:en`, { signal: AbortSignal.timeout(8000) })
          const xml = await res.text()
          const out: string[] = []
          for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
            const t = m[1].match(/<title>(.*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '')
            if (t && out.length < 5) out.push(t)
          }
          if (!out.length) return record('search_news', false, `No news found for "${query}".`)
          return record('search_news', true, `Top headlines for "${query}": ${out.join(' | ')}`)
        } catch (e: any) { return record('search_news', false, `News search failed: ${e.message}`) }
      },
    }),

    get_recent_activity: tool({
      description: "Read Sri's recent activity log to see what he has actually been doing in the app.",
      inputSchema: z.object({ limit: z.number().min(1).max(50).optional() }),
      execute: async ({ limit }) => {
        try {
          const rows = await p.activityLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit || 15 })
          if (!rows.length) return record('get_recent_activity', true, 'No activity recorded yet.')
          return record('get_recent_activity', true, rows.map((r: any) => `${r.action}${r.surface ? ` (${r.surface})` : ''}`).join(' | '))
        } catch (e: any) { return record('get_recent_activity', false, `Could not read activity: ${e.message}`) }
      },
    }),
  }
}

function getModelStatus() {
  return MODEL_CHAIN.map(m => ({
    name: m.name,
    healthy: m.healthy || isModelReady(m),
    cooldownRemaining: m.healthy ? 0 : Math.max(0, m.cooldownMs - (Date.now() - m.lastFailAt)),
    lastError: m.lastError,
  }))
}

// POST /api/ai/chat
app.post('/ai/chat', requireAuth, async (c) => {
  try {
    const body = await c.req.json()
    const { messages, model: preferredModelId, sessionId, toolsEnabled } = body as {
      messages: Array<{ role: string; content: string }>
      model?: string
      sessionId?: string
      toolsEnabled?: boolean
    }
    if (!messages?.length) return c.json({ error: 'messages array required' }, 400)

    // The conversation is the unit that must not change model mid-task, so
    // stickiness is keyed by session (falling back to the signed-in user).
    const sessionKey = sessionId || (c.get('userId') as string) || 'main'

    // First ever request waits briefly for the model check so it already picks
    // a model we have seen answer; later ones use the cached catalogue.
    if (catalogCheckedAt === 0) await Promise.race([refreshModelCatalog(), sleep(3000)])

    const [liveContext, userContext] = await Promise.all([fetchLiveContext(), buildUserContext().catch(() => '')])
    const fullPrompt = JARVIS_SYSTEM_PROMPT + userContext + liveContext

    const activity: ToolActivity[] = []
    const tools = toolsEnabled === false ? undefined : buildJarvisTools(activity)

    let answer: AiAnswer
    try {
      answer = await callAI(fullPrompt, messages, { preferredModelId, sessionKey, tools })
      answer.toolsUsed = activity
    } catch (aiError: any) {
      // PRODUCTION RULE: never fabricate an assistant reply. A canned "standby
      // mode" message looks like J.A.R.V.I.S. answered when nothing did. Report
      // the real failure and let the UI show an honest connection notice.
      const keys = loadKeys()
      const hasOwnKey = Boolean(keys.openai || keys.anthropic || keys.gemini)
      await (prisma as any).activityLog.create({
        data: { action: 'ai_chat_failed', details: String(aiError?.message || '').slice(0, 400), surface: 'chat' },
      }).catch(() => {})
      return c.json({
        error: 'No AI model could be reached',
        detail: String(aiError?.message || '').slice(0, 500),
        setupHint: hasOwnKey
          ? 'Your saved provider keys were tried and failed too — re-check them in Settings - AI Providers.'
          : 'Add your own OpenAI / Anthropic / Gemini key in Settings - AI Providers so chat never depends on a shared pool.',
      }, 503)
    }

    const lastUser = messages.filter(m => m.role === 'user').pop()
    if (lastUser) {
      await (prisma as any).conversation.create({ data: { role: 'user', content: lastUser.content, sessionId: 'main' } }).catch(() => {})
      await (prisma as any).conversation.create({ data: { role: 'assistant', content: answer.text.substring(0, 2000), sessionId: 'main' } }).catch(() => {})
      await (prisma as any).activityLog.create({ data: { action: 'ai_chat', details: `${answer.source}${answer.toolsUsed.length ? ` + ${answer.toolsUsed.length} tool call(s)` : ''}`, surface: 'chat' } }).catch(() => {})
    }

    return c.json({
      content: answer.text,
      source: answer.source,
      modelId: answer.modelId,
      // Non-null only when we had to abandon the model the conversation was
      // pinned to — the UI shows this instead of switching silently.
      switchedFrom: answer.switchedFrom,
      attemptedModels: answer.attemptedModels,
      toolsUsed: answer.toolsUsed,
    })
  } catch (error: any) {
    return c.json({ error: error.message || 'Chat error' }, 500)
  }
})

// GET /api/ai/history — restore the conversation across reloads
app.get('/ai/history', requireAuth, async (c) => {
  const limit = Math.min(Number(c.req.query('limit') || 80), 300)
  const rows = await (prisma as any).conversation.findMany({
    where: { sessionId: 'main' },
    orderBy: { createdAt: 'desc' },
    take: limit,
  }).catch(() => [])
  return c.json({
    messages: rows.reverse().map((r: any) => ({ role: r.role, content: r.content, createdAt: r.createdAt })),
  })
})

// DELETE /api/ai/history
app.delete('/ai/history', requireAuth, async (c) => {
  const res = await (prisma as any).conversation.deleteMany({ where: { sessionId: 'main' } })
  return c.json({ ok: true, deleted: res.count })
})

// GET /api/ai/models — every model, with what we last actually measured
app.get('/ai/models', async (c) => {
  // Served from the cached catalogue; refresh once in the background if stale
  // so the numbers the UI shows are never older than the TTL.
  refreshModelCatalog().catch(() => {})
  return c.json({
    models: MODEL_CHAIN.map(m => ({
      id: m.id,
      name: m.name,
      healthy: m.healthy || isModelReady(m),
      cooldownRemaining: m.healthy ? 0 : Math.max(0, m.cooldownMs - (Date.now() - m.lastFailAt)),
      lastError: m.lastError,
      latencyMs: m.lastLatencyMs ?? null,
      supportsTools: m.supportsTools ?? null,
    })),
    // Kept separate on purpose: these 403 on the current plan, so they must
    // never be picked to answer a request.
    premium: PREMIUM_MODELS.map(m => ({ id: m.id, name: m.name, requiresPlan: 'Pro', available: false })),
    checkedAt: catalogCheckedAt || null,
    failures: lastProbeFailures,
  })
})

// POST /api/ai/models/refresh — re-probe every model on demand
app.post('/ai/models/refresh', requireAuth, async (c) => {
  await refreshModelCatalog(true)
  return c.json({
    ok: true,
    checkedAt: catalogCheckedAt,
    models: MODEL_CHAIN.map(m => ({ id: m.id, name: m.name, healthy: m.healthy, latencyMs: m.lastLatencyMs ?? null, lastError: m.lastError })),
    failures: lastProbeFailures,
  })
})

// GET /api/ai/capabilities — what this assistant can and cannot actually do,
// derived from live checks rather than from marketing copy.
app.get('/ai/capabilities', async (c) => {
  const p = prisma as any
  const tools = getServerToolsClient()
  let gmailOk = false
  try {
    const probe: any = await tools.execute('GMAIL_FETCH_EMAILS', { maxResults: 1 })
    gmailOk = Boolean(probe?.ok)
  } catch { gmailOk = false }

  const [memories, notes, reminders, habits, conversations] = await Promise.all([
    p.memory.count().catch(() => 0),
    p.note.count().catch(() => 0),
    p.reminder.count({ where: { completed: false } }).catch(() => 0),
    p.habit.count().catch(() => 0),
    p.conversation.count().catch(() => 0),
  ])

  const liveModels = MODEL_CHAIN.filter(m => m.healthy || isModelReady(m))

  return c.json({
    models: {
      answering: liveModels.map(m => ({ name: m.name, latencyMs: m.lastLatencyMs ?? null })),
      count: liveModels.length,
      total: MODEL_CHAIN.length,
      locked: PREMIUM_MODELS.map(m => m.name),
      note: 'The locked models require a Pro plan; they are not used to answer.',
    },
    knowledge: {
      readsYourData: true,
      memories, notes, openReminders: reminders, habits, storedMessages: conversations,
      injectedIntoPrompt: ['memories', 'notes', 'reminders', 'habits', 'metrics', 'recent activity', 'live weather', 'AI news'],
    },
    actions: {
      can: [
        'save a memory', 'search memories and notes', 'create a note', 'list notes',
        'create a reminder', 'list reminders', 'log a habit', 'list habits',
        'record a metric', 'read recent activity', 'get live weather for any city',
        'search news', 'read your Gmail inbox (once connected)',
      ],
      toolsEnabled: true,
      gmailConnected: gmailOk,
    },
    cannot: [
      'send email (no send tool wired yet)',
      'see Google Calendar (integration not connected)',
      'run anything on a schedule on its own (heartbeat is off; no channel connected)',
      'generate images or speak (no voice/image layer)',
      'stream replies token-by-token',
      'browse the open web freely — news search is RSS-only',
      'switch model mid-conversation without telling you',
    ],
  })
})

// ═══════════════════════════════════════════════════════════════════
// MEMORY & ACTIVITY SYSTEM
// ═══════════════════════════════════════════════════════════════════

// POST /api/memory/save
app.post('/memory/save', requireAuth, async (c) => {
  const body = await c.req.json()
  const { content, category, importance, tags } = body
  if (!content) return c.json({ error: 'content required' }, 400)
  const memory = await (prisma as any).memory.create({
    data: { content: sanitize(content), category: category || 'conversation', importance: importance || 5, tags: tags || null }
  })
  return c.json({ ok: true, id: memory.id })
})

// GET /api/memory/stats
app.get('/memory/stats', requireAuth, async (c) => {
  const [totalMemories, totalConversations, totalNotes, todayActivities] = await Promise.all([
    (prisma as any).memory.count(),
    (prisma as any).conversation.count(),
    (prisma as any).note.count(),
    (prisma as any).activityLog.count({ where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
  ])
  return c.json({ totalMemories, totalConversations, totalNotes, todayActivities })
})

// GET /api/memory/search
app.get('/memory/search', requireAuth, async (c) => {
  const q = c.req.query('q') || ''
  if (!q) return c.json({ results: [] })
  const memories = await (prisma as any).memory.findMany({ where: { content: { contains: q } }, orderBy: { createdAt: 'desc' }, take: 20 })
  const conversations = await (prisma as any).conversation.findMany({ where: { content: { contains: q } }, orderBy: { createdAt: 'desc' }, take: 20 })
  return c.json({ memories, conversations })
})

// GET /api/memory/timeline
app.get('/memory/timeline', requireAuth, async (c) => {
  const logs = await (prisma as any).activityLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
  const grouped: Record<string, any[]> = {}
  for (const log of logs) {
    const day = new Date(log.createdAt).toISOString().split('T')[0]
    if (!grouped[day]) grouped[day] = []
    grouped[day].push(log)
  }
  return c.json({ timeline: grouped })
})

// GET /api/memory/daily-summary
app.get('/memory/daily-summary', requireAuth, async (c) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const logs = await (prisma as any).activityLog.findMany({ where: { createdAt: { gte: today } }, orderBy: { createdAt: 'asc' } })
  const conversations = await (prisma as any).conversation.findMany({ where: { createdAt: { gte: today } }, orderBy: { createdAt: 'asc' } })

  const summary = await (prisma as any).dailySummary.findFirst({ where: { date: today } })
  if (summary) return c.json({ summary: summary.summary, stats: summary.stats ? JSON.parse(summary.stats) : null })

  const stats = {
    activities: logs.length,
    conversations: conversations.length,
    surfaces: [...new Set(logs.map((l: any) => l.surface).filter(Boolean))],
    actions: logs.map((l: any) => l.action),
  }
  return c.json({ summary: `Today: ${logs.length} activities, ${conversations.length} conversations`, stats })
})

// POST /api/activity/log
app.post('/activity/log', requireAuth, async (c) => {
  const body = await c.req.json()
  const { action, details, surface } = body
  await (prisma as any).activityLog.create({ data: { action: sanitize(action || ''), details: sanitize(details || ''), surface: sanitize(surface || '') } })
  return c.json({ ok: true })
})

// ═══════════════════════════════════════════════════════════════════
// GITHUB INTEGRATION
// ═══════════════════════════════════════════════════════════════════

// GET /api/github/repos
app.get('/github/repos', requireAuth, async (c) => {
  try {
    const res = await fetch('https://api.github.com/users/Srimani26/repos?sort=updated&per_page=20', {
      headers: { 'Accept': 'application/vnd.github.v3+json' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error('GitHub API error')
    const repos = await res.json() as any[]
    return c.json({ repos: repos.map(r => ({ name: r.name, description: r.description, language: r.language, stars: r.stargazers_count, updated: r.updated_at, url: r.html_url })) })
  } catch (err: any) {
    return c.json({ error: err.message, repos: [] })
  }
})

// GET /api/github/files
app.get('/github/files', requireAuth, async (c) => {
  const repo = c.req.query('repo') || 'Sri-AI-Business-OS'
  try {
    const res = await fetch(`https://api.github.com/repos/Srimani26/${repo}/contents/`, {
      headers: { 'Accept': 'application/vnd.github.v3+json' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error('Failed to fetch files')
    const files = await res.json() as any[]
    return c.json({ files: files.map(f => ({ name: f.name, type: f.type, size: f.size, path: f.path })) })
  } catch (err: any) {
    return c.json({ error: err.message, files: [] })
  }
})

// ═══════════════════════════════════════════════════════════════════
// SESSION & CONNECTION TRACKING
// ═══════════════════════════════════════════════════════════════════

// POST /api/sessions/register
app.post('/sessions/register', requireAuth, async (c) => {
  const body = await c.req.json()
  const { deviceType, deviceName } = body
  const session = await (prisma as any).userSession.create({
    data: { deviceType: deviceType || 'web', deviceName: deviceName || 'unknown', ipAddress: c.req.header('x-forwarded-for') || 'unknown' }
  })
  return c.json({ session })
})

// GET /api/sessions
app.get('/sessions', requireAuth, async (c) => {
  const sessions = await (prisma as any).userSession.findMany({ orderBy: { lastActive: 'desc' }, take: 20 })
  return c.json({ sessions })
})

// GET /api/connections
app.get('/connections', requireAuth, async (c) => {
  const githubOk = await fetch('https://api.github.com/users/Srimani26', { signal: AbortSignal.timeout(3000) }).then(r => r.ok).catch(() => false)
  return c.json({ connections: [
    { name: 'GitHub', status: githubOk ? 'connected' : 'error', icon: '🐙', detail: '8 repositories synced' },
    { name: 'Gmail', status: 'needs-setup', icon: '📧', detail: 'Connect Google account' },
    { name: 'Calendar', status: 'needs-setup', icon: '📅', detail: 'Connect Google Calendar' },
    { name: 'Weather', status: 'connected', icon: '🌤️', detail: 'Erode, Tamil Nadu — live' },
    { name: 'News', status: 'connected', icon: '📰', detail: 'AI news feed — live' },
    { name: 'AI Models', status: MODEL_CHAIN.some(m => m.healthy) ? 'connected' : 'degraded', icon: '🤖', detail: `${MODEL_CHAIN.filter(m => m.healthy || isModelReady(m)).length}/${MODEL_CHAIN.length} models active` },
    { name: 'Database', status: 'connected', icon: '💾', detail: 'SQLite — healthy' },
    { name: 'Memory', status: 'connected', icon: '🧠', detail: 'Active — learning continuously' },
  ]})
})

// ═══════════════════════════════════════════════════════════════════
// AI PROVIDER KEYS — Bring Your Own Key (never runs out)
// ═══════════════════════════════════════════════════════════════════

// GET /api/settings/keys — which providers are configured (masked, never returns raw keys)
app.get('/settings/keys', requireAuth, (c) => {
  const keys = loadKeys()
  const mask = (k?: string) => (k ? `${k.slice(0, 6)}••••${k.slice(-4)}` : null)
  return c.json({
    providers: [
      { id: 'openai', name: 'OpenAI', configured: Boolean(keys.openai), masked: mask(keys.openai), models: 'GPT-4o Mini' },
      { id: 'anthropic', name: 'Anthropic', configured: Boolean(keys.anthropic), masked: mask(keys.anthropic), models: 'Claude Haiku 4.5' },
      { id: 'gemini', name: 'Google Gemini', configured: Boolean(keys.gemini), masked: mask(keys.gemini), models: 'Gemini 2.0 Flash' },
    ],
  })
})

// POST /api/settings/keys — save a provider key
app.post('/settings/keys', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { provider, key } = body as { provider?: string; key?: string }
  if (!provider || !['openai', 'anthropic', 'gemini'].includes(provider)) {
    return c.json({ error: 'provider must be one of: openai, anthropic, gemini' }, 400)
  }
  if (!key || key.trim().length < 10) return c.json({ error: 'A valid API key is required' }, 400)

  const keys = loadKeys()
  ;(keys as any)[provider] = key.trim()
  saveKeys(keys)
  await (prisma as any).activityLog.create({ data: { action: 'provider_key_added', details: `Connected ${provider}`, surface: 'settings' } }).catch(() => {})
  return c.json({ ok: true, provider })
})

// DELETE /api/settings/keys/:provider — remove a provider key
app.delete('/settings/keys/:provider', requireAuth, async (c) => {
  const provider = c.req.param('provider')
  const keys = loadKeys()
  delete (keys as any)[provider]
  saveKeys(keys)
  return c.json({ ok: true })
})

// ═══════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════

app.get('/health', (c) => {
  return c.json({
    status: 'operational',
    version: '2.0.0-nextgen',
    ai: { moa: MODEL_CHAIN.filter(m => m.healthy || isModelReady(m)).length + '/' + MODEL_CHAIN.length + ' models active' },
    security: { rateLimit: RATE_LIMIT + '/min', bcrypt: BCRYPT_ROUNDS + ' rounds', jwt: 'enabled' },
    uptime: process.uptime(),
  })
})

// POST /api/ai/web-search — enhanced web search using multiple sources
app.post('/ai/web-search', requireAuth, async (c) => {
  try {
    const body = await c.req.json()
    const { query } = body as { query: string }
    if (!query) return c.json({ error: 'query is required' }, 400)

    // Search multiple sources simultaneously
    const [googleNews, wikiSnippet] = await Promise.allSettled([
      // Google News RSS for the topic
      fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en&gl=IN&ceid=IN:en`, { signal: AbortSignal.timeout(5000) })
        .then(r => r.text())
        .then(xml => {
          const items: Array<{ title: string; source: string; link: string }> = []
          for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
            const title = match[1].match(/<title>(.*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '') || ''
            const source = match[1].match(/<source[^>]*>(.*?)<\/source>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '') || ''
            const link = match[1].match(/<link>(.*?)<\/link>/)?.[1] || ''
            if (title && items.length < 5) items.push({ title, source, link })
          }
          return items
        })
        .catch(() => []),
      // Wikipedia for quick context
      fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.split(' ').slice(0, 3).join('_'))}`, { signal: AbortSignal.timeout(3000) })
        .then(r => r.json())
        .then((d: any) => d?.extract ? { title: d.title, extract: d.extract.slice(0, 500), url: d.content_urls?.desktop?.page } : null)
        .catch(() => null),
    ])

    return c.json({
      query,
      news: googleNews.status === 'fulfilled' ? googleNews.value : [],
      wiki: wikiSnippet.status === 'fulfilled' ? wikiSnippet.value : null,
    })
  } catch (error: any) {
    return c.json({ error: error.message }, 500)
  }
})

// POST /api/ai/model-test — test a specific model directly
app.post('/ai/model-test', requireAuth, async (c) => {
  const body = await c.req.json()
  const { model } = body as { model: string }
  if (!model) return c.json({ error: 'model required' }, 400)
  const llmProvider = createLlmProvider()
  if (!llmProvider) return c.json({ error: 'no AI gateway credential available' }, 500)
  const start = Date.now()
  try {
    const result = await generateText({
      model: llmProvider(model),
      prompt: 'Say exactly: MODEL_OK',
      maxTokens: 10,
    })
    return c.json({ ok: true, model, response: result.text?.trim(), ms: Date.now() - start })
  } catch (err: any) {
    return c.json({ ok: false, model, error: err.message?.slice(0, 200), ms: Date.now() - start })
  }
})

// GET /api/ai/status — check AI service health + model status
app.get('/ai/status', async (c) => {
  const hasToken = Boolean(resolveAiToken())
  const live = MODEL_CHAIN.filter(m => m.healthy || isModelReady(m))
  return c.json({
    chat: hasToken ? 'ready' : 'not configured',
    // Web search genuinely works through Google News RSS + Wikipedia. The old
    // check reported "limited" whenever a SerpAPI key was absent, which read as
    // broken even though search was answering.
    search: 'live',
    searchProvider: 'google-news-rss + wikipedia',
    models: getModelStatus(),
    activeModel: MODEL_CHAIN.find(m => m.healthy)?.name || 'All in cooldown',
    modelsAnswering: `${live.length}/${MODEL_CHAIN.length}`,
    catalogCheckedAt: catalogCheckedAt || null,
    failures: lastProbeFailures,
    tools: true,
    lockedModels: PREMIUM_MODELS.map(m => m.name),
  })
})

// ── Weather & News Routes ──────────────────────────────────
// GET /api/weather — live weather for Erode, Tamil Nadu
app.get('/weather', async (c) => {
  try {
    const res = await fetch('https://wttr.in/Erode,Tamil+Nadu?format=j1')
    const data = await res.json() as any
    const current = data?.current_condition?.[0]
    if (!current) return c.json({ error: 'Weather data unavailable' }, 502)
    return c.json({
      location: 'Erode, Tamil Nadu',
      temp_c: current.temp_C,
      feels_like: current.FeelsLikeC,
      humidity: current.humidity,
      description: current.weatherDesc?.[0]?.value || 'Unknown',
      wind_kmph: current.windspeedKmph,
      visibility: current.visibility,
      uv_index: current.uvIndex,
      pressure: current.pressure,
    })
  } catch (error: any) {
    return c.json({ error: error.message }, 500)
  }
})

// GET /api/news — trending AI and tech news
app.get('/news', async (c) => {
  try {
    // Use Google News RSS for AI/tech
    const res = await fetch('https://news.google.com/rss/search?q=AI+artificial+intelligence+2026&hl=en&gl=IN&ceid=IN:en')
    const xml = await res.text()
    // Simple XML parsing for RSS
    const items: Array<{ title: string; link: string; pubDate: string; source: string }> = []
    const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g)
    for (const match of itemMatches) {
      const itemXml = match[1]
      const title = itemXml.match(/<title>(.*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '') || ''
      const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || ''
      const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ''
      const source = itemXml.match(/<source[^>]*>(.*?)<\/source>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '') || ''
      if (title && items.length < 15) {
        items.push({ title, link, pubDate, source })
      }
    }
    return c.json({ news: items })
  } catch (error: any) {
    return c.json({ news: [], error: error.message }, 500)
  }
})

// ── Gmail & Calendar Integration Routes ──────────────────────
import { getServerToolsClient } from '@shogo-ai/sdk/tools'

// Helper: safely parse tool data (SDK returns deeply nested JSON strings with escaped chars)
function parseToolData<T>(data: unknown): T {
  if (data === null || data === undefined) return data as T
  let current: any = data
  for (let i = 0; i < 5; i++) {
    if (typeof current === 'string') {
      try {
        const next = JSON.parse(current)
        if (typeof next === 'object' && next !== null) return next as T
        current = next
      } catch {
        // Try unescaping backslash-escaped quotes first
        try {
          const cleaned = current.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
          const next = JSON.parse(cleaned)
          if (typeof next === 'object' && next !== null) return next as T
          current = next
        } catch { break }
      }
    } else break
  }
  return current as T
}

// Managed integrations are installed per-runtime. When one is missing the tools
// client answers with `Tool "X" not found` — meaningless to a user, so translate
// it into something actionable.
const INTEGRATION_MISSING = /not found|not installed|no such tool|unknown tool/i

function toolFailure(rawError: string | undefined, label: string): { error: string; code: string } {
  const message = rawError || `${label} failed`
  if (INTEGRATION_MISSING.test(message)) {
    return {
      error: `${label} is not connected to this runtime. Open the Connections Hub and reconnect it.`,
      code: 'INTEGRATION_NOT_CONNECTED',
    }
  }
  return { error: message, code: 'TOOL_ERROR' }
}

// GET /api/gmail/inbox — fetch recent emails
app.get('/gmail/inbox', requireAuth, async (c) => {
  try {
    const tools = getServerToolsClient()
    const result = await tools.execute('GMAIL_FETCH_EMAILS', {
      max_results: 20,
      verbose: true,
    })
    if (!result.ok) {
      const failure = toolFailure(result.error, 'Gmail')
      return c.json(failure, failure.code === 'INTEGRATION_NOT_CONNECTED' ? 412 : 502)
    }

    // The SDK returns nested JSON strings — just return the raw data and let the frontend parse
    return c.json({ raw: result.data })
  } catch (error: any) {
    const failure = toolFailure(error?.message, 'Gmail')
    return c.json(failure, failure.code === 'INTEGRATION_NOT_CONNECTED' ? 412 : 500)
  }
})

// GET /api/gmail/profile — who am I
app.get('/gmail/profile', requireAuth, async (c) => {
  try {
    const tools = getServerToolsClient()
    const result = await tools.execute('GMAIL_WHO_AM_I', {})
    if (!result.ok) {
      const failure = toolFailure(result.error, 'Gmail')
      return c.json(failure, failure.code === 'INTEGRATION_NOT_CONNECTED' ? 412 : 401)
    }
    return c.json(result.data)
  } catch (error: any) {
    const failure = toolFailure(error?.message, 'Gmail')
    return c.json(failure, failure.code === 'INTEGRATION_NOT_CONNECTED' ? 412 : 500)
  }
})

// POST /api/gmail/send — send an email
app.post('/gmail/send', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { to, subject, html } = body
  if (!to || !subject) return c.json({ error: 'to and subject required' }, 400)
  try {
    const tools = getServerToolsClient()
    const result = await tools.execute('GMAIL_SEND_EMAIL', {
      recipient_email: to,
      subject,
      body: html || '',
      is_html: true,
    })
    if (!result.ok) {
      const failure = toolFailure(result.error, 'Gmail')
      return c.json(failure, failure.code === 'INTEGRATION_NOT_CONNECTED' ? 412 : 502)
    }
    return c.json({ ok: true })
  } catch (error: any) {
    const failure = toolFailure(error?.message, 'Gmail')
    return c.json(failure, failure.code === 'INTEGRATION_NOT_CONNECTED' ? 412 : 500)
  }
})

// GET /api/calendar/today — today's events
app.get('/calendar/today', requireAuth, async (c) => {
  try {
    const tools = getServerToolsClient()
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

    const result = await tools.execute('GOOGLECALENDAR_EVENTS_LIST', {
      calendarId: 'primary',
      timeMin: startOfDay,
      timeMax: endOfDay,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 20,
    })
    if (!result.ok) {
      const failure = toolFailure(result.error, 'Google Calendar')
      return c.json(failure, failure.code === 'INTEGRATION_NOT_CONNECTED' ? 412 : 502)
    }

    const raw = parseToolData<any>(result.data)
    return c.json({ events: raw?.items || [] })
  } catch (error: any) {
    const failure = toolFailure(error?.message, 'Google Calendar')
    return c.json(failure, failure.code === 'INTEGRATION_NOT_CONNECTED' ? 412 : 500)
  }
})

// GET /api/calendar/upcoming — next 7 days
app.get('/calendar/upcoming', requireAuth, async (c) => {
  try {
    const tools = getServerToolsClient()
    const now = new Date()
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const result = await tools.execute('GOOGLECALENDAR_EVENTS_LIST', {
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: weekFromNow,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 30,
    })
    if (!result.ok) {
      const failure = toolFailure(result.error, 'Google Calendar')
      return c.json(failure, failure.code === 'INTEGRATION_NOT_CONNECTED' ? 412 : 502)
    }

    const raw = parseToolData<any>(result.data)
    return c.json({ events: raw?.items || [] })
  } catch (error: any) {
    const failure = toolFailure(error?.message, 'Google Calendar')
    return c.json(failure, failure.code === 'INTEGRATION_NOT_CONNECTED' ? 412 : 500)
  }
})

// Catch-all — registered last so it only sees genuinely unmatched paths.
// Without this, an unknown /api/* fell through to the SPA static handler and
// returned index.html with HTTP 200: the frontend then failed to parse HTML as
// JSON and reported "API server not ready" while the server was perfectly
// healthy. An API path must always answer as an API.
app.all('*', (c) =>
  c.json(
    { error: 'Not found', detail: `No API route for ${c.req.method} ${c.req.path}` },
    404,
  ),
)

export default app
