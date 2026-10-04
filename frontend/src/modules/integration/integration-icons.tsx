import {
  CalendarIcon,
  CheckSquareIcon,
  FileTextIcon,
  MailIcon,
  UsersIcon,
  CirclePlayIcon,
  type LucideIcon,
} from 'lucide-react'
import type { ToolkitSlug } from '@/types/api'

export const INTEGRATION_ICONS: Record<ToolkitSlug, LucideIcon> = {
  gmail: MailIcon,
  googlecalendar: CalendarIcon,
  notion: FileTextIcon,
  asana: CheckSquareIcon,
  hubspot: UsersIcon,
  youtube: CirclePlayIcon,
}
