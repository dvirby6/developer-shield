/**
 * User-defined detection rules.
 *
 * Rules are stored locally and compiled into the scanner at runtime. They never
 * leave the machine and are also embedded into the pre-commit hook when it is
 * installed.
 */

import type { Severity } from './scanner'

export interface CustomRule {
  id: string
  label: string
  /** Regular expression source, without delimiters or flags. */
  pattern: string
  severity: Severity
  ignoreCase: boolean
  enabled: boolean
  createdAt: number
}

export interface CustomRuleDraft {
  label: string
  pattern: string
  severity: Severity
  ignoreCase: boolean
}

export const MAX_CUSTOM_RULES = 50
export const MAX_PATTERN_LENGTH = 400
export const MAX_LABEL_LENGTH = 60

export interface CompiledPattern {
  regex: RegExp | null
  error: string | null
}

/** Compile a user pattern, rejecting empty matches that would loop the scanner. */
export function compilePattern(
  pattern: string,
  ignoreCase: boolean,
): CompiledPattern {
  const source = pattern.trim()

  if (!source) {
    return { regex: null, error: 'Enter a regular expression.' }
  }

  if (source.length > MAX_PATTERN_LENGTH) {
    return {
      regex: null,
      error: `Patterns are limited to ${MAX_PATTERN_LENGTH} characters.`,
    }
  }

  if (/[\r\n]/.test(source)) {
    return { regex: null, error: 'Patterns must stay on a single line.' }
  }

  try {
    const probe = new RegExp(source, ignoreCase ? 'i' : '')
    if (probe.test('')) {
      return { regex: null, error: 'Pattern must not match empty text.' }
    }
    return {
      regex: new RegExp(source, ignoreCase ? 'gi' : 'g'),
      error: null,
    }
  } catch (error) {
    return {
      regex: null,
      error: error instanceof Error ? error.message : 'Invalid pattern.',
    }
  }
}

export function validateCustomRule(draft: CustomRuleDraft): string | null {
  const label = draft.label.trim()

  if (!label) return 'Give the rule a name.'
  if (label.length > MAX_LABEL_LENGTH) {
    return `Names are limited to ${MAX_LABEL_LENGTH} characters.`
  }

  return compilePattern(draft.pattern, draft.ignoreCase).error
}

function newRuleId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function createCustomRule(draft: CustomRuleDraft): CustomRule {
  return {
    id: newRuleId(),
    label: draft.label.trim(),
    pattern: draft.pattern.trim(),
    severity: draft.severity,
    ignoreCase: draft.ignoreCase,
    enabled: true,
    createdAt: Date.now(),
  }
}

export interface SampleMatch {
  count: number
  previews: string[]
}

/** Count and preview matches for the rule builder's live sample. */
export function previewMatches(
  pattern: string,
  ignoreCase: boolean,
  sample: string,
): SampleMatch {
  const { regex } = compilePattern(pattern, ignoreCase)
  if (!regex || !sample) return { count: 0, previews: [] }

  const previews: string[] = []
  let count = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(sample)) !== null) {
    count += 1
    if (previews.length < 3) previews.push(match[0])
    if (match[0].length === 0) regex.lastIndex += 1
    if (count >= 500) break
  }

  return { count, previews }
}

function isSeverity(value: unknown): value is Severity {
  return value === 'critical' || value === 'high' || value === 'medium'
}

/** Defensively normalise rules loaded from disk or older app versions. */
export function normaliseCustomRules(value: unknown): CustomRule[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const rules: CustomRule[] = []

  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Partial<CustomRule>

    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.label !== 'string' ||
      typeof candidate.pattern !== 'string' ||
      !isSeverity(candidate.severity)
    ) {
      continue
    }

    const label = candidate.label.trim()
    if (!label || label.length > MAX_LABEL_LENGTH) continue
    if (compilePattern(candidate.pattern, candidate.ignoreCase === true).error) {
      continue
    }
    if (seen.has(candidate.id)) continue

    seen.add(candidate.id)
    rules.push({
      id: candidate.id,
      label,
      pattern: candidate.pattern.trim(),
      severity: candidate.severity,
      ignoreCase: candidate.ignoreCase === true,
      enabled: candidate.enabled !== false,
      createdAt:
        typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now(),
    })

    if (rules.length >= MAX_CUSTOM_RULES) break
  }

  return rules
}
