import { viewItems, type ViewId } from '../data/navigation'
import { FolderIcon, GitBranchIcon, SettingsIcon, ShieldIcon } from './icons'
import { Toggle } from './Toggle'

interface TopbarProps {
  active: ViewId
  onNavigate: (view: ViewId) => void
  shieldActive: boolean
  onShieldChange: (next: boolean) => void
  onOpenDetails: () => void
  workspacePath: string | null
  branch: string | null
}

export function Topbar({
  active,
  onNavigate,
  shieldActive,
  onShieldChange,
  onOpenDetails,
  workspacePath,
  branch,
}: TopbarProps) {
  const current = viewItems.find((item) => item.id === active)
  const workspaceName = workspacePath
    ? (workspacePath.split(/[\\/]/).filter(Boolean).pop() ?? workspacePath)
    : 'demo workspace'

  return (
    <header className="shrink-0 border-b border-zinc-900 bg-[#09090b]/95">
      <div className="flex h-12 items-center justify-between gap-3 px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex min-w-0 items-center gap-1.5 lg:hidden">
            <ShieldIcon
              className="h-4 w-4 shrink-0 text-zinc-400"
              strokeWidth={1.8}
            />
            <span className="truncate text-[11.5px] font-medium text-zinc-200">
              Developer Shield
            </span>
          </span>

          <span className="hidden min-w-0 items-center gap-1.5 text-[11px] text-zinc-600 lg:flex">
            <span className="truncate text-zinc-600">Workspace</span>
            <span className="text-zinc-800">/</span>
            <span
              className="flex min-w-0 items-center gap-1 text-zinc-500"
              title={workspacePath ?? 'Demo fixtures'}
            >
              <FolderIcon className="h-3 w-3 shrink-0 text-zinc-700" />
              <span className="truncate">{workspaceName}</span>
            </span>
            <span className="text-zinc-800">/</span>
            <span className="truncate text-zinc-400">{current?.label}</span>
            {branch ? (
              <span className="ml-0.5 flex max-w-[140px] items-center gap-1 rounded border border-zinc-900 px-1.5 py-0.5 font-mono text-[9px] text-zinc-700">
                <GitBranchIcon className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{branch}</span>
              </span>
            ) : null}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <span className="hidden items-center gap-1.5 text-[10.5px] text-zinc-500 sm:flex">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                shieldActive ? 'bg-emerald-500' : 'bg-zinc-600'
              }`}
            />
            {shieldActive ? 'Armed' : 'Paused'}
          </span>

          <button
            type="button"
            onClick={onOpenDetails}
            aria-label="Open guardrails panel"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-zinc-800 px-2 text-[10.5px] text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-200 xl:hidden"
          >
            <SettingsIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Guardrails</span>
          </button>

          <Toggle
            checked={shieldActive}
            onChange={onShieldChange}
            label="Shield active"
            size="sm"
          />
        </div>
      </div>

      <nav
        className="flex h-9 items-center gap-1 border-t border-zinc-900 px-2 lg:hidden"
        aria-label="Section navigation"
      >
        {viewItems.map((item) => {
          const Icon = item.icon
          const isActive = active === item.id

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-[10.5px] font-medium transition ${
                isActive
                  ? 'bg-zinc-900/80 text-zinc-100'
                  : 'text-zinc-600 hover:bg-zinc-900/40 hover:text-zinc-300'
              }`}
            >
              <Icon className="h-3 w-3 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          )
        })}
      </nav>
    </header>
  )
}
