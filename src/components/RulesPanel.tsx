import { useState } from 'react'
import {
  MAX_CUSTOM_RULES,
  type CustomRule,
} from '../utils/customRules'
import {
  SECRET_PATTERN_CATALOG,
  SECRET_PATTERN_COUNT,
  type Severity,
} from '../utils/scanner'
import { ArrowRightIcon, CloseIcon } from './icons'
import { RuleBuilderModal } from './RuleBuilderModal'
import { SeverityBadge } from './SeverityBadge'
import { Toggle } from './Toggle'

interface RulesPanelProps {
  customRules: CustomRule[]
  onAddRule: (rule: CustomRule) => void
  onToggleRule: (id: string) => void
  onDeleteRule: (id: string) => void
  onTestRules: () => void
}

const severityDot: Record<Severity, string> = {
  critical: 'bg-rose-500',
  high: 'bg-orange-500',
  medium: 'bg-amber-500',
}

export function RulesPanel({
  customRules,
  onAddRule,
  onToggleRule,
  onDeleteRule,
  onTestRules,
}: RulesPanelProps) {
  const [builderOpen, setBuilderOpen] = useState(false)
  const enabledCustom = customRules.filter((rule) => rule.enabled).length
  const atLimit = customRules.length >= MAX_CUSTOM_RULES

  return (
    <>
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-zinc-900 bg-[#0a0a0d]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800/70 px-4 py-3">
          <div>
            <h2 className="text-[12px] font-semibold text-zinc-200">
              Detection rules
            </h2>
            <p className="mt-0.5 text-[10.5px] text-zinc-600">
              {SECRET_PATTERN_COUNT} built-in · {enabledCustom} custom active
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={onTestRules}
              className="hidden items-center gap-1 text-[10.5px] font-medium text-violet-400 transition hover:text-violet-300 sm:inline-flex"
            >
              Test rules
              <ArrowRightIcon className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => setBuilderOpen(true)}
              disabled={atLimit}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-1 text-[10.5px] font-medium text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900/60 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              + Add rule
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3.5">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-600">
                Built-in pack
              </p>
              <span className="font-mono text-[9.5px] text-zinc-700">
                v1.5
              </span>
            </div>
            <ul className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {SECRET_PATTERN_CATALOG.map((rule) => (
                <li
                  key={rule.kind}
                  className="flex min-w-0 items-center gap-1.5 text-[10px] text-zinc-500"
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${severityDot[rule.severity]}`}
                  />
                  <span className="truncate">{rule.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-600">
                Custom rules
              </p>
              <span className="font-mono text-[9.5px] text-zinc-700">
                {customRules.length}/{MAX_CUSTOM_RULES}
              </span>
            </div>

            {customRules.length === 0 ? (
              <div className="mt-2 rounded-md border border-dashed border-zinc-800 px-3 py-4 text-center">
                <p className="text-[10.5px] text-zinc-500">
                  No custom rules yet.
                </p>
                <p className="mt-1 text-[9.5px] leading-relaxed text-zinc-700">
                  Add a regex for company-internal keys, newer token formats, or
                  environment-specific secrets.
                </p>
              </div>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {customRules.map((rule) => (
                  <li
                    key={rule.id}
                    className={`rounded-md border border-zinc-900 px-2.5 py-2 ${
                      rule.enabled ? '' : 'opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${severityDot[rule.severity]}`}
                      />
                      <span className="min-w-0 flex-1 truncate text-[10.5px] text-zinc-300">
                        {rule.label}
                      </span>
                      <Toggle
                        checked={rule.enabled}
                        onChange={() => onToggleRule(rule.id)}
                        label={`${rule.enabled ? 'Disable' : 'Enable'} ${rule.label}`}
                        size="sm"
                      />
                      <button
                        type="button"
                        onClick={() => onDeleteRule(rule.id)}
                        aria-label={`Delete ${rule.label}`}
                        className="grid h-5 w-5 shrink-0 place-items-center rounded text-zinc-600 transition hover:bg-zinc-900 hover:text-rose-300"
                      >
                        <CloseIcon className="h-3 w-3" />
                      </button>
                    </div>
                    <p
                      className="mt-1 truncate font-mono text-[9px] text-zinc-700"
                      title={rule.pattern}
                    >
                      /{rule.pattern}/{rule.ignoreCase ? 'gi' : 'g'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-zinc-800/70 px-4 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              <SeverityBadge severity="low" />
              <SeverityBadge severity="medium" />
              <SeverityBadge severity="high" />
              <SeverityBadge severity="critical" />
            </div>
            <button
              type="button"
              onClick={onTestRules}
              className="text-[10px] font-medium text-violet-400 transition hover:text-violet-300 sm:hidden"
            >
              Test rules →
            </button>
          </div>
          <p className="mt-1.5 text-[9px] leading-relaxed text-zinc-700">
            Custom rules apply to new scans and sanitizer runs. Reinstall the
            pre-commit hook to embed them in Git.
          </p>
        </div>
      </section>

      {builderOpen ? (
        <RuleBuilderModal
          existingCount={customRules.length}
          limit={MAX_CUSTOM_RULES}
          onClose={() => setBuilderOpen(false)}
          onSave={onAddRule}
        />
      ) : null}
    </>
  )
}
