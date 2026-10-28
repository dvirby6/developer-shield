/**
 * Scan history model.
 *
 * Entries keep masked findings only: raw secrets are deliberately never written
 * to disk. History is capped so the local cache cannot grow without bound.
 */

import { APP_VERSION } from '../data/app'
import type {
  DirectoryScanOutcome,
  SecretKind,
  Severity,
} from './scanner'
import { maskSecret } from './scanner'

export const HISTORY_LIMIT = 25
const MAX_FINDINGS_PER_ENTRY = 1_000

export interface HistoryFinding {
  file: string
  label: string
  kind: SecretKind
  severity: Severity
  line: number
  column: number
  /** Masked value, e.g. `sk-p••••••••••wZ1`. */
  masked: string
}

export interface HistoryFile {
  path: string
  language: string
  findings: HistoryFinding[]
}

export interface ScanHistoryEntry {
  id: string
  scannedAt: number
  workspacePath: string
  workspaceName: string
  appVersion: string
  scannedFiles: number
  skippedFiles: number
  truncated: boolean
  durationMs: number
  findings: number
  flaggedFiles: number
  severity: Record<Severity, number>
  files: HistoryFile[]
}

function workspaceNameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

function newEntryId(scannedAt: number): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${scannedAt}-${Math.random().toString(36).slice(2, 10)}`
}

/** Build a persistable record from a completed directory scan. */
export function createHistoryEntry(
  outcome: DirectoryScanOutcome,
  workspacePath: string,
): ScanHistoryEntry {
  const severity: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
  }

  const files: HistoryFile[] = []
  let findings = 0
  let keptFindings = 0

  outcome.files.forEach((file, index) => {
    const result = outcome.results[index]
    if (!result || result.findings.length === 0) return

    findings += result.findings.length

    if (keptFindings >= MAX_FINDINGS_PER_ENTRY) return

    const entryFindings: HistoryFinding[] = []
    for (const finding of result.findings) {
      severity[finding.severity] += 1

      if (keptFindings >= MAX_FINDINGS_PER_ENTRY) continue

      entryFindings.push({
        file: file.path,
        label: finding.label,
        kind: finding.kind,
        severity: finding.severity,
        line: finding.line,
        column: finding.column,
        masked: maskSecret(finding.match),
      })
      keptFindings += 1
    }

    if (entryFindings.length > 0) {
      files.push({
        path: file.path,
        language: file.language,
        findings: entryFindings,
      })
    }
  })

  const scannedAt = Date.now()

  return {
    id: newEntryId(scannedAt),
    scannedAt,
    workspacePath,
    workspaceName: workspaceNameFromPath(workspacePath),
    appVersion: APP_VERSION,
    scannedFiles: outcome.scannedFiles,
    skippedFiles: outcome.skippedFiles,
    truncated: outcome.truncated,
    durationMs: Math.round(outcome.durationMs),
    findings,
    flaggedFiles: files.length,
    severity,
    files,
  }
}

/** Newest first, bounded by `HISTORY_LIMIT`. */
export function addHistoryEntry(
  entries: ScanHistoryEntry[],
  entry: ScanHistoryEntry,
): ScanHistoryEntry[] {
  return [entry, ...entries].slice(0, HISTORY_LIMIT)
}

function isSeverity(value: unknown): value is Severity {
  return value === 'critical' || value === 'high' || value === 'medium'
}

function normaliseEntry(value: unknown): ScanHistoryEntry | null {
  if (!value || typeof value !== 'object') return null
  const entry = value as Partial<ScanHistoryEntry>

  if (
    typeof entry.id !== 'string' ||
    typeof entry.scannedAt !== 'number' ||
    typeof entry.workspacePath !== 'string'
  ) {
    return null
  }

  const files: HistoryFile[] = Array.isArray(entry.files)
    ? entry.files
        .filter(
          (file): file is HistoryFile =>
            Boolean(file) &&
            typeof file.path === 'string' &&
            Array.isArray(file.findings),
        )
        .map((file) => ({
          path: file.path,
          language:
            typeof file.language === 'string' ? file.language : 'TEXT',
          findings: file.findings
            .filter(
              (finding) =>
                Boolean(finding) &&
                typeof finding.file === 'string' &&
                typeof finding.label === 'string' &&
                isSeverity(finding.severity) &&
                typeof finding.masked === 'string',
            )
            .map((finding) => ({
              file: finding.file,
              label: finding.label,
              kind: finding.kind,
              severity: finding.severity,
              line: typeof finding.line === 'number' ? finding.line : 0,
              column:
                typeof finding.column === 'number' ? finding.column : 0,
              masked: finding.masked,
            })),
        }))
    : []

  const severity: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
  }
  if (entry.severity && typeof entry.severity === 'object') {
    for (const level of ['critical', 'high', 'medium'] as const) {
      const count = entry.severity[level]
      if (typeof count === 'number' && count >= 0) severity[level] = count
    }
  }

  return {
    id: entry.id,
    scannedAt: entry.scannedAt,
    workspacePath: entry.workspacePath,
    workspaceName:
      typeof entry.workspaceName === 'string'
        ? entry.workspaceName
        : workspaceNameFromPath(entry.workspacePath),
    appVersion:
      typeof entry.appVersion === 'string' ? entry.appVersion : 'unknown',
    scannedFiles:
      typeof entry.scannedFiles === 'number' ? entry.scannedFiles : 0,
    skippedFiles:
      typeof entry.skippedFiles === 'number' ? entry.skippedFiles : 0,
    truncated: entry.truncated === true,
    durationMs: typeof entry.durationMs === 'number' ? entry.durationMs : 0,
    findings: typeof entry.findings === 'number' ? entry.findings : 0,
    flaggedFiles:
      typeof entry.flaggedFiles === 'number' ? entry.flaggedFiles : files.length,
    severity,
    files,
  }
}

export function normaliseHistory(value: unknown): ScanHistoryEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .map(normaliseEntry)
    .filter((entry): entry is ScanHistoryEntry => entry !== null)
    .sort((a, b) => b.scannedAt - a.scannedAt)
    .slice(0, HISTORY_LIMIT)
}
