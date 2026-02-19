from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


# ─── Enums (mirror frontend types) ───────────────────────────────────────────

class UserRole(str):
    citizen = "citizen"
    district_admin = "district_admin"
    municipal_admin = "municipal_admin"
    staff = "staff"


# ─── Auth ─────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: UUID
    email: str
    role: str
    municipality_id: UUID
    district_id: Optional[UUID] = None
    name: str

    class Config:
        from_attributes = True


# ─── Municipality / District ──────────────────────────────────────────────────

class MunicipalityOut(BaseModel):
    id: UUID
    name: str

    class Config:
        from_attributes = True


class DistrictOut(BaseModel):
    id: UUID
    municipality_id: UUID
    name: str

    class Config:
        from_attributes = True


# ─── Attachments ──────────────────────────────────────────────────────────────

class AttachmentOut(BaseModel):
    id: UUID
    request_id: UUID
    kind: str
    file_url: str
    file_name: str
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Request Updates ──────────────────────────────────────────────────────────

class RequestUpdateOut(BaseModel):
    id: UUID
    request_id: UUID
    actor_user_id: Optional[UUID] = None
    actor_name: Optional[str] = None
    message: Optional[str] = None
    from_status: Optional[str] = None
    to_status: Optional[str] = None
    from_priority: Optional[str] = None
    to_priority: Optional[str] = None
    is_auto_escalation: bool
    is_internal: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Service Requests ─────────────────────────────────────────────────────────

class ServiceRequestOut(BaseModel):
    id: UUID
    municipality_id: UUID
    district_id: UUID
    category: str
    priority: str
    status: str
    description: str
    tracking_code: str
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    address_text: Optional[str] = None
    assigned_to_user_id: Optional[UUID] = None
    assigned_to_name: Optional[str] = None
    rejection_reason: Optional[str] = None
    completion_photo_url: Optional[str] = None
    priority_escalated_at: Optional[datetime] = None
    is_auto_escalated: bool
    sla_deadline: Optional[datetime] = None
    sla_status: Optional[str] = None
    sla_breached_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    closed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ServiceRequestDetail(ServiceRequestOut):
    updates: list[RequestUpdateOut] = []
    attachments: list[AttachmentOut] = []

    class Config:
        from_attributes = True


# ─── Public endpoints ─────────────────────────────────────────────────────────

class PublicSubmitRequest(BaseModel):
    district_id: UUID
    category: str
    description: str
    address_text: Optional[str] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None


class PublicCitizenUpdate(BaseModel):
    message: str


# ─── Admin endpoints ──────────────────────────────────────────────────────────

class AssignStaffRequest(BaseModel):
    staff_user_id: UUID


class StatusUpdateRequest(BaseModel):
    status: str
    rejection_reason: Optional[str] = None
    completion_photo_url: Optional[str] = None
    note: Optional[str] = None


class PriorityUpdateRequest(BaseModel):
    priority: str


class InternalNoteRequest(BaseModel):
    message: str


# ─── Paginated responses ──────────────────────────────────────────────────────

class PaginatedRequests(BaseModel):
    items: list[ServiceRequestOut]
    total: int
    page: int
    page_size: int
