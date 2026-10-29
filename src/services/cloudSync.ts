/**
 * Local LAN / peer-to-peer sync transport and configuration.
 *
 * Only ciphertext leaves the machine. Rules and scan history are packed into a
 * versioned snapshot, encrypted with the user's passphrase through the local
 * E2E module, and then written to a user-supplied endpoint. The passphrase is
 * never part of the configuration, the request metadata, or the stored state.
 *
 * Protocol (single opaque snapshot per endpoint):
 *
 *   PUT  <endpoint>  body: encrypted envelope JSON   -> 2xx
 *   GET  <endpoint>  response: encrypted envelope JSON
 *
 * The peer only ever sees a salted PBKDF2/AES-GCM envelope. It must allow
 * cross-origin requests because the desktop webview and browser preview call
 * the endpoint with `fetch`.
 */

import { decryptPayload, encryptPayload } from './encryption.ts'
import { readState, writeState } from './storage.ts'
import {
  normaliseCustomRules,
  type CustomRule,
} from '../utils/customRules.ts'
import {
  normaliseHistory,
  type ScanHistoryEntry,
} from '../utils/history.ts'

export const SYNC_CONFIG_STORE = 'sync.json'
export const SYNC_CONFIG_VERSION = 1
export const SYNC_SNAPSHOT_VERSION = 1

/** Keep a malicious or broken endpoint from exhausting memory. */
const MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024
const MAX_ENDPOINT_LENGTH = 2048
const REQUEST_TIMEOUT_MS = 20_000
const OVERSIZED_SNAPSHOT_MESSAGE =
  'The encrypted snapshot is larger than the supported limit.'

export type SyncDirection = 'push' | 'pull'

export interface SyncConfig {
  version: typeof SYNC_CONFIG_VERSION
  enabled: boolean
  endpoint: string
  lastSyncedAt: number | null
  lastDirection: SyncDirection | null
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  version: SYNC_CONFIG_VERSION,
  enabled: false,
  endpoint: '',
  lastSyncedAt: null,
  lastDirection: null,
}

/**
 * Metadata persisted between sessions. Unknown properties (including a
 * mistakenly supplied passphrase) are discarded rather than written to disk.
 */
export function normaliseSyncConfig(value: unknown): SyncConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_SYNC_CONFIG }
  }

  const candidate = value as Partial<SyncConfig>
  const endpoint =
    typeof candidate.endpoint === 'string'
      ? candidate.endpoint.trim().slice(0, MAX_ENDPOINT_LENGTH)
      : ''

  return {
    version: SYNC_CONFIG_VERSION,
    enabled: candidate.enabled === true && endpoint.length > 0,
    endpoint,
    lastSyncedAt:
      typeof candidate.lastSyncedAt === 'number' &&
      Number.isFinite(candidate.lastSyncedAt)
        ? candidate.lastSyncedAt
        : null,
    lastDirection:
      candidate.lastDirection === 'push' || candidate.lastDirection === 'pull'
        ? candidate.lastDirection
        : null,
  }
}

export async function loadSyncConfig(): Promise<SyncConfig> {
  return normaliseSyncConfig(await readState<unknown>(SYNC_CONFIG_STORE))
}

// Serialise writes so rapid edits (e.g. typing an endpoint) cannot land on disk
// out of order and resurrect an older value.
let saveQueue: Promise<void> = Promise.resolve()

export function saveSyncConfig(config: SyncConfig): Promise<void> {
  const snapshot = normaliseSyncConfig(config)
  saveQueue = saveQueue
    .catch(() => {
      // Keep the queue alive after a failed write; the next save retries.
    })
    .then(() => writeState(SYNC_CONFIG_STORE, snapshot))

  return saveQueue
}

/**
 * True for IPv4 literals that only exist on a local network: loopback,
 * RFC 1918 private ranges, and link-local (APIPA) addresses.
 */
function isLocalIpv4(hostname: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)
  if (!match) return false

  const octets = match.slice(1).map(Number)
  if (octets.some((octet) => octet > 255)) return false

  const [a, b] = octets
  return (
    a === 10 ||
    a === 127 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 169 && b === 254)
  )
}

/** True for IPv6 loopback, unique-local (fc00::/7), and link-local (fe80::/10). */
function isLocalIpv6(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()

  return (
    host === '::1' ||
    /^f[cd][0-9a-f]{2}:/.test(host) ||
    /^fe[89ab][0-9a-f]:/.test(host)
  )
}

/**
 * HTTP is acceptable when the host cannot be a public internet name:
 * localhost, mDNS `.local` names, single-label device hostnames, or private
 * IP literals. Everything else needs HTTPS.
 */
function isLocalNetworkHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')

  if (isLocalIpv4(host) || isLocalIpv6(hostname)) return true
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host.endsWith('.local')) return true

  // A name without a dot is resolved by the local network (mDNS/NetBIOS/DNS
  // suffix), never by the public DNS hierarchy.
  return host.length > 0 && !host.includes('.') && !host.includes(':')
}

/**
 * Validate a user-supplied endpoint. Public endpoints must use HTTPS; plain
 * HTTP is limited to loopback, `.local` hostnames, single-label device names,
 * and private LAN addresses. Credentials/fragments are rejected so nothing
 * sensitive can hide in a URL that might later be logged by a proxy.
 */
export function validateSyncEndpoint(value: string): string | null {
  const endpoint = value.trim()

  if (!endpoint) return 'Enter a sync endpoint.'
  if (endpoint.length > MAX_ENDPOINT_LENGTH) {
    return `Endpoint URLs are limited to ${MAX_ENDPOINT_LENGTH} characters.`
  }

  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return 'Enter a valid absolute URL, e.g. http://192.168.1.50:8080/sync.'
  }

  if (url.username || url.password) {
    return 'Do not put credentials in the endpoint URL.'
  }

  if (url.hash) {
    return 'The endpoint must not include a URL fragment.'
  }

  if (url.protocol === 'https:') return null
  if (url.protocol === 'http:' && isLocalNetworkHost(url.hostname)) return null

  return 'Use HTTPS for public endpoints. Plain HTTP is only allowed for localhost, .local hostnames, and private LAN addresses.'
}

export interface SyncSnapshot {
  syncVersion: typeof SYNC_SNAPSHOT_VERSION
  exportedAt: number
  rules: CustomRule[]
  history: ScanHistoryEntry[]
}

/** Build the plaintext snapshot that will be encrypted before upload. */
export function buildSyncSnapshot(
  rules: CustomRule[],
  history: ScanHistoryEntry[],
): SyncSnapshot {
  return {
    syncVersion: SYNC_SNAPSHOT_VERSION,
    exportedAt: Date.now(),
    rules: normaliseCustomRules(rules),
    history: normaliseHistory(history),
  }
}

/**
 * Validate a decrypted snapshot before it can replace local state. Arrays are
 * required so a truncated or foreign payload cannot silently wipe the user's
 * rules and history.
 */
export function normaliseSyncSnapshot(value: unknown): SyncSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SyncRequestError(
      'invalid-response',
      'The decrypted sync snapshot is not an object.',
    )
  }

  const candidate = value as Partial<SyncSnapshot>

  if (candidate.syncVersion !== SYNC_SNAPSHOT_VERSION) {
    throw new SyncRequestError(
      'invalid-response',
      'The sync snapshot uses an unsupported schema version.',
    )
  }

  if (!Array.isArray(candidate.rules) || !Array.isArray(candidate.history)) {
    throw new SyncRequestError(
      'invalid-response',
      'The sync snapshot is missing its rules or history.',
    )
  }

  return {
    syncVersion: SYNC_SNAPSHOT_VERSION,
    exportedAt:
      typeof candidate.exportedAt === 'number' &&
      Number.isFinite(candidate.exportedAt)
        ? candidate.exportedAt
        : Date.now(),
    rules: normaliseCustomRules(candidate.rules),
    history: normaliseHistory(candidate.history),
  }
}

export type SyncErrorKind =
  | 'invalid-endpoint'
  | 'offline'
  | 'timeout'
  | 'network'
  | 'http'
  | 'invalid-response'

export class SyncRequestError extends Error {
  readonly kind: SyncErrorKind
  readonly status?: number

  constructor(
    kind: SyncErrorKind,
    message: string,
    options?: { cause?: unknown; status?: number },
  ) {
    super(message, options)
    this.name = 'SyncRequestError'
    this.kind = kind
    this.status = options?.status
  }
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

async function request<T>(
  endpoint: string,
  init: RequestInit,
  consume: (response: Response) => Promise<T>,
): Promise<T> {
  if (typeof fetch !== 'function') {
    throw new SyncRequestError(
      'network',
      'Network access is unavailable in this environment.',
    )
  }

  if (isOffline()) {
    throw new SyncRequestError(
      'offline',
      'You are offline. Reconnect before syncing.',
    )
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(endpoint, {
      ...init,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    })

    // Keep the deadline alive while the body is consumed so an endpoint that
    // stalls mid-response cannot leave the UI stuck in "syncing".
    return await consume(response)
  } catch (error) {
    if (error instanceof SyncRequestError) throw error

    if (controller.signal.aborted) {
      throw new SyncRequestError(
        'timeout',
        'The sync request timed out. Check the endpoint and try again.',
        { cause: error },
      )
    }

    if (isOffline()) {
      throw new SyncRequestError(
        'offline',
        'You are offline. Reconnect before syncing.',
        { cause: error },
      )
    }

    throw new SyncRequestError(
      'network',
      'Could not reach the sync endpoint. Check the URL, its CORS policy, and that it does not redirect.',
      { cause: error },
    )
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Read a response body while enforcing the snapshot cap. Streaming means a
 * hostile endpoint cannot make us buffer an unbounded payload before checking.
 */
async function readResponseText(response: Response): Promise<string> {
  if (!response.body) {
    const text = await response.text()
    if (new TextEncoder().encode(text).byteLength > MAX_SNAPSHOT_BYTES) {
      throw new SyncRequestError('invalid-response', OVERSIZED_SNAPSHOT_MESSAGE)
    }
    return text
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const parts: string[] = []
  let received = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      received += value.byteLength
      if (received > MAX_SNAPSHOT_BYTES) {
        await reader.cancel().catch(() => {})
        throw new SyncRequestError('invalid-response', OVERSIZED_SNAPSHOT_MESSAGE)
      }

      parts.push(decoder.decode(value, { stream: true }))
    }
  } finally {
    reader.releaseLock()
  }

  parts.push(decoder.decode())
  return parts.join('')
}

function httpError(response: Response): SyncRequestError {
  let message = `The sync endpoint returned HTTP ${response.status}.`

  if (response.status === 401 || response.status === 403) {
    message = 'The sync endpoint rejected the request. Check its access policy.'
  } else if (response.status === 404) {
    message = 'The sync endpoint was not found. Check the URL.'
  } else if (response.status === 413) {
    message = 'The encrypted snapshot is too large for this endpoint.'
  } else if (response.status >= 500) {
    message = 'The sync service is unavailable right now. Try again later.'
  }

  return new SyncRequestError('http', message, { status: response.status })
}

export interface SyncPushResult {
  ciphertextBytes: number
}

/** Encrypt a snapshot locally and PUT the envelope to the endpoint. */
export async function pushSyncSnapshot(
  endpoint: string,
  snapshot: SyncSnapshot,
  passphrase: string,
): Promise<SyncPushResult> {
  const endpointError = validateSyncEndpoint(endpoint)
  if (endpointError) {
    throw new SyncRequestError('invalid-endpoint', endpointError)
  }

  const encrypted = await encryptPayload(snapshot, passphrase)
  return request(
    endpoint.trim(),
    {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: encrypted,
    },
    async (response) => {
      if (!response.ok) throw httpError(response)

      return {
        ciphertextBytes: new TextEncoder().encode(encrypted).byteLength,
      } satisfies SyncPushResult
    },
  )
}

/** GET an envelope from the endpoint, decrypt it, and validate the snapshot. */
export async function pullSyncSnapshot(
  endpoint: string,
  passphrase: string,
): Promise<SyncSnapshot> {
  const endpointError = validateSyncEndpoint(endpoint)
  if (endpointError) {
    throw new SyncRequestError('invalid-endpoint', endpointError)
  }

  const encrypted = await request(
    endpoint.trim(),
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
    },
    async (response) => {
      if (response.status === 404) {
        throw new SyncRequestError(
          'invalid-response',
          'No encrypted snapshot was found at this endpoint.',
          { status: 404 },
        )
      }

      if (!response.ok) throw httpError(response)

      const declaredLength = Number(response.headers.get('content-length') ?? 0)
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > MAX_SNAPSHOT_BYTES
      ) {
        throw new SyncRequestError(
          'invalid-response',
          OVERSIZED_SNAPSHOT_MESSAGE,
        )
      }

      return readResponseText(response)
    },
  )

  if (!encrypted.trim()) {
    throw new SyncRequestError(
      'invalid-response',
      'The sync endpoint returned an empty snapshot.',
    )
  }

  const decrypted = await decryptPayload<Record<string, unknown>>(
    encrypted,
    passphrase,
  )
  return normaliseSyncSnapshot(decrypted)
}
