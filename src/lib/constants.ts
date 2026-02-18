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
  normal: 'text-muted-foreground',
  high: 'text-[oklch(0.70_0.15_65)]',
  urgent: 'text-destructive'
}

export const CATEGORY_SLA: Record<RequestCategory, number> = {
  lighting: 3,
  water: 1,
  waste: 2,
  roads: 7,
  other: 5
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
