/**
 * Compliance report generation and export.
 *
 * JSON exports are written through the native save dialog in the desktop app
 * (and downloaded in the browser). PDF export opens a print-ready A4 report and
 * uses the system print dialog, so no third-party PDF engine or network access
 * is required.
 */

import { APP_NAME } from '../data/app'
import { isDesktopApp } from './desktop'
import type { ScanHistoryEntry } from '../utils/history'
import type { Severity } from '../utils/scanner'

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium']

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(timestamp))
}

function safeFileStem(value: string): string {
  const stem = value
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return stem || 'workspace'
}

export function reportFileName(
  entry: ScanHistoryEntry,
  extension: 'json' | 'html',
): string {
  const date = new Date(entry.scannedAt).toISOString().slice(0, 10)
  return `developer-shield-${safeFileStem(entry.workspaceName)}-${date}.${extension}`
}

export interface JsonReport {
  reportVersion: 1
  generator: string
  generatedAt: string
  scan: {
    id: string
    scannedAt: string
    workspace: string
    workspaceName: string
    appVersion: string
    durationMs: number
    scannedFiles: number
    skippedFiles: number
    truncated: boolean
  }
  summary: {
    findings: number
    flaggedFiles: number
    severity: Record<Severity, number>
  }
  findings: Array<{
    file: string
    line: number
    column: number
    rule: string
    kind: string
    severity: Severity
    match: string
  }>
  notes: string[]
}

export function buildJsonReport(entry: ScanHistoryEntry): JsonReport {
  return {
    reportVersion: 1,
    generator: `${APP_NAME} ${entry.appVersion}`,
    generatedAt: new Date().toISOString(),
    scan: {
      id: entry.id,
      scannedAt: new Date(entry.scannedAt).toISOString(),
      workspace: entry.workspacePath,
      workspaceName: entry.workspaceName,
      appVersion: entry.appVersion,
      durationMs: entry.durationMs,
      scannedFiles: entry.scannedFiles,
      skippedFiles: entry.skippedFiles,
      truncated: entry.truncated,
    },
    summary: {
      findings: entry.findings,
      flaggedFiles: entry.flaggedFiles,
      severity: entry.severity,
    },
    findings: entry.files.flatMap((file) =>
      file.findings.map((finding) => ({
        file: finding.file,
        line: finding.line,
        column: finding.column,
        rule: finding.label,
        kind: finding.kind,
        severity: finding.severity,
        match: finding.masked,
      })),
    ),
    notes: [
      'Secrets are masked in this report; the raw values never leave the scanned machine.',
      'Detection is heuristic. Review every finding before committing.',
      '.gitignore rules and dependency/build directories were excluded from the scan.',
    ],
  }
}

export function serialiseJsonReport(entry: ScanHistoryEntry): string {
  return JSON.stringify(buildJsonReport(entry), null, 2)
}

function metric(label: string, value: string | number): string {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(
    String(value),
  )}</strong></div>`
}

/** Report body shared by the print preview and the HTML export. */
export function buildReportBody(entry: ScanHistoryEntry): string {
  const severityRows = SEVERITY_ORDER.map(
    (level) =>
      `<span class="pill pill-${level}">${level}: ${entry.severity[level]}</span>`,
  ).join('')

  const fileRows = entry.files
    .map((file) => {
      const findings = file.findings
        .map(
          (finding) => `<tr>
            <td class="mono">${escapeHtml(file.path)}:${finding.line}</td>
            <td>${escapeHtml(finding.label)}</td>
            <td><span class="sev sev-${finding.severity}">${finding.severity}</span></td>
            <td class="mono">${escapeHtml(finding.masked)}</td>
          </tr>`,
        )
        .join('')

      return `<tr class="file-row">
          <td colspan="4">
            <div class="file-name mono">${escapeHtml(file.path)}</div>
            <div class="file-meta">${escapeHtml(file.language)} · ${file.findings.length} finding${
              file.findings.length === 1 ? '' : 's'
            }</div>
          </td>
        </tr>${findings}`
    })
    .join('')

  return `<article class="ds-report">
    <header class="report-header">
      <div>
        <p class="eyebrow">Security compliance report</p>
        <h1>${escapeHtml(APP_NAME)}</h1>
      </div>
      <div class="report-meta">
        <p>Scan ${escapeHtml(formatTimestamp(entry.scannedAt))}</p>
        <p>Generated ${escapeHtml(formatTimestamp(Date.now()))}</p>
        <p>Report ID <span class="mono">${escapeHtml(entry.id)}</span></p>
      </div>
    </header>

    <section class="workspace">
      <h2>Workspace</h2>
      <p class="mono">${escapeHtml(entry.workspacePath)}</p>
    </section>

    <section class="metrics">
      ${metric('Files scanned', entry.scannedFiles)}
      ${metric('Flagged files', entry.flaggedFiles)}
      ${metric('Findings', entry.findings)}
      ${metric('Skipped', entry.skippedFiles)}
      ${metric('Duration', `${entry.durationMs} ms`)}
      ${metric('Tool version', entry.appVersion)}
    </section>

    <section>
      <h2>Severity breakdown</h2>
      <div class="pills">${severityRows}</div>
      ${entry.truncated ? '<p class="warning">The scan hit its file budget; results may be incomplete.</p>' : ''}
    </section>

    <section>
      <h2>Findings</h2>
      ${
        entry.files.length === 0
          ? '<p class="clean">No secrets were detected in this scan.</p>'
          : `<table class="findings">
              <thead>
                <tr><th>Location</th><th>Rule</th><th>Severity</th><th>Match</th></tr>
              </thead>
              <tbody>${fileRows}</tbody>
            </table>`
      }
    </section>

    <section class="notes">
      <h2>Method &amp; limitations</h2>
      <ul>
        <li>All scanning ran locally. No source code, secret, or telemetry left this machine.</li>
        <li>Secrets are masked in this report; raw values are never persisted.</li>
        <li>.gitignore rules plus dependency and build directories were excluded.</li>
        <li>Detection is heuristic and does not prove the workspace is secret-free.</li>
      </ul>
    </section>

    <footer>
      <span>${escapeHtml(APP_NAME)} · local-first by design</span>
      <span>${escapeHtml(entry.workspaceName)}</span>
    </footer>
  </article>`
}

const REPORT_STYLES = `
.ds-print-report { position: fixed; inset: 0; z-index: 9999; overflow: auto; background: #f4f4f1; color: #18181b; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.ds-print-report .ds-report { width: min(820px, calc(100% - 32px)); margin: 0 auto; background: #ffffff; padding: 40px 44px; box-shadow: 0 20px 60px rgb(0 0 0 / 0.18); }
.ds-print-report .ds-report-toolbar { position: sticky; top: 0; z-index: 2; display: flex; justify-content: flex-end; gap: 8px; padding: 10px 16px; background: #09090b; }
.ds-print-report .ds-report-toolbar button { border-radius: 6px; border: 1px solid #3f3f46; background: #18181b; color: #e4e4e7; font-size: 12px; padding: 6px 12px; cursor: pointer; }
.ds-print-report .ds-report-toolbar button.primary { background: #f4f4f5; border-color: #f4f4f5; color: #18181b; font-weight: 600; }
.ds-print-report h1 { margin: 2px 0 0; font-size: 26px; letter-spacing: -0.02em; }
.ds-print-report h2 { margin: 28px 0 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; color: #71717a; }
.ds-print-report p { margin: 0; font-size: 12px; line-height: 1.55; }
.ds-print-report .report-header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #18181b; padding-bottom: 18px; }
.ds-print-report .eyebrow { font-size: 10px; text-transform: uppercase; letter-spacing: 0.18em; color: #a1a1aa; }
.ds-print-report .report-meta { text-align: right; font-size: 10.5px; color: #52525b; }
.ds-print-report .workspace { margin-top: 20px; padding: 12px 14px; background: #fafafa; border: 1px solid #e4e4e7; border-radius: 6px; }
.ds-print-report .workspace p { margin-top: 4px; font-size: 11px; word-break: break-all; }
.ds-print-report .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 16px; }
.ds-print-report .metric { border: 1px solid #e4e4e7; border-radius: 6px; padding: 10px 12px; }
.ds-print-report .metric span { display: block; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.1em; color: #71717a; }
.ds-print-report .metric strong { display: block; margin-top: 4px; font-size: 18px; }
.ds-print-report .pills { display: flex; flex-wrap: wrap; gap: 6px; }
.ds-print-report .pill, .ds-print-report .sev { display: inline-block; border-radius: 999px; padding: 2px 8px; font-size: 10px; font-weight: 600; text-transform: capitalize; }
.ds-print-report .pill-critical, .ds-print-report .sev-critical { background: #ffe4e6; color: #9f1239; }
.ds-print-report .pill-high, .ds-print-report .sev-high { background: #ffedd5; color: #9a3412; }
.ds-print-report .pill-medium, .ds-print-report .sev-medium { background: #fef3c7; color: #92400e; }
.ds-print-report table.findings { width: 100%; border-collapse: collapse; margin-top: 8px; }
.ds-print-report table.findings th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: #71717a; border-bottom: 1px solid #d4d4d8; padding: 6px 8px; }
.ds-print-report table.findings td { border-bottom: 1px solid #f0f0f2; padding: 6px 8px; font-size: 10.5px; vertical-align: top; }
.ds-print-report table.findings tr.file-row td { background: #fafafa; border-bottom: none; padding-top: 12px; }
.ds-print-report .file-name { font-size: 11px; font-weight: 600; }
.ds-print-report .file-meta { font-size: 9.5px; color: #a1a1aa; margin-top: 2px; }
.ds-print-report .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.ds-print-report .warning { margin-top: 8px; color: #9a3412; font-size: 10.5px; }
.ds-print-report .clean { padding: 12px; border: 1px dashed #a7f3d0; background: #ecfdf5; color: #047857; border-radius: 6px; }
.ds-print-report .notes ul { margin: 0; padding-left: 18px; }
.ds-print-report .notes li { font-size: 10.5px; line-height: 1.6; color: #52525b; }
.ds-print-report footer { display: flex; justify-content: space-between; gap: 16px; margin-top: 32px; border-top: 1px solid #e4e4e7; padding-top: 10px; font-size: 9.5px; color: #a1a1aa; }
@media print {
  @page { size: A4; margin: 14mm; }
  body > *:not(.ds-print-report):not(style) { display: none !important; }
  .ds-print-report { position: static; overflow: visible; background: #ffffff; }
  .ds-print-report .ds-report-toolbar { display: none !important; }
  .ds-print-report .ds-report { width: 100%; margin: 0; padding: 0; box-shadow: none; }
  .ds-print-report table.findings tr { break-inside: avoid; }
}
`

/** Open a full-screen, print-ready report. The user picks "Save as PDF". */
export function openReportPreview(entry: ScanHistoryEntry): void {
  document.querySelector('.ds-print-report')?.remove()

  const style = document.createElement('style')
  style.textContent = REPORT_STYLES

  const container = document.createElement('div')
  container.className = 'ds-print-report'
  container.innerHTML = `<div class="ds-report-toolbar">
      <button type="button" data-action="close">Close</button>
      <button type="button" class="primary" data-action="print">Print / Save as PDF</button>
    </div>${buildReportBody(entry)}`

  const cleanup = () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('afterprint', cleanup)
    style.remove()
    container.remove()
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') cleanup()
  }

  container
    .querySelector<HTMLButtonElement>('[data-action="print"]')
    ?.addEventListener('click', () => window.print())
  container
    .querySelector<HTMLButtonElement>('[data-action="close"]')
    ?.addEventListener('click', cleanup)

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('afterprint', cleanup, { once: true })
  document.body.append(style, container)
}

/**
 * Save the JSON report. Returns the chosen path, a download filename in the
 * browser, or null when the user cancels.
 */
export async function exportJsonReport(
  entry: ScanHistoryEntry,
): Promise<string | null> {
  const contents = serialiseJsonReport(entry)
  const fileName = reportFileName(entry, 'json')

  if (isDesktopApp()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { invoke } = await import('@tauri-apps/api/core')

    const target = await save({
      defaultPath: fileName,
      filters: [{ name: 'JSON report', extensions: ['json'] }],
    })

    if (!target) return null
    await invoke('write_export_file', { path: target, contents })
    return target
  }

  const blob = new Blob([contents], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
  return fileName
}
