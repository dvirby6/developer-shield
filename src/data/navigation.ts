import type { ComponentType } from 'react'
import {
  ActivityIcon,
  ClockIcon,
  ScanIcon,
  SettingsIcon,
  SparklesIcon,
  type IconProps,
} from '../components/icons'

export type ViewId =
  | 'overview'
  | 'scans'
  | 'history'
  | 'sanitizer'
  | 'guardrails'

export interface ViewItem {
  id: ViewId
  label: string
  icon: ComponentType<IconProps>
}

export const viewItems: ViewItem[] = [
  { id: 'overview', label: 'Overview', icon: ActivityIcon },
  { id: 'scans', label: 'Scans', icon: ScanIcon },
  { id: 'history', label: 'History', icon: ClockIcon },
  { id: 'sanitizer', label: 'Sanitizer', icon: SparklesIcon },
  { id: 'guardrails', label: 'Guardrails', icon: SettingsIcon },
]
