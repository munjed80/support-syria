import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps import get_current_user, require_roles, require_district_scope, require_municipality_scope
from app.models import Attachment, AuditLog, District, Governorate, Municipality, RequestUpdate, ServiceRequest, User
from app.auth import hash_password
from app.schemas import (
    AdminServiceRequestCreate,
    AssignStaffRequest,
    AttachmentOut,
    CreateMayorRequest,
    CreateMukhtarRequest,
    DistrictCreate,
    DistrictOut,
    DistrictUpdate,
    GovernorateOut,
    InternalNoteRequest,
    MunicipalityCreate,
    MunicipalityOut,
    MunicipalityUpdate,
    PaginatedRequests,
    PriorityUpdateRequest,
    ServiceRequestDetail,
    ServiceRequestOut,
    StatusUpdateRequest,
    UserOut,
)
from app.sla import calculate_sla_status, can_transition, get_sla_deadline, ROLE_TRANSITIONS

settings = get_settings()
router = APIRouter(prefix="/admin", tags=["admin"])

ALLOWED_ROLES = ("district_admin", "municipal_admin", "staff", "governor", "mayor", "mukhtar")


def _scoped_requests(db: Session, user: User):
    """Return a base query scoped to the user's access level."""
    q = db.query(ServiceRequest)
    if user.role == "governor":
        from sqlalchemy import select
        mun_subq = select(Municipality.id).where(Municipality.governorate_id == user.governorate_id)
        q = q.filter(ServiceRequest.municipality_id.in_(mun_subq))
    elif user.role in ("municipal_admin", "mayor"):
        q = q.filter(ServiceRequest.municipality_id == user.municipality_id)
    elif user.role in ("district_admin", "mukhtar"):
        q = q.filter(ServiceRequest.district_id == user.district_id)
    elif user.role == "staff":
        q = q.filter(ServiceRequest.assigned_to_user_id == user.id)
    return q


def _log(db: Session, actor_id, action: str, entity_type: str, entity_id: str, details: str = None):
    entry = AuditLog(
        actor_user_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        details=details,
    )
    db.add(entry)


# ─── Governorates ─────────────────────────────────────────────────────────────

@router.get("/governorates", response_model=list[GovernorateOut])
def list_governorates(
    current_user: User = Depends(require_roles("governor")),
    db: Session = Depends(get_db),
):
    return db.query(Governorate).filter(Governorate.id == current_user.governorate_id).all()


# ─── Municipalities ────────────────────────────────────────────────────────────

@router.get("/municipalities", response_model=list[MunicipalityOut])
def list_municipalities(
    current_user: User = Depends(require_roles("governor")),
    db: Session = Depends(get_db),
):
    return (
        db.query(Municipality)
        .filter(Municipality.governorate_id == current_user.governorate_id)
        .order_by(Municipality.name)
        .all()
    )


@router.post("/municipalities", response_model=MunicipalityOut, status_code=201)
def create_municipality(
    payload: MunicipalityCreate,
    current_user: User = Depends(require_roles("governor")),
    db: Session = Depends(get_db),
):
    mun = Municipality(
        name=payload.name,
        governorate_id=current_user.governorate_id,
        is_active=True,
    )
    db.add(mun)
    db.flush()
    _log(db, current_user.id, "create_municipality", "municipality", str(mun.id), payload.name)
    db.commit()
    db.refresh(mun)
    return mun


@router.patch("/municipalities/{municipality_id}", response_model=MunicipalityOut)
def update_municipality(
    municipality_id: UUID,
    payload: MunicipalityUpdate,
    current_user: User = Depends(require_roles("governor")),
    db: Session = Depends(get_db),
):
    mun = db.query(Municipality).filter(
        Municipality.id == municipality_id,
        Municipality.governorate_id == current_user.governorate_id,
    ).first()
    if not mun:
        raise HTTPException(status_code=404, detail="Municipality not found")
    if payload.name is not None:
        mun.name = payload.name
    if payload.is_active is not None:
        mun.is_active = payload.is_active
    _log(db, current_user.id, "update_municipality", "municipality", str(municipality_id))
    db.commit()
    db.refresh(mun)
    return mun


# ─── Districts ────────────────────────────────────────────────────────────────

@router.get("/districts", response_model=list[DistrictOut])
def list_districts_admin(
    current_user: User = Depends(require_roles("mayor", "governor")),
    db: Session = Depends(get_db),
):
    if current_user.role == "mayor":
        return (
            db.query(District)
            .filter(District.municipality_id == current_user.municipality_id)
            .order_by(District.name)
            .all()
        )
    # governor: list all districts in their governorate's municipalities
    from sqlalchemy import select
    mun_subq = select(Municipality.id).where(Municipality.governorate_id == current_user.governorate_id)
    return (
        db.query(District)
        .filter(District.municipality_id.in_(mun_subq))
        .order_by(District.name)
        .all()
    )


@router.post("/districts", response_model=DistrictOut, status_code=201)
def create_district(
    payload: DistrictCreate,
    current_user: User = Depends(require_roles("mayor")),
    db: Session = Depends(get_db),
):
    district = District(
        name=payload.name,
        municipality_id=current_user.municipality_id,
        is_active=True,
    )
    db.add(district)
    db.flush()
    _log(db, current_user.id, "create_district", "district", str(district.id), payload.name)
    db.commit()
    db.refresh(district)
    return district


@router.patch("/districts/{district_id}", response_model=DistrictOut)
def update_district(
    district_id: UUID,
    payload: DistrictUpdate,
    current_user: User = Depends(require_roles("mayor")),
    db: Session = Depends(get_db),
):
    district = db.query(District).filter(
        District.id == district_id,
        District.municipality_id == current_user.municipality_id,
    ).first()
    if not district:
        raise HTTPException(status_code=404, detail="District not found")
    if payload.name is not None:
        district.name = payload.name
    if payload.is_active is not None:
        district.is_active = payload.is_active
    _log(db, current_user.id, "update_district", "district", str(district_id))
    db.commit()
    db.refresh(district)
    return district


# ─── Requests ─────────────────────────────────────────────────────────────────

@router.get("/requests", response_model=PaginatedRequests)
def list_requests(
    municipality_id: Optional[UUID] = Query(None),
    district_id: Optional[UUID] = Query(None),
    status: Optional[List[str]] = Query(None),
    category: Optional[List[str]] = Query(None),
    priority: Optional[List[str]] = Query(None),
    overdue: Optional[bool] = Query(None),
    sla_breached: Optional[bool] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    search: Optional[str] = Query(None),
    sort_by: Optional[str] = Query("created_at"),
    sort_dir: Optional[str] = Query("desc"),
    assigned_to_me: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_roles(*ALLOWED_ROLES)),
    db: Session = Depends(get_db),
):
    q = _scoped_requests(db, current_user)

    if assigned_to_me and current_user.role != "staff":
        q = q.filter(ServiceRequest.assigned_to_user_id == current_user.id)

    # Multi-value filters
    if status:
        q = q.filter(ServiceRequest.status.in_(status))
    if category:
        q = q.filter(ServiceRequest.category.in_(category))
    if priority:
        q = q.filter(ServiceRequest.priority.in_(priority))

    # Scope filters (governor can drill into a specific municipality/district)
    if municipality_id and current_user.role in ("governor",):
        q = q.filter(ServiceRequest.municipality_id == municipality_id)
    if district_id and current_user.role in ("governor", "municipal_admin", "mayor"):
        q = q.filter(ServiceRequest.district_id == district_id)

    # Overdue: closed_at is null AND sla_deadline < now
    if overdue is True:
        now = datetime.now(timezone.utc)
        q = q.filter(
            ServiceRequest.closed_at.is_(None),
            ServiceRequest.sla_deadline < now,
        )

    # SLA breached
    if sla_breached is True:
        q = q.filter(ServiceRequest.sla_status == "breached")

    # Date range
    if date_from:
        q = q.filter(ServiceRequest.created_at >= date_from)
    if date_to:
        q = q.filter(ServiceRequest.created_at <= date_to)

    # Full-text search on description, tracking_code
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                ServiceRequest.description.ilike(term),
                ServiceRequest.tracking_code.ilike(term),
                ServiceRequest.address_text.ilike(term),
            )
        )

    # Sorting
    sort_column = getattr(ServiceRequest, sort_by, ServiceRequest.created_at)
    if sort_dir == "asc":
        q = q.order_by(sort_column.asc())
    else:
        q = q.order_by(sort_column.desc())

    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()
    return PaginatedRequests(items=items, total=total, page=page, page_size=page_size)


@router.get("/requests/{request_id}", response_model=ServiceRequestDetail)
def get_request(
    request_id: UUID,
    current_user: User = Depends(require_roles(*ALLOWED_ROLES)),
    db: Session = Depends(get_db),
):
    q = _scoped_requests(db, current_user)
    req = q.filter(ServiceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    return req


@router.post("/requests", response_model=ServiceRequestOut, status_code=201)
def create_request(
    payload: AdminServiceRequestCreate,
    current_user: User = Depends(require_roles("mukhtar", "district_admin")),
    db: Session = Depends(get_db),
):
    """MUKHTAR creates a service request manually for their district."""
    # Enforce scope: mukhtar can only create in their own district
    if str(payload.district_id) != str(current_user.district_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="يمكنك إضافة طلبات في حيّك فقط",
        )
    district = db.query(District).filter(District.id == payload.district_id).first()
    if not district:
        raise HTTPException(status_code=404, detail="District not found")

    import secrets
    TRACKING_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    for _ in range(10):
        code = "".join(secrets.choice(TRACKING_CHARS) for _ in range(8))
        if not db.query(ServiceRequest).filter(ServiceRequest.tracking_code == code).first():
            break
    else:
        raise HTTPException(status_code=500, detail="Could not generate unique tracking code")

    now = datetime.now(timezone.utc)
    sla_deadline = get_sla_deadline(now, payload.category, payload.priority)
    sla_st = calculate_sla_status(now, payload.category, payload.priority, "new",
                                   sla_deadline=sla_deadline)

    req = ServiceRequest(
        municipality_id=district.municipality_id,
        district_id=district.id,
        category=payload.category,
        priority=payload.priority,
        status="new",
        description=payload.description,
        tracking_code=code,
        address_text=payload.address_text,
        location_lat=payload.location_lat,
        location_lng=payload.location_lng,
        sla_deadline=sla_deadline,
        sla_status=sla_st,
    )
    db.add(req)
    db.flush()

    db.add(RequestUpdate(
        request_id=req.id,
        actor_user_id=current_user.id,
        actor_name=current_user.name,
        message="تم تسجيل الطلب من قِبل المختار",
        to_status="new",
        is_internal=False,
    ))
    _log(db, current_user.id, "create_request", "service_request", req.id)
    db.commit()
    db.refresh(req)
    return req


@router.post("/requests/{request_id}/assign", response_model=ServiceRequestOut)
def assign_staff(
    request_id: UUID,
    payload: AssignStaffRequest,
    current_user: User = Depends(require_roles("district_admin", "municipal_admin", "mayor")),
    db: Session = Depends(get_db),
):
    req = _scoped_requests(db, current_user).filter(ServiceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    staff = db.query(User).filter(
        User.id == payload.staff_user_id,
        User.role == "staff",
        User.district_id == req.district_id,
    ).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found in this district")

    req.assigned_to_user_id = staff.id
    req.assigned_to_name = staff.name
    req.updated_at = datetime.now(timezone.utc)

    update = RequestUpdate(
        request_id=req.id,
        actor_user_id=current_user.id,
        actor_name=current_user.name,
        message=f"تم تعيين الطلب إلى {staff.name}",
        is_internal=True,
    )
    db.add(update)
    _log(db, current_user.id, "assign_staff", "service_request", req.id, str(staff.id))
    db.commit()
    db.refresh(req)
    return req


@router.post("/requests/{request_id}/status", response_model=ServiceRequestOut)
def update_status(
    request_id: UUID,
    payload: StatusUpdateRequest,
    current_user: User = Depends(require_roles(*ALLOWED_ROLES)),
    db: Session = Depends(get_db),
):
    req = _scoped_requests(db, current_user).filter(ServiceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if not can_transition(req.status, payload.status, current_user.role):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"لا يُسمح بتغيير الحالة من '{req.status}' إلى '{payload.status}' لدورك الحالي",
        )

    if payload.status == "rejected" and not (payload.rejection_reason or "").strip():
        raise HTTPException(status_code=422, detail="rejection_reason is required when rejecting")

    if payload.status == "resolved" and not (payload.completion_photo_url or "").strip():
        raise HTTPException(status_code=422, detail="completion_photo_url is required when resolving")

    now = datetime.now(timezone.utc)
    old_status = req.status
    req.status = payload.status
    req.updated_at = now

    if payload.status in ("resolved", "rejected", "deferred"):
        req.closed_at = now

    if payload.status == "rejected" and payload.rejection_reason:
        req.rejection_reason = payload.rejection_reason

    if payload.status == "resolved" and payload.completion_photo_url:
        req.completion_photo_url = payload.completion_photo_url

    req.sla_status = calculate_sla_status(
        req.created_at, req.category, req.priority, req.status,
        req.closed_at, req.sla_deadline
    )

    update = RequestUpdate(
        request_id=req.id,
        actor_user_id=current_user.id,
        actor_name=current_user.name,
        message=None,
        from_status=old_status,
        to_status=payload.status,
        is_internal=False,
    )
    db.add(update)

    if payload.status == "rejected" and payload.rejection_reason:
        db.add(RequestUpdate(
            request_id=req.id,
            actor_user_id=current_user.id,
            actor_name=current_user.name,
            message=f"سبب الرفض: {payload.rejection_reason}",
            is_internal=False,
        ))

    if payload.note and payload.note.strip():
        db.add(RequestUpdate(
            request_id=req.id,
            actor_user_id=current_user.id,
            actor_name=current_user.name,
            message=f"ملاحظة داخلية: {payload.note}",
            is_internal=True,
        ))

    _log(db, current_user.id, "status_change", "service_request", req.id,
         f"{old_status} -> {payload.status}")
    db.commit()
    db.refresh(req)
    return req


@router.post("/requests/{request_id}/priority", response_model=ServiceRequestOut)
def update_priority(
    request_id: UUID,
    payload: PriorityUpdateRequest,
    current_user: User = Depends(require_roles("district_admin", "municipal_admin", "mayor", "mukhtar")),
    db: Session = Depends(get_db),
):
    req = _scoped_requests(db, current_user).filter(ServiceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    old_priority = req.priority
    if old_priority == payload.priority:
        raise HTTPException(status_code=422, detail="Priority unchanged")

    PRIORITY_LABELS = {"low": "منخفض", "normal": "عادي", "high": "مرتفع", "urgent": "عاجل"}

    now = datetime.now(timezone.utc)
    req.priority = payload.priority
    req.is_auto_escalated = False
    req.priority_escalated_at = None
    req.updated_at = now

    db.add(RequestUpdate(
        request_id=req.id,
        actor_user_id=current_user.id,
        actor_name=current_user.name,
        message=(
            f'تم تغيير الأولوية من "{PRIORITY_LABELS.get(old_priority, old_priority)}" '
            f'إلى "{PRIORITY_LABELS.get(payload.priority, payload.priority)}"'
        ),
        from_priority=old_priority,
        to_priority=payload.priority,
        is_internal=True,
    ))
    _log(db, current_user.id, "priority_change", "service_request", req.id,
         f"{old_priority} -> {payload.priority}")
    db.commit()
    db.refresh(req)
    return req


@router.post("/requests/{request_id}/note", response_model=ServiceRequestOut)
def add_internal_note(
    request_id: UUID,
    payload: InternalNoteRequest,
    current_user: User = Depends(require_roles(*ALLOWED_ROLES)),
    db: Session = Depends(get_db),
):
    req = _scoped_requests(db, current_user).filter(ServiceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    db.add(RequestUpdate(
        request_id=req.id,
        actor_user_id=current_user.id,
        actor_name=current_user.name,
        message=payload.message,
        is_internal=True,
    ))
    _log(db, current_user.id, "add_note", "service_request", req.id)
    db.commit()
    db.refresh(req)
    return req


@router.post("/requests/{request_id}/attachments", response_model=AttachmentOut)
async def upload_attachment(
    request_id: UUID,
    file: UploadFile = File(...),
    kind: str = Query("other"),
    current_user: User = Depends(require_roles(*ALLOWED_ROLES)),
    db: Session = Depends(get_db),
):
    req = _scoped_requests(db, current_user).filter(ServiceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    # Validate kind
    if kind not in ("before", "after", "other"):
        kind = "other"

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 5 MB)")

    # `kind` (before/after/other) is supplied via query parameter, not inferred from extension.
    # The extension is only used to preserve the original file type in the stored filename.
    ext = os.path.splitext(file.filename or "")[1].lower()
    filename = f"{uuid.uuid4()}{ext}"
    os.makedirs(settings.upload_dir, exist_ok=True)
    file_path = os.path.join(settings.upload_dir, filename)

    import aiofiles
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    attachment = Attachment(
        request_id=req.id,
        kind=kind,
        file_url=f"/uploads/{filename}",
        file_name=file.filename or filename,
    )
    db.add(attachment)
    _log(db, current_user.id, "upload_attachment", "service_request", req.id,
         f"{filename} (kind={kind})")
    db.commit()
    db.refresh(attachment)
    return attachment


@router.get("/staff", response_model=list[UserOut])
def list_staff(
    district_id: Optional[UUID] = Query(None),
    current_user: User = Depends(require_roles("district_admin", "municipal_admin", "mayor")),
    db: Session = Depends(get_db),
):
    """List staff members accessible to the current admin for assignment purposes."""
    q = db.query(User).filter(User.role == "staff")
    if district_id:
        q = q.filter(User.district_id == district_id)
    elif current_user.role == "district_admin":
        q = q.filter(User.district_id == current_user.district_id)
    elif current_user.role in ("municipal_admin", "mayor"):
        q = q.filter(User.municipality_id == current_user.municipality_id)
    return q.order_by(User.full_name).all()


# ─── User management (hierarchical) ──────────────────────────────────────────

@router.post("/users/mayors", response_model=UserOut, status_code=201)
def create_mayor(
    payload: CreateMayorRequest,
    current_user: User = Depends(require_roles("governor")),
    db: Session = Depends(get_db),
):
    """Governor creates a Mayor account scoped to a municipality within their governorate."""
    mun = db.query(Municipality).filter(
        Municipality.id == payload.municipality_id,
        Municipality.governorate_id == current_user.governorate_id,
    ).first()
    if not mun:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="البلدية غير موجودة أو لا تنتمي إلى محافظتك",
        )
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="اسم المستخدم مستخدم بالفعل",
        )
    new_user = User(
        username=payload.username,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        role="mayor",
        municipality_id=payload.municipality_id,
        is_active=True,
        must_change_password=True,
        created_by_user_id=current_user.id,
    )
    db.add(new_user)
    db.flush()
    _log(db, current_user.id, "create_mayor", "user", str(new_user.id), payload.username)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.post("/users/mukhtars", response_model=UserOut, status_code=201)
def create_mukhtar(
    payload: CreateMukhtarRequest,
    current_user: User = Depends(require_roles("mayor")),
    db: Session = Depends(get_db),
):
    """Mayor creates a Mukhtar account scoped to a district within their municipality."""
    district = db.query(District).filter(
        District.id == payload.district_id,
        District.municipality_id == current_user.municipality_id,
    ).first()
    if not district:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="الحي غير موجود أو لا ينتمي إلى بلديتك",
        )
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="اسم المستخدم مستخدم بالفعل",
        )
    new_user = User(
        username=payload.username,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        role="mukhtar",
        municipality_id=current_user.municipality_id,
        district_id=payload.district_id,
        is_active=True,
        must_change_password=True,
        created_by_user_id=current_user.id,
    )
    db.add(new_user)
    db.flush()
    _log(db, current_user.id, "create_mukhtar", "user", str(new_user.id), payload.username)
    db.commit()
    db.refresh(new_user)
    return new_user
