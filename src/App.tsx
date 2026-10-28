import { useEffect, useMemo, useRef, useState } from 'react'
import { DetailsDrawer } from './components/DetailsDrawer'
import { ProtectionPanel } from './components/ProtectionPanel'
import { RulesPanel } from './components/RulesPanel'
import { SanitizerWidget } from './components/SanitizerWidget'
import { ScannedFilesTable } from './components/ScannedFilesTable'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import {
  ClockIcon,
  CloseIcon,
  LoaderIcon,
  LockIcon,
  ScanIcon,
} from './components/icons'
import { demoFiles } from './data/demo'
import { viewItems, type ViewId } from './data/navigation'
import {
  isDesktopApp,
  pickProjectFolder,
  registerProjectScope,
} from './services/desktop'
import {
  scanDirectory,
  scanFiles,
  type DirectoryScanOutcome,
  type ScannedFile,
} from './utils/scanner'
import {
  installPreCommitHook,
  inspectPreCommitHook,
  type HookStatus,
} from './utils/preCommit'
import { formatRelativeTime } from './utils/time'

function viewFromHash(): ViewId {
  const candidate = window.location.hash.replace('#', '')
  return viewItems.some((item) => item.id === candidate)
    ? (candidate as ViewId)
    : 'overview'
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return 'Something went wrong while reading the local filesystem.'
}

function workspaceLabel(path: string | null): string | null {
  if (!path) return null
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

interface RunScanButtonProps {
  picking: boolean
  scanning: boolean
  onScan: () => void
}

function RunScanButton({ picking, scanning, onScan }: RunScanButtonProps) {
  const busy = picking || scanning
  const label = picking
    ? 'Choosing folder…'
    : scanning
      ? 'Scanning…'
      : 'Run scan'

  return (
    <button
      type="button"
      onClick={onScan}
      disabled={busy}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-zinc-100 px-3 py-1.5 text-[11px] font-medium text-zinc-950 transition hover:bg-white disabled:cursor-wait disabled:opacity-60"
    >
      {busy ? (
        <LoaderIcon className="h-3 w-3 animate-spin" />
      ) : (
        <ScanIcon className="h-3 w-3" />
      )}
      {label}
    </button>
  )
}

interface Notice {
  kind: 'info' | 'error'
  message: string
}

function App() {
  const [files, setFiles] = useState<ScannedFile[]>(demoFiles)
  const [results, setResults] = useState(() => scanFiles(demoFiles))
  const [lastScan, setLastScan] = useState(() => new Date())
  const [now, setNow] = useState(() => Date.now())
  const [picking, setPicking] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState<{
    processedFiles: number
    totalFiles: number
  } | null>(null)
  const [scanSummary, setScanSummary] = useState<DirectoryScanOutcome | null>(
    null,
  )
  const [workspacePath, setWorkspacePath] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [hookStatus, setHookStatus] = useState<HookStatus>('unknown')
  const [hookBusy, setHookBusy] = useState(false)
  const [hookMessage, setHookMessage] = useState<string | null>(null)

  const [view, setView] = useState<ViewId>(viewFromHash)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [guardrailPane, setGuardrailPane] = useState<'settings' | 'rules'>(
    'settings',
  )

  const [shieldActive, setShieldActive] = useState(true)
  const [preCommit, setPreCommit] = useState(true)
  const [liveWatch, setLiveWatch] = useState(true)
  const [autoSanitize, setAutoSanitize] = useState(true)

  const scanRunRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const isDesktop = isDesktopApp()

  // Keep relative timestamps honest without re-rendering constantly.
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(interval)
  }, [])

  // Cancel any in-flight folder scan when the window closes.
  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  // Keep the active workspace in the URL hash so reloads and back/forward work.
  useEffect(() => {
    const onHashChange = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Escape closes the overlay details panel on narrow windows.
  useEffect(() => {
    if (!detailsOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetailsOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [detailsOpen])

  const totals = useMemo(() => {
    const findings = results.reduce(
      (sum, result) => sum + result.findings.length,
      0,
    )
    const flaggedFiles = results.filter(
      (result) => result.findings.length > 0,
    ).length
    return { findings, flaggedFiles }
  }, [results])

  const maxLatency = useMemo(
    () =>
      results.reduce(
        (slowest, result) => Math.max(slowest, result.durationMs),
        0,
      ),
    [results],
  )

  const lastScanLabel = formatRelativeTime(lastScan, now)
  const hookEnabled = shieldActive && preCommit
  const latency = maxLatency < 1 ? '<1' : maxLatency.toFixed(1)
  const workspaceName = workspaceLabel(workspacePath)

  async function runDirectoryScan(root: string) {
    const runId = scanRunRef.current + 1
    scanRunRef.current = runId

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setScanning(true)
    setScanProgress({ processedFiles: 0, totalFiles: 0 })
    setScanSummary(null)
    setHookStatus('unknown')
    setHookMessage(null)
    setNotice(null)

    try {
      const outcome = await scanDirectory(root, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (scanRunRef.current !== runId) return
          setScanProgress({
            processedFiles: progress.processedFiles,
            totalFiles: progress.totalFiles,
          })
        },
      })

      if (scanRunRef.current !== runId) return

      setFiles(outcome.files)
      setResults(outcome.results)
      setScanSummary(outcome)
      setWorkspacePath(root)
      setLastScan(new Date())
      setNow(Date.now())
      setHookStatus(await inspectPreCommitHook(root))
    } catch (error) {
      if (scanRunRef.current !== runId) return
      if (error instanceof Error && error.name === 'AbortError') return
      setNotice({ kind: 'error', message: errorMessage(error) })
    } finally {
      if (scanRunRef.current === runId) {
        setScanning(false)
        setScanProgress(null)
      }
    }
  }

  async function startScan() {
    if (picking || scanning) return
    setNotice(null)

    if (!isDesktop) {
      setNotice({
        kind: 'info',
        message:
          'Folder scanning uses the native desktop app. Start it with "npm run desktop".',
      })
      return
    }

    setPicking(true)

    try {
      const selected = await pickProjectFolder()
      if (!selected) return

      const root = await registerProjectScope(selected)
      await runDirectoryScan(root)
    } catch (error) {
      setNotice({ kind: 'error', message: errorMessage(error) })
    } finally {
      setPicking(false)
    }
  }

  function rescan() {
    if (picking || scanning) return
    if (workspacePath) {
      void runDirectoryScan(workspacePath)
    } else {
      void startScan()
    }
  }

  async function handleInstallHook() {
    if (!workspacePath || hookBusy) return

    setHookBusy(true)
    setHookMessage(null)
    setNotice(null)

    try {
      const installed = await installPreCommitHook(workspacePath)
      setHookStatus('installed')
      setPreCommit(true)
      setHookMessage(
        installed.replacedCustomHook
          ? 'Installed. The previous hook was backed up next to it.'
          : 'Pre-commit hook installed.',
      )
    } catch (error) {
      setHookStatus('unknown')
      setNotice({ kind: 'error', message: errorMessage(error) })
    } finally {
      setHookBusy(false)
    }
  }

  function navigate(next: ViewId) {
    setDetailsOpen(false)
    if (window.location.hash === `#${next}`) {
      setView(next)
      return
    }
    window.location.hash = next
  }

  const protectionPanel = (
    <ProtectionPanel
      shieldActive={shieldActive}
      preCommit={preCommit}
      liveWatch={liveWatch}
      autoSanitize={autoSanitize}
      onShieldChange={setShieldActive}
      onPreCommitChange={setPreCommit}
      onLiveWatchChange={setLiveWatch}
      onAutoSanitizeChange={setAutoSanitize}
      workspaceName={workspaceName}
      workspacePath={workspacePath}
      isDesktop={isDesktop}
      hookStatus={hookStatus}
      hookBusy={hookBusy}
      hookMessage={hookMessage}
      onInstallHook={() => void handleInstallHook()}
      onChooseFolder={() => void startScan()}
    />
  )

  const overviewClassName =
    view === 'overview' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'
  const scansClassName =
    view === 'scans' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'
  const sanitizerClassName =
    view === 'sanitizer' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'
  const guardrailsClassName =
    view === 'guardrails' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#09090b] text-zinc-400">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar active={view} onNavigate={navigate} />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar
            active={view}
            onNavigate={navigate}
            shieldActive={shieldActive}
            onShieldChange={setShieldActive}
            onOpenDetails={() => setDetailsOpen(true)}
            workspacePath={workspacePath}
          />

          <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4">
            <div className={overviewClassName}>
              <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-[17px] font-medium tracking-tight text-zinc-100">
                    Overview
                  </h1>
                  <p className="mt-1 text-[11.5px] text-zinc-600">
                    Local secret scanning and AI redaction.
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <span className="hidden items-center gap-1.5 text-[10.5px] text-zinc-600 sm:flex">
                    <ClockIcon className="h-3 w-3" />
                    {lastScanLabel}
                  </span>
                  <RunScanButton
                    picking={picking}
                    scanning={scanning}
                    onScan={() => void startScan()}
                  />
                </div>
              </div>

              <div className="mt-2.5 flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-y border-zinc-900 py-2 text-[10.5px] text-zinc-500">
                <span className="flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      shieldActive ? 'bg-emerald-500' : 'bg-zinc-600'
                    }`}
                  />
                  {shieldActive ? 'Shield armed' : 'Shield paused'}
                </span>
                <span>
                  {hookEnabled ? 'Pre-commit active' : 'Pre-commit bypassed'}
                </span>
                <span>{totals.findings} findings</span>
                <span>{files.length} files</span>
                {scanning ? (
                  <span className="text-zinc-400">
                    {scanProgress && scanProgress.totalFiles > 0
                      ? `Scanned ${scanProgress.processedFiles}/${scanProgress.totalFiles}`
                      : 'Preparing scan…'}
                  </span>
                ) : null}
                {workspacePath ? (
                  <span
                    className="min-w-0 max-w-[240px] truncate font-mono text-[10px] text-zinc-600"
                    title={workspacePath}
                  >
                    {workspacePath}
                  </span>
                ) : (
                  <span className="rounded border border-zinc-800 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-zinc-600">
                    Demo data
                  </span>
                )}
                <span className="font-mono text-zinc-600">{latency} ms</span>
              </div>

              <div className="mt-3 flex min-h-0 flex-1 gap-3">
                <ScannedFilesTable
                  className="min-h-0 flex-1"
                  files={files}
                  results={results}
                  scanning={scanning}
                  onRescan={rescan}
                />

                <aside className="hidden w-[252px] shrink-0 xl:block">
                  <div className="flex h-full min-h-0 flex-col rounded-lg border border-zinc-900 bg-[#0a0a0d] p-4">
                    {protectionPanel}
                  </div>
                </aside>
              </div>
            </div>

            <div className={scansClassName}>
              <div className="flex shrink-0 flex-wrap items-end justify-between gap-3 pb-3">
                <div className="min-w-0">
                  <h1 className="text-[17px] font-medium tracking-tight text-zinc-100">
                    Scans
                  </h1>
                  <p className="mt-1 text-[11.5px] text-zinc-600">
                    {files.length} files · {totals.findings} findings ·{' '}
                    {totals.flaggedFiles} flagged
                    {scanSummary && scanSummary.skippedFiles > 0
                      ? ` · ${scanSummary.skippedFiles} skipped`
                      : ''}
                    {scanSummary?.truncated ? ' · scan limit reached' : ''}
                  </p>
                  <p
                    className="mt-0.5 truncate font-mono text-[9.5px] text-zinc-700"
                    title={workspacePath ?? 'Demo fixtures'}
                  >
                    {workspacePath ?? 'Demo workspace'}
                  </p>
                </div>
                <RunScanButton
                  picking={picking}
                  scanning={scanning}
                  onScan={() => void startScan()}
                />
              </div>

              <ScannedFilesTable
                className="min-h-0 flex-1"
                files={files}
                results={results}
                scanning={scanning}
                onRescan={rescan}
              />
            </div>

            <div className={sanitizerClassName}>
              <SanitizerWidget />
            </div>

            <div className={guardrailsClassName}>
              <div className="shrink-0 pb-3">
                <h1 className="text-[17px] font-medium tracking-tight text-zinc-100">
                  Guardrails
                </h1>
                <p className="mt-1 text-[11.5px] text-zinc-600">
                  Shield, pre-commit hook, live watch, and detection rules.
                </p>
              </div>

              <div
                role="tablist"
                aria-label="Guardrails panes"
                className="mb-2 flex shrink-0 items-center gap-1 rounded-md border border-zinc-900 p-1 md:hidden"
              >
                {(
                  [
                    { id: 'settings', label: 'Settings' },
                    { id: 'rules', label: 'Detection rules' },
                  ] as const
                ).map((pane) => (
                  <button
                    key={pane.id}
                    type="button"
                    role="tab"
                    aria-selected={guardrailPane === pane.id}
                    onClick={() => setGuardrailPane(pane.id)}
                    className={`flex-1 rounded px-2 py-1 text-[10.5px] font-medium transition ${
                      guardrailPane === pane.id
                        ? 'bg-zinc-900 text-zinc-200'
                        : 'text-zinc-600 hover:text-zinc-300'
                    }`}
                  >
                    {pane.label}
                  </button>
                ))}
              </div>

              <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
                <div
                  className={`min-h-0 flex-col overflow-hidden rounded-lg border border-zinc-900 bg-[#0a0a0d] p-4 ${
                    guardrailPane === 'settings' ? 'flex' : 'hidden'
                  } md:flex`}
                >
                  {protectionPanel}
                </div>
                <div
                  className={`min-h-0 ${
                    guardrailPane === 'rules' ? 'block' : 'hidden'
                  } md:block`}
                >
                  <RulesPanel onTestRules={() => navigate('sanitizer')} />
                </div>
              </div>
            </div>
          </main>

          <footer className="flex h-8 shrink-0 items-center justify-between gap-2 border-t border-zinc-900 px-3 text-[10px] text-zinc-700 sm:px-4">
            <p>Developer Shield · local-first</p>
            <p className="flex items-center gap-1.5">
              <LockIcon className="h-3 w-3" />
              <span className="hidden sm:inline">
                No code leaves this machine
              </span>
              <span className="sm:hidden">Local only</span>
            </p>
          </footer>
        </div>
      </div>

      {notice ? (
        <div
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`fixed bottom-11 right-3 z-[60] flex max-w-[min(420px,calc(100vw-1.5rem))] items-start gap-2 rounded-md border px-3 py-2 text-[10.5px] shadow-2xl sm:right-4 ${
            notice.kind === 'error'
              ? 'border-rose-900/70 bg-rose-950/90 text-rose-200'
              : 'border-zinc-800 bg-zinc-900/95 text-zinc-300'
          }`}
        >
          <span className="min-w-0 flex-1 break-words">{notice.message}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss message"
            className="shrink-0 text-current opacity-60 transition hover:opacity-100"
          >
            <CloseIcon className="h-3 w-3" />
          </button>
        </div>
      ) : null}

      {detailsOpen ? (
        <DetailsDrawer onClose={() => setDetailsOpen(false)}>
          {protectionPanel}
        </DetailsDrawer>
      ) : null}
    </div>
  )
}

export default App
