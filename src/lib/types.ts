export type UserRole = 'citizen' | 'district_admin' | 'municipal_admin' | 'staff' | 'governor' | 'mayor' | 'mukhtar'

export type RequestCategory = 'lighting' | 'water' | 'waste' | 'roads' | 'other'

export type RequestStatus = 'new' | 'under_review' | 'in_progress' | 'resolved' | 'rejected' | 'deferred'

export type Priority = 'low' | 'normal' | 'high' | 'urgent'

export interface Governorate {
  id: string
  name: string
  isActive: boolean
}

export interface Municipality {
  id: string
  governorateId?: string
  name: string
  isActive: boolean
}

export interface District {
  id: string
  municipalityId: string
  name: string
  isActive: boolean
}

export interface User {
  id: string
  username: string
  fullName: string
  role: UserRole
  governorateId?: string
  municipalityId?: string
  districtId?: string
  isActive: boolean
  createdAt?: string
}

export interface ServiceRequest {
  id: string
  municipalityId: string
  districtId: string
  complaintNumber?: string
  category: RequestCategory
  priority: Priority
  status: RequestStatus
  responsibleTeam?: string
  responsibleTeamId?: string
  responsibleTeamName?: string
  responsibleTeamLeaderName?: string
  responsibleTeamLeaderPhone?: string
  description: string
  trackingCode: string
  locationLat?: number
  locationLng?: number
  addressText?: string
  assignedToUserId?: string
  assignedToName?: string
  rejectionReason?: string
  completionPhotoUrl?: string
  completionNote?: string
  isArchived?: boolean
  archivedAt?: string
  archivedByUserId?: string
  archiveNote?: string
  priorityEscalatedAt?: string
  isAutoEscalated?: boolean
  slaDeadline?: string
  slaStatus?: 'met' | 'at_risk' | 'breached'
  slaBreachedAt?: string
  createdAt: string
  updatedAt: string
  closedAt?: string
  municipalityName?: string
  districtName?: string
  governorateName?: string
}

export interface MaterialUsed {
  id: string
  requestId: string
  name: string
  quantity: string
  notes?: string
  createdAt: string
}

export interface RequestUpdate {
  id: string
  requestId: string
  actorUserId?: string
  actorName?: string
  message?: string
  eventType?: string
  fromStatus?: RequestStatus
  toStatus?: RequestStatus
  fromPriority?: Priority
  toPriority?: Priority
  isAutoEscalation?: boolean
  isInternal: boolean
  createdAt: string
}

export interface Assignment {
  id: string
  requestId: string
  staffUserId: string
  staffName: string
  assignedByUserId: string
  assignedByName: string
  createdAt: string
}

export interface Attachment {
  id: string
  requestId: string
  kind: 'before' | 'after' | 'other' | 'photo' | 'document'
  fileUrl: string
  fileName: string
  createdAt: string
}

export interface AuditLog {
  id: string
  actorUserId?: string
  action: string
  entityType: string
  entityId: string
  details?: string
  createdAt: string
}

export interface CategorySLA {
  category: RequestCategory
  daysToResolve: number
}

export interface MunicipalTeam {
  id: string
  municipalityId: string
  teamName: string
  leaderName: string
  leaderPhone: string
  notes?: string
  isActive: boolean
}
