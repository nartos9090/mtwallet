/**
 * Seals the session (the Google refresh token) into a cookie value with
 * AES-GCM, so the service stores nothing: the browser keeps the encrypted
 * token, only this service can read or forge it. Web Crypto only, so it runs
 * on Cloudflare Workers, Node and Bun alike.
 */

const encoder = new TextEncoder()
const keys = new Map<string, Promise<CryptoKey>>()

function key(secret: string): Promise<CryptoKey> {
  let derived = keys.get(secret)
  if (!derived) {
    derived = crypto.subtle
      .importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey'])
      .then((material) =>
        crypto.subtle.deriveKey(
          { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('wallet-session'), info: encoder.encode('cookie v1') },
          material,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt'],
        ),
      )
    keys.set(secret, derived)
  }
  return derived
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

export async function seal(data: unknown, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(secret), encoder.encode(JSON.stringify(data))),
  )
  const sealed = new Uint8Array(iv.length + ciphertext.length)
  sealed.set(iv)
  sealed.set(ciphertext, iv.length)
  return toBase64Url(sealed)
}

/** Returns undefined for anything tampered with, sealed with another secret, or malformed. */
export async function unseal<T>(value: string, secret: string): Promise<T | undefined> {
  try {
    const sealed = fromBase64Url(value)
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: sealed.slice(0, 12) },
      await key(secret),
      sealed.slice(12),
    )
    return JSON.parse(new TextDecoder().decode(plaintext)) as T
  } catch {
    return undefined
  }
}
