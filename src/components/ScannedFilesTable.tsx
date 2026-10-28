import type {
  ScannedFile,
  ScanResult,
  SecretFinding,
  Severity,
} from '../utils/scanner'
import { maskSecret } from '../utils/scanner'
import { formatMinutesAgo } from '../utils/time'
import { ScanIcon } from './icons'
import { SeverityBadge } from './SeverityBadge'

interface ScannedFilesTableProps {
  files: ScannedFile[]
  results: ScanResult[]
  scanning: boolean
  onRescan: () => void
  className?: string
}

const MAX_RENDERED_ROWS = 300

const severityRank: Record<Severity, number> = {
  critical: 3,
  high: 2,
  medium: 1,
}

function highestSeverity(findings: SecretFinding[]): Severity | null {
  return findings.reduce<Severity | null>((current, finding) => {
    if (!current || severityRank[finding.severity] > severityRank[current]) {
      return finding.severity
    }
    return current
  }, null)
}

export function ScannedFilesTable({
  files,
  results,
  scanning,
  onRescan,
  className = '',
}: ScannedFilesTableProps) {
  const resultByPath = new Map(results.map((result) => [result.file, result]))
  const flaggedCount = results.filter(
    (result) => result.findings.length > 0,
  ).length
  const visibleFiles = files.slice(0, MAX_RENDERED_ROWS)
  const hiddenCount = files.length - visibleFiles.length

  return (
    <section
      className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-zinc-900 bg-[#0a0a0d] ${className}`}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-900 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
            Recent scans
          </h2>
          <span className="rounded bg-zinc-900/70 px-1.5 py-0.5 font-mono text-[9.5px] text-zinc-600">
            {files.length}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden text-[10px] text-zinc-600 sm:inline">
            {scanning ? 'Scanning…' : `${flaggedCount} flagged`}
          </span>
          <button
            type="button"
            onClick={onRescan}
            disabled={scanning}
            className="inline-flex items-center gap-1.5 text-[10.5px] text-zinc-500 transition hover:text-zinc-200 disabled:cursor-wait disabled:opacity-50"
          >
            <ScanIcon className="h-3 w-3" />
            Rescan
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left">
          <thead className="sticky top-0 z-10 bg-[#0a0a0d]">
            <tr className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">
              <th className="border-b border-zinc-900 py-2.5 pl-4 pr-4 font-medium">
                File
              </th>
              <th className="border-b border-zinc-900 px-3 py-2.5 font-medium">
                Exposure
              </th>
              <th className="border-b border-zinc-900 px-3 py-2.5 font-medium">
                Severity
              </th>
              <th className="border-b border-zinc-900 px-3 py-2.5 font-medium">
                Findings
              </th>
              <th className="border-b border-zinc-900 px-3 py-2.5 font-medium">
                Modified
              </th>
              <th className="border-b border-zinc-900 py-2.5 pl-3 pr-4 text-right font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleFiles.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <p className="text-[11px] text-zinc-500">
                    No files scanned yet
                  </p>
                  <p className="mt-1 text-[10px] text-zinc-700">
                    Run a scan and pick a project folder to see real results.
                  </p>
                </td>
              </tr>
            ) : null}
            {visibleFiles.map((file) => {
              const result = resultByPath.get(file.path)
              const findings = result?.findings ?? []
              const first = findings[0]
              const flagged = findings.length > 0
              const severity = highestSeverity(findings)

              return (
                <tr
                  key={file.path}
                  className="transition-colors duration-150 hover:bg-zinc-900/20"
                >
                  <td className="border-b border-zinc-900/70 py-2.5 pl-4 pr-4">
                    <p className="font-mono text-[11px] text-zinc-300">
                      {file.path}
                    </p>
                    <p className="mt-0.5 text-[9px] text-zinc-700">
                      {file.language}
                    </p>
                  </td>
                  <td className="border-b border-zinc-900/70 px-3 py-2.5">
                    {first ? (
                      <div>
                        <p className="text-[10.5px] text-zinc-400">
                          {first.label}
                        </p>
                        <p className="mt-0.5 font-mono text-[9.5px] text-zinc-700">
                          {maskSecret(first.match)}
                        </p>
                      </div>
                    ) : (
                      <span className="text-[10px] text-zinc-700">
                        No secrets
                      </span>
                    )}
                  </td>
                  <td className="border-b border-zinc-900/70 px-3 py-2.5">
                    {severity ? (
                      <SeverityBadge severity={severity} />
                    ) : (
                      <span className="text-[10px] text-zinc-800">—</span>
                    )}
                  </td>
                  <td className="border-b border-zinc-900/70 px-3 py-2.5 font-mono text-[10px] text-zinc-600">
                    {findings.length}
                  </td>
                  <td className="border-b border-zinc-900/70 px-3 py-2.5 text-[10px] text-zinc-600">
                    {file.touchedMinutesAgo === undefined ? (
                      <span className="text-zinc-700">—</span>
                    ) : (
                      formatMinutesAgo(file.touchedMinutesAgo)
                    )}
                  </td>
                  <td className="border-b border-zinc-900/70 py-2.5 pl-3 pr-4 text-right">
                    <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-500">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          flagged ? 'bg-rose-500' : 'bg-emerald-500'
                        }`}
                      />
                      {flagged ? 'Review' : 'Clean'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {hiddenCount > 0 ? (
          <div className="sticky bottom-0 border-t border-zinc-900 bg-[#0a0a0d] px-4 py-2 text-[9.5px] text-zinc-600">
            Showing the first {MAX_RENDERED_ROWS} of {files.length} files.
            Riskiest files are listed first.
          </div>
        ) : null}
      </div>
    </section>
  )
}
