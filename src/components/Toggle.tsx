interface ToggleProps {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
  size?: 'sm' | 'md'
}

const sizes = {
  sm: {
    track: 'h-5 w-9',
    knob: 'h-3.5 w-3.5',
    on: 'translate-x-[18px]',
    off: 'translate-x-[3px]',
  },
  md: {
    track: 'h-6 w-11',
    knob: 'h-4 w-4',
    on: 'translate-x-6',
    off: 'translate-x-1',
  },
} as const

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  size = 'md',
}: ToggleProps) {
  const styles = sizes[size]

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex shrink-0 items-center rounded-full border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-40 ${styles.track} ${
        checked
          ? 'border-zinc-600 bg-zinc-700'
          : 'border-zinc-800 bg-zinc-900'
      }`}
    >
      <span
        className={`inline-block transform rounded-full transition-transform duration-150 ease-out ${styles.knob} ${
          checked ? 'bg-zinc-100' : 'bg-zinc-600'
        } ${checked ? styles.on : styles.off}`}
      />
    </button>
  )
}
