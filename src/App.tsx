import { useEffect, useMemo, useState } from 'react'
import { DetailsDrawer } from './components/DetailsDrawer'
import { ProtectionPanel } from './components/ProtectionPanel'
import { RulesPanel } from './components/RulesPanel'
import { SanitizerWidget } from './components/SanitizerWidget'
import { ScannedFilesTable } from './components/ScannedFilesTable'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import {
  ClockIcon,
  LoaderIcon,
  LockIcon,
  ScanIcon,
} from './components/icons'
import { demoFiles } from './data/demo'
import { viewItems, type ViewId } from './data/navigation'
import { scanFiles } from './utils/scanner'
import { formatRelativeTime } from './utils/time'

function viewFromHash(): ViewId {
  const candidate = window.location.hash.replace('#', '')
  return viewItems.some((item) => item.id === candidate)
    ? (candidate as ViewId)
    : 'overview'
}

interface RunScanButtonProps {
  scanning: boolean
  onScan: () => void
}

function RunScanButton({ scanning, onScan }: RunScanButtonProps) {
  return (
    <button
      type="button"
      onClick={onScan}
      disabled={scanning}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-zinc-100 px-3 py-1.5 text-[11px] font-medium text-zinc-950 transition hover:bg-white disabled:cursor-wait disabled:opacity-60"
    >
      {scanning ? (
        <LoaderIcon className="h-3 w-3 animate-spin" />
      ) : (
        <ScanIcon className="h-3 w-3" />
      )}
      {scanning ? 'Scanning…' : 'Run scan'}
    </button>
  )
}

function App() {
  const [results, setResults] = useState(() => scanFiles(demoFiles))
  const [lastScan, setLastScan] = useState(() => new Date())
  const [now, setNow] = useState(() => Date.now())
  const [scanning, setScanning] = useState(false)
  const [view, setView] = useState<ViewId>(viewFromHash)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [guardrailPane, setGuardrailPane] = useState<'settings' | 'rules'>(
    'settings',
  )

  const [shieldActive, setShieldActive] = useState(true)
  const [preCommit, setPreCommit] = useState(true)
  const [liveWatch, setLiveWatch] = useState(true)
  const [autoSanitize, setAutoSanitize] = useState(true)

  // Keep relative timestamps honest without re-rendering constantly.
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(interval)
  }, [])

  // Simulate a short local scan pass.
  useEffect(() => {
    if (!scanning) return
    const timeout = window.setTimeout(() => {
      setResults(scanFiles(demoFiles))
      setLastScan(new Date())
      setNow(Date.now())
      setScanning(false)
    }, 1100)
    return () => window.clearTimeout(timeout)
  }, [scanning])

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
                    scanning={scanning}
                    onScan={() => setScanning(true)}
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
                <span>{demoFiles.length} files</span>
                <span className="font-mono text-zinc-600">{latency} ms</span>
              </div>

              <div className="mt-3 flex min-h-0 flex-1 gap-3">
                <ScannedFilesTable
                  className="min-h-0 flex-1"
                  files={demoFiles}
                  results={results}
                  scanning={scanning}
                  onRescan={() => setScanning(true)}
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
                    {demoFiles.length} files · {totals.findings} findings ·{' '}
                    {totals.flaggedFiles} flagged
                  </p>
                </div>
                <RunScanButton
                  scanning={scanning}
                  onScan={() => setScanning(true)}
                />
              </div>

              <ScannedFilesTable
                className="min-h-0 flex-1"
                files={demoFiles}
                results={results}
                scanning={scanning}
                onRescan={() => setScanning(true)}
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

      {detailsOpen ? (
        <DetailsDrawer onClose={() => setDetailsOpen(false)}>
          {protectionPanel}
        </DetailsDrawer>
      ) : null}
    </div>
  )
}

export default App
