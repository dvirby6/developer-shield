import { useState } from 'react'
import {
  validateSyncEndpoint,
  type SyncConfig,
  type SyncSnapshot,
} from '../services/cloudSync'
import {
  ENCRYPTION_ALGORITHM,
  KEY_DERIVATION_FUNCTION,
  MIN_PASSPHRASE_LENGTH,
  PBKDF2_ITERATIONS,
} from '../services/encryption'
import { useCloudSync, type SyncStatus } from '../hooks/useCloudSync'
import type { CustomRule } from '../utils/customRules'
import type { ScanHistoryEntry } from '../utils/history'
import { formatRelativeTime } from '../utils/time'
import {
  CloudIcon,
  CloseIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  LoaderIcon,
  LockIcon,
  UploadIcon,
} from './icons'
import { Toggle } from './Toggle'

interface CloudSyncPanelProps {
  customRules: CustomRule[]
  history: ScanHistoryEntry[]
  now: number
  onApplySnapshot: (snapshot: SyncSnapshot) => void
}

const statusView: Record<
  SyncStatus,
  { label: string; dot: string; tone: string; description: string }
> = {
  disabled: {
    label: 'Off',
    dot: 'bg-zinc-600',
    tone: 'text-zinc-500',
    description: 'Sync is off. No snapshot leaves this machine.',
  },
  ready: {
    label: 'Ready',
    dot: 'bg-sky-500',
    tone: 'text-sky-400/80',
    description: 'Endpoint configured. Push or pull when you are ready.',
  },
  syncing: {
    label: 'Syncing',
    dot: 'bg-amber-500 animate-pulse',
    tone: 'text-amber-400/80',
    description: 'Encrypting locally, then contacting the peer.',
  },
  synced: {
    label: 'Synced',
    dot: 'bg-emerald-500',
    tone: 'text-emerald-400/80',
    description: 'The last local sync completed successfully.',
  },
  offline: {
    label: 'Offline',
    dot: 'bg-zinc-500',
    tone: 'text-zinc-400',
    description: 'This device is offline. Reconnect before syncing.',
  },
  error: {
    label: 'Error',
    dot: 'bg-rose-500',
    tone: 'text-rose-400/80',
    description: 'The last sync failed. Review the message below.',
  },
}

const fieldClass =
  'mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950/70 px-2.5 py-1.5 font-mono text-[10.5px] text-zinc-300 outline-none transition placeholder:text-zinc-700 focus:border-zinc-600 focus:ring-1 focus:ring-zinc-700 disabled:cursor-not-allowed disabled:opacity-50'

export function CloudSyncPanel({
  customRules,
  history,
  now,
  onApplySnapshot,
}: CloudSyncPanelProps) {
  const {
    config,
    status,
    busy,
    error,
    message,
    online,
    loaded,
    updateConfig,
    clearFeedback,
    push,
    pull,
  } = useCloudSync({ customRules, history, onApplySnapshot })

  const [passphrase, setPassphrase] = useState('')
  const [showPassphrase, setShowPassphrase] = useState(false)

  const endpointError = validateSyncEndpoint(config.endpoint)
  const passphraseTooShort =
    passphrase.length > 0 && passphrase.length < MIN_PASSPHRASE_LENGTH
  const canEnableSync =
    loaded &&
    endpointError === null &&
    passphrase.length >= MIN_PASSPHRASE_LENGTH
  const canSync =
    loaded &&
    config.enabled &&
    !endpointError &&
    passphrase.length >= MIN_PASSPHRASE_LENGTH &&
    online &&
    busy === null

  const view = statusView[status]
  const lastSync = config.lastSyncedAt
    ? formatRelativeTime(new Date(config.lastSyncedAt), now)
    : 'Never'
  const lastDirection =
    config.lastDirection === 'push'
      ? 'last push'
      : config.lastDirection === 'pull'
        ? 'last pull'
        : 'no sync yet'

  async function handlePush() {
    const outcome = await push(passphrase)
    if (outcome) setPassphrase('')
  }

  async function handlePull() {
    if (
      !window.confirm(
        'Pull will replace local custom rules and scan history with the encrypted local snapshot. Continue?',
      )
    ) {
      return
    }

    const outcome = await pull(passphrase)
    if (outcome) setPassphrase('')
  }

  function changeConfig(patch: Partial<Pick<SyncConfig, 'enabled' | 'endpoint'>>) {
    updateConfig(patch)
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-zinc-900 bg-[#0a0a0d]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800/70 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <CloudIcon className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
          <div className="min-w-0">
            <h2 className="truncate text-[12px] font-semibold text-zinc-200">
              Local LAN / P2P Sync
            </h2>
            <p className="mt-0.5 text-[10.5px] text-zinc-600">
              Encrypted snapshots across your LAN
            </p>
          </div>
        </div>
        <span
          className={`flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-900 px-2 py-0.5 text-[9.5px] ${view.tone}`}
          title={view.description}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${view.dot}`} />
          {view.label}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-4 py-3.5">
        <p className="text-[10px] leading-relaxed text-zinc-600">
          Zero-knowledge local network sync. All payloads are end-to-end
          encrypted <span className="text-zinc-400">before</span> leaving this
          machine. The peer only receives an opaque AES-GCM envelope.
        </p>

        <div className="rounded-md border border-zinc-900 bg-zinc-950/40 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-600">
              Status
            </span>
            <span className={`flex items-center gap-1.5 text-[10px] ${view.tone}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${view.dot}`} />
              {view.label}
            </span>
          </div>
          <p className="mt-1.5 text-[9.5px] leading-relaxed text-zinc-500">
            {view.description}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-zinc-900 pt-2 text-[9.5px] text-zinc-600">
            <span>{customRules.length} rules</span>
            <span>{history.length} scans</span>
            <span>
              {lastSync}
              {config.lastSyncedAt ? ` · ${lastDirection}` : ''}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-y border-zinc-900 py-2.5">
          <div className="min-w-0">
            <p className="text-[11px] text-zinc-300">Enable local sync</p>
            <p className="mt-0.5 text-[9.5px] text-zinc-600">
              {config.enabled
                ? 'Manual push and pull only. Nothing syncs in the background.'
                : endpointError
                  ? 'Add a valid LAN or HTTPS endpoint below to unlock sync.'
                  : passphrase.length < MIN_PASSPHRASE_LENGTH
                    ? `Enter a passphrase of at least ${MIN_PASSPHRASE_LENGTH} characters to unlock sync.`
                    : 'Ready to enable. Nothing syncs until you push or pull.'}
            </p>
          </div>
          <Toggle
            checked={config.enabled}
            onChange={(next) => changeConfig({ enabled: next })}
            label="Enable local LAN sync"
            disabled={
              busy !== null || (!config.enabled && !canEnableSync)
            }
            size="sm"
          />
        </div>

        <div>
          <label
            htmlFor="sync-endpoint"
            className="text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-600"
          >
            Endpoint URL
          </label>
          <input
            id="sync-endpoint"
            type="url"
            value={config.endpoint}
            onChange={(event) =>
              changeConfig({ endpoint: event.target.value })
            }
            disabled={busy !== null}
            placeholder="http://192.168.1.50:8080/sync"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={
              config.endpoint.length > 0 && endpointError !== null
            }
            className={`${fieldClass} ${
              config.endpoint.length > 0 && endpointError
                ? 'border-rose-900/80 focus:border-rose-800 focus:ring-rose-950'
                : ''
            }`}
          />
          {config.endpoint.length > 0 && endpointError ? (
            <p className="mt-1 text-[9.5px] text-rose-400/90">{endpointError}</p>
          ) : (
            <p className="mt-1 text-[9px] leading-relaxed text-zinc-700">
              HTTPS for public hosts. HTTP is allowed on localhost, .local names,
              and private 10.x / 172.16–31.x / 192.168.x addresses. Cross-origin
              PUT/GET must be allowed.
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="sync-passphrase"
            className="text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-600"
          >
            Passphrase
          </label>
          <div className="relative">
            <input
              id="sync-passphrase"
              type={showPassphrase ? 'text' : 'password'}
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              placeholder={`At least ${MIN_PASSPHRASE_LENGTH} characters`}
              spellCheck={false}
              autoComplete="new-password"
              aria-invalid={passphraseTooShort}
              className={`${fieldClass} pr-[62px] ${
                passphraseTooShort
                  ? 'border-rose-900/80 focus:border-rose-800 focus:ring-rose-950'
                  : ''
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassphrase((visible) => !visible)}
              aria-label={
                showPassphrase ? 'Hide passphrase' : 'Show passphrase'
              }
              className="absolute inset-y-0 right-0 flex items-center gap-1 rounded-r-md px-2.5 text-[9.5px] text-zinc-600 transition hover:text-zinc-300"
            >
              {showPassphrase ? (
                <EyeOffIcon className="h-3 w-3" />
              ) : (
                <EyeIcon className="h-3 w-3" />
              )}
              {showPassphrase ? 'Hide' : 'Show'}
            </button>
          </div>
          <p
            className={`mt-1 text-[9px] leading-relaxed ${
              passphraseTooShort ? 'text-rose-400/90' : 'text-zinc-700'
            }`}
          >
            {passphraseTooShort
              ? `Passphrases need at least ${MIN_PASSPHRASE_LENGTH} characters.`
              : config.enabled && passphrase.length === 0
                ? 'Re-enter your passphrase to push or pull. It is held in memory only.'
                : 'Held in memory only. Never stored on disk or sent to the peer.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-zinc-700">
          <LockIcon className="h-2.5 w-2.5" />
          {ENCRYPTION_ALGORITHM} · {KEY_DERIVATION_FUNCTION} ·{' '}
          {PBKDF2_ITERATIONS.toLocaleString()} iterations
        </div>

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-rose-900/70 bg-rose-950/40 px-2.5 py-2 text-[10px] text-rose-200"
          >
            <span className="min-w-0 flex-1 break-words">{error}</span>
            <button
              type="button"
              onClick={clearFeedback}
              aria-label="Dismiss sync error"
              className="shrink-0 opacity-60 transition hover:opacity-100"
            >
              <CloseIcon className="h-3 w-3" />
            </button>
          </div>
        ) : null}

        {message ? (
          <div
            role="status"
            className="flex items-start gap-2 rounded-md border border-emerald-900/60 bg-emerald-950/30 px-2.5 py-2 text-[10px] text-emerald-200/90"
          >
            <span className="min-w-0 flex-1 break-words">{message}</span>
            <button
              type="button"
              onClick={clearFeedback}
              aria-label="Dismiss sync message"
              className="shrink-0 opacity-60 transition hover:opacity-100"
            >
              <CloseIcon className="h-3 w-3" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-zinc-800/70 px-4 py-3">
        <div className="flex flex-col gap-1.5 sm:flex-row">
          <button
            type="button"
            onClick={() => void handlePush()}
            disabled={!canSync}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-zinc-100 px-3 py-1.5 text-[10.5px] font-medium text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === 'push' ? (
              <LoaderIcon className="h-3 w-3 animate-spin" />
            ) : (
              <UploadIcon className="h-3 w-3" />
            )}
            {busy === 'push' ? 'Pushing…' : 'Push snapshot'}
          </button>
          <button
            type="button"
            onClick={() => void handlePull()}
            disabled={!canSync}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-zinc-800 px-3 py-1.5 text-[10.5px] font-medium text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900/60 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === 'pull' ? (
              <LoaderIcon className="h-3 w-3 animate-spin" />
            ) : (
              <DownloadIcon className="h-3 w-3" />
            )}
            {busy === 'pull' ? 'Pulling…' : 'Pull snapshot'}
          </button>
        </div>
        <p className="mt-1.5 text-[9px] leading-relaxed text-zinc-700">
          Config stores only the endpoint and sync timestamps. Pull replaces
          local rules and history after confirmation.
        </p>
      </div>
    </section>
  )
}
