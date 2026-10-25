import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto'

export class CryptoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CryptoError'
  }
}

const NONCE_BYTES = 12
const TAG_BYTES = 16
const KEY_BYTES = 32

export function deriveKey(secret: string, info: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, '', info, KEY_BYTES))
}

export function encrypt(key: Buffer, plaintext: string): Buffer {
  return encryptBytes(key, Buffer.from(plaintext, 'utf8'))
}

export function decrypt(key: Buffer, blob: Buffer): string {
  return decryptBytes(key, blob).toString('utf8')
}

export function encryptBytes(key: Buffer, plaintext: Buffer): Buffer {
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext])
}

export function decryptBytes(key: Buffer, blob: Buffer): Buffer {
  if (blob.length < NONCE_BYTES + TAG_BYTES) throw new CryptoError('cannot decrypt: blob too short')
  const nonce = blob.subarray(0, NONCE_BYTES)
  const tag = blob.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES)
  const ciphertext = blob.subarray(NONCE_BYTES + TAG_BYTES)
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, nonce)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    throw new CryptoError('cannot decrypt: wrong key or tampered data')
  }
}

export function sha256(input: string | Buffer): Buffer {
  return createHash('sha256').update(input).digest()
}

export function redact(value: string): string {
  if (value.length <= 4) return '*'.repeat(value.length)
  return '*'.repeat(value.length - 4) + value.slice(-4)
}
