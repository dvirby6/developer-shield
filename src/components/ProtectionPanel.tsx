import { SECRET_PATTERN_COUNT } from '../utils/scanner'
import {
  ScanIcon,
  ShieldIcon,
  SparklesIcon,
  TerminalIcon,
} from './icons'
import { Toggle } from './Toggle'

interface ProtectionPanelProps {
  shieldActive: boolean
  preCommit: boolean
  liveWatch: boolean
  autoSanitize: boolean
  onShieldChange: (next: boolean) => void
  onPreCommitChange: (next: boolean) => void
  onLiveWatchChange: (next: boolean) => void
  onAutoSanitizeChange: (next: boolean) => void
}

export function ProtectionPanel({
  shieldActive,
  preCommit,
  liveWatch,
  autoSanitize,
  onShieldChange,
  onPreCommitChange,
  onLiveWatchChange,
  onAutoSanitizeChange,
}: ProtectionPanelProps) {
  const rows = [
    {
      id: 'shield',
      title: 'Shield',
      icon: ShieldIcon,
      checked: shieldActive,
      onChange: onShieldChange,
      disabled: false,
    },
    {
      id: 'pre-commit',
      title: 'Pre-commit hook',
      icon: TerminalIcon,
      checked: preCommit,
      onChange: onPreCommitChange,
      disabled: !shieldActive,
    },
    {
      id: 'watch',
      title: 'Live file watch',
      icon: ScanIcon,
      checked: liveWatch,
      onChange: onLiveWatchChange,
      disabled: !shieldActive,
    },
    {
      id: 'auto-sanitize',
      title: 'Auto-sanitize prompts',
      icon: SparklesIcon,
      checked: autoSanitize,
      onChange: onAutoSanitizeChange,
      disabled: !shieldActive,
    },
  ]

  return (
    <section>
      <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
        <h2 className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
          Guardrails
        </h2>
        <span className="flex items-center gap-1.5 text-[10px] text-zinc-600">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              shieldActive ? 'bg-emerald-500' : 'bg-zinc-600'
            }`}
          />
          {shieldActive ? 'Armed' : 'Paused'}
        </span>
      </div>

      <div className="divide-y divide-zinc-900">
        {rows.map((row) => {
          const Icon = row.icon

          return (
            <div
              key={row.id}
              className={`flex items-center justify-between gap-3 py-3 ${
                row.disabled ? 'opacity-45' : ''
              }`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
                <span className="truncate text-[11.5px] text-zinc-300">
                  {row.title}
                </span>
              </div>
              <Toggle
                checked={row.checked}
                onChange={row.onChange}
                label={row.title}
                disabled={row.disabled}
                size="sm"
              />
            </div>
          )
        })}
      </div>

      <p className="pt-3 text-[10px] text-zinc-700">
        {SECRET_PATTERN_COUNT} rules · v1.4 · offline
      </p>
    </section>
  )
}
