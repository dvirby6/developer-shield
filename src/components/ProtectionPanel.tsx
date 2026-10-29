import type { HookStatus, RepoHook } from '../utils/preCommit'
import { SECRET_PATTERN_COUNT } from '../utils/scanner'
import {
  FolderIcon,
  GitBranchIcon,
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
  hookRepos: RepoHook[]
  hookBusy: boolean
  hookMessage: string | null
  customRuleCount: number
  onInstallHook: () => void
  onChooseFolder: () => void
}

const hookStatusView: Record<
  HookStatus | 'not-a-repo',
  { label: string; dot: string; tone: string }
> = {
  installed: {
    label: 'Protected',
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
    label: 'No Git repository',
    dot: 'bg-zinc-600',
    tone: 'text-zinc-500',
  },
  unknown: { label: 'Not checked', dot: 'bg-zinc-600', tone: 'text-zinc-500' },
}

const repoDot: Record<HookStatus, string> = {
  installed: 'bg-emerald-500',
  missing: 'bg-zinc-600',
  custom: 'bg-amber-500',
  unknown: 'bg-zinc-600',
}

function aggregateStatus(repos: RepoHook[]): HookStatus | 'not-a-repo' {
  if (repos.length === 0) return 'not-a-repo'
  if (repos.every((repo) => repo.status === 'installed')) return 'installed'
  if (repos.some((repo) => repo.status === 'custom')) return 'custom'
  if (repos.some((repo) => repo.status === 'unknown')) return 'unknown'
  return 'missing'
}

function repoName(root: string): string {
  return root.split(/[\\/]/).filter(Boolean).pop() ?? root
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
  hookRepos,
  hookBusy,
  hookMessage,
  customRuleCount,
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

  const status = hookStatusView[aggregateStatus(hookRepos)]
  const protectedCount = hookRepos.filter(
    (repo) => repo.status === 'installed',
  ).length
  const canInstall =
    Boolean(workspaceName) && isDesktop && !hookBusy && hookRepos.length > 0
  const canPick = !workspaceName && isDesktop && !hookBusy
  const usesConfiguredPath = hookRepos.some((repo) => repo.usesCustomHooksPath)

  const actionLabel = !isDesktop
    ? 'Desktop app required'
    : !workspaceName
      ? 'Choose folder'
      : hookBusy
        ? 'Installing…'
        : hookRepos.length === 0
          ? 'No Git repository found'
          : hookRepos.length > 1
            ? `Install hooks (${hookRepos.length})`
            : protectedCount === 1
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
            Repository hooks
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

        {hookRepos.length > 0 ? (
          <div className="mt-1.5">
            <p className="text-[9.5px] text-zinc-600">
              {protectedCount} of {hookRepos.length}{' '}
              {hookRepos.length === 1 ? 'repository' : 'repositories'} protected
            </p>
            <ul className="mt-1 space-y-0.5">
              {hookRepos.slice(0, 3).map((repo) => (
                <li
                  key={repo.root}
                  className="flex min-w-0 items-center gap-1.5 text-[9.5px] text-zinc-500"
                  title={repo.root}
                >
                  <span
                    className={`h-1 w-1 shrink-0 rounded-full ${repoDot[repo.status]}`}
                  />
                  <span className="truncate">{repoName(repo.root)}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-0.5 text-zinc-700">
                    <GitBranchIcon className="h-2.5 w-2.5" />
                    {repo.detached ? 'detached' : (repo.branch ?? 'unknown')}
                  </span>
                </li>
              ))}
              {hookRepos.length > 3 ? (
                <li className="text-[9px] text-zinc-700">
                  +{hookRepos.length - 3} more repositories
                </li>
              ) : null}
            </ul>
          </div>
        ) : (
          <p className="mt-1 text-[9.5px] leading-relaxed text-zinc-600">
            {workspaceName
              ? 'No .git folder found in this workspace. Run "git init" and scan again.'
              : 'Pick a folder to detect its Git repositories.'}
          </p>
        )}

        <p className="mt-1 text-[9px] leading-relaxed text-zinc-600">
          Writes <span className="font-mono">hooks/pre-commit</span> to block
          staged secrets. Existing hooks are backed up.
          {usesConfiguredPath
            ? ' This repository uses a custom core.hooksPath.'
            : ''}
        </p>

        <button
          type="button"
          onClick={workspaceName ? onInstallHook : onChooseFolder}
          disabled={workspaceName ? !canInstall : !canPick}
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
        {SECRET_PATTERN_COUNT} built-in
        {customRuleCount > 0 ? ` + ${customRuleCount} custom` : ''} rules · v1.5
        · local-first
      </p>
    </section>
  )
}
