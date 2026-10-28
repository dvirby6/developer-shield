import type { ComponentType } from 'react'
import {
  ActivityIcon,
  ScanIcon,
  SettingsIcon,
  SparklesIcon,
  type IconProps,
} from '../components/icons'

export type ViewId = 'overview' | 'scans' | 'sanitizer' | 'guardrails'

export interface ViewItem {
  id: ViewId
  label: string
  icon: ComponentType<IconProps>
}

export const viewItems: ViewItem[] = [
  { id: 'overview', label: 'Overview', icon: ActivityIcon },
  { id: 'scans', label: 'Scans', icon: ScanIcon },
  { id: 'sanitizer', label: 'Sanitizer', icon: SparklesIcon },
  { id: 'guardrails', label: 'Guardrails', icon: SettingsIcon },
]
