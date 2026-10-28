import { useState } from 'react'
import { viewItems, type ViewId } from '../data/navigation'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { LockIcon, PanelLeftIcon, ShieldIcon } from './icons'

interface SidebarProps {
  active: ViewId
  onNavigate: (view: ViewId) => void
}

export function Sidebar({ active, onNavigate }: SidebarProps) {
  const isWide = useMediaQuery('(min-width: 1280px)')
  const [manualCollapsed, setManualCollapsed] = useState(false)

  // Slim automatically between 1024px and 1279px; manual control above that.
  const collapsed = !isWide || manualCollapsed

  return (
    <aside
      className={`hidden h-full shrink-0 flex-col border-r border-zinc-900 bg-[#09090b] transition-[width] duration-200 ease-out lg:flex ${
        collapsed ? 'w-14' : 'w-[212px]'
      }`}
    >
      <div
        className={`flex h-12 shrink-0 items-center border-b border-zinc-900 ${
          collapsed ? 'justify-center' : 'justify-between px-3'
        }`}
      >
        <button
          type="button"
          onClick={() => onNavigate('overview')}
          aria-label="Developer Shield overview"
          className="flex min-w-0 items-center gap-2"
        >
          <ShieldIcon
            className="h-4 w-4 shrink-0 text-zinc-400"
            strokeWidth={1.8}
          />
          {!collapsed ? (
            <span className="truncate text-[12px] font-medium tracking-tight text-zinc-200">
              Developer Shield
            </span>
          ) : null}
        </button>
        {!collapsed ? (
          <button
            type="button"
            onClick={() => setManualCollapsed(true)}
            aria-label="Collapse sidebar"
            className="grid h-6 w-6 place-items-center rounded text-zinc-600 transition hover:bg-zinc-900 hover:text-zinc-300"
          >
            <PanelLeftIcon className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {collapsed && isWide ? (
        <button
          type="button"
          onClick={() => setManualCollapsed(false)}
          aria-label="Expand sidebar"
          className="mx-2 mt-2 flex h-7 items-center justify-center rounded text-zinc-600 transition hover:bg-zinc-900 hover:text-zinc-300"
        >
          <PanelLeftIcon className="h-3.5 w-3.5 rotate-180" />
        </button>
      ) : null}

      <nav
        className="min-h-0 flex-1 space-y-0.5 overflow-hidden px-2 py-3"
        aria-label="Primary"
      >
        {viewItems.map((item) => {
          const Icon = item.icon
          const isActive = active === item.id

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              title={collapsed ? item.label : undefined}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={`group flex w-full items-center gap-2.5 rounded-md text-[11.5px] font-medium transition-colors duration-150 ${
                collapsed ? 'justify-center py-2' : 'px-2.5 py-1.5'
              } ${
                isActive
                  ? 'bg-zinc-900/70 text-zinc-100'
                  : 'text-zinc-500 hover:bg-zinc-900/40 hover:text-zinc-300'
              }`}
            >
              <Icon
                className={`h-3.5 w-3.5 shrink-0 ${
                  isActive
                    ? 'text-zinc-300'
                    : 'text-zinc-600 group-hover:text-zinc-400'
                }`}
              />
              {!collapsed ? <span className="truncate">{item.label}</span> : null}
            </button>
          )
        })}
      </nav>

      <div
        className={`shrink-0 border-t border-zinc-900 p-3 ${
          collapsed ? 'flex justify-center' : ''
        }`}
      >
        {collapsed ? (
          <span title="Local only" className="text-zinc-600">
            <LockIcon className="h-3.5 w-3.5" />
          </span>
        ) : (
          <div>
            <p className="flex items-center gap-1.5 text-[10px] text-zinc-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Local only
            </p>
            <p className="mt-1 text-[9.5px] text-zinc-700">
              v0.1.0 · 0 network calls
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}
