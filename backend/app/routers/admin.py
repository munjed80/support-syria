import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps import get_current_user, require_roles, require_district_scope, require_municipality_scope
from app.models import Attachment, AuditLog, District, Governorate, MaterialUsed, Municipality, RequestUpdate, ServiceRequest, User
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
    MaterialUsedCreate,
    MaterialUsedOut,
    MonthlyReport,
    MunicipalityCreate,
    MunicipalityOut,
    MunicipalityUpdate,
    PaginatedRequests,
    PriorityUpdateRequest,
    ReportCountEntry,
    ResponsibleTeamUpdateRequest,
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


def _extract_name_code(name: str, length: int = 3) -> str:
    """Extract up to `length` uppercase ASCII letters from name."""
    import re
    ascii_only = re.sub(r"[^A-Za-z]", "", name)
    if ascii_only:
        return ascii_only[:length].upper()
    # Fall back to first letter of each word
    words = name.split()
    result = ""
    for word in words:
        if word:
            result += word[0].upper()
        if len(result) >= length:
            break
    return (result or "XXX")[:length].upper()


def _generate_complaint_number(db: Session, district: District) -> str:
    """Generate a unique complaint number: MUN_CODE-DIST_CODE-YEAR-SEQ."""
    from datetime import date

    mun_name = district.municipality.name if district.municipality else "MUN"
    dist_name = district.name

    mun_code = _extract_name_code(mun_name, 3)
    dist_code = _extract_name_code(dist_name, 3)
    year = date.today().year

    # Count existing complaints for this district this year
    prefix = f"{mun_code}-{dist_code}-{year}-"
    existing = (
        db.query(ServiceRequest)
        .filter(ServiceRequest.complaint_number.like(f"{prefix}%"))
        .count()
    )
    seq = existing + 1

    for attempt in range(100):
        candidate = f"{prefix}{(seq + attempt):06d}"
        if not db.query(ServiceRequest).filter(
            ServiceRequest.complaint_number == candidate
        ).first():
            return candidate

    # Ultimate fallback: append random suffix (should not happen in normal operation)
    import logging
    import secrets
    logging.getLogger(__name__).warning(
        "Complaint number generation required random fallback for prefix=%s seq=%d", prefix, seq
    )
    return f"{prefix}{seq:06d}-{secrets.token_hex(3).upper()}"


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


# ─── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/dashboard")
def get_dashboard(
    current_user: User = Depends(require_roles(*ALLOWED_ROLES)),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Return role-scoped dashboard statistics."""
    now = datetime.now(timezone.utc)
    base_q = _scoped_requests(db, current_user)

    if current_user.role in ("mukhtar", "district_admin"):
        open_count = base_q.filter(
            ServiceRequest.status.in_(["new", "under_review"])
        ).count()
        in_progress_count = base_q.filter(
            ServiceRequest.status == "in_progress"
        ).count()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        resolved_this_month = base_q.filter(
            ServiceRequest.status == "resolved",
            ServiceRequest.closed_at >= month_start,
        ).count()
        resolved_total = base_q.filter(ServiceRequest.status == "resolved").count()
        return {
            "role": "mukhtar",
            "open": open_count,
            "in_progress": in_progress_count,
            "resolved_this_month": resolved_this_month,
            "resolved": resolved_total,
        }

    if current_user.role in ("mayor", "municipal_admin"):
        open_count = base_q.filter(
            ServiceRequest.status.in_(["new", "under_review", "in_progress"])
        ).count()
        urgent_count = base_q.filter(
            ServiceRequest.priority == "urgent",
            ServiceRequest.status.notin_(["resolved", "rejected", "deferred"]),
        ).count()
        overdue_count = base_q.filter(
            ServiceRequest.closed_at.is_(None),
            ServiceRequest.sla_deadline < now,
        ).count()
        district_result = (
            db.query(District.name, func.count(ServiceRequest.id).label("cnt"))
            .join(ServiceRequest, ServiceRequest.district_id == District.id)
            .filter(ServiceRequest.municipality_id == current_user.municipality_id)
            .group_by(District.name)
            .order_by(func.count(ServiceRequest.id).desc())
            .first()
        )
        category_result = (
            base_q
            .with_entities(
                ServiceRequest.category,
                func.count(ServiceRequest.id).label("cnt"),
            )
            .group_by(ServiceRequest.category)
            .order_by(func.count(ServiceRequest.id).desc())
            .first()
        )
        return {
            "role": "mayor",
            "open": open_count,
            "urgent": urgent_count,
            "overdue": overdue_count,
            "most_problematic_district": district_result[0] if district_result else None,
            "most_problematic_district_count": district_result[1] if district_result else 0,
            "most_common_category": category_result[0] if category_result else None,
            "most_common_category_count": category_result[1] if category_result else 0,
        }

    if current_user.role == "governor":
        from sqlalchemy import select as sa_select
        total = base_q.count()
        open_count = base_q.filter(
            ServiceRequest.status.in_(["new", "under_review"])
        ).count()
        in_progress_count = base_q.filter(
            ServiceRequest.status == "in_progress"
        ).count()
        resolved_count = base_q.filter(ServiceRequest.status == "resolved").count()

        mun_subq = sa_select(Municipality.id).where(
            Municipality.governorate_id == current_user.governorate_id
        )
        by_municipality = (
            db.query(Municipality.name, func.count(ServiceRequest.id).label("cnt"))
            .join(ServiceRequest, ServiceRequest.municipality_id == Municipality.id)
            .filter(Municipality.governorate_id == current_user.governorate_id)
            .group_by(Municipality.name)
            .order_by(func.count(ServiceRequest.id).desc())
            .all()
        )
        by_district = (
            db.query(District.name, func.count(ServiceRequest.id).label("cnt"))
            .join(ServiceRequest, ServiceRequest.district_id == District.id)
            .filter(ServiceRequest.municipality_id.in_(mun_subq))
            .group_by(District.name)
            .order_by(func.count(ServiceRequest.id).desc())
            .limit(10)
            .all()
        )
        category_result = (
            base_q
            .with_entities(
                ServiceRequest.category,
                func.count(ServiceRequest.id).label("cnt"),
            )
            .group_by(ServiceRequest.category)
            .order_by(func.count(ServiceRequest.id).desc())
            .first()
        )
        team_result = (
            base_q
            .filter(ServiceRequest.responsible_team.isnot(None))
            .with_entities(
                ServiceRequest.responsible_team,
                func.count(ServiceRequest.id).label("cnt"),
            )
            .group_by(ServiceRequest.responsible_team)
            .order_by(func.count(ServiceRequest.id).desc())
            .first()
        )
        return {
            "role": "governor",
            "total": total,
            "open": open_count,
            "in_progress": in_progress_count,
            "resolved": resolved_count,
            "by_municipality": [{"name": r[0], "count": r[1]} for r in by_municipality],
            "by_district": [{"name": r[0], "count": r[1]} for r in by_district],
            "most_common_category": category_result[0] if category_result else None,
            "most_common_category_count": category_result[1] if category_result else 0,
            "most_assigned_team": team_result[0] if team_result else None,
            "most_assigned_team_count": team_result[1] if team_result else 0,
        }

    # Staff / other roles — minimal stats
    return {"role": current_user.role, "total": base_q.count()}


# ─── Requests ─────────────────────────────────────────────────────────────────

@router.get("/requests", response_model=PaginatedRequests)
def list_requests(
    municipality_id: Optional[UUID] = Query(None),
    district_id: Optional[UUID] = Query(None),
    status: Optional[List[str]] = Query(None),
    category: Optional[List[str]] = Query(None),
    priority: Optional[List[str]] = Query(None),
    responsible_team: Optional[List[str]] = Query(None),
    complaint_number: Optional[str] = Query(None),
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
    if responsible_team:
        q = q.filter(ServiceRequest.responsible_team.in_(responsible_team))

    # Complaint number exact/partial match
    if complaint_number and complaint_number.strip():
        term = f"%{complaint_number.strip()}%"
        q = q.filter(ServiceRequest.complaint_number.ilike(term))

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

    # Full-text search on description, tracking_code, address_text, and complaint_number
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                ServiceRequest.description.ilike(term),
                ServiceRequest.tracking_code.ilike(term),
                ServiceRequest.address_text.ilike(term),
                ServiceRequest.complaint_number.ilike(term),
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
    from sqlalchemy.orm import joinedload
    q = _scoped_requests(db, current_user)
    req = (
        q.options(
            joinedload(ServiceRequest.municipality).joinedload(Municipality.governorate),
            joinedload(ServiceRequest.district),
        )
        .filter(ServiceRequest.id == request_id)
        .first()
    )
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

    # Eagerly load municipality for complaint number generation
    from sqlalchemy.orm import joinedload
    district = (
        db.query(District)
        .options(joinedload(District.municipality))
        .filter(District.id == payload.district_id)
        .first()
    )
    complaint_number = _generate_complaint_number(db, district)

    now = datetime.now(timezone.utc)
    sla_deadline = get_sla_deadline(now, payload.category, payload.priority)
    sla_st = calculate_sla_status(now, payload.category, payload.priority, "new",
                                   sla_deadline=sla_deadline)

    req = ServiceRequest(
        municipality_id=district.municipality_id,
        district_id=district.id,
        complaint_number=complaint_number,
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


@router.post("/requests/{request_id}/responsible-team", response_model=ServiceRequestOut)
def update_responsible_team(
    request_id: UUID,
    payload: ResponsibleTeamUpdateRequest,
    current_user: User = Depends(require_roles("mayor", "governor")),
    db: Session = Depends(get_db),
):
    """Mayor or Governor can assign/change the responsible team for a request."""
    req = _scoped_requests(db, current_user).filter(ServiceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    from app.models import RESPONSIBLE_TEAMS
    if payload.responsible_team is not None and payload.responsible_team not in RESPONSIBLE_TEAMS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid responsible_team. Allowed: {', '.join(RESPONSIBLE_TEAMS)}",
        )

    old_team = req.responsible_team
    req.responsible_team = payload.responsible_team
    req.updated_at = datetime.now(timezone.utc)

    TEAM_LABELS = {
        "electricity": "فريق الكهرباء",
        "water": "فريق المياه",
        "gas": "فريق الغاز",
        "maintenance": "فريق الصيانة",
        "sanitation": "فريق النظافة",
    }
    new_label = TEAM_LABELS.get(payload.responsible_team or "", payload.responsible_team or "—")
    db.add(RequestUpdate(
        request_id=req.id,
        actor_user_id=current_user.id,
        actor_name=current_user.name,
        message=f"تم تعيين الفريق المسؤول: {new_label}",
        is_internal=True,
    ))
    _log(db, current_user.id, "update_responsible_team", "service_request", req.id,
         f"{old_team} -> {payload.responsible_team}")
    db.commit()
    db.refresh(req)
    return req


@router.get("/requests/{request_id}/materials", response_model=list[MaterialUsedOut])
def list_materials(
    request_id: UUID,
    current_user: User = Depends(require_roles(*ALLOWED_ROLES)),
    db: Session = Depends(get_db),
):
    req = _scoped_requests(db, current_user).filter(ServiceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    return req.materials_used


@router.post("/requests/{request_id}/materials", response_model=MaterialUsedOut, status_code=201)
def add_material(
    request_id: UUID,
    payload: MaterialUsedCreate,
    current_user: User = Depends(require_roles(*ALLOWED_ROLES)),
    db: Session = Depends(get_db),
):
    req = _scoped_requests(db, current_user).filter(ServiceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    material = MaterialUsed(
        request_id=req.id,
        name=payload.name.strip(),
        quantity=payload.quantity.strip(),
        notes=payload.notes.strip() if payload.notes else None,
    )
    db.add(material)
    db.add(RequestUpdate(
        request_id=req.id,
        actor_user_id=current_user.id,
        actor_name=current_user.name,
        message=f"تمت إضافة مادة: {payload.name} — {payload.quantity}",
        is_internal=True,
    ))
    _log(db, current_user.id, "add_material", "service_request", req.id,
         f"{payload.name} x {payload.quantity}")
    db.commit()
    db.refresh(material)
    return material


@router.delete("/requests/{request_id}/materials/{material_id}", status_code=204)
def delete_material(
    request_id: UUID,
    material_id: UUID,
    current_user: User = Depends(require_roles(*ALLOWED_ROLES)),
    db: Session = Depends(get_db),
):
    req = _scoped_requests(db, current_user).filter(ServiceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    material = db.query(MaterialUsed).filter(
        MaterialUsed.id == material_id,
        MaterialUsed.request_id == request_id,
    ).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    db.delete(material)
    _log(db, current_user.id, "delete_material", "service_request", req.id, str(material_id))
    db.commit()


ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_IMAGE_MIME_SIGNATURES: dict[bytes, str] = {
    b"\xff\xd8\xff": ".jpg",
    b"\x89PNG\r\n\x1a\n": ".png",
    b"RIFF": ".webp",  # RIFF....WEBP checked below
}
MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5 MB


def _validate_image_content(content: bytes, declared_ext: str) -> None:
    """Raise HTTPException if content does not look like an allowed image."""
    # Check magic bytes
    if content[:3] == b"\xff\xd8\xff":
        return  # JPEG
    if content[:8] == b"\x89PNG\r\n\x1a\n":
        return  # PNG
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return  # WEBP
    raise HTTPException(
        status_code=415,
        detail="نوع الملف غير مسموح به. يُقبل فقط: JPG، JPEG، PNG، WEBP",
    )


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

    # Validate file extension
    original_name = file.filename or ""
    ext = os.path.splitext(original_name)[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail="نوع الملف غير مسموح به. يُقبل فقط: JPG، JPEG، PNG، WEBP",
        )

    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail="حجم الملف كبير جداً. الحد الأقصى 5 ميجابايت",
        )

    # Validate magic bytes (prevent disguised executables)
    _validate_image_content(content, ext)

    # Sanitize: store with UUID-based name, preserving validated extension
    safe_ext = ext if ext in ALLOWED_IMAGE_EXTENSIONS else ".jpg"
    filename = f"{uuid.uuid4()}{safe_ext}"
    os.makedirs(settings.upload_dir, exist_ok=True)
    file_path = os.path.join(settings.upload_dir, filename)

    import aiofiles
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    attachment = Attachment(
        request_id=req.id,
        kind=kind,
        file_url=f"/uploads/{filename}",
        file_name=filename,
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


# ─── Monthly Reports ──────────────────────────────────────────────────────────

def _month_range(year: int, month: int):
    """Return (start_dt, end_exclusive_dt) UTC datetimes bracketing the given month."""
    start = datetime(year, month, 1, 0, 0, 0, tzinfo=timezone.utc)
    if month == 12:
        end_exclusive = datetime(year + 1, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    else:
        end_exclusive = datetime(year, month + 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    return start, end_exclusive


def _build_report(
    db: Session,
    base_q,
    month: int,
    year: int,
    top_district_query=None,
) -> MonthlyReport:
    """Compute monthly report stats from a scoped base query."""
    now = datetime.now(timezone.utc)
    start, end_exclusive = _month_range(year, month)

    q = base_q.filter(
        ServiceRequest.created_at >= start,
        ServiceRequest.created_at < end_exclusive,
    )

    total = q.count()
    open_count = q.filter(
        ServiceRequest.status.in_(["new", "under_review"])
    ).count()
    in_progress = q.filter(ServiceRequest.status == "in_progress").count()
    resolved = q.filter(ServiceRequest.status == "resolved").count()
    urgent = q.filter(ServiceRequest.priority == "urgent").count()
    overdue = q.filter(
        ServiceRequest.closed_at.is_(None),
        ServiceRequest.sla_deadline < now,
    ).count()

    by_category_rows = (
        q
        .with_entities(ServiceRequest.category, func.count(ServiceRequest.id).label("cnt"))
        .group_by(ServiceRequest.category)
        .order_by(func.count(ServiceRequest.id).desc())
        .all()
    )
    by_status_rows = (
        q
        .with_entities(ServiceRequest.status, func.count(ServiceRequest.id).label("cnt"))
        .group_by(ServiceRequest.status)
        .order_by(func.count(ServiceRequest.id).desc())
        .all()
    )
    team_result = (
        q
        .filter(ServiceRequest.responsible_team.isnot(None))
        .with_entities(ServiceRequest.responsible_team, func.count(ServiceRequest.id).label("cnt"))
        .group_by(ServiceRequest.responsible_team)
        .order_by(func.count(ServiceRequest.id).desc())
        .first()
    )

    most_common_category = by_category_rows[0][0] if by_category_rows else None
    most_assigned_team = team_result[0] if team_result else None

    top_district = None
    if top_district_query is not None:
        top_district_row = top_district_query(start, end_exclusive)
        top_district = top_district_row[0] if top_district_row else None

    return MonthlyReport(
        period={"month": month, "year": year},
        total=total,
        open=open_count,
        in_progress=in_progress,
        resolved=resolved,
        urgent=urgent,
        overdue=overdue,
        most_common_category=most_common_category,
        most_assigned_team=most_assigned_team,
        top_district=top_district,
        by_category=[ReportCountEntry(name=r[0], count=r[1]) for r in by_category_rows],
        by_status=[ReportCountEntry(name=r[0], count=r[1]) for r in by_status_rows],
    )


@router.get("/reports/district", response_model=MonthlyReport)
def district_monthly_report(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000, le=2100),
    district_id: Optional[UUID] = Query(None),
    current_user: User = Depends(require_roles("mukhtar", "district_admin", "mayor", "municipal_admin", "governor")),
    db: Session = Depends(get_db),
):
    """Return monthly report for a specific district."""
    now_year = datetime.now(timezone.utc).year
    if year > now_year + 1:
        raise HTTPException(status_code=422, detail="السنة المحددة غير صالحة")

    if current_user.role in ("mukhtar", "district_admin"):
        # Mukhtar: always their own district
        target_district_id = current_user.district_id
    elif current_user.role in ("mayor", "municipal_admin"):
        if district_id is None:
            raise HTTPException(status_code=422, detail="يجب تحديد الحي")
        district = db.query(District).filter(
            District.id == district_id,
            District.municipality_id == current_user.municipality_id,
        ).first()
        if not district:
            raise HTTPException(status_code=404, detail="الحي غير موجود أو لا ينتمي إلى بلديتك")
        target_district_id = district_id
    else:
        # Governor
        if district_id is None:
            raise HTTPException(status_code=422, detail="يجب تحديد الحي")
        from sqlalchemy import select as sa_select
        mun_subq = sa_select(Municipality.id).where(
            Municipality.governorate_id == current_user.governorate_id
        )
        district = db.query(District).filter(
            District.id == district_id,
            District.municipality_id.in_(mun_subq),
        ).first()
        if not district:
            raise HTTPException(status_code=404, detail="الحي غير موجود أو لا ينتمي إلى محافظتك")
        target_district_id = district_id

    base_q = db.query(ServiceRequest).filter(
        ServiceRequest.district_id == target_district_id
    )
    return _build_report(db, base_q, month, year)


@router.get("/reports/municipality", response_model=MonthlyReport)
def municipality_monthly_report(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000, le=2100),
    municipality_id: Optional[UUID] = Query(None),
    current_user: User = Depends(require_roles("mayor", "municipal_admin", "governor")),
    db: Session = Depends(get_db),
):
    """Return monthly report for a specific municipality."""
    now_year = datetime.now(timezone.utc).year
    if year > now_year + 1:
        raise HTTPException(status_code=422, detail="السنة المحددة غير صالحة")

    if current_user.role in ("mayor", "municipal_admin"):
        target_municipality_id = current_user.municipality_id
    else:
        # Governor
        if municipality_id is None:
            raise HTTPException(status_code=422, detail="يجب تحديد البلدية")
        mun = db.query(Municipality).filter(
            Municipality.id == municipality_id,
            Municipality.governorate_id == current_user.governorate_id,
        ).first()
        if not mun:
            raise HTTPException(status_code=404, detail="البلدية غير موجودة أو لا تنتمي إلى محافظتك")
        target_municipality_id = municipality_id

    base_q = db.query(ServiceRequest).filter(
        ServiceRequest.municipality_id == target_municipality_id
    )

    def top_district_fn(start, end_exclusive):
        return (
            db.query(District.name, func.count(ServiceRequest.id).label("cnt"))
            .join(ServiceRequest, ServiceRequest.district_id == District.id)
            .filter(
                ServiceRequest.municipality_id == target_municipality_id,
                ServiceRequest.created_at >= start,
                ServiceRequest.created_at < end_exclusive,
            )
            .group_by(District.name)
            .order_by(func.count(ServiceRequest.id).desc())
            .first()
        )

    return _build_report(db, base_q, month, year, top_district_query=top_district_fn)


@router.get("/reports/governorate", response_model=MonthlyReport)
def governorate_monthly_report(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000, le=2100),
    current_user: User = Depends(require_roles("governor")),
    db: Session = Depends(get_db),
):
    """Return monthly report for the entire governorate."""
    now_year = datetime.now(timezone.utc).year
    if year > now_year + 1:
        raise HTTPException(status_code=422, detail="السنة المحددة غير صالحة")

    from sqlalchemy import select as sa_select
    mun_subq = sa_select(Municipality.id).where(
        Municipality.governorate_id == current_user.governorate_id
    )
    base_q = db.query(ServiceRequest).filter(
        ServiceRequest.municipality_id.in_(mun_subq)
    )

    def top_district_fn(start, end_exclusive):
        return (
            db.query(District.name, func.count(ServiceRequest.id).label("cnt"))
            .join(ServiceRequest, ServiceRequest.district_id == District.id)
            .filter(
                ServiceRequest.municipality_id.in_(mun_subq),
                ServiceRequest.created_at >= start,
                ServiceRequest.created_at < end_exclusive,
            )
            .group_by(District.name)
            .order_by(func.count(ServiceRequest.id).desc())
            .first()
        )

    return _build_report(db, base_q, month, year, top_district_query=top_district_fn)
