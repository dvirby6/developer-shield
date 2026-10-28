import { useState } from 'react'
import type { ScanHistoryEntry } from '../utils/history'
import type { Severity } from '../utils/scanner'
import { formatDateTime } from '../utils/time'
import { ChevronDownIcon, ClockIcon, FileIcon, ScanIcon } from './icons'

interface HistoryViewProps {
  entries: ScanHistoryEntry[]
  loading: boolean
  onExportJson: (entry: ScanHistoryEntry) => void
  onExportPdf: (entry: ScanHistoryEntry) => void
  onDelete: (id: string) => void
  onClear: () => void
}

const severityStyles: Record<Severity, string> = {
  critical: 'border-rose-900/60 bg-rose-950/40 text-rose-300',
  high: 'border-orange-900/60 bg-orange-950/30 text-orange-300',
  medium: 'border-amber-900/60 bg-amber-950/30 text-amber-300',
}

function severitySummary(entry: ScanHistoryEntry): string {
  const parts = (['critical', 'high', 'medium'] as const)
    .filter((level) => entry.severity[level] > 0)
    .map((level) => `${entry.severity[level]} ${level}`)
  return parts.length > 0 ? parts.join(' · ') : 'No findings'
}

export function HistoryView({
  entries,
  loading,
  onExportJson,
  onExportPdf,
  onDelete,
  onClear,
}: HistoryViewProps) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3 pb-3">
        <div className="min-w-0">
          <h1 className="text-[17px] font-medium tracking-tight text-zinc-100">
            History
          </h1>
          <p className="mt-1 text-[11.5px] text-zinc-600">
            Local audit trail · masked findings only · newest first
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={entries.length === 0}
          className="shrink-0 rounded-md border border-zinc-800 px-2.5 py-1.5 text-[10.5px] text-zinc-500 transition hover:border-rose-900/60 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear history
        </button>
      </div>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-zinc-900 bg-[#0a0a0d]">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-[11px] text-zinc-600">Loading local history…</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
            <span className="grid h-9 w-9 place-items-center rounded-full border border-zinc-800 text-zinc-600">
              <ClockIcon className="h-4 w-4" />
            </span>
            <p className="mt-3 text-[11.5px] text-zinc-400">No scans yet</p>
            <p className="mt-1 max-w-[320px] text-[10px] leading-relaxed text-zinc-600">
              Every folder scan is saved here with masked findings. Export a
              JSON or PDF compliance report at any time.
            </p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 divide-y divide-zinc-900/80 overflow-y-auto">
            {entries.map((entry) => {
              const isOpen = expanded === entry.id

              return (
                <article key={entry.id}>
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : entry.id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-zinc-900/20"
                  >
                    <span
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-md border ${
                        entry.findings > 0
                          ? 'border-rose-900/50 bg-rose-950/30 text-rose-400'
                          : 'border-emerald-900/50 bg-emerald-950/30 text-emerald-400'
                      }`}
                    >
                      <ScanIcon className="h-3.5 w-3.5" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="truncate text-[11.5px] font-medium text-zinc-200">
                          {entry.workspaceName}
                        </span>
                        <span className="font-mono text-[9.5px] text-zinc-600">
                          {formatDateTime(entry.scannedAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-zinc-600">
                        <span>{entry.scannedFiles} files</span>
                        <span className="text-zinc-800">·</span>
                        <span>{entry.findings} findings</span>
                        <span className="text-zinc-800">·</span>
                        <span>{severitySummary(entry)}</span>
                        {entry.truncated ? (
                          <>
                            <span className="text-zinc-800">·</span>
                            <span className="text-amber-400/80">
                              limit reached
                            </span>
                          </>
                        ) : null}
                      </span>
                    </span>

                    <ChevronDownIcon
                      className={`h-3.5 w-3.5 shrink-0 text-zinc-600 transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {isOpen ? (
                    <div className="border-t border-zinc-900/70 bg-zinc-950/30 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p
                          className="min-w-0 flex-1 truncate font-mono text-[9.5px] text-zinc-600"
                          title={entry.workspacePath}
                        >
                          {entry.workspacePath}
                        </p>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onExportJson(entry)}
                            className="inline-flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-1 text-[10px] text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
                          >
                            <FileIcon className="h-3 w-3" />
                            JSON
                          </button>
                          <button
                            type="button"
                            onClick={() => onExportPdf(entry)}
                            className="inline-flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-1 text-[10px] text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
                          >
                            <FileIcon className="h-3 w-3" />
                            PDF
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(entry.id)}
                            className="rounded-md border border-zinc-800 px-2 py-1 text-[10px] text-zinc-500 transition hover:border-rose-900/60 hover:text-rose-300"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      <dl className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {[
                          ['Duration', `${entry.durationMs} ms`],
                          ['Flagged files', entry.flaggedFiles],
                          ['Skipped', entry.skippedFiles],
                          ['Tool', `v${entry.appVersion}`],
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            className="rounded border border-zinc-900 px-2 py-1.5"
                          >
                            <dt className="text-[8.5px] uppercase tracking-[0.12em] text-zinc-600">
                              {label}
                            </dt>
                            <dd className="mt-0.5 font-mono text-[10px] text-zinc-400">
                              {value}
                            </dd>
                          </div>
                        ))}
                      </dl>

                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {(['critical', 'high', 'medium'] as const).map(
                          (level) =>
                            entry.severity[level] > 0 ? (
                              <span
                                key={level}
                                className={`rounded-full border px-2 py-0.5 text-[9.5px] ${severityStyles[level]}`}
                              >
                                {entry.severity[level]} {level}
                              </span>
                            ) : null,
                        )}
                      </div>

                      {entry.files.length === 0 ? (
                        <p className="mt-3 rounded border border-emerald-900/40 bg-emerald-950/20 px-3 py-2 text-[10px] text-emerald-300">
                          No secrets were detected in this scan.
                        </p>
                      ) : (
                        <div className="mt-3 overflow-hidden rounded border border-zinc-900">
                          <table className="w-full border-collapse text-left">
                            <thead>
                              <tr className="bg-zinc-900/40 text-[8.5px] uppercase tracking-[0.12em] text-zinc-600">
                                <th className="px-2.5 py-1.5 font-medium">
                                  File
                                </th>
                                <th className="px-2.5 py-1.5 font-medium">
                                  Rule
                                </th>
                                <th className="px-2.5 py-1.5 font-medium">
                                  Severity
                                </th>
                                <th className="px-2.5 py-1.5 font-medium">
                                  Match
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {entry.files.flatMap((file) =>
                                file.findings
                                  .slice(0, 200)
                                  .map((finding) => (
                                    <tr
                                      key={`${finding.file}:${finding.line}:${finding.column}:${finding.label}`}
                                      className="border-t border-zinc-900/70"
                                    >
                                      <td className="px-2.5 py-1.5 font-mono text-[9.5px] text-zinc-400">
                                        {file.path}:{finding.line}
                                      </td>
                                      <td className="px-2.5 py-1.5 text-[9.5px] text-zinc-500">
                                        {finding.label}
                                      </td>
                                      <td className="px-2.5 py-1.5 text-[9.5px] capitalize text-zinc-500">
                                        {finding.severity}
                                      </td>
                                      <td className="px-2.5 py-1.5 font-mono text-[9.5px] text-zinc-600">
                                        {finding.masked}
                                      </td>
                                    </tr>
                                  )),
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
