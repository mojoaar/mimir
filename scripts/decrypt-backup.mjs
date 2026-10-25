#!/usr/bin/env node
// Decrypts a Mimir backup artifact: `node scripts/decrypt-backup.mjs <file> [out]`
//
// The layout is the one lib/crypto.ts writes: nonce(12) | tag(16) | ciphertext,
// AES-256-GCM, key = HKDF-SHA256(MIMIR_SECRET, info "mimir/backup"). Without the
// same MIMIR_SECRET that produced the file, this cannot recover anything.
import { createDecipheriv, hkdfSync } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const [, , input, output] = process.argv
if (!input) {
  console.error('usage: node scripts/decrypt-backup.mjs <file.enc> [out]')
  process.exit(2)
}

const secret = process.env.MIMIR_SECRET
if (!secret) {
  console.error('MIMIR_SECRET is required: it is the key this backup was encrypted with')
  process.exit(2)
}

const blob = readFileSync(input)
if (blob.length < 28) {
  console.error(`${input} is not a Mimir artifact (too short)`)
  process.exit(1)
}

const key = Buffer.from(hkdfSync('sha256', secret, '', 'mimir/backup', 32))
const nonce = blob.subarray(0, 12)
const tag = blob.subarray(12, 28)
const ciphertext = blob.subarray(28)

let plain
try {
  const decipher = createDecipheriv('aes-256-gcm', key, nonce)
  decipher.setAuthTag(tag)
  plain = Buffer.concat([decipher.update(ciphertext), decipher.final()])
} catch {
  console.error('cannot decrypt: wrong MIMIR_SECRET, or the file is damaged')
  process.exit(1)
}

if (output) writeFileSync(output, plain)
else process.stdout.write(plain)
