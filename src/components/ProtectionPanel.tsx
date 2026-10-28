import type { HookStatus } from '../utils/preCommit'
import { SECRET_PATTERN_COUNT } from '../utils/scanner'
import {
  FolderIcon,
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
  workspaceName: string | null
  workspacePath: string | null
  isDesktop: boolean
  hookStatus: HookStatus
  hookBusy: boolean
  hookMessage: string | null
  onInstallHook: () => void
  onChooseFolder: () => void
}

const hookStatusView: Record<
  HookStatus,
  { label: string; dot: string; tone: string }
> = {
  installed: {
    label: 'Installed',
    dot: 'bg-emerald-500',
    tone: 'text-emerald-400/80',
  },
  missing: { label: 'Not installed', dot: 'bg-zinc-600', tone: 'text-zinc-500' },
  custom: {
    label: 'Custom hook present',
    dot: 'bg-amber-500',
    tone: 'text-amber-400/80',
  },
  'not-a-repo': {
    label: 'Not a Git repository',
    dot: 'bg-zinc-600',
    tone: 'text-zinc-500',
  },
  unknown: { label: 'Not checked', dot: 'bg-zinc-600', tone: 'text-zinc-500' },
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
  workspaceName,
  workspacePath,
  isDesktop,
  hookStatus,
  hookBusy,
  hookMessage,
  onInstallHook,
  onChooseFolder,
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

  const status = hookStatusView[hookStatus]
  const canInstall = Boolean(workspaceName) && isDesktop && !hookBusy
  const canPick = !workspaceName && isDesktop && !hookBusy

  const actionLabel = !isDesktop
    ? 'Desktop app required'
    : !workspaceName
      ? 'Choose folder'
      : hookBusy
        ? 'Installing…'
        : hookStatus === 'installed'
          ? 'Reinstall hook'
          : 'Install hook'

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-900 pb-3">
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

      <div className="shrink-0 divide-y divide-zinc-900">
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

      <div className="mt-1 shrink-0 border-t border-zinc-900 pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-600">
            Repository hook
          </p>
          <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
        </div>

        <p
          className="mt-2 flex min-w-0 items-center gap-1.5 text-[10.5px] text-zinc-400"
          title={workspacePath ?? undefined}
        >
          <FolderIcon className="h-3 w-3 shrink-0 text-zinc-600" />
          <span className="truncate">
            {workspaceName ?? 'No folder selected'}
          </span>
        </p>

        <p className="mt-1 text-[9.5px] leading-relaxed text-zinc-600">
          Writes <span className="font-mono">.git/hooks/pre-commit</span> to
          block staged secrets. Existing hooks are backed up.
        </p>

        <button
          type="button"
          onClick={workspaceName ? onInstallHook : onChooseFolder}
          disabled={!canInstall && !canPick}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-zinc-800 px-2 py-1.5 text-[10.5px] font-medium text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900/60 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <TerminalIcon className="h-3 w-3" />
          {actionLabel}
        </button>

        {hookMessage ? (
          <p className={`mt-1.5 text-[9.5px] ${status.tone}`}>{hookMessage}</p>
        ) : null}
      </div>

      <p className="mt-auto shrink-0 pt-3 text-[10px] text-zinc-700">
        {SECRET_PATTERN_COUNT} rules · v1.4 · offline
      </p>
    </section>
  )
}
