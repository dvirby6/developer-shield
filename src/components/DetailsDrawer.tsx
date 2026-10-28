import type { ReactNode } from 'react'
import { CloseIcon, LockIcon } from './icons'

interface DetailsDrawerProps {
  onClose: () => void
  children: ReactNode
}

/**
 * Slide-over used below 1280px so the details panel never squeezes the scans
 * table. Above 1280px the panel lives inline in the overview instead.
 */
export function DetailsDrawer({ onClose, children }: DetailsDrawerProps) {
  return (
    <div className="fixed inset-0 z-50 xl:hidden">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close guardrails panel"
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Guardrails"
        className="absolute inset-y-0 right-0 flex w-[320px] max-w-[86vw] flex-col border-l border-zinc-800 bg-[#09090b] shadow-2xl"
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-900 px-4">
          <div>
            <h2 className="text-[12px] font-medium text-zinc-200">Guardrails</h2>
            <p className="text-[9.5px] text-zinc-600">Shield · hooks · watchers</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="grid h-7 w-7 place-items-center rounded text-zinc-600 transition hover:bg-zinc-900 hover:text-zinc-300"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden p-4">{children}</div>

        <div className="flex shrink-0 items-center gap-1.5 border-t border-zinc-900 px-4 py-2.5 text-[9.5px] text-zinc-700">
          <LockIcon className="h-3 w-3" />
          Settings stay on this machine
        </div>
      </aside>
    </div>
  )
}
