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


export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getToken()
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(extra || {}) }
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
