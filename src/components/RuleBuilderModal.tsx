import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Severity } from '../utils/scanner'
import {
  MAX_LABEL_LENGTH,
  MAX_PATTERN_LENGTH,
  compilePattern,
  createCustomRule,
  previewMatches,
  validateCustomRule,
  type CustomRule,
} from '../utils/customRules'
import { AlertIcon, CloseIcon, SparklesIcon } from './icons'

interface RuleBuilderModalProps {
  existingCount: number
  onClose: () => void
  onSave: (rule: CustomRule) => void
  limit: number
}

const severityOptions: Array<{ value: Severity; label: string }> = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
]

export function RuleBuilderModal({
  existingCount,
  onClose,
  onSave,
  limit,
}: RuleBuilderModalProps) {
  const titleId = useId()
  const descriptionId = useId()
  const nameRef = useRef<HTMLInputElement>(null)

  const [label, setLabel] = useState('')
  const [pattern, setPattern] = useState('')
  const [severity, setSeverity] = useState<Severity>('high')
  const [ignoreCase, setIgnoreCase] = useState(false)
  const [sample, setSample] = useState('')

  const atLimit = existingCount >= limit
  const validationError = validateCustomRule({
    label,
    pattern,
    severity,
    ignoreCase,
  })
  const compiled = compilePattern(pattern, ignoreCase)
  const preview = previewMatches(pattern, ignoreCase, sample)
  const canSave = !atLimit && validationError === null

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSave) return
    onSave(createCustomRule({ label, pattern, severity, ignoreCase }))
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-2 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close rule builder"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
      />

      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onSubmit={handleSubmit}
        className="relative flex max-h-[calc(100vh-1rem)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-zinc-800 bg-[#0b0b0e] shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-900 px-4 py-3">
          <div>
            <h2
              id={titleId}
              className="flex items-center gap-1.5 text-[12.5px] font-semibold text-zinc-200"
            >
              <SparklesIcon className="h-3.5 w-3.5 text-violet-400" />
              New detection rule
            </h2>
            <p id={descriptionId} className="mt-0.5 text-[10.5px] text-zinc-600">
              JavaScript regular expression · evaluated locally
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-6 w-6 place-items-center rounded text-zinc-600 transition hover:bg-zinc-900 hover:text-zinc-300"
          >
            <CloseIcon className="h-3 w-3" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3.5">
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
              Rule name
            </span>
            <input
              ref={nameRef}
              value={label}
              maxLength={MAX_LABEL_LENGTH}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Acme internal API key"
              className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 text-[11.5px] text-zinc-200 outline-none transition placeholder:text-zinc-700 focus:border-zinc-600"
            />
          </label>

          <label className="block">
            <span className="flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
              <span>Pattern</span>
              <span className="font-mono normal-case tracking-normal text-zinc-700">
                {pattern.length}/{MAX_PATTERN_LENGTH}
              </span>
            </span>
            <input
              value={pattern}
              maxLength={MAX_PATTERN_LENGTH}
              spellCheck={false}
              onChange={(event) => setPattern(event.target.value)}
              placeholder="acme_(live|test)_[A-Za-z0-9]{24}"
              className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 font-mono text-[11.5px] text-zinc-200 outline-none transition placeholder:text-zinc-700 focus:border-zinc-600"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                Severity
              </span>
              <select
                value={severity}
                onChange={(event) =>
                  setSeverity(event.target.value as Severity)
                }
                className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 text-[11.5px] text-zinc-200 outline-none transition focus:border-zinc-600"
              >
                {severityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-end gap-2 pb-1.5">
              <input
                type="checkbox"
                checked={ignoreCase}
                onChange={(event) => setIgnoreCase(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-950 accent-violet-500"
              />
              <span className="text-[11px] text-zinc-400">Ignore case</span>
            </label>
          </div>

          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
              Test sample <span className="normal-case">(optional)</span>
            </span>
            <textarea
              value={sample}
              onChange={(event) => setSample(event.target.value)}
              spellCheck={false}
              rows={3}
              placeholder={'INTERNAL_API_KEY=acme_live_9f3k2m8q7x1p4v6n'}
              className="mt-1 w-full resize-none rounded-md border border-zinc-800 bg-zinc-950/60 px-2.5 py-2 font-mono text-[11px] leading-5 text-zinc-300 outline-none transition placeholder:text-zinc-700 focus:border-zinc-600"
            />
          </label>

          <div className="rounded-md border border-zinc-900 bg-zinc-950/40 px-3 py-2">
            {validationError ? (
              <p className="flex items-start gap-1.5 text-[10.5px] text-rose-300">
                <AlertIcon className="mt-px h-3 w-3 shrink-0" />
                {validationError}
              </p>
            ) : compiled.regex ? (
              <div>
                <p className="flex items-center gap-1.5 text-[10.5px] text-emerald-400/90">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Pattern is valid
                  <span className="font-mono text-zinc-600">
                    /{pattern.trim()}/{ignoreCase ? 'gi' : 'g'}
                  </span>
                </p>
                <p className="mt-1 text-[10px] text-zinc-600">
                  {sample
                    ? `${preview.count} match${preview.count === 1 ? '' : 'es'} in the sample`
                    : 'Add a sample to preview matches.'}
                </p>
                {preview.previews.length > 0 ? (
                  <ul className="mt-1.5 space-y-0.5">
                    {preview.previews.map((value, index) => (
                      <li
                        key={`${value}-${index}`}
                        className="truncate font-mono text-[10px] text-zinc-500"
                      >
                        {value}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <p className="text-[10.5px] text-zinc-600">
                Enter a pattern to see live validation and sample matches.
              </p>
            )}
          </div>

          {atLimit ? (
            <p className="text-[10.5px] text-amber-400/90">
              You have reached the {limit}-rule limit. Delete an unused rule to
              add another.
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-zinc-900 px-4 py-2.5">
          <p className="text-[9.5px] text-zinc-700">
            Stored locally · applied to new scans
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2.5 py-1.5 text-[10.5px] text-zinc-500 transition hover:text-zinc-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="rounded-md bg-zinc-100 px-3 py-1.5 text-[10.5px] font-medium text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add rule
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
