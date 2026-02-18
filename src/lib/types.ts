export type UserRole = 'citizen' | 'district_admin' | 'municipal_admin' | 'staff'

export type RequestCategory = 'lighting' | 'water' | 'waste' | 'roads' | 'other'

export type RequestStatus = 'submitted' | 'received' | 'in_progress' | 'completed' | 'rejected'

export type Priority = 'normal' | 'high' | 'urgent'

export interface Municipality {
  id: string
  name: string
}

export interface District {
  id: string
  municipalityId: string
  name: string
}

export interface User {
  id: string
  email: string
  passwordHash: string
  role: UserRole
  municipalityId: string
  districtId?: string
  name: string
}

export interface ServiceRequest {
  id: string
  municipalityId: string
  districtId: string
  category: RequestCategory
  priority: Priority
  status: RequestStatus
  description: string
  trackingCode: string
  locationLat?: number
  locationLng?: number
  addressText?: string
  assignedToUserId?: string
  assignedToName?: string
  rejectionReason?: string
  completionPhotoUrl?: string
  createdAt: string
  updatedAt: string
  closedAt?: string
}

export interface RequestUpdate {
  id: string
  requestId: string
  actorUserId?: string
  actorName?: string
  message?: string
  fromStatus?: RequestStatus
  toStatus?: RequestStatus
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
  kind: 'photo' | 'document'
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
