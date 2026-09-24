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
if (typeof globalThis.fetch === 'function' && !(globalThis as any).__jarvisFetchPatched) {
  const nativeFetch = globalThis.fetch.bind(globalThis)
  globalThis.fetch = ((input: any, init?: RequestInit) => {
    try {
      if (typeof input === 'string') input = authUrl(input)
    } catch {
      // Never let the auth shim break a request — fall through unmodified.
    }
    return nativeFetch(input, init)
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
