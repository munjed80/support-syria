/**
 * API client for the Municipal Requests backend.
 *
 * Usage:
 *   import { api } from '@/lib/api'
 *
 *   // Auth
 *   const { access_token } = await api.login('admin@mun.sa', 'admin123')
 *   api.setToken(access_token)
 *
 *   // Public
 *   const req = await api.submitRequest({ district_id, category, description })
 *   const tracked = await api.trackRequest('ABCD1234')
 *
 *   // Admin
 *   const { items } = await api.getRequests({ status: 'submitted' })
 *   await api.updateStatus(id, { status: 'received' })
 */

import type { ServiceRequest, RequestUpdate, District, Municipality, User, UserRole } from '@/lib/types'

const BASE_URL = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:8000'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string
  token_type: string
}

export interface UserOut {
  id: string
  username: string
  full_name: string
  role: string
  governorate_id?: string
  municipality_id?: string
  district_id?: string
  is_active: boolean
}

export interface GovernorateOut {
  id: string
  name: string
  is_active: boolean
}

export interface MunicipalityOut {
  id: string
  governorate_id?: string
  name: string
  is_active: boolean
}

export interface DistrictOut {
  id: string
  municipality_id: string
  name: string
  is_active: boolean
}

export interface ServiceRequestOut {
  id: string
  municipality_id: string
  district_id: string
  category: string
  priority: string
  status: string
  description: string
  tracking_code: string
  location_lat?: number
  location_lng?: number
  address_text?: string
  assigned_to_user_id?: string
  assigned_to_name?: string
  rejection_reason?: string
  completion_photo_url?: string
  priority_escalated_at?: string
  is_auto_escalated: boolean
  sla_deadline?: string
  sla_status?: string
  sla_breached_at?: string
  created_at: string
  updated_at: string
  closed_at?: string
}

export interface RequestUpdateOut {
  id: string
  request_id: string
  actor_user_id?: string
  actor_name?: string
  message?: string
  from_status?: string
  to_status?: string
  from_priority?: string
  to_priority?: string
  is_auto_escalation: boolean
  is_internal: boolean
  created_at: string
}

export interface ServiceRequestDetail extends ServiceRequestOut {
  updates: RequestUpdateOut[]
}

export interface PaginatedRequests {
  items: ServiceRequestOut[]
  total: number
  page: number
  page_size: number
}

export interface PublicSubmitRequest {
  district_id: string
  category: string
  description: string
  address_text?: string
  location_lat?: number
  location_lng?: number
}

export interface StatusUpdateRequest {
  status: string
  rejection_reason?: string
  completion_photo_url?: string
  note?: string
}

export interface RequestsFilter {
  municipality_id?: string
  district_id?: string
  status?: string | string[]
  category?: string | string[]
  priority?: string | string[]
  overdue?: boolean
  sla_breached?: boolean
  date_from?: string
  date_to?: string
  search?: string
  sort_by?: string
  sort_dir?: string
  assigned_to_me?: boolean
  page?: number
  page_size?: number
}

// ─── Mappers (snake_case API → camelCase frontend types) ─────────────────────

export function toServiceRequest(r: ServiceRequestOut): ServiceRequest {
  return {
    id: String(r.id),
    municipalityId: String(r.municipality_id),
    districtId: String(r.district_id),
    category: r.category as any,
    priority: r.priority as any,
    status: r.status as any,
    description: r.description,
    trackingCode: r.tracking_code,
    locationLat: r.location_lat ?? undefined,
    locationLng: r.location_lng ?? undefined,
    addressText: r.address_text ?? undefined,
    assignedToUserId: r.assigned_to_user_id ? String(r.assigned_to_user_id) : undefined,
    assignedToName: r.assigned_to_name ?? undefined,
    rejectionReason: r.rejection_reason ?? undefined,
    completionPhotoUrl: r.completion_photo_url ?? undefined,
    priorityEscalatedAt: r.priority_escalated_at ?? undefined,
    isAutoEscalated: r.is_auto_escalated,
    slaDeadline: r.sla_deadline ?? undefined,
    slaStatus: r.sla_status as any,
    slaBreachedAt: r.sla_breached_at ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    closedAt: r.closed_at ?? undefined,
  }
}

export function toRequestUpdate(u: RequestUpdateOut): RequestUpdate {
  return {
    id: String(u.id),
    requestId: String(u.request_id),
    actorUserId: u.actor_user_id ? String(u.actor_user_id) : undefined,
    actorName: u.actor_name ?? undefined,
    message: u.message ?? undefined,
    fromStatus: u.from_status as any,
    toStatus: u.to_status as any,
    fromPriority: u.from_priority as any,
    toPriority: u.to_priority as any,
    isAutoEscalation: u.is_auto_escalation,
    isInternal: u.is_internal,
    createdAt: u.created_at,
  }
}

export function toMunicipality(m: MunicipalityOut): Municipality {
  return {
    id: String(m.id),
    governorateId: m.governorate_id ? String(m.governorate_id) : undefined,
    name: m.name,
    isActive: m.is_active,
  }
}

export function toDistrict(d: DistrictOut): District {
  return {
    id: String(d.id),
    municipalityId: String(d.municipality_id),
    name: d.name,
    isActive: d.is_active,
  }
}

export function toUser(u: UserOut): User {
  return {
    id: String(u.id),
    username: u.username,
    fullName: u.full_name,
    role: u.role as UserRole,
    governorateId: u.governorate_id ? String(u.governorate_id) : undefined,
    municipalityId: u.municipality_id ? String(u.municipality_id) : undefined,
    districtId: u.district_id ? String(u.district_id) : undefined,
    isActive: u.is_active,
  }
}

// ─── Client ───────────────────────────────────────────────────────────────────

class ApiClient {
  private token: string | null = null

  setToken(token: string | null) {
    this.token = token
    if (token) {
      localStorage.setItem('api_token', token)
    } else {
      localStorage.removeItem('api_token')
    }
  }

  loadToken() {
    this.token = localStorage.getItem('api_token')
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    }
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.detail ?? `HTTP ${res.status}`)
    }
    if (res.status === 204) return undefined as T
    return res.json()
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async login(username: string, password: string): Promise<TokenResponse> {
    return this.request<TokenResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
  }

  async me(): Promise<UserOut> {
    return this.request<UserOut>('/auth/me')
  }

  // ── Public ────────────────────────────────────────────────────────────────

  async getDistricts(): Promise<DistrictOut[]> {
    return this.request<DistrictOut[]>('/public/districts')
  }

  async submitRequest(payload: PublicSubmitRequest): Promise<ServiceRequestOut> {
    return this.request<ServiceRequestOut>('/public/requests', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async trackRequest(trackingCode: string): Promise<ServiceRequestDetail> {
    return this.request<ServiceRequestDetail>(
      `/public/requests/${encodeURIComponent(trackingCode)}`,
    )
  }

  async citizenUpdate(
    trackingCode: string,
    message: string,
  ): Promise<ServiceRequestDetail> {
    return this.request<ServiceRequestDetail>(
      `/public/requests/${encodeURIComponent(trackingCode)}/update`,
      { method: 'POST', body: JSON.stringify({ message }) },
    )
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  async getRequests(filters: RequestsFilter = {}): Promise<PaginatedRequests> {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return
      if (Array.isArray(v)) {
        v.forEach((item) => params.append(k, String(item)))
      } else {
        params.set(k, String(v))
      }
    })
    const qs = params.toString()
    return this.request<PaginatedRequests>(`/admin/requests${qs ? `?${qs}` : ''}`)
  }

  async createRequest(payload: {
    district_id: string
    category: string
    description: string
    priority?: string
    address_text?: string
    location_lat?: number
    location_lng?: number
  }): Promise<ServiceRequestOut> {
    return this.request<ServiceRequestOut>('/admin/requests', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async getRequest(id: string): Promise<ServiceRequestDetail> {
    return this.request<ServiceRequestDetail>(`/admin/requests/${id}`)
  }

  async getMunicipalities(): Promise<MunicipalityOut[]> {
    return this.request<MunicipalityOut[]>('/admin/municipalities')
  }

  async createMunicipality(name: string): Promise<MunicipalityOut> {
    return this.request<MunicipalityOut>('/admin/municipalities', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
  }

  async updateMunicipality(
    id: string,
    payload: { name?: string; is_active?: boolean },
  ): Promise<MunicipalityOut> {
    return this.request<MunicipalityOut>(`/admin/municipalities/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  }

  async getAdminDistricts(): Promise<DistrictOut[]> {
    return this.request<DistrictOut[]>('/admin/districts')
  }

  async createDistrict(name: string): Promise<DistrictOut> {
    return this.request<DistrictOut>('/admin/districts', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
  }

  async updateDistrict(
    id: string,
    payload: { name?: string; is_active?: boolean },
  ): Promise<DistrictOut> {
    return this.request<DistrictOut>(`/admin/districts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  }

  async getStaff(districtId?: string): Promise<UserOut[]> {
    const qs = districtId ? `?district_id=${encodeURIComponent(districtId)}` : ''
    return this.request<UserOut[]>(`/admin/staff${qs}`)
  }

  async createMayor(payload: {
    full_name: string
    username: string
    password: string
    municipality_id: string
  }): Promise<UserOut> {
    return this.request<UserOut>('/admin/users/mayors', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async createMukhtar(payload: {
    full_name: string
    username: string
    password: string
    district_id: string
  }): Promise<UserOut> {
    return this.request<UserOut>('/admin/users/mukhtars', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async assignStaff(requestId: string, staffUserId: string): Promise<ServiceRequestOut> {
    return this.request<ServiceRequestOut>(`/admin/requests/${requestId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ staff_user_id: staffUserId }),
    })
  }

  async updateStatus(
    requestId: string,
    payload: StatusUpdateRequest,
  ): Promise<ServiceRequestOut> {
    return this.request<ServiceRequestOut>(`/admin/requests/${requestId}/status`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async updatePriority(requestId: string, priority: string): Promise<ServiceRequestOut> {
    return this.request<ServiceRequestOut>(`/admin/requests/${requestId}/priority`, {
      method: 'POST',
      body: JSON.stringify({ priority }),
    })
  }

  async addNote(requestId: string, message: string): Promise<ServiceRequestOut> {
    return this.request<ServiceRequestOut>(`/admin/requests/${requestId}/note`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    })
  }

  async uploadAttachment(requestId: string, file: File): Promise<unknown> {
    const form = new FormData()
    form.append('file', file)
    const headers: Record<string, string> = {}
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`
    const res = await fetch(`${BASE_URL}/admin/requests/${requestId}/attachments`, {
      method: 'POST',
      headers,
      body: form,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.detail ?? `HTTP ${res.status}`)
    }
    return res.json()
  }
}

export const api = new ApiClient()

// Auto-load token from localStorage on module initialisation
api.loadToken()
