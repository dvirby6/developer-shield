/**
 * Local end-to-end encryption for local LAN / P2P sync.
 *
 * Rules and scan history are serialised, encrypted in the renderer, and only
 * then handed to a sync transport. The passphrase never leaves this module and
 * the derived key is non-extractable and exists only for the duration of a
 * single operation — nothing key-shaped is ever written to disk.
 *
 * Wire format (versioned JSON envelope, safe to store or upload as text):
 *
 *   {
 *     "format": "developer-shield.e2e",
 *     "version": 1,
 *     "algorithm": "AES-256-GCM",
 *     "kdf": {
 *       "name": "PBKDF2",
 *       "hash": "SHA-256",
 *       "iterations": 600000,
 *       "salt": "<base64>"
 *     },
 *     "iv": "<base64>",
 *     "ciphertext": "<base64>"
 *   }
 *
 * A fresh 16-byte salt and 12-byte IV are generated for every payload, so the
 * same data encrypted twice produces unrelated ciphertexts. The envelope
 * metadata is also authenticated as AES-GCM additional data, which means
 * tampering with the KDF parameters or algorithm identifiers is detected.
 *
 * Both Web Crypto implementations used here (Tauri's WebView and Node's
 * `globalThis.crypto`) are available in secure contexts only, which covers the
 * desktop app and the localhost development server.
 */

/** Envelope version understood by this module. */
export const ENCRYPTION_VERSION = 1

/** Authenticated encryption algorithm recorded in the envelope. */
export const ENCRYPTION_ALGORITHM = 'AES-256-GCM'

/** Web Crypto identifier; the key length is selected separately. */
const WEB_CRYPTO_ALGORITHM = 'AES-GCM'

/** Password-based key derivation function. */
export const KEY_DERIVATION_FUNCTION = 'PBKDF2'
export const KEY_DERIVATION_HASH = 'SHA-256'

/**
 * PBKDF2 work factor. OWASP recommends at least 600,000 iterations for
 * PBKDF2-HMAC-SHA256; the value is stored in the envelope so future increases
 * remain backwards compatible with older payloads.
 */
export const PBKDF2_ITERATIONS = 600_000

/** Refuse envelopes that claim an unreasonably low or high work factor. */
const MIN_PBKDF2_ITERATIONS = 600_000
const MAX_PBKDF2_ITERATIONS = 10_000_000

/** Short passphrases are rejected rather than silently weakening the payload. */
export const MIN_PASSPHRASE_LENGTH = 8

const ENVELOPE_FORMAT = 'developer-shield.e2e'
const SALT_BYTES = 16
const IV_BYTES = 12
const AUTH_TAG_BITS = 128
const KEY_BITS = 256
const ADDITIONAL_DATA_PREFIX = 'developer-shield:cloud-sync'

export type EncryptionErrorCode =
  | 'invalid-input'
  | 'invalid-payload'
  | 'decryption-failed'
  | 'unavailable'

/**
 * Error raised for any encryption or decryption problem.
 *
 * Decryption failures deliberately use one generic code and message so callers
 * cannot distinguish a wrong passphrase from corrupted ciphertext.
 */
export class EncryptionError extends Error {
  readonly code: EncryptionErrorCode

  constructor(
    code: EncryptionErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'EncryptionError'
    this.code = code
  }
}

interface KeyDerivationEnvelope {
  name: typeof KEY_DERIVATION_FUNCTION
  hash: typeof KEY_DERIVATION_HASH
  iterations: number
  salt: string
}

interface EncryptedEnvelope {
  format: typeof ENVELOPE_FORMAT
  version: number
  algorithm: typeof ENCRYPTION_ALGORITHM
  kdf: KeyDerivationEnvelope
  iv: string
  ciphertext: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertPassphrase(passphrase: unknown): asserts passphrase is string {
  if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new EncryptionError(
      'invalid-input',
      `Passphrase must be a string of at least ${MIN_PASSPHRASE_LENGTH} characters.`,
    )
  }
}

function getCrypto(): Crypto {
  const cryptoApi = globalThis.crypto
  if (!cryptoApi || !cryptoApi.subtle) {
    throw new EncryptionError(
      'unavailable',
      'Web Crypto is unavailable. Encryption requires a secure context.',
    )
  }
  return cryptoApi
}

function toBase64(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = ''
  // Chunked so very large ciphertexts cannot overflow the call stack.
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  if (
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    throw new EncryptionError('invalid-payload', 'Encrypted payload is malformed.')
  }

  let binary: string
  try {
    binary = atob(value)
  } catch {
    throw new EncryptionError('invalid-payload', 'Encrypted payload is malformed.')
  }

  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function additionalData(kdf: KeyDerivationEnvelope): Uint8Array<ArrayBuffer> {
  return encoder.encode(
    [
      ADDITIONAL_DATA_PREFIX,
      `v${ENCRYPTION_VERSION}`,
      ENCRYPTION_ALGORITHM,
      kdf.name,
      kdf.hash,
      String(kdf.iterations),
    ].join('|'),
  )
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
  usage: KeyUsage,
): Promise<CryptoKey> {
  const { subtle } = getCrypto()

  const baseKey = await subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  // `extractable: false` keeps raw key bytes out of JavaScript entirely.
  return subtle.deriveKey(
    {
      name: KEY_DERIVATION_FUNCTION,
      hash: KEY_DERIVATION_HASH,
      salt,
      iterations,
    },
    baseKey,
    { name: WEB_CRYPTO_ALGORITHM, length: KEY_BITS },
    false,
    [usage],
  )
}

function parseEnvelope(encryptedData: string): EncryptedEnvelope {
  let value: unknown
  try {
    value = JSON.parse(encryptedData)
  } catch {
    throw new EncryptionError('invalid-payload', 'Encrypted payload is not valid JSON.')
  }

  if (!isPlainObject(value)) {
    throw new EncryptionError('invalid-payload', 'Encrypted payload is malformed.')
  }

  const envelope = value as Partial<EncryptedEnvelope>
  const kdf = envelope.kdf as Partial<KeyDerivationEnvelope> | undefined

  if (envelope.format !== ENVELOPE_FORMAT || envelope.version !== ENCRYPTION_VERSION) {
    throw new EncryptionError(
      'invalid-payload',
      'Encrypted payload uses an unsupported format or version.',
    )
  }

  if (
    envelope.algorithm !== ENCRYPTION_ALGORITHM ||
    !kdf ||
    kdf.name !== KEY_DERIVATION_FUNCTION ||
    kdf.hash !== KEY_DERIVATION_HASH ||
    typeof kdf.salt !== 'string' ||
    typeof envelope.iv !== 'string' ||
    typeof envelope.ciphertext !== 'string'
  ) {
    throw new EncryptionError('invalid-payload', 'Encrypted payload is malformed.')
  }

  if (
    typeof kdf.iterations !== 'number' ||
    !Number.isSafeInteger(kdf.iterations) ||
    kdf.iterations < MIN_PBKDF2_ITERATIONS ||
    kdf.iterations > MAX_PBKDF2_ITERATIONS
  ) {
    throw new EncryptionError(
      'invalid-payload',
      'Encrypted payload uses unsupported key derivation parameters.',
    )
  }

  const salt = fromBase64(kdf.salt)
  if (salt.length !== SALT_BYTES) {
    throw new EncryptionError('invalid-payload', 'Encrypted payload is malformed.')
  }

  const iv = fromBase64(envelope.iv)
  if (iv.length !== IV_BYTES) {
    throw new EncryptionError('invalid-payload', 'Encrypted payload is malformed.')
  }

  const ciphertext = fromBase64(envelope.ciphertext)
  if (ciphertext.length <= AUTH_TAG_BITS / 8) {
    throw new EncryptionError('invalid-payload', 'Encrypted payload is malformed.')
  }

  return {
    format: ENVELOPE_FORMAT,
    version: ENCRYPTION_VERSION,
    algorithm: ENCRYPTION_ALGORITHM,
    kdf: {
      name: KEY_DERIVATION_FUNCTION,
      hash: KEY_DERIVATION_HASH,
      iterations: kdf.iterations,
      salt: kdf.salt,
    },
    iv: envelope.iv,
    ciphertext: envelope.ciphertext,
  }
}

/**
 * Encrypt a JSON-serialisable plain object with a user passphrase.
 *
 * Returns a self-contained JSON envelope (salt, IV, KDF parameters, and
 * ciphertext) that can be stored or uploaded as a string. Async because Web
 * Crypto's subtle API is asynchronous.
 *
 * @throws {EncryptionError} when the passphrase is too short, the value is not
 * a plain object, or encryption is unavailable.
 */
export async function encryptPayload(
  data: object,
  passphrase: string,
): Promise<string> {
  assertPassphrase(passphrase)

  if (!isPlainObject(data)) {
    throw new EncryptionError(
      'invalid-input',
      'Payload must be a plain object.',
    )
  }

  let serialised: string
  try {
    serialised = JSON.stringify(data)
  } catch (error) {
    throw new EncryptionError(
      'invalid-input',
      'Payload could not be serialised as JSON.',
      { cause: error },
    )
  }

  const cryptoApi = getCrypto()
  const { subtle } = cryptoApi
  const salt = cryptoApi.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = cryptoApi.getRandomValues(new Uint8Array(IV_BYTES))
  const kdf: KeyDerivationEnvelope = {
    name: KEY_DERIVATION_FUNCTION,
    hash: KEY_DERIVATION_HASH,
    iterations: PBKDF2_ITERATIONS,
    salt: toBase64(salt),
  }

  const key = await deriveKey(passphrase, salt, kdf.iterations, 'encrypt')

  let ciphertext: Uint8Array<ArrayBuffer>
  try {
    const result = await subtle.encrypt(
      {
        name: WEB_CRYPTO_ALGORITHM,
        iv,
        additionalData: additionalData(kdf),
        tagLength: AUTH_TAG_BITS,
      },
      key,
      encoder.encode(serialised),
    )
    ciphertext = new Uint8Array(result)
  } catch (error) {
    throw new EncryptionError(
      'invalid-input',
      'Payload could not be encrypted.',
      { cause: error },
    )
  }

  const envelope: EncryptedEnvelope = {
    format: ENVELOPE_FORMAT,
    version: ENCRYPTION_VERSION,
    algorithm: ENCRYPTION_ALGORITHM,
    kdf,
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
  }

  return JSON.stringify(envelope)
}

/**
 * Decrypt an envelope produced by {@link encryptPayload}.
 *
 * Uses the salt and iteration count recorded in the envelope, so payloads
 * encrypted before a future work-factor increase still open correctly.
 *
 * @throws {EncryptionError} with code `decryption-failed` for a wrong
 * passphrase or tampered ciphertext; malformed envelopes use
 * `invalid-payload`. The underlying Web Crypto error is retained as `cause`.
 */
export async function decryptPayload<
  T extends object = Record<string, unknown>,
>(encryptedData: string, passphrase: string): Promise<T> {
  assertPassphrase(passphrase)

  if (typeof encryptedData !== 'string' || encryptedData.length === 0) {
    throw new EncryptionError('invalid-payload', 'Encrypted payload is missing.')
  }

  const envelope = parseEnvelope(encryptedData)
  const salt = fromBase64(envelope.kdf.salt)
  const iv = fromBase64(envelope.iv)
  const ciphertext = fromBase64(envelope.ciphertext)

  const key = await deriveKey(
    passphrase,
    salt,
    envelope.kdf.iterations,
    'decrypt',
  )

  let plaintext: Uint8Array<ArrayBuffer>
  try {
    const result = await getCrypto().subtle.decrypt(
      {
        name: WEB_CRYPTO_ALGORITHM,
        iv,
        additionalData: additionalData(envelope.kdf),
        tagLength: AUTH_TAG_BITS,
      },
      key,
      ciphertext,
    )
    plaintext = new Uint8Array(result)
  } catch (error) {
    // AES-GCM authentication failed: wrong passphrase or modified payload.
    throw new EncryptionError(
      'decryption-failed',
      'Unable to decrypt payload: wrong passphrase or corrupted data.',
      { cause: error },
    )
  }

  let value: unknown
  try {
    value = JSON.parse(decoder.decode(plaintext))
  } catch (error) {
    throw new EncryptionError(
      'decryption-failed',
      'Unable to decrypt payload: wrong passphrase or corrupted data.',
      { cause: error },
    )
  }

  if (!isPlainObject(value)) {
    throw new EncryptionError('invalid-payload', 'Decrypted payload is not an object.')
  }

  return value as T
}
