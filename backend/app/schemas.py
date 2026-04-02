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
    created_at: Optional[datetime] = None

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
    responsible_team_id: Optional[UUID] = None
    responsible_team_name: Optional[str] = None
    responsible_team_leader_name: Optional[str] = None
    responsible_team_leader_phone: Optional[str] = None
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
    responsible_team_id: Optional[UUID] = None


class MunicipalTeamOut(BaseModel):
    id: UUID
    municipality_id: UUID
    team_name: str
    leader_name: str
    leader_phone: str
    notes: Optional[str] = None
    is_active: bool

    class Config:
        from_attributes = True


class MunicipalTeamCreate(BaseModel):
    team_name: str
    leader_name: str
    leader_phone: str
    notes: Optional[str] = None


class MunicipalTeamUpdate(BaseModel):
    team_name: Optional[str] = None
    leader_name: Optional[str] = None
    leader_phone: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class UserAdminUpdate(BaseModel):
    full_name: Optional[str] = None
    username: Optional[str] = None
    district_id: Optional[UUID] = None
    municipality_id: Optional[UUID] = None
    is_active: Optional[bool] = None


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




# ─── Performance & Accountability ───────────────────────────────────────────

class PerformanceSignal(str):
    good = "good"
    moderate = "moderate"
    poor = "poor"


class GovernorMunicipalityPerformance(BaseModel):
    municipality_id: UUID
    municipality_name: str
    total_complaints: int
    open_complaints: int
    in_progress_complaints: int
    resolved_complaints: int
    rejected_complaints: int
    deferred_complaints: int
    overdue_complaints: int
    resolution_rate: float
    average_resolution_time_hours: Optional[float] = None
    last_activity_date: Optional[datetime] = None
    most_common_category: Optional[str] = None
    most_assigned_team: Optional[str] = None
    active_districts_count: int
    active_mukhtars_count: int
    closure_signal: str
    overdue_signal: str
    speed_signal: str


class GovernorPerformanceHighlights(BaseModel):
    best_performing_municipality: Optional[str] = None
    worst_performing_municipality: Optional[str] = None
    highest_backlog_municipality: Optional[str] = None
    fastest_closure_municipality: Optional[str] = None


class GovernorPerformanceDashboard(BaseModel):
    highlights: GovernorPerformanceHighlights
    municipalities: list[GovernorMunicipalityPerformance] = []


class MayorDistrictPerformance(BaseModel):
    district_id: UUID
    district_name: str
    mukhtar_name: Optional[str] = None
    total_complaints: int
    open_complaints: int
    resolved_complaints: int
    overdue_complaints: int
    average_resolution_time_hours: Optional[float] = None
    last_activity_date: Optional[datetime] = None
    most_common_category: Optional[str] = None
    closure_signal: str
    overdue_signal: str
    speed_signal: str


class MayorTeamPerformance(BaseModel):
    team_id: UUID
    team_name: str
    leader_name: str
    is_active: bool
    assigned_complaints: int
    resolved_count: int
    overdue_count: int
    average_closure_time_hours: Optional[float] = None
    closure_signal: str
    overdue_signal: str
    speed_signal: str


class MayorPerformanceHighlights(BaseModel):
    best_performing_district: Optional[str] = None
    highest_backlog_district: Optional[str] = None
    most_active_mukhtar: Optional[str] = None
    least_responsive_district: Optional[str] = None
    most_productive_team: Optional[str] = None


class MayorPerformanceDashboard(BaseModel):
    highlights: MayorPerformanceHighlights
    districts: list[MayorDistrictPerformance] = []
    teams: list[MayorTeamPerformance] = []


class AccountabilityTopEntity(BaseModel):
    name: str
    count: int


class AccountabilityReport(BaseModel):
    period: MonthlyReportPeriod
    complaints_opened_during_period: int
    complaints_closed_during_period: int
    complaints_still_open_from_previous_periods: int
    overdue_complaints: int
    closure_rate: float
    average_time_to_resolution_hours: Optional[float] = None
    top_categories: list[AccountabilityTopEntity] = []
    top_teams: list[AccountabilityTopEntity] = []
    top_delayed_entities: list[AccountabilityTopEntity] = []
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
