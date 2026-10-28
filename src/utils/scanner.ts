/**
 * Developer Shield - local secret scanner.
 *
 * Everything in this module runs in the browser / locally. No secret is ever
 * sent over the network.
 */

import type { DirEntry } from '@tauri-apps/plugin-fs'
import { compilePattern, type CustomRule } from './customRules'
import type { IgnoreRule } from './gitignore'

export type SecretKind =
  | 'openai'
  | 'github'
  | 'aws-access-key'
  | 'aws-secret-key'
  | 'stripe'
  | 'slack'
  | 'google'
  | 'jwt'
  | 'private-key'
  | 'generic'
  | 'custom'

export type Severity = 'critical' | 'high' | 'medium'

export interface SecretFinding {
  /** Stable identifier for this finding inside a file. */
  id: string
  kind: SecretKind
  label: string
  severity: Severity
  /** The raw secret value that must never leave the machine. */
  match: string
  /** Zero-based offset of the secret inside the scanned text. */
  index: number
  /** One-based line / column for editor-style reporting. */
  line: number
  column: number
  /** Shannon entropy (bits per character) of the matched value. */
  entropy: number
}

export interface ScanResult {
  file: string
  findings: SecretFinding[]
  scannedAt: number
  durationMs: number
}

export interface ScanFile {
  path: string
  content: string
}

interface SecretPattern {
  kind: SecretKind
  label: string
  severity: Severity
  pattern: RegExp
  /** Capture group holding the secret. Defaults to the whole match. */
  group?: number
  /** Minimum entropy required (used to suppress noisy generic matches). */
  minEntropy?: number
}

/**
 * Patterns are intentionally conservative: a missed secret is bad, but a
 * scanner that cries wolf on every variable name is unusable.
 */
const SECRET_PATTERNS: SecretPattern[] = [
  {
    kind: 'openai',
    label: 'OpenAI API key',
    severity: 'critical',
    pattern: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    kind: 'github',
    label: 'GitHub token',
    severity: 'critical',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/g,
  },
  {
    kind: 'aws-access-key',
    label: 'AWS access key ID',
    severity: 'critical',
    pattern: /\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/g,
  },
  {
    kind: 'aws-secret-key',
    label: 'AWS secret access key',
    severity: 'critical',
    pattern:
      /\baws_?secret_?access_?key\b\s*[:=]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi,
    group: 1,
  },
  {
    kind: 'stripe',
    label: 'Stripe secret key',
    severity: 'critical',
    pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
  },
  {
    kind: 'slack',
    label: 'Slack token',
    severity: 'high',
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    kind: 'google',
    label: 'Google API key',
    severity: 'high',
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    kind: 'jwt',
    label: 'JSON Web Token',
    severity: 'high',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
  {
    kind: 'private-key',
    label: 'Private key block',
    severity: 'critical',
    // Prefer the whole PEM block; fall back to the header for truncated files.
    pattern:
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----|$)/g,
  },
  {
    kind: 'generic',
    label: 'Hard-coded credential',
    severity: 'medium',
    pattern:
      /\b(?:api[_-]?key|apikey|secret(?:[_-]?key)?|access[_-]?token|auth[_-]?token|password|passwd|pwd)\b\s*[:=]\s*['"]([^'"\n]{12,})['"]/gi,
    group: 1,
    minEntropy: 3,
  },
]

export const SECRET_PATTERN_COUNT = SECRET_PATTERNS.length

export interface SecretPatternInfo {
  kind: SecretKind
  label: string
  severity: Severity
}

/** Built-in rule metadata for the rules panel (regexes stay private). */
export const SECRET_PATTERN_CATALOG: SecretPatternInfo[] = SECRET_PATTERNS.map(
  ({ kind, label, severity }) => ({ kind, label, severity }),
)

const customPatterns: SecretPattern[] = []

/**
 * Replace the active user-defined rules. Compiled patterns are shared by every
 * scanner entry point (directory scans, the sanitizer, and rule previews).
 */
export function setCustomRules(rules: readonly CustomRule[]): void {
  customPatterns.length = 0

  for (const rule of rules) {
    if (!rule.enabled) continue

    const { regex } = compilePattern(rule.pattern, rule.ignoreCase)
    if (!regex) continue

    customPatterns.push({
      kind: 'custom',
      label: rule.label,
      severity: rule.severity,
      pattern: regex,
    })
  }
}

export function customRuleCount(): number {
  return customPatterns.length
}

/** Values that look like credentials but are clearly placeholders. */
const PLACEHOLDER_MARKERS = [
  'process.env',
  'import.meta',
  'your_',
  'your-',
  'changeme',
  'change_me',
  'example',
  'placeholder',
  'redacted',
  'xxxx',
  '<',
  '>',
  '${',
]

/** Shannon entropy in bits per character. */
export function shannonEntropy(value: string): number {
  if (value.length === 0) return 0

  const counts = new Map<string, number>()
  for (const char of value) {
    counts.set(char, (counts.get(char) ?? 0) + 1)
  }

  let entropy = 0
  for (const count of counts.values()) {
    const probability = count / value.length
    entropy -= probability * Math.log2(probability)
  }
  return entropy
}

/** Show only enough of a secret for a human to recognise it. */
export function maskSecret(value: string): string {
  if (value.length <= 8) return '•'.repeat(value.length)
  return `${value.slice(0, 4)}${'•'.repeat(Math.min(12, value.length - 8))}${value.slice(-4)}`
}

function isPlaceholder(value: string): boolean {
  const normalised = value.toLowerCase()
  return PLACEHOLDER_MARKERS.some((marker) => normalised.includes(marker))
}

function positionOf(text: string, index: number): { line: number; column: number } {
  let line = 1
  let lineStart = 0
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text[cursor] === '\n') {
      line += 1
      lineStart = cursor + 1
    }
  }
  return { line, column: index - lineStart + 1 }
}

interface Candidate {
  kind: SecretKind
  label: string
  severity: Severity
  match: string
  index: number
}

function collectCandidates(text: string): Candidate[] {
  const candidates: Candidate[] = []
  const definitions = [...SECRET_PATTERNS, ...customPatterns]

  for (const definition of definitions) {
    const regex = new RegExp(definition.pattern.source, definition.pattern.flags)
    let result: RegExpExecArray | null

    while ((result = regex.exec(text)) !== null) {
      const captured = definition.group ? result[definition.group] : result[0]
      if (!captured) continue

      // Guard against zero-length matches looping forever.
      if (result[0].length === 0) regex.lastIndex += 1

      const offset = result.index + result[0].indexOf(captured)
      const entropy = shannonEntropy(captured)

      if (definition.minEntropy !== undefined && entropy < definition.minEntropy) {
        continue
      }
      if (definition.kind === 'generic' && isPlaceholder(captured)) {
        continue
      }

      candidates.push({
        kind: definition.kind,
        label: definition.label,
        severity: definition.severity,
        match: captured,
        index: offset,
      })
    }
  }

  // Prefer specific, longer matches; drop candidates overlapping an accepted one.
  candidates.sort((a, b) => a.index - b.index || b.match.length - a.match.length)

  const accepted: Candidate[] = []
  for (const candidate of candidates) {
    const end = candidate.index + candidate.match.length
    const overlaps = accepted.some((existing) => {
      const existingEnd = existing.index + existing.match.length
      return candidate.index < existingEnd && end > existing.index
    })
    if (!overlaps) accepted.push(candidate)
  }

  return accepted
}

/**
 * Scan a piece of text (a file, a diff, or pasted code) for secrets.
 */
export function scanText(text: string, file = 'inline'): ScanResult {
  const startedAt = performance.now()
  const findings: SecretFinding[] = collectCandidates(text).map((candidate) => {
    const { line, column } = positionOf(text, candidate.index)
    return {
      ...candidate,
      id: `${file}:${candidate.kind}:${candidate.index}`,
      line,
      column,
      entropy: shannonEntropy(candidate.match),
    }
  })

  return {
    file,
    findings,
    scannedAt: Date.now(),
    durationMs: performance.now() - startedAt,
  }
}

/** Scan a set of files, e.g. the workspace snapshot shown in the dashboard. */
export function scanFiles(files: ScanFile[]): ScanResult[] {
  return files.map((file) => scanText(file.content, file.path))
}

/* -------------------------------------------------------------------------- */
/* Local directory scanning (Tauri desktop only)                              */
/* -------------------------------------------------------------------------- */

/** A file row shown in the dashboard. Contents are dropped after scanning. */
export interface ScannedFile {
  /** Path relative to the selected workspace root, posix separators. */
  path: string
  language: string
  /** Whole minutes since the file was modified, when the platform reports it. */
  touchedMinutesAgo?: number
}

export interface DirectoryScanProgress {
  processedFiles: number
  totalFiles: number
  currentPath: string
}

export interface DirectoryScanOptions {
  signal?: AbortSignal
  /** Maximum number of files to inspect. Defaults to 2000. */
  maxFiles?: number
  /** Maximum size of a single file in bytes. Defaults to 512 KiB. */
  maxFileBytes?: number
  /** Maximum total number of bytes read. Defaults to 32 MiB. */
  maxTotalBytes?: number
  /** Maximum directory depth. Defaults to 24. */
  maxDepth?: number
  onProgress?: (progress: DirectoryScanProgress) => void
}

export interface DirectoryScanOutcome {
  files: ScannedFile[]
  results: ScanResult[]
  scannedFiles: number
  skippedFiles: number
  /** True when the file-count or byte budget stopped the walk early. */
  truncated: boolean
  /** Wall-clock duration of the whole scan, in milliseconds. */
  durationMs: number
}

const DEFAULT_MAX_FILES = 2_000
const DEFAULT_MAX_FILE_BYTES = 512 * 1024
const DEFAULT_MAX_TOTAL_BYTES = 32 * 1024 * 1024
const DEFAULT_MAX_DEPTH = 24
const READ_CONCURRENCY = 8

/** Directories that never contain project source worth scanning. */
const EXCLUDED_DIRS = new Set([
  '.git',
  '.gradle',
  '.next',
  '.nuxt',
  '.pnpm-store',
  '.terraform',
  '.turbo',
  '.venv',
  '.yarn',
  'Pods',
  'bower_components',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'target',
  'vendor',
  'venv',
  '__pycache__',
])

const BINARY_EXTENSIONS = new Set([
  '7z', 'ai', 'avif', 'avi', 'bin', 'bmp', 'bz2', 'class', 'dat', 'db',
  'dll', 'dylib', 'eot', 'exe', 'fig', 'flac', 'gif', 'gz', 'ico', 'jar',
  'jpeg', 'jpg', 'lockb', 'mkv', 'mov', 'mp3', 'mp4', 'ogg', 'otf', 'pdf',
  'png', 'psd', 'rar', 'sketch', 'so', 'sqlite', 'sqlite3', 'tar', 'tiff',
  'ttf', 'war', 'wasm', 'wav', 'webm', 'webp', 'woff', 'woff2', 'xz', 'zip',
])

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  bash: 'SH',
  c: 'C',
  cc: 'C++',
  cjs: 'JS',
  cpp: 'C++',
  cs: 'C#',
  css: 'CSS',
  cts: 'TS',
  env: 'ENV',
  go: 'GO',
  gql: 'GQL',
  graphql: 'GQL',
  h: 'H',
  hpp: 'C++',
  html: 'HTML',
  java: 'JAVA',
  js: 'JS',
  json: 'JSON',
  jsonc: 'JSON',
  jsx: 'JSX',
  kt: 'KT',
  kts: 'KT',
  less: 'LESS',
  md: 'MD',
  mdx: 'MDX',
  mjs: 'JS',
  mts: 'TS',
  php: 'PHP',
  ps1: 'PS1',
  py: 'PY',
  rb: 'RB',
  rs: 'RS',
  sass: 'SASS',
  scss: 'SCSS',
  sh: 'SH',
  sql: 'SQL',
  swift: 'SWIFT',
  svg: 'SVG',
  toml: 'TOML',
  ts: 'TS',
  tsx: 'TSX',
  vue: 'VUE',
  xml: 'XML',
  yaml: 'YAML',
  yml: 'YAML',
  zsh: 'SH',
}

/** Best-effort language label for the dashboard table. */
export function languageForPath(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path

  if (name === '.env' || name.startsWith('.env.') || name.endsWith('.env')) {
    return 'ENV'
  }

  const extension = name.includes('.') ? name.split('.').pop()?.toLowerCase() : ''
  if (!extension) return 'TEXT'

  return LANGUAGE_BY_EXTENSION[extension] ?? extension.toUpperCase().slice(0, 6)
}

function isBinaryPath(name: string): boolean {
  const extension = name.includes('.') ? name.split('.').pop()?.toLowerCase() : ''
  return extension !== undefined && BINARY_EXTENSIONS.has(extension)
}

function joinNativePath(base: string, ...parts: string[]): string {
  const separator = base.includes('\\') ? '\\' : '/'
  const trimmed = base.replace(/[\\/]+$/, '')
  return [trimmed, ...parts].join(separator)
}

function abortError(): Error {
  const error = new Error('Scan cancelled')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError()
}

interface ScannedCandidate {
  absolute: string
  relative: string
}

async function collectScanCandidates(
  root: string,
  signal: AbortSignal | undefined,
  maxFiles: number,
  maxDepth: number,
): Promise<{ candidates: ScannedCandidate[]; truncated: boolean }> {
  const { readDir, readTextFile } = await import('@tauri-apps/plugin-fs')
  const { isPathIgnored, parseGitignore } = await import('./gitignore')

  const candidates: ScannedCandidate[] = []
  let truncated = false

  async function rulesFor(
    directory: string,
    relative: string,
  ): Promise<IgnoreRule[]> {
    try {
      const contents = await readTextFile(
        joinNativePath(directory, '.gitignore'),
      )
      return parseGitignore(contents, relative)
    } catch {
      return []
    }
  }

  async function walk(
    directory: string,
    relative: string,
    depth: number,
    inherited: IgnoreRule[],
  ): Promise<void> {
    throwIfAborted(signal)
    if (depth > maxDepth) return

    const rules = inherited.concat(await rulesFor(directory, relative))

    let entries: DirEntry[]
    try {
      entries = await readDir(directory)
    } catch {
      return
    }

    entries.sort((a, b) => a.name.localeCompare(b.name))

    for (const entry of entries) {
      throwIfAborted(signal)
      if (entry.isSymlink) continue

      const childRelative = relative
        ? `${relative}/${entry.name}`
        : entry.name

      if (entry.isDirectory) {
        if (EXCLUDED_DIRS.has(entry.name)) continue
        if (isPathIgnored(childRelative, true, rules)) continue
        await walk(
          joinNativePath(directory, entry.name),
          childRelative,
          depth + 1,
          rules,
        )
        if (truncated) return
        continue
      }

      if (!entry.isFile) continue
      if (isPathIgnored(childRelative, false, rules)) continue
      if (isBinaryPath(entry.name)) continue

      candidates.push({
        absolute: joinNativePath(directory, entry.name),
        relative: childRelative,
      })

      if (candidates.length >= maxFiles) {
        truncated = true
        return
      }
    }
  }

  await walk(root, '', 0, [])
  return { candidates, truncated }
}

/**
 * Recursively read a folder through the Tauri fs plugin and run every text file
 * through the existing regex rules. Excludes `.git`, dependency/build folders,
 * and anything matched by `.gitignore`.
 *
 * Only call this in the desktop app: the folder must already be in the fs scope
 * (the native picker grants it via the `allow_directory` command).
 */
export async function scanDirectory(
  root: string,
  options: DirectoryScanOptions = {},
): Promise<DirectoryScanOutcome> {
  const startedAt = performance.now()
  const { readTextFile, stat } = await import('@tauri-apps/plugin-fs')

  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH

  const { candidates, truncated } = await collectScanCandidates(
    root,
    options.signal,
    maxFiles,
    maxDepth,
  )

  const totalFiles = candidates.length
  const files: ScannedFile[] = []
  const results: ScanResult[] = []
  let skippedFiles = 0
  let totalBytes = 0
  let cursor = 0
  let processedFiles = 0

  function emitProgress(currentPath: string): void {
    if (processedFiles % 5 !== 0 && processedFiles !== totalFiles) return
    options.onProgress?.({ processedFiles, totalFiles, currentPath })
  }

  async function worker(): Promise<void> {
    while (true) {
      throwIfAborted(options.signal)

      const index = cursor
      cursor += 1
      if (index >= totalFiles) return

      const candidate = candidates[index]

      let info
      try {
        info = await stat(candidate.absolute)
      } catch {
        skippedFiles += 1
        processedFiles += 1
        emitProgress(candidate.relative)
        continue
      }

      if (
        info.size > maxFileBytes ||
        totalBytes + info.size > maxTotalBytes
      ) {
        skippedFiles += 1
        processedFiles += 1
        emitProgress(candidate.relative)
        continue
      }

      let content: string
      try {
        content = await readTextFile(candidate.absolute)
      } catch {
        skippedFiles += 1
        processedFiles += 1
        emitProgress(candidate.relative)
        continue
      }

      throwIfAborted(options.signal)

      if (content.includes('\u0000')) {
        skippedFiles += 1
        processedFiles += 1
        emitProgress(candidate.relative)
        continue
      }

      totalBytes += info.size
      files.push({
        path: candidate.relative,
        language: languageForPath(candidate.relative),
        touchedMinutesAgo: info.mtime
          ? Math.max(
              0,
              Math.round((Date.now() - info.mtime.getTime()) / 60_000),
            )
          : undefined,
      })
      results.push(scanText(content, candidate.relative))

      processedFiles += 1
      emitProgress(candidate.relative)
    }
  }

  const workerCount = Math.min(READ_CONCURRENCY, Math.max(totalFiles, 1))
  await Promise.all(
    Array.from({ length: workerCount }, () => worker()),
  )

  const pairs = files.map((file, index) => ({
    file,
    result: results[index],
  }))

  // Surface the riskiest files first, then keep the table alphabetical.
  pairs.sort(
    (a, b) =>
      b.result.findings.length - a.result.findings.length ||
      a.file.path.localeCompare(b.file.path),
  )

  return {
    files: pairs.map((pair) => pair.file),
    results: pairs.map((pair) => pair.result),
    scannedFiles: files.length,
    skippedFiles,
    truncated,
    durationMs: performance.now() - startedAt,
  }
}

