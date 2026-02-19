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

export const CATEGORY_PRIORITY_SLA: Record<
  RequestCategory,
  Record<Priority, number>
> = {
  water: {
    low: 2,
    normal: 1,
    high: 0.5,
    urgent: 0.25
  },
  waste: {
    low: 3,
    normal: 2,
    high: 1,
    urgent: 0.5
  },
  lighting: {
    low: 5,
    normal: 3,
    high: 2,
    urgent: 1
  },
  roads: {
    low: 10,
    normal: 7,
    high: 5,
    urgent: 2
  },
  other: {
    low: 7,
    normal: 5,
    high: 3,
    urgent: 1
  }
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

export function getSLADeadline(request: { 
  createdAt: string
  category: RequestCategory
  priority: Priority
}): string {
  const createdDate = new Date(request.createdAt)
  const slaDays = CATEGORY_PRIORITY_SLA[request.category][request.priority]
  const deadlineDate = new Date(createdDate.getTime() + slaDays * 24 * 60 * 60 * 1000)
  return deadlineDate.toISOString()
}

export function calculateSLAStatus(request: { 
  createdAt: string
  category: RequestCategory
  priority: Priority
  status: RequestStatus
  closedAt?: string
  slaDeadline?: string
}): 'met' | 'at_risk' | 'breached' {
  if (request.status === 'completed' || request.status === 'rejected') {
    if (request.closedAt) {
      const closedDate = new Date(request.closedAt)
      const deadline = request.slaDeadline ? new Date(request.slaDeadline) : new Date(getSLADeadline(request))
      return closedDate <= deadline ? 'met' : 'breached'
    }
    return 'met'
  }

  const deadline = request.slaDeadline ? new Date(request.slaDeadline) : new Date(getSLADeadline(request))
  const now = new Date()
  const timeRemaining = deadline.getTime() - now.getTime()
  const hoursRemaining = timeRemaining / (1000 * 60 * 60)

  if (timeRemaining <= 0) {
    return 'breached'
  }

  const slaDays = CATEGORY_PRIORITY_SLA[request.category][request.priority]
  const atRiskThreshold = slaDays * 24 * 0.25

  if (hoursRemaining <= atRiskThreshold) {
    return 'at_risk'
  }

  return 'met'
}

export function getSLAStatusLabel(status: 'met' | 'at_risk' | 'breached'): string {
  const labels = {
    met: 'ضمن الموعد',
    at_risk: 'معرض للتأخير',
    breached: 'متأخر'
  }
  return labels[status]
}

export function getSLAStatusColor(status: 'met' | 'at_risk' | 'breached'): string {
  const colors = {
    met: 'bg-[oklch(0.60_0.15_145)] text-white',
    at_risk: 'bg-[oklch(0.70_0.15_65)] text-[oklch(0.25_0.05_60)]',
    breached: 'bg-destructive text-destructive-foreground'
  }
  return colors[status]
}

export function getTimeUntilDeadline(request: { 
  slaDeadline?: string
  createdAt: string
  category: RequestCategory
  priority: Priority
}): string {
  const deadline = request.slaDeadline ? new Date(request.slaDeadline) : new Date(getSLADeadline(request))
  const now = new Date()
  const timeRemaining = deadline.getTime() - now.getTime()
  
  if (timeRemaining <= 0) {
    const hoursOverdue = Math.abs(Math.floor(timeRemaining / (1000 * 60 * 60)))
    const daysOverdue = Math.floor(hoursOverdue / 24)
    if (daysOverdue > 0) {
      return `متأخر ${daysOverdue} يوم`
    }
    return `متأخر ${hoursOverdue} ساعة`
  }

  const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60))
  const daysRemaining = Math.floor(hoursRemaining / 24)
  
  if (daysRemaining > 0) {
    return `متبقي ${daysRemaining} يوم`
  }
  return `متبقي ${hoursRemaining} ساعة`
}

export function getSLAComplianceRate(requests: Array<{ 
  status: RequestStatus
  slaStatus?: 'met' | 'at_risk' | 'breached'
}>): number {
  const closedRequests = requests.filter(r => r.status === 'completed' || r.status === 'rejected')
  if (closedRequests.length === 0) return 100
  
  const metSLA = closedRequests.filter(r => r.slaStatus === 'met').length
  return Math.round((metSLA / closedRequests.length) * 100)
}

export function getSLAComplianceByCategory(
  requests: Array<{ 
    category: RequestCategory
    status: RequestStatus
    slaStatus?: 'met' | 'at_risk' | 'breached'
  }>
): Record<RequestCategory, { total: number; met: number; breached: number; rate: number }> {
  const result: Record<RequestCategory, { total: number; met: number; breached: number; rate: number }> = {
    lighting: { total: 0, met: 0, breached: 0, rate: 0 },
    water: { total: 0, met: 0, breached: 0, rate: 0 },
    waste: { total: 0, met: 0, breached: 0, rate: 0 },
    roads: { total: 0, met: 0, breached: 0, rate: 0 },
    other: { total: 0, met: 0, breached: 0, rate: 0 }
  }

  requests
    .filter(r => r.status === 'completed' || r.status === 'rejected')
    .forEach(request => {
      result[request.category].total++
      if (request.slaStatus === 'met') {
        result[request.category].met++
      } else if (request.slaStatus === 'breached') {
        result[request.category].breached++
      }
    })

  Object.keys(result).forEach(category => {
    const cat = category as RequestCategory
    if (result[cat].total > 0) {
      result[cat].rate = Math.round((result[cat].met / result[cat].total) * 100)
    } else {
      result[cat].rate = 100
    }
  })

  return result
}
