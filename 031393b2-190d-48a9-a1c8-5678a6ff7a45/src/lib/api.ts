const TOKEN_KEY = 'jarvis_token'

export function getToken(): string {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token: string) {
  if (typeof localStorage === 'undefined') return
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}


/**
 * Auth transport.
 *
 * The pod's public proxy forwards ONLY the URL — every request header
 * (`Authorization`, `Cookie`, and any custom header) is stripped before the
 * request reaches this API. Verified against the live proxy: a request sent
 * with Authorization + Cookie + custom headers arrives carrying none of them.
 *
 * So header-based auth can never work through it, and the token has to travel
 * in the query string. `authHeaders()` still sets the headers as well, because
 * they DO work for direct calls (curl, tests, other pods) and cost nothing.
 */
export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getToken()
  if (!token) return { ...(extra || {}) }
  return {
    'x-jarvis-token': token,
    Authorization: `Bearer ${token}`,
    ...(extra || {}),
  }
}

/** Append the session token to a URL — the only channel the proxy passes through. */
export function authUrl(url: string): string {
  const token = getToken()
  if (!token || !url.startsWith('/api/') || url.includes('token=')) return url
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
}

// Installed once at module load so every /api/ call in the app is covered —
// including ones added later. Wrapping fetch (rather than editing ~20 call
// sites by hand) is what makes this hold for good instead of until the next
// surface is written.
//
// It also retries, because this preview host is load-balanced across backends
// that do NOT all serve this project: measured live, ~15% of `/api/health` and
// ~10% of `/api/auth/login` requests came back 404 from a *foreign* backend.
// Those requests never reach our server, so retrying them is safe and turns a
// random "login failed" into a non-event.
//
// We only retry a response that provably did NOT come from our own API: a
// 404/502/503/504 whose body is not JSON. Any JSON answer from our API — 401,
// 409, 400 — is returned on the first try, so real errors stay real and fast.
const RETRY_STATUSES = new Set([404, 502, 503, 504])
const RETRY_ATTEMPTS = 4

function isOurJson(text: string): boolean {
  const t = text.trim()
  if (!t.startsWith('{') && !t.startsWith('[')) return false
  try {
    JSON.parse(t)
    return true
  } catch {
    return false
  }
}

// Re-sending a request only works if its body can be read twice. Streams cannot.
function bodyIsResendable(body: unknown): boolean {
  return (
    body == null ||
    typeof body === 'string' ||
    (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) ||
    (typeof FormData !== 'undefined' && body instanceof FormData) ||
    (typeof Blob !== 'undefined' && body instanceof Blob)
  )
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Captured at module scope (bound, so calling it unbound can't throw an
// "Illegal invocation") because the retry helper below has to reach it.
const nativeFetch: typeof fetch =
  typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : (globalThis.fetch as typeof fetch)

async function retryingFetch(input: any, init?: RequestInit): Promise<Response> {
  const isApiCall = typeof input === 'string' && input.startsWith('/api/')
  if (!isApiCall || !bodyIsResendable(init?.body)) return nativeFetch(input, init)

  for (let attempt = 1; ; attempt++) {
    try {
      const res = await nativeFetch(input, init)
      if (attempt >= RETRY_ATTEMPTS || !RETRY_STATUSES.has(res.status)) return res
      const text = await res.clone().text().catch(() => '')
      // A JSON body means our API answered — that 404/5xx is real. Don't retry.
      if (isOurJson(text)) return res
      await delay(120 * attempt)
    } catch (err) {
      if (attempt >= RETRY_ATTEMPTS) throw err
      await delay(120 * attempt)
    }
  }
}

if (typeof globalThis.fetch === 'function' && !(globalThis as any).__jarvisFetchPatched) {
  globalThis.fetch = ((input: any, init?: RequestInit) => {
    try {
      if (typeof input === 'string') input = authUrl(input)
    } catch {
      // Never let the auth shim break a request — fall through unmodified.
    }
    return retryingFetch(input, init)
  }) as typeof fetch
  ;(globalThis as any).__jarvisFetchPatched = true
}

export function jsonAuthHeaders(): Record<string, string> {
  return authHeaders({ 'Content-Type': 'application/json' })
}

/**
 * fetch() with the bearer token attached. Throws an Error carrying the server's
 * own `error` string (never a generic message) so callers can surface it.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<any> {
  const headers = authHeaders((init.headers as Record<string, string>) || {})
  const res = await fetch(path, { ...init, headers })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body?.error || `Request failed (${res.status})`) as Error & { status?: number; code?: string }
    err.status = res.status
    err.code = body?.code
    throw err
  }
  return body
}
