from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, field_validator

VALID_CATEGORIES = {"lighting", "water", "waste", "roads", "other"}
VALID_PRIORITIES = {"low", "normal", "high", "urgent"}
DESCRIPTION_MIN_LENGTH = 10


# ─── Enums (mirror frontend types) ───────────────────────────────────────────

class UserRole(str):
    citizen = "citizen"
    district_admin = "district_admin"
    municipal_admin = "municipal_admin"
    staff = "staff"
    governor = "governor"
    mayor = "mayor"
    mukhtar = "mukhtar"


# ─── Auth ─────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: UUID
    username: str
    full_name: str
    role: str
    governorate_id: Optional[UUID] = None
    municipality_id: Optional[UUID] = None
    district_id: Optional[UUID] = None
    is_active: bool = True

    class Config:
        from_attributes = True


# ─── Governorate ──────────────────────────────────────────────────────────────

class GovernorateOut(BaseModel):
    id: UUID
    name: str
    is_active: bool

    class Config:
        from_attributes = True


# ─── Municipality / District ──────────────────────────────────────────────────

class MunicipalityOut(BaseModel):
    id: UUID
    governorate_id: Optional[UUID] = None
    name: str
    is_active: bool

    class Config:
        from_attributes = True


class MunicipalityCreate(BaseModel):
    name: str


class MunicipalityUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None


class DistrictOut(BaseModel):
    id: UUID
    municipality_id: UUID
    name: str
    is_active: bool

    class Config:
        from_attributes = True


class DistrictCreate(BaseModel):
    name: str


class DistrictUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None


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
    complaint_number: Optional[str] = None
    category: str
    priority: str
    status: str
    responsible_team: Optional[str] = None
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
    materials_used: list["MaterialUsedOut"] = []
    municipality_name: Optional[str] = None
    district_name: Optional[str] = None
    governorate_name: Optional[str] = None

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

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        if v not in VALID_CATEGORIES:
            raise ValueError("فئة غير صالحة. الفئات المتاحة: إنارة، مياه، نفايات، طرق، أخرى")
        return v

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: str) -> str:
        if not v or len(v.strip()) < DESCRIPTION_MIN_LENGTH:
            raise ValueError(f"يجب أن يحتوي الوصف على {DESCRIPTION_MIN_LENGTH} أحرف على الأقل")
        return v.strip()


class PublicCitizenUpdate(BaseModel):
    message: str

    @field_validator("message")
    @classmethod
    def validate_message(cls, v: str) -> str:
        if not v or len(v.strip()) < 5:
            raise ValueError("يجب أن تحتوي الرسالة على 5 أحرف على الأقل")
        return v.strip()


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


class AdminServiceRequestCreate(BaseModel):
    district_id: UUID
    category: str
    description: str
    priority: str = "normal"
    address_text: Optional[str] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        if v not in VALID_CATEGORIES:
            raise ValueError("فئة غير صالحة. الفئات المتاحة: إنارة، مياه، نفايات، طرق، أخرى")
        return v

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, v: str) -> str:
        if v not in VALID_PRIORITIES:
            raise ValueError("أولوية غير صالحة. الأولويات المتاحة: منخفضة، عادية، مرتفعة، عاجلة")
        return v

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: str) -> str:
        if not v or len(v.strip()) < DESCRIPTION_MIN_LENGTH:
            raise ValueError(f"يجب أن يحتوي الوصف على {DESCRIPTION_MIN_LENGTH} أحرف على الأقل")
        return v.strip()


# ─── Paginated responses ──────────────────────────────────────────────────────

class PaginatedRequests(BaseModel):
    items: list[ServiceRequestOut]
    total: int
    page: int
    page_size: int


# ─── User management ──────────────────────────────────────────────────────────

class CreateMayorRequest(BaseModel):
    full_name: str
    username: str
    password: str
    municipality_id: UUID


class CreateMukhtarRequest(BaseModel):
    full_name: str
    username: str
    password: str
    district_id: UUID


# ─── Responsible Team ─────────────────────────────────────────────────────────

class ResponsibleTeamUpdateRequest(BaseModel):
    responsible_team: Optional[str] = None


# ─── Materials Used ───────────────────────────────────────────────────────────

class MaterialUsedOut(BaseModel):
    id: UUID
    request_id: UUID
    name: str
    quantity: str
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class MaterialUsedCreate(BaseModel):
    name: str
    quantity: str
    notes: Optional[str] = None


# ─── Monthly Reports ──────────────────────────────────────────────────────────

class ReportCountEntry(BaseModel):
    name: str
    count: int


class MonthlyReportPeriod(BaseModel):
    month: int
    year: int


class MonthlyReport(BaseModel):
    period: MonthlyReportPeriod
    total: int
    open: int
    in_progress: int
    resolved: int
    urgent: int
    overdue: int
    most_common_category: Optional[str] = None
    most_assigned_team: Optional[str] = None
    top_district: Optional[str] = None
    by_category: list[ReportCountEntry] = []
    by_status: list[ReportCountEntry] = []
