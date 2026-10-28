import type { Severity } from '../utils/scanner'

export type SeverityLevel = Severity | 'low'

const severityStyles: Record<SeverityLevel, { label: string; dot: string }> = {
  low: { label: 'Low', dot: 'bg-zinc-600' },
  medium: { label: 'Medium', dot: 'bg-amber-500' },
  high: { label: 'High', dot: 'bg-orange-500' },
  critical: { label: 'Critical', dot: 'bg-rose-500' },
}

interface SeverityBadgeProps {
  severity: SeverityLevel
}

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const styles = severityStyles[severity]

  return (
    <span className="inline-flex items-center gap-1.5 text-[10.5px] text-zinc-500">
      <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
      {styles.label}
    </span>
  )
}
