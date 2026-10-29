/**
 * Encryption module tests.
 *
 * Run with Node's built-in test runner (no extra dependencies):
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  decryptPayload,
  ENCRYPTION_ALGORITHM,
  ENCRYPTION_VERSION,
  encryptPayload,
  EncryptionError,
  KEY_DERIVATION_FUNCTION,
  MIN_PASSPHRASE_LENGTH,
  PBKDF2_ITERATIONS,
} from '../src/services/encryption.ts'

const PASSPHRASE = 'correct horse battery staple'
const WRONG_PASSPHRASE = 'incorrect horse battery staple'

const samplePayload = {
  version: 1,
  rules: [
    { id: 'acme-key', pattern: 'acme_(live|test)_[A-Za-z0-9]{24}' },
  ],
  history: [
    {
      id: 'scan-1',
      workspaceName: 'demo-workspace',
      scannedAt: 1_790_000_000_000,
      findings: [{ label: 'OpenAI API key', masked: 'sk-p••••••••••wZ1' }],
    },
  ],
  unicode: 'passphrase-🔐-ñ',
}

test('round-trips a nested object', async () => {
  const encrypted = await encryptPayload(samplePayload, PASSPHRASE)
  const decrypted = await decryptPayload<typeof samplePayload>(
    encrypted,
    PASSPHRASE,
  )

  assert.deepEqual(decrypted, samplePayload)
})

test('returns an authenticated, versioned JSON envelope', async () => {
  const encrypted = await encryptPayload({ hello: 'world' }, PASSPHRASE)
  const envelope = JSON.parse(encrypted) as Record<string, unknown>
  const kdf = envelope.kdf as Record<string, unknown>

  assert.equal(envelope.format, 'developer-shield.e2e')
  assert.equal(envelope.version, ENCRYPTION_VERSION)
  assert.equal(envelope.algorithm, ENCRYPTION_ALGORITHM)
  assert.equal(kdf.name, KEY_DERIVATION_FUNCTION)
  assert.equal(kdf.hash, 'SHA-256')
  assert.equal(kdf.iterations, PBKDF2_ITERATIONS)
  assert.ok(PBKDF2_ITERATIONS >= 600_000)
  assert.equal(typeof envelope.iv, 'string')
  assert.equal(typeof envelope.ciphertext, 'string')
})

test('never puts the passphrase or plaintext in the envelope', async () => {
  const encrypted = await encryptPayload(
    { secret: 'sk-live-should-not-leak' },
    PASSPHRASE,
  )

  assert.equal(encrypted.includes(PASSPHRASE), false)
  assert.equal(encrypted.includes('sk-live-should-not-leak'), false)
  assert.equal(encrypted.includes('secret'), false)
})

test('uses a fresh salt and IV for every encryption', async () => {
  const first = JSON.parse(
    await encryptPayload({ value: 1 }, PASSPHRASE),
  ) as { kdf: { salt: string }; iv: string; ciphertext: string }
  const second = JSON.parse(
    await encryptPayload({ value: 1 }, PASSPHRASE),
  ) as { kdf: { salt: string }; iv: string; ciphertext: string }

  assert.notEqual(first.kdf.salt, second.kdf.salt)
  assert.notEqual(first.iv, second.iv)
  assert.notEqual(first.ciphertext, second.ciphertext)
})

test('fails gracefully with a wrong passphrase', async () => {
  const encrypted = await encryptPayload(samplePayload, PASSPHRASE)

  await assert.rejects(
    () => decryptPayload(encrypted, WRONG_PASSPHRASE),
    (error: unknown) => {
      assert.ok(error instanceof EncryptionError)
      assert.equal(error.code, 'decryption-failed')
      assert.match(error.message, /wrong passphrase or corrupted data/)
      return true
    },
  )
})

test('rejects tampered ciphertext', async () => {
  const envelope = JSON.parse(
    await encryptPayload(samplePayload, PASSPHRASE),
  ) as { ciphertext: string }

  // Flip one base64 character while keeping the envelope structurally valid.
  const firstChar = envelope.ciphertext[0]
  const replacement = firstChar === 'A' ? 'B' : 'A'
  envelope.ciphertext =
    replacement + envelope.ciphertext.slice(1)

  await assert.rejects(
    () => decryptPayload(JSON.stringify(envelope), PASSPHRASE),
    (error: unknown) => {
      assert.ok(error instanceof EncryptionError)
      assert.equal(error.code, 'decryption-failed')
      return true
    },
  )
})

test('rejects tampered KDF metadata', async () => {
  const envelope = JSON.parse(
    await encryptPayload(samplePayload, PASSPHRASE),
  ) as { kdf: { iterations: number } }

  envelope.kdf.iterations = PBKDF2_ITERATIONS + 1

  await assert.rejects(
    () => decryptPayload(JSON.stringify(envelope), PASSPHRASE),
    (error: unknown) => {
      assert.ok(error instanceof EncryptionError)
      assert.equal(error.code, 'decryption-failed')
      return true
    },
  )
})

test('rejects malformed envelopes without throwing raw errors', async () => {
  const malformed = [
    '',
    'not json',
    'null',
    '[]',
    '{}',
    JSON.stringify({
      format: 'other',
      version: ENCRYPTION_VERSION,
      algorithm: ENCRYPTION_ALGORITHM,
    }),
  ]

  for (const payload of malformed) {
    await assert.rejects(
      () => decryptPayload(payload, PASSPHRASE),
      (error: unknown) => {
        assert.ok(error instanceof EncryptionError)
        assert.equal(error.code, 'invalid-payload')
        return true
      },
    )
  }
})

test('rejects an unsupported future envelope version', async () => {
  const envelope = JSON.parse(
    await encryptPayload({ value: 1 }, PASSPHRASE),
  ) as { version: number }

  envelope.version = ENCRYPTION_VERSION + 1

  await assert.rejects(
    () => decryptPayload(JSON.stringify(envelope), PASSPHRASE),
    (error: unknown) => {
      assert.ok(error instanceof EncryptionError)
      assert.equal(error.code, 'invalid-payload')
      return true
    },
  )
})

test('rejects passphrases below the minimum length', async () => {
  const shortPassphrase = 'short'

  assert.ok(shortPassphrase.length < MIN_PASSPHRASE_LENGTH)
  await assert.rejects(
    () => encryptPayload({ value: 1 }, shortPassphrase),
    (error: unknown) => {
      assert.ok(error instanceof EncryptionError)
      assert.equal(error.code, 'invalid-input')
      return true
    },
  )

  const encrypted = await encryptPayload({ value: 1 }, PASSPHRASE)
  await assert.rejects(
    () => decryptPayload(encrypted, shortPassphrase),
    (error: unknown) => {
      assert.ok(error instanceof EncryptionError)
      assert.equal(error.code, 'invalid-input')
      return true
    },
  )
})

test('rejects values that are not plain objects', async () => {
  for (const value of [null, [], 'text', 42]) {
    await assert.rejects(
      () => encryptPayload(value as unknown as object, PASSPHRASE),
      (error: unknown) => {
        assert.ok(error instanceof EncryptionError)
        assert.equal(error.code, 'invalid-input')
        return true
      },
    )
  }
})

test('round-trips an empty object', async () => {
  const encrypted = await encryptPayload({}, PASSPHRASE)
  const decrypted = await decryptPayload(encrypted, PASSPHRASE)

  assert.deepEqual(decrypted, {})
})
