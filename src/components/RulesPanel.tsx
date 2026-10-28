import { ArrowRightIcon } from './icons'
import { SeverityBadge } from './SeverityBadge'

interface RulesPanelProps {
  onTestRules: () => void
}

const ruleGroups = [
  {
    label: 'API keys',
    detail: 'OpenAI · Stripe · Google',
    count: 3,
    width: 'w-[30%]',
  },
  {
    label: 'Cloud credentials',
    detail: 'AWS access & secret keys',
    count: 2,
    width: 'w-[20%]',
  },
  {
    label: 'Source control',
    detail: 'GitHub PATs & fine-grained',
    count: 1,
    width: 'w-[10%]',
  },
  {
    label: 'Tokens & keys',
    detail: 'Slack · JWT · private keys',
    count: 4,
    width: 'w-[40%]',
  },
]

export function RulesPanel({ onTestRules }: RulesPanelProps) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-zinc-900 bg-[#0a0a0d]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800/70 px-4 py-3">
        <div>
          <h2 className="text-[12px] font-semibold text-zinc-200">
            Detection rules
          </h2>
          <p className="mt-0.5 text-[10.5px] text-zinc-600">
            Rule pack <span className="font-mono text-zinc-500">v1.4</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onTestRules}
          className="inline-flex items-center gap-1 text-[10.5px] font-medium text-violet-400 transition hover:text-violet-300"
        >
          Test rules
          <ArrowRightIcon className="h-3 w-3" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3.5 px-4 py-4">
        {ruleGroups.map((group) => (
          <div key={group.label}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[11px] font-medium text-zinc-400">
                {group.label}
              </p>
              <span className="font-mono text-[10px] text-zinc-600">
                {String(group.count).padStart(2, '0')}
              </span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-zinc-800/80">
              <div
                className={`h-full rounded-full bg-gradient-to-r from-violet-500/80 to-indigo-400/50 ${group.width}`}
              />
            </div>
            <p className="mt-1 text-[10px] text-zinc-600">{group.detail}</p>
          </div>
        ))}
      </div>

      <div className="shrink-0 border-t border-zinc-800/70 px-4 py-3">
        <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-600">
          Severity scale
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <SeverityBadge severity="low" />
          <SeverityBadge severity="medium" />
          <SeverityBadge severity="high" />
          <SeverityBadge severity="critical" />
        </div>
      </div>
    </section>
  )
}
