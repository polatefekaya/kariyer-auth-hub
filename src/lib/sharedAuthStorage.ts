import type { Session } from '@supabase/supabase-js'

/**
 * One Supabase session across our subdomains and local development ports.
 *
 * The same file lives in kariyer-basvuru-web, kariyer-auth-hub and kariyer-zamani-web — keep the
 * three identical. supabase-js keeps the session in localStorage by default, which is per origin:
 * each subdomain held its own copy, and copies drift. Supabase rotates the refresh token on every
 * refresh, so once one app refreshed, the others held a spent token, and replaying a spent token
 * can revoke the whole session — logging the person out everywhere.
 *
 * This adapter stores the session in cookies on the parent domain instead, so every app reads and
 * writes the SAME session: a login, a refresh or a logout in one app is seen by all of them. The
 * key is supabase-js' own (sb-<project-ref>-auth-token), so two Supabase projects on the same
 * domain — test and production — never read each other's session.
 *
 * A session is larger than one cookie may be, so it is split into `<key>.0`, `<key>.1`, ….
 */

const PARENT_DOMAIN = 'kariyerzamani.com'

// Below the ~4 KB per-cookie limit with room for the name and attributes.
const CHUNK_SIZE = 3000

// Matches what @supabase/ssr uses; the session's real lifetime is the refresh token's.
const MAX_AGE_SECONDS = 400 * 24 * 60 * 60

/** `.kariyerzamani.com` on any of our hosts; null elsewhere. Local development uses host-only cookies shared across ports. */
export function sharedCookieDomain(): string | null {
  if (typeof window === 'undefined') return null
  const host = window.location.hostname
  return host === PARENT_DOMAIN || host.endsWith(`.${PARENT_DOMAIN}`) ? `.${PARENT_DOMAIN}` : null
}

/** Cookies on localhost are shared by every port, unlike localStorage. */
export function usesSharedAuthStorage(): boolean {
  if (typeof window === 'undefined') return false
  return !!sharedCookieDomain() || ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
}

function readCookie(name: string): string | null {
  const prefix = `${name}=`
  for (const cookie of document.cookie.split(';')) {
    const part = cookie.trim()
    if (part.startsWith(prefix)) return part.slice(prefix.length)
  }
  return null
}

function writeCookie(name: string, value: string, maxAge: number) {
  const domain = sharedCookieDomain()
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie =
    `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Lax${domain ? `; domain=${domain}` : ''}${secure}`
}

function removeChunks(key: string, from: number) {
  for (let i = from; readCookie(`${key}.${i}`) !== null; i++) {
    writeCookie(`${key}.${i}`, '', 0)
  }
}

export const sharedAuthStorage = {
  getItem(key: string): string | null {
    let encoded = ''
    for (let i = 0; ; i++) {
      const chunk = readCookie(`${key}.${i}`)
      if (chunk === null) break
      encoded += chunk
    }

    if (encoded) {
      // Never leave a second, stale session in this origin's old storage.
      try { window.localStorage.removeItem(key) } catch { /* storage blocked */ }
      try {
        return decodeURIComponent(encoded)
      } catch {
        return null
      }
    }

    // A logout in another app must prevent this origin's old session from being resurrected.
    if (readCookie(`${key}.state`) !== null) {
      try { window.localStorage.removeItem(key) } catch { /* storage blocked */ }
      return null
    }

    // One-time move of a session this app kept in its own localStorage before the switch, so
    // nobody who was signed in is signed out by the deploy.
    try {
      const legacy = window.localStorage.getItem(key)
      if (legacy) {
        sharedAuthStorage.setItem(key, legacy)
        window.localStorage.removeItem(key)
        return legacy
      }
    } catch {
      /* storage blocked */
    }

    return null
  },

  setItem(key: string, value: string) {
    const encoded = encodeURIComponent(value)
    let count = 0
    for (let at = 0; at < encoded.length; at += CHUNK_SIZE, count++) {
      writeCookie(`${key}.${count}`, encoded.slice(at, at + CHUNK_SIZE), MAX_AGE_SECONDS)
    }
    // A shorter session than last time must not leave stale tail chunks behind.
    removeChunks(key, count)
    writeCookie(`${key}.state`, 'active', MAX_AGE_SECONDS)
    try { window.localStorage.removeItem(key) } catch { /* storage blocked */ }
  },

  removeItem(key: string) {
    removeChunks(key, 0)
    writeCookie(`${key}.state`, 'signed-out', MAX_AGE_SECONDS)
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* storage blocked */
    }
  },
}


interface SharedSessionClient {
  auth: {
    getSession(): Promise<{ data: { session: Session | null }; error: unknown }>
  }
}

/** Supabase's BroadcastChannel is per origin; cookie changes need their own cross-app watcher. */
export function watchSharedAuthSession(
  client: SharedSessionClient,
  storageKey: string,
  onSession: (session: Session | null) => void,
): () => void {
  if (!usesSharedAuthStorage()) return () => {}
  let seen = sharedAuthStorage.getItem(storageKey)
  let running = false
  let stopped = false

  const sync = async () => {
    if (running || stopped || document.visibilityState === 'hidden') return
    if (sharedAuthStorage.getItem(storageKey) === seen) return
    running = true
    try {
      const { data, error } = await client.auth.getSession()
      if (!error && !stopped) {
        const current = sharedAuthStorage.getItem(storageKey)
        const stored = current ? JSON.parse(current) as Session : null
        // A logout/account switch may have happened while getSession was refreshing.
        if ((stored?.access_token ?? null) !== (data.session?.access_token ?? null) ||
            (stored?.refresh_token ?? null) !== (data.session?.refresh_token ?? null)) return
        onSession(data.session)
        seen = current
      }
    } catch {
      // Keep the current UI on transient failure; the next focus/tick retries.
    } finally {
      running = false
    }
  }

  window.addEventListener('focus', sync)
  window.addEventListener('pageshow', sync)
  document.addEventListener('visibilitychange', sync)
  // No network traffic while the cookie is unchanged; also updates two visible app windows.
  const timer = window.setInterval(sync, 2000)
  return () => {
    stopped = true
    window.clearInterval(timer)
    window.removeEventListener('focus', sync)
    window.removeEventListener('pageshow', sync)
    document.removeEventListener('visibilitychange', sync)
  }
}
