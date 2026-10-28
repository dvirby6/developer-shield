/**
 * Developer Shield - local AI sanitizer.
 *
 * Replaces detected secrets with stable redaction tokens and keeps the
 * de-anonymisation map in memory only. Nothing is persisted.
 */

import { scanText, type SecretFinding, type SecretKind } from './scanner'

/** The first redaction token. Subsequent unique secrets get a numeric suffix. */
export const REDACTION_TOKEN = '[REDACTED_ID]'

export interface RedactionEntry {
  placeholder: string
  secret: string
  kind: SecretKind
  label: string
}

export interface SanitizeResult {
  sanitized: string
  entries: RedactionEntry[]
  findings: SecretFinding[]
}

/**
 * Stateful sanitizer. One instance represents one temporary local session;
 * call `clear()` to forget every mapping.
 */
export class Sanitizer {
  private readonly mapping = new Map<string, RedactionEntry>()
  private readonly secretToPlaceholder = new Map<string, string>()

  get entries(): RedactionEntry[] {
    return [...this.mapping.values()]
  }

  get size(): number {
    return this.mapping.size
  }

  get isDirty(): boolean {
    return this.mapping.size > 0
  }

  sanitize(text: string, file = 'inline'): SanitizeResult {
    const { findings } = scanText(text, file)
    if (findings.length === 0) {
      return { sanitized: text, entries: this.entries, findings }
    }

    // Reuse a token for a repeated secret, otherwise mint a fresh one.
    const replacements = findings.map((finding) => {
      let placeholder = this.secretToPlaceholder.get(finding.match)
      if (!placeholder) {
        placeholder = this.createPlaceholder(text)
        this.secretToPlaceholder.set(finding.match, placeholder)
        this.mapping.set(placeholder, {
          placeholder,
          secret: finding.match,
          kind: finding.kind,
          label: finding.label,
        })
      }
      return { finding, placeholder }
    })

    // Replace from the end so earlier offsets stay valid.
    let sanitized = text
    for (const { finding, placeholder } of [...replacements].reverse()) {
      sanitized =
        sanitized.slice(0, finding.index) +
        placeholder +
        sanitized.slice(finding.index + finding.match.length)
    }

    return { sanitized, entries: this.entries, findings }
  }

  /** Put the original secrets back, e.g. after an AI round-trip. */
  restore(sanitized: string): string {
    return restoreWithMapping(sanitized, this.entries)
  }

  /** Forget the temporary map. */
  clear(): void {
    this.mapping.clear()
    this.secretToPlaceholder.clear()
  }

  private createPlaceholder(originalText: string): string {
    let index = this.mapping.size + 1
    let placeholder = index === 1 ? REDACTION_TOKEN : `${REDACTION_TOKEN.slice(0, -1)}_${index}]`

    while (originalText.includes(placeholder) || this.mapping.has(placeholder)) {
      index += 1
      placeholder = `${REDACTION_TOKEN.slice(0, -1)}_${index}]`
    }
    return placeholder
  }
}

/** Restore a sanitized string using a previously captured mapping. */
export function restoreWithMapping(
  sanitized: string,
  entries: readonly RedactionEntry[],
): string {
  let restored = sanitized
  // Longest token first: [REDACTED_ID_10] before [REDACTED_ID_1].
  for (const entry of [...entries].sort(
    (a, b) => b.placeholder.length - a.placeholder.length,
  )) {
    restored = restored.split(entry.placeholder).join(entry.secret)
  }
  return restored
}
