/**
 * Developer Shield - local secret scanner.
 *
 * Everything in this module runs in the browser / locally. No secret is ever
 * sent over the network.
 */

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

  for (const definition of SECRET_PATTERNS) {
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
