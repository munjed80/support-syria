import type { RequestCategory, RequestStatus, UserRole, Priority } from './types'

export const CATEGORIES: Record<RequestCategory, string> = {
  lighting: 'إنارة',
  water: 'مياه',
  waste: 'نفايات',
  roads: 'طرق',
  other: 'أخرى'
}

export const STATUSES: Record<RequestStatus, string> = {
  submitted: 'مُرسلة',
  received: 'مستلمة',
  in_progress: 'قيد المعالجة',
  completed: 'منجزة',
  rejected: 'مرفوضة'
}

export const ROLES: Record<UserRole, string> = {
  citizen: 'مواطن',
  district_admin: 'مدير حي',
  municipal_admin: 'مدير بلدي',
  staff: 'موظف ميداني'
}

export const PRIORITIES: Record<Priority, string> = {
  low: 'منخفض',
  normal: 'عادي',
  high: 'مرتفع',
  urgent: 'عاجل'
}

export const STATUS_COLORS: Record<RequestStatus, string> = {
  submitted: 'bg-[oklch(0.60_0.01_240)] text-white',
  received: 'bg-[oklch(0.55_0.10_250)] text-white',
  in_progress: 'bg-[oklch(0.65_0.13_65)] text-[oklch(0.25_0.05_60)]',
  completed: 'bg-[oklch(0.60_0.15_145)] text-white',
  rejected: 'bg-[oklch(0.55_0.18_25)] text-white'
}

export const PRIORITY_COLORS: Record<Priority, string> = {
  low: 'text-muted-foreground',
  normal: 'text-muted-foreground',
  high: 'text-[oklch(0.70_0.15_65)]',
  urgent: 'text-destructive'
}

export const PRIORITY_BADGE_COLORS: Record<Priority, string> = {
  low: 'bg-muted text-muted-foreground',
  normal: 'bg-muted text-muted-foreground',
  high: 'bg-[oklch(0.70_0.15_65)] text-[oklch(0.25_0.05_60)]',
  urgent: 'bg-destructive text-destructive-foreground'
}

export const PRIORITY_ORDER: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3
}

export const CATEGORY_SLA: Record<RequestCategory, number> = {
  lighting: 3,
  water: 1,
  waste: 2,
  roads: 7,
  other: 5
}

export const CATEGORY_ESCALATION_RULES: Record<
  RequestCategory,
  Record<Priority, { hoursToNextLevel: number; nextPriority: Priority | null }>
> = {
  water: {
    low: { hoursToNextLevel: 12, nextPriority: 'normal' },
    normal: { hoursToNextLevel: 12, nextPriority: 'high' },
    high: { hoursToNextLevel: 6, nextPriority: 'urgent' },
    urgent: { hoursToNextLevel: Infinity, nextPriority: null }
  },
  waste: {
    low: { hoursToNextLevel: 24, nextPriority: 'normal' },
    normal: { hoursToNextLevel: 24, nextPriority: 'high' },
    high: { hoursToNextLevel: 12, nextPriority: 'urgent' },
    urgent: { hoursToNextLevel: Infinity, nextPriority: null }
  },
  lighting: {
    low: { hoursToNextLevel: 48, nextPriority: 'normal' },
    normal: { hoursToNextLevel: 72, nextPriority: 'high' },
    high: { hoursToNextLevel: 48, nextPriority: 'urgent' },
    urgent: { hoursToNextLevel: Infinity, nextPriority: null }
  },
  roads: {
    low: { hoursToNextLevel: 72, nextPriority: 'normal' },
    normal: { hoursToNextLevel: 120, nextPriority: 'high' },
    high: { hoursToNextLevel: 72, nextPriority: 'urgent' },
    urgent: { hoursToNextLevel: Infinity, nextPriority: null }
  },
  other: {
    low: { hoursToNextLevel: 48, nextPriority: 'normal' },
    normal: { hoursToNextLevel: 72, nextPriority: 'high' },
    high: { hoursToNextLevel: 48, nextPriority: 'urgent' },
    urgent: { hoursToNextLevel: Infinity, nextPriority: null }
  }
}

export const PRIORITY_ESCALATION_RULES: Record<Priority, { hoursToNextLevel: number; nextPriority: Priority | null }> = {
  low: { hoursToNextLevel: 48, nextPriority: 'normal' },
  normal: { hoursToNextLevel: 72, nextPriority: 'high' },
  high: { hoursToNextLevel: 48, nextPriority: 'urgent' },
  urgent: { hoursToNextLevel: Infinity, nextPriority: null }
}

export function generateTrackingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5)
}

export function isOverdue(request: { createdAt: string; status: RequestStatus; category: RequestCategory }): boolean {
  if (request.status === 'completed' || request.status === 'rejected') {
    return false
  }
  
  const createdDate = new Date(request.createdAt)
  const now = new Date()
  const daysPassed = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24))
  
  return daysPassed > CATEGORY_SLA[request.category]
}

export function getDaysRemaining(request: { createdAt: string; category: RequestCategory }): number {
  const createdDate = new Date(request.createdAt)
  const now = new Date()
  const daysPassed = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24))
  const slaDays = CATEGORY_SLA[request.category]
  
  return Math.max(0, slaDays - daysPassed)
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffMins < 1) return 'الآن'
  if (diffMins < 60) return `منذ ${diffMins} دقيقة`
  if (diffHours < 24) return `منذ ${diffHours} ساعة`
  if (diffDays < 7) return `منذ ${diffDays} يوم`
  
  return formatDate(dateString)
}

const STATUS_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  submitted: ['received'],
  received: ['in_progress'],
  in_progress: ['completed', 'rejected'],
  completed: [],
  rejected: []
}

export function canTransitionTo(from: RequestStatus, to: RequestStatus): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) || false
}

export function getValidNextStatuses(current: RequestStatus): RequestStatus[] {
  return STATUS_TRANSITIONS[current] || []
}

export function shouldEscalatePriority(request: { 
  createdAt: string
  priority: Priority
  status: RequestStatus
  category: RequestCategory
  priorityEscalatedAt?: string
}): { shouldEscalate: boolean; newPriority: Priority | null; hoursSinceCreation: number } {
  if (request.status === 'completed' || request.status === 'rejected') {
    return { shouldEscalate: false, newPriority: null, hoursSinceCreation: 0 }
  }

  const baseDate = request.priorityEscalatedAt || request.createdAt
  const baseDateObj = new Date(baseDate)
  const now = new Date()
  const hoursPassed = Math.floor((now.getTime() - baseDateObj.getTime()) / (1000 * 60 * 60))

  const escalationRule = CATEGORY_ESCALATION_RULES[request.category][request.priority]
  
  if (escalationRule.nextPriority && hoursPassed >= escalationRule.hoursToNextLevel) {
    return { 
      shouldEscalate: true, 
      newPriority: escalationRule.nextPriority,
      hoursSinceCreation: hoursPassed
    }
  }

  return { shouldEscalate: false, newPriority: null, hoursSinceCreation: hoursPassed }
}

export function getHoursUntilNextEscalation(request: { 
  createdAt: string
  priority: Priority
  category: RequestCategory
  priorityEscalatedAt?: string
}): number | null {
  const baseDate = request.priorityEscalatedAt || request.createdAt
  const baseDateObj = new Date(baseDate)
  const now = new Date()
  const hoursPassed = Math.floor((now.getTime() - baseDateObj.getTime()) / (1000 * 60 * 60))

  const escalationRule = CATEGORY_ESCALATION_RULES[request.category][request.priority]
  
  if (!escalationRule.nextPriority) {
    return null
  }

  const hoursRemaining = escalationRule.hoursToNextLevel - hoursPassed
  return Math.max(0, hoursRemaining)
}

export function getCategoryEscalationInfo(category: RequestCategory): string {
  const rules = CATEGORY_ESCALATION_RULES[category]
  const lowToNormal = rules.low.hoursToNextLevel
  const normalToHigh = rules.normal.hoursToNextLevel
  const highToUrgent = rules.high.hoursToNextLevel
  
  return `${CATEGORIES[category]}: ${lowToNormal}س → ${normalToHigh}س → ${highToUrgent}س`
}
