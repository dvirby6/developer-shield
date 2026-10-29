/**
 * React state for the Local LAN / P2P Sync panel.
 *
 * Configuration (endpoint + last-sync metadata) is persisted through the local
 * storage service. The passphrase is passed straight into push/pull calls and
 * is never stored in this hook, React state, or the sync config file.
 */

import { useEffect, useState } from 'react'
import {
  buildSyncSnapshot,
  loadSyncConfig,
  normaliseSyncConfig,
  pullSyncSnapshot,
  pushSyncSnapshot,
  saveSyncConfig,
  SyncRequestError,
  validateSyncEndpoint,
  type SyncConfig,
  type SyncDirection,
  type SyncSnapshot,
} from '../services/cloudSync'
import { EncryptionError } from '../services/encryption'
import type { CustomRule } from '../utils/customRules'
import type { ScanHistoryEntry } from '../utils/history'

export type SyncStatus =
  | 'disabled'
  | 'ready'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'error'

export interface SyncOutcome {
  direction: SyncDirection
  rules: number
  history: number
  syncedAt: number
  ciphertextBytes?: number
}

interface UseCloudSyncOptions {
  customRules: CustomRule[]
  history: ScanHistoryEntry[]
  onApplySnapshot: (snapshot: SyncSnapshot) => void
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

function describeError(error: unknown): string {
  if (
    error instanceof SyncRequestError ||
    error instanceof EncryptionError ||
    error instanceof Error
  ) {
    return error.message
  }
  return 'Local sync failed. Check the endpoint and try again.'
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} KB`
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`
}

export function useCloudSync({
  customRules,
  history,
  onApplySnapshot,
}: UseCloudSyncOptions) {
  const [config, setConfig] = useState<SyncConfig>(() => ({
    ...normaliseSyncConfig(null),
  }))
  const [status, setStatus] = useState<SyncStatus>('disabled')
  const [busy, setBusy] = useState<SyncDirection | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [online, setOnline] = useState(isOnline)
  const [loaded, setLoaded] = useState(false)

  // Restore endpoint metadata. There is deliberately no passphrase to restore.
  useEffect(() => {
    let cancelled = false

    void loadSyncConfig()
      .then((stored) => {
        if (cancelled) return
        setConfig(stored)
        setStatus(
          stored.enabled ? (isOnline() ? 'ready' : 'offline') : 'disabled',
        )
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not load the saved local sync settings.')
          setStatus('error')
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Keep the indicator honest when the OS network connection changes.
  useEffect(() => {
    const onOnline = () => {
      setOnline(true)
      setStatus((previous) => {
        if (!config.enabled) return previous
        return previous === 'offline' ? 'ready' : previous
      })
    }

    const onOffline = () => {
      setOnline(false)
      setStatus((previous) => {
        if (!config.enabled || previous === 'syncing') return previous
        return 'offline'
      })
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [config.enabled])

  function persistConfig(next: SyncConfig): void {
    setConfig(next)
    void saveSyncConfig(next)
  }

  function updateConfig(
    patch: Partial<Pick<SyncConfig, 'enabled' | 'endpoint'>>,
  ): void {
    const next = normaliseSyncConfig({ ...config, ...patch })
    persistConfig(next)

    if (patch.endpoint !== undefined) {
      setError(null)
      setMessage(null)
      // A new endpoint has not been synced yet, and it clears a stale error.
      if (next.enabled) setStatus(online ? 'ready' : 'offline')
    }

    if (!next.enabled) {
      setStatus('disabled')
      setError(null)
      setMessage(null)
      return
    }

    if (!config.enabled) {
      setStatus(online ? 'ready' : 'offline')
    }
  }

  function clearFeedback(): void {
    setError(null)
    setMessage(null)
  }

  async function run(direction: SyncDirection, passphrase: string) {
    const endpointError = validateSyncEndpoint(config.endpoint)
    if (endpointError) {
      setError(endpointError)
      setStatus('error')
      return null
    }

    if (!config.enabled) {
      setError('Enable local sync before pushing or pulling.')
      setStatus('error')
      return null
    }

    if (!online) {
      setError('You are offline. Reconnect before syncing.')
      setStatus('offline')
      return null
    }

    setBusy(direction)
    setStatus('syncing')
    setError(null)
    setMessage(null)

    try {
      const syncedAt = Date.now()

      if (direction === 'push') {
        const snapshot = buildSyncSnapshot(customRules, history)
        const result = await pushSyncSnapshot(
          config.endpoint,
          snapshot,
          passphrase,
        )
        const next: SyncConfig = {
          ...config,
          lastSyncedAt: syncedAt,
          lastDirection: 'push',
        }
        persistConfig(next)
        setStatus('synced')
        setMessage(
          `Pushed ${snapshot.rules.length} ${
            snapshot.rules.length === 1 ? 'rule' : 'rules'
          } and ${snapshot.history.length} ${
            snapshot.history.length === 1 ? 'scan' : 'scans'
          } · ${formatBytes(result.ciphertextBytes)} ciphertext.`,
        )
        return {
          direction,
          rules: snapshot.rules.length,
          history: snapshot.history.length,
          syncedAt,
          ciphertextBytes: result.ciphertextBytes,
        } satisfies SyncOutcome
      }

      const snapshot = await pullSyncSnapshot(config.endpoint, passphrase)
      onApplySnapshot(snapshot)

      const next: SyncConfig = {
        ...config,
        lastSyncedAt: syncedAt,
        lastDirection: 'pull',
      }
      persistConfig(next)
      setStatus('synced')
      setMessage(
        `Pulled ${snapshot.rules.length} ${
          snapshot.rules.length === 1 ? 'rule' : 'rules'
        } and ${snapshot.history.length} ${
          snapshot.history.length === 1 ? 'scan' : 'scans'
        } from the encrypted snapshot.`,
      )
      return {
        direction,
        rules: snapshot.rules.length,
        history: snapshot.history.length,
        syncedAt,
      } satisfies SyncOutcome
    } catch (caught) {
      setError(describeError(caught))
      setStatus(
        caught instanceof SyncRequestError && caught.kind === 'offline'
          ? 'offline'
          : 'error',
      )
      return null
    } finally {
      setBusy(null)
    }
  }

  return {
    config,
    status,
    busy,
    error,
    message,
    online,
    loaded,
    updateConfig,
    clearFeedback,
    push: (passphrase: string) => run('push', passphrase),
    pull: (passphrase: string) => run('pull', passphrase),
  }
}
