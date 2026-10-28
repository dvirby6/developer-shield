import type { ComponentType } from 'react'
import type { IconProps } from './icons'

export type StatusTone = 'emerald' | 'violet' | 'rose' | 'amber' | 'zinc'

const toneStyles: Record<
  StatusTone,
  { icon: string; glow: string; dot: string }
> = {
  emerald: {
    icon: 'border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-400',
    glow: 'bg-emerald-500/10',
    dot: 'bg-emerald-400',
  },
  violet: {
    icon: 'border-violet-500/20 bg-violet-500/[0.08] text-violet-400',
    glow: 'bg-violet-500/10',
    dot: 'bg-violet-400',
  },
  rose: {
    icon: 'border-rose-500/20 bg-rose-500/[0.08] text-rose-400',
    glow: 'bg-rose-500/10',
    dot: 'bg-rose-400',
  },
  amber: {
    icon: 'border-amber-500/20 bg-amber-500/[0.08] text-amber-400',
    glow: 'bg-amber-500/10',
    dot: 'bg-amber-400',
  },
  zinc: {
    icon: 'border-zinc-700/70 bg-zinc-800/40 text-zinc-400',
    glow: 'bg-zinc-500/10',
    dot: 'bg-zinc-500',
  },
}

interface StatusCardProps {
  label: string
  value: string
  detail: string
  icon: ComponentType<IconProps>
  tone: StatusTone
  pulse?: boolean
  unit?: string
}

export function StatusCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
  pulse = false,
  unit,
}: StatusCardProps) {
  const styles = toneStyles[tone]

  return (
    <div className="group relative overflow-hidden rounded-xl border border-zinc-800/80 bg-[#0c0c0f] p-4 transition-colors duration-200 hover:border-zinc-700/80">
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full blur-3xl ${styles.glow}`}
      />
      <div className="relative flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium text-zinc-500">{label}</span>
        <span
          className={`grid h-7 w-7 place-items-center rounded-md border ${styles.icon}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="relative mt-3 flex items-baseline gap-1.5">
        <span className="text-[25px] font-semibold leading-none tracking-[-0.02em] text-zinc-100">
          {value}
        </span>
        {unit ? (
          <span className="text-[11px] font-medium text-zinc-500">{unit}</span>
        ) : null}
      </div>
      <div className="relative mt-2 flex items-center gap-1.5 text-[11px] text-zinc-500">
        {pulse ? (
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${styles.dot}`}
            />
            <span
              className={`relative inline-flex h-1.5 w-1.5 rounded-full ${styles.dot}`}
            />
          </span>
        ) : null}
        <span className="truncate">{detail}</span>
      </div>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
    </div>
  )
}
