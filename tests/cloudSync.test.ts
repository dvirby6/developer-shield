/**
 * Local LAN / P2P sync transport, config, and snapshot tests.
 *
 * Network calls are mocked; nothing leaves the test process.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildSyncSnapshot,
  normaliseSyncConfig,
  normaliseSyncSnapshot,
  pullSyncSnapshot,
  pushSyncSnapshot,
  SyncRequestError,
  validateSyncEndpoint,
  type SyncSnapshot,
} from '../src/services/cloudSync.ts'
import { decryptPayload, encryptPayload } from '../src/services/encryption.ts'
import type { CustomRule } from '../src/utils/customRules.ts'

const PASSPHRASE = 'correct horse battery staple'
const WRONG_PASSPHRASE = 'incorrect horse battery staple'
const ENDPOINT = 'https://sync.example.com/v1/snapshot'

const rules: CustomRule[] = [
  {
    id: 'acme-key',
    label: 'Acme internal key',
    pattern: 'acme_(live|test)_[A-Za-z0-9]{24}',
    severity: 'critical',
    ignoreCase: false,
    enabled: true,
    createdAt: 1_790_000_000_000,
  },
]

const snapshot: SyncSnapshot = buildSyncSnapshot(rules, [])

function mockFetch(
  handler: (url: string, init: RequestInit) => Promise<Response>,
): { calls: Array<{ url: string; init: RequestInit }>; restore: () => void } {
  const original = globalThis.fetch
  const calls: Array<{ url: string; init: RequestInit }> = []

  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString()
    const options = init ?? {}
    calls.push({ url, init: options })
    return handler(url, options)
  }

  return {
    calls,
    restore: () => {
      globalThis.fetch = original
    },
  }
}

test('accepts HTTPS and local LAN HTTP endpoints', () => {
  const valid = [
    'https://sync.example.com/v1/snapshot',
    'http://localhost:8787/snapshot',
    'http://127.0.0.1:8787/snapshot',
    'http://127.0.0.2:8787/snapshot',
    'http://[::1]:8787/snapshot',
    'http://192.168.1.50:8080/sync',
    'http://10.0.0.5/sync',
    'http://172.16.0.10/sync',
    'http://172.31.255.254/sync',
    'http://169.254.10.20/sync',
    'http://devbox.local:8080/sync',
    'http://my-nas.local/sync',
    'http://nas/sync',
    'http://[fd12:3456::1]:8080/sync',
    'http://[fe80::1]:8080/sync',
  ]

  for (const endpoint of valid) {
    assert.equal(validateSyncEndpoint(endpoint), null, endpoint)
  }
})

test('rejects public HTTP and unsafe or malformed endpoints', () => {
  const invalid = [
    '',
    'sync.example.com',
    'http://sync.example.com/snapshot',
    'http://8.8.8.8/snapshot',
    'http://172.15.0.1/snapshot',
    'http://172.32.0.1/snapshot',
    'http://192.169.1.1/snapshot',
    'http://169.253.1.1/snapshot',
    'http://192.168.1.999/snapshot',
    'http://localhost.example.com/snapshot',
    'http://192.168.1.1.example.com/snapshot',
    'http://[2001:4860:4860::8888]/snapshot',
    'http://[fe8::1]/snapshot',
    'http://[fc::1]/snapshot',
    'ftp://sync.example.com/snapshot',
    'https://user:secret@sync.example.com/snapshot',
    'https://sync.example.com/snapshot#fragment',
  ]

  for (const endpoint of invalid) {
    assert.notEqual(validateSyncEndpoint(endpoint), null, endpoint)
  }
})

test('config normalisation stores metadata only', () => {
  const config = normaliseSyncConfig({
    version: 1,
    enabled: true,
    endpoint: `  ${ENDPOINT}  `,
    lastSyncedAt: 1_790_000_000_000,
    lastDirection: 'pull',
    passphrase: 'must-not-survive',
  })

  assert.deepEqual(config, {
    version: 1,
    enabled: true,
    endpoint: ENDPOINT,
    lastSyncedAt: 1_790_000_000_000,
    lastDirection: 'pull',
  })
  assert.equal(JSON.stringify(config).includes('must-not-survive'), false)
})

test('config cannot enable sync without an endpoint', () => {
  const config = normaliseSyncConfig({ enabled: true, endpoint: '   ' })

  assert.equal(config.enabled, false)
  assert.equal(config.endpoint, '')
  assert.equal(config.lastSyncedAt, null)
  assert.equal(config.lastDirection, null)
})

test('snapshot normalisation keeps valid entries and rejects bad payloads', () => {
  const normalised = normaliseSyncSnapshot({
    syncVersion: 1,
    exportedAt: 123,
    rules: [rules[0], { id: 'broken' }],
    history: [],
  })

  assert.equal(normalised.syncVersion, 1)
  assert.equal(normalised.exportedAt, 123)
  assert.equal(normalised.rules.length, 1)
  assert.equal(normalised.rules[0].id, 'acme-key')

  assert.throws(
    () => normaliseSyncSnapshot({ syncVersion: 1, rules: [] }),
    (error: unknown) =>
      error instanceof SyncRequestError && error.kind === 'invalid-response',
  )
  assert.throws(
    () => normaliseSyncSnapshot({ syncVersion: 2, rules: [], history: [] }),
    (error: unknown) =>
      error instanceof SyncRequestError && error.kind === 'invalid-response',
  )
})

test('push encrypts the snapshot before uploading it', async () => {
  const mock = mockFetch(async () => new Response('', { status: 200 }))

  try {
    const result = await pushSyncSnapshot(ENDPOINT, snapshot, PASSPHRASE)

    assert.equal(mock.calls.length, 1)
    assert.equal(mock.calls[0].url, ENDPOINT)
    assert.equal(mock.calls[0].init.method, 'PUT')
    assert.equal(mock.calls[0].init.credentials, 'omit')

    const body = String(mock.calls[0].init.body)
    assert.equal(body.includes('acme-key'), false)
    assert.equal(body.includes('acme_(live|test)'), false)
    assert.equal(body.includes(PASSPHRASE), false)
    assert.ok(result.ciphertextBytes > 0)

    const decrypted = await decryptPayload<SyncSnapshot>(body, PASSPHRASE)
    assert.deepEqual(decrypted.rules, snapshot.rules)
    assert.deepEqual(decrypted.history, snapshot.history)
  } finally {
    mock.restore()
  }
})

test('pull fetches and decrypts a snapshot', async () => {
  const encrypted = await encryptPayload(snapshot, PASSPHRASE)
  const mock = mockFetch(
    async () =>
      new Response(encrypted, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  )

  try {
    const pulled = await pullSyncSnapshot(ENDPOINT, PASSPHRASE)

    assert.equal(mock.calls.length, 1)
    assert.equal(mock.calls[0].init.method, 'GET')
    assert.deepEqual(pulled.rules, snapshot.rules)
    assert.deepEqual(pulled.history, snapshot.history)
  } finally {
    mock.restore()
  }
})

test('pull fails gracefully with the wrong passphrase', async () => {
  const encrypted = await encryptPayload(snapshot, PASSPHRASE)
  const mock = mockFetch(async () => new Response(encrypted, { status: 200 }))

  try {
    await assert.rejects(
      () => pullSyncSnapshot(ENDPOINT, WRONG_PASSPHRASE),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.equal(error.name, 'EncryptionError')
        assert.match(error.message, /wrong passphrase or corrupted data/)
        return true
      },
    )
  } finally {
    mock.restore()
  }
})

test('maps HTTP failures to user-facing sync errors', async () => {
  const mock = mockFetch(
    async () => new Response('upstream down', { status: 503 }),
  )

  try {
    await assert.rejects(
      () => pushSyncSnapshot(ENDPOINT, snapshot, PASSPHRASE),
      (error: unknown) => {
        assert.ok(error instanceof SyncRequestError)
        assert.equal(error.kind, 'http')
        assert.equal(error.status, 503)
        assert.match(error.message, /unavailable/)
        return true
      },
    )
  } finally {
    mock.restore()
  }
})

test('reports a missing remote snapshot on 404', async () => {
  const mock = mockFetch(async () => new Response('', { status: 404 }))

  try {
    await assert.rejects(
      () => pullSyncSnapshot(ENDPOINT, PASSPHRASE),
      (error: unknown) => {
        assert.ok(error instanceof SyncRequestError)
        assert.equal(error.kind, 'invalid-response')
        assert.equal(error.status, 404)
        assert.match(error.message, /No encrypted snapshot/)
        return true
      },
    )
  } finally {
    mock.restore()
  }
})

test('invalid endpoints are rejected before any network call', async () => {
  const mock = mockFetch(async () => new Response('', { status: 200 }))

  try {
    await assert.rejects(
      () => pushSyncSnapshot('http://evil.example.com/snapshot', snapshot, PASSPHRASE),
      (error: unknown) =>
        error instanceof SyncRequestError && error.kind === 'invalid-endpoint',
    )
    assert.equal(mock.calls.length, 0)
  } finally {
    mock.restore()
  }
})
