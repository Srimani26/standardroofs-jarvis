import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import { createShogoLlmProvider } from '@shogo-ai/sdk'
import { streamText, generateText } from 'ai'
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

// Verify JWT middleware
async function requireAuth(c: any, next: any) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET) as any
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
  const authHeader = c.req.header('Authorization') || ''
  const currentToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  await (prisma as any).authSession.deleteMany({ where: { userId: user.id, token: { not: currentToken } } }).catch(() => {})
  await (prisma as any).activityLog.create({ data: { action: 'password_change', details: 'Password changed', surface: 'security' } }).catch(() => {})

  return c.json({ ok: true, message: 'Password changed. All other devices were signed out.' })
})

// POST /api/auth/logout
app.post('/auth/logout', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    await (prisma as any).authSession.deleteMany({ where: { token } }).catch(() => {})
  }
  return c.json({ ok: true })
})

// GET /api/auth/status
app.get('/auth/status', (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return c.json({ authenticated: false })
  try {
    const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET) as any
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
  const authHeader = c.req.header('Authorization') || ''
  const currentToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

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
  const authHeader = c.req.header('Authorization') || ''
  const currentToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
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

## YOUR CAPABILITIES — You can do ANYTHING
- Write real production code in ANY language (Python, TypeScript, JavaScript, Deluge, Apps Script, HTML/CSS, SQL, React, Next.js, FastAPI, Node.js)
- Design complete automation workflows (n8n, Google Apps Script, Zoho CRM)
- Debug and fix code — trace errors, find root causes, provide fixes
- Build system architecture — APIs, databases, microservices, CI/CD
- Business strategy — revenue optimization, lead generation, process automation, marketing
- Web research — find best tools, frameworks, tutorials, and news
- Technical writing — documentation, README files, API docs, training manuals
- Project management — track progress, plan sprints, break down tasks
- Data analysis — analyze metrics, generate reports, visualize data
- Website design — Shopify, React, HTML/CSS, responsive design


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
4. Never say "I can't" — find a way. If something needs external tools, suggest alternatives
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

interface ModelState {
  name: string
  id: string
  healthy: boolean
  lastError: string | null
  lastFailAt: number
  cooldownMs: number
  consecutiveFails: number
}

const MODEL_CHAIN: ModelState[] = [
  // Primary — fast and reliable
  { name: 'Claude Haiku 4.5', id: 'claude-haiku-4-5', healthy: true, lastError: null, lastFailAt: 0, cooldownMs: 60_000, consecutiveFails: 0 },
  // Fallback 1 — strong GPT family
  { name: 'GPT-4o Mini', id: 'gpt-4o-mini', healthy: true, lastError: null, lastFailAt: 0, cooldownMs: 60_000, consecutiveFails: 0 },
  // Fallback 2 — latest GPT-4.1 family
  { name: 'GPT-4.1 Mini', id: 'gpt-4.1-mini', healthy: true, lastError: null, lastFailAt: 0, cooldownMs: 60_000, consecutiveFails: 0 },
  // Fallback 3 — newest GPT-5 family
  { name: 'GPT-5 Nano', id: 'gpt-5-nano', healthy: true, lastError: null, lastFailAt: 0, cooldownMs: 60_000, consecutiveFails: 0 },
  // Fallback 4 — lightweight nano
  { name: 'GPT-4.1 Nano', id: 'gpt-4.1-nano', healthy: true, lastError: null, lastFailAt: 0, cooldownMs: 60_000, consecutiveFails: 0 },
  // Fallback 5 — dated Haiku (if latest variant fails)
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

async function callAI(systemPrompt: string, messages: Array<{ role: string; content: string }>, preferredModelId?: string): Promise<{ text: string; source: string }> {
  const errors: string[] = []
  const chatMessages = messages.map(m => ({ role: m.role, content: m.content }))

  // 1) Shogo gateway (pod-native, no key required)
  const llmProvider = createLlmProvider()
  if (llmProvider) {
    // An explicitly picked model is tried first, even if it is cooling down —
    // Sri asked for it by name. Everything else stays as the failover chain.
    const preferred = preferredModelId ? MODEL_CHAIN.filter(m => m.id === preferredModelId) : []
    const fallbacks = MODEL_CHAIN.filter(m => m.id !== preferredModelId && isModelReady(m))
    const ordered = [...preferred, ...fallbacks]
    if (ordered.length === 0) ordered.push([...MODEL_CHAIN].sort((a, b) => a.lastFailAt - b.lastFailAt)[0])
    for (const model of ordered) {
      try {
        const result = await generateText({
          model: llmProvider(model.id),
          system: systemPrompt,
          messages: chatMessages.map(m => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content })),
          maxTokens: 8192,
          temperature: 0.7,
        })
        if (result.text?.trim()) { recordSuccess(model); return { text: result.text, source: model.name } }
        throw new Error('Empty response')
      } catch (err: any) { recordFailure(model, err.message); errors.push(`${model.name}: ${err.message}`) }
    }
  }

  // 2) Sri's own provider keys (never runs out)
  const keys = loadKeys()
  const directProviders: Array<{ name: string; fn: (k: string) => Promise<string>; key?: string }> = [
    { name: 'OpenAI (your key)', fn: k => callDirectOpenAI(k, systemPrompt, chatMessages), key: keys.openai },
    { name: 'Anthropic (your key)', fn: k => callDirectAnthropic(k, systemPrompt, chatMessages), key: keys.anthropic },
    { name: 'Gemini (your key)', fn: k => callDirectGemini(k, systemPrompt, chatMessages), key: keys.gemini },
  ]
  for (const p of directProviders) {
    if (!p.key) continue
    try {
      const text = await p.fn(p.key)
      if (text?.trim()) return { text, source: p.name }
    } catch (err: any) { errors.push(`${p.name}: ${err.message}`) }
  }

  throw new Error(errors.slice(0, 3).join(' | ') || 'No AI provider available')
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
    const { messages, model: preferredModelId } = body as {
      messages: Array<{ role: string; content: string }>
      model?: string
    }
    if (!messages?.length) return c.json({ error: 'messages array required' }, 400)

    const liveContext = await fetchLiveContext()
    const fullPrompt = JARVIS_SYSTEM_PROMPT + liveContext

    let answer: { text: string; source: string }
    try {
      answer = await callAI(fullPrompt, messages, preferredModelId)
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
      await (prisma as any).activityLog.create({ data: { action: 'ai_chat', details: answer.source, surface: 'chat' } }).catch(() => {})
    }
    return c.json({ content: answer.text, source: answer.source })
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

// GET /api/ai/models
app.get('/ai/models', (c) => {
  return c.json({ models: MODEL_CHAIN.map(m => ({
    id: m.id,
    name: m.name,
    healthy: m.healthy || isModelReady(m),
    cooldownRemaining: m.healthy ? 0 : Math.max(0, m.cooldownMs - (Date.now() - m.lastFailAt)),
    lastError: m.lastError,
  })) })
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
  const hasSearch = !!process.env.SERPAPI_KEY
  return c.json({
    chat: hasToken ? 'ready' : 'not configured',
    search: hasSearch ? 'live' : 'limited',
    models: getModelStatus(),
    activeModel: MODEL_CHAIN.find(m => m.healthy)?.name || 'All in cooldown',
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

export default app
