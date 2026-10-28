import { useMemo, useRef, useState } from 'react'
import { demoSanitizerSnippet } from '../data/demo'
import { maskSecret, scanText } from '../utils/scanner'
import { Sanitizer, type RedactionEntry } from '../utils/sanitizer'
import { CheckIcon, CopyIcon, RestoreIcon } from './icons'

type Phase = 'idle' | 'sanitized' | 'restored'
type Pane = 'input' | 'output' | 'mapping'

const phaseLabel: Record<Phase, string> = {
  idle: 'Idle',
  sanitized: 'Sanitized',
  restored: 'Restored',
}

const paneLabel: Record<Pane, string> = {
  input: 'Input',
  output: 'Output',
  mapping: 'Mapping',
}

export function SanitizerWidget() {
  const [input, setInput] = useState(demoSanitizerSnippet)
  const [output, setOutput] = useState('')
  const [entries, setEntries] = useState<RedactionEntry[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const [pane, setPane] = useState<Pane>('input')
  const [copiedTarget, setCopiedTarget] = useState<string | null>(null)
  const sanitizerRef = useRef<Sanitizer | null>(null)

  const detected = useMemo(
    () => scanText(input, 'playground').findings,
    [input],
  )

  function resetResult() {
    setOutput('')
    setEntries([])
    setPhase('idle')
    setCopiedTarget(null)
    sanitizerRef.current = null
  }

  function handleInputChange(value: string) {
    setInput(value)
    if (phase !== 'idle') resetResult()
  }

  function handleSanitize() {
    const sanitizer = new Sanitizer()
    const result = sanitizer.sanitize(input, 'playground')
    sanitizerRef.current = sanitizer
    setOutput(result.sanitized)
    setEntries(result.entries)
    setPhase('sanitized')
    setCopiedTarget(null)
    setPane('output')
  }

  function handleRestore() {
    if (!sanitizerRef.current || phase !== 'sanitized') return
    setOutput(sanitizerRef.current.restore(output))
    setPhase('restored')
    setCopiedTarget(null)
    setPane('output')
  }

  async function copyValue(value: string, target: string) {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopiedTarget(target)
      window.setTimeout(() => setCopiedTarget(null), 1600)
    } catch {
      // Clipboard access can be denied; the content is still selectable.
    }
  }

  const tabCount: Record<Pane, string> = {
    input: `${detected.length}`,
    output: phase === 'idle' ? '—' : phaseLabel[phase],
    mapping: `${entries.length}`,
  }

  const paneVisibility = (target: Pane) =>
    `${pane === target ? 'flex' : 'hidden'} xl:flex`

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-end justify-between gap-3 pb-3">
        <div className="min-w-0">
          <h2 className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
            AI Sanitizer
          </h2>
          <p className="mt-1 text-[11px] text-zinc-600">
            Redact secrets before pasting code into an AI assistant.
          </p>
        </div>
        <span className="hidden shrink-0 text-[9.5px] uppercase tracking-[0.12em] text-zinc-700 sm:block">
          In-memory mapping
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-zinc-900 bg-[#0a0a0d]">
        <div
          role="tablist"
          aria-label="Sanitizer panes"
          className="flex shrink-0 items-center gap-1 border-b border-zinc-900 p-1.5 xl:hidden"
        >
          {(Object.keys(paneLabel) as Pane[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={pane === key}
              aria-controls={`sanitizer-pane-${key}`}
              onClick={() => setPane(key)}
              className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-[10.5px] font-medium transition ${
                pane === key
                  ? 'bg-zinc-900 text-zinc-200'
                  : 'text-zinc-600 hover:bg-zinc-900/40 hover:text-zinc-300'
              }`}
            >
              <span className="truncate">{paneLabel[key]}</span>
              <span className="shrink-0 font-mono text-[9px] text-zinc-700">
                {tabCount[key]}
              </span>
            </button>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-zinc-900 xl:grid-cols-[1.15fr_1.15fr_0.8fr] xl:divide-x xl:divide-y-0">
          <div
            id="sanitizer-pane-input"
            role="tabpanel"
            aria-label="Sanitizer input"
            className={`min-h-0 min-w-0 flex-col ${paneVisibility('input')}`}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-900 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-zinc-500">
                  input.ts
                </span>
                <span className="truncate text-[9px] text-zinc-700">
                  {detected.length} findings
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => copyValue(input, 'input')}
                  disabled={!input}
                  aria-label="Copy input"
                  className="grid h-6 w-6 place-items-center rounded text-zinc-600 transition hover:bg-zinc-900 hover:text-zinc-300 disabled:opacity-40"
                >
                  {copiedTarget === 'input' ? (
                    <CheckIcon className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <CopyIcon className="h-3 w-3" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInput(demoSanitizerSnippet)
                    resetResult()
                  }}
                  className="rounded px-1.5 py-1 text-[10px] text-zinc-600 transition hover:bg-zinc-900 hover:text-zinc-300"
                >
                  Load sample
                </button>
              </div>
            </div>

            <textarea
              id="sanitizer-input"
              value={input}
              onChange={(event) => handleInputChange(event.target.value)}
              spellCheck={false}
              wrap="off"
              aria-label="Code to sanitize"
              className="min-h-0 flex-1 resize-none overflow-auto whitespace-pre bg-transparent p-4 font-mono text-[11px] leading-5 text-zinc-300 caret-zinc-300 outline-none placeholder:text-zinc-700"
              placeholder="Paste code or a prompt you want to share…"
            />

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-zinc-900 px-3 py-2">
              <span className="flex items-center gap-1.5 text-[10px] text-zinc-600">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    detected.length > 0 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                />
                {detected.length > 0
                  ? `${detected.length} secret${detected.length === 1 ? '' : 's'}`
                  : 'No secrets'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setInput('')
                    resetResult()
                  }}
                  className="rounded px-1.5 py-1 text-[10px] text-zinc-600 transition hover:text-zinc-300"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handleSanitize}
                  disabled={input.trim().length === 0}
                  className="rounded-md bg-zinc-100 px-2.5 py-1.5 text-[10.5px] font-medium text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Sanitize
                </button>
              </div>
            </div>
          </div>

          <div
            id="sanitizer-pane-output"
            role="tabpanel"
            aria-label="Sanitizer output"
            className={`min-h-0 min-w-0 flex-col ${paneVisibility('output')}`}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-900 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-zinc-500">
                  output.ts
                </span>
                <span className="truncate text-[9px] text-zinc-700">
                  {phaseLabel[phase]}
                </span>
              </div>
              <button
                type="button"
                onClick={() => copyValue(output, 'output')}
                disabled={!output}
                className="inline-flex shrink-0 items-center gap-1.5 rounded px-1.5 py-1 text-[10px] text-zinc-600 transition hover:bg-zinc-900 hover:text-zinc-300 disabled:opacity-40"
              >
                {copiedTarget === 'output' ? (
                  <CheckIcon className="h-3 w-3 text-emerald-500" />
                ) : (
                  <CopyIcon className="h-3 w-3" />
                )}
                {copiedTarget === 'output' ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4">
              {phase === 'idle' ? (
                <div className="flex h-full min-h-0 items-center justify-center">
                  <p className="font-mono text-[10px] text-zinc-700">
                    // output appears here
                  </p>
                </div>
              ) : (
                <pre className="whitespace-pre font-mono text-[11px] leading-5 text-zinc-300">
                  {output}
                </pre>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-zinc-900 px-3 py-2">
              <span className="font-mono text-[9.5px] text-zinc-700">
                {output.length} chars · {entries.length} map
                {entries.length === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                onClick={handleRestore}
                disabled={phase !== 'sanitized' || entries.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 px-2.5 py-1.5 text-[10px] text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RestoreIcon className="h-3 w-3" />
                Restore
              </button>
            </div>
          </div>

          <div
            id="sanitizer-pane-mapping"
            role="tabpanel"
            aria-label="Sanitizer mapping"
            className={`min-h-0 min-w-0 flex-col ${paneVisibility('mapping')}`}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-900 px-3 py-2">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-zinc-500">
                mapping.json
              </span>
              <span className="font-mono text-[9px] text-zinc-700">
                {entries.length}
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {entries.length === 0 ? (
                <div className="flex h-full min-h-0 items-center justify-center px-4">
                  <p className="text-center font-mono text-[10px] text-zinc-700">
                    // no active mappings
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-900">
                  {entries.map((entry) => {
                    const target = `token:${entry.placeholder}`
                    return (
                      <div
                        key={entry.placeholder}
                        className="flex items-center gap-2 px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-[10px] text-zinc-300">
                            {entry.placeholder}
                          </p>
                          <p className="mt-0.5 truncate font-mono text-[9.5px] text-zinc-700">
                            {maskSecret(entry.secret)} · {entry.kind}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyValue(entry.placeholder, target)}
                          aria-label={`Copy ${entry.placeholder}`}
                          className="grid h-6 w-6 shrink-0 place-items-center rounded text-zinc-600 transition hover:bg-zinc-900 hover:text-zinc-300"
                        >
                          {copiedTarget === target ? (
                            <CheckIcon className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <CopyIcon className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-zinc-900 px-3 py-2 text-[9.5px] text-zinc-700">
              Cleared on refresh
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
