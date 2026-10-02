/**
 * One Supabase session for every *.kariyerzamani.com app.
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

/** `.kariyerzamani.com` on any of our hosts; null elsewhere (localhost), where storage stays per-origin. */
export function sharedCookieDomain(): string | null {
  if (typeof window === 'undefined') return null
  const host = window.location.hostname
  return host === PARENT_DOMAIN || host.endsWith(`.${PARENT_DOMAIN}`) ? `.${PARENT_DOMAIN}` : null
}

function readCookie(name: string): string | null {
  const prefix = `${name}=`
  for (const part of document.cookie.split('; ')) {
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
      try {
        return decodeURIComponent(encoded)
      } catch {
        return null
      }
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
  },

  removeItem(key: string) {
    removeChunks(key, 0)
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* storage blocked */
    }
  },
}
