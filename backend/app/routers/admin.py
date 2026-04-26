import csv
import io
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, case, func, or_
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps import get_current_user, require_roles, require_district_scope, require_municipality_scope
from app.models import Attachment, AuditLog, District, Governorate, MaterialUsed, MunicipalTeam, Municipality, Notification, RequestUpdate, ServiceRequest, User
from app.auth import hash_password
from app.schemas import (
    AccountabilityReport,
    AccountabilityTopEntity,
    AdminServiceRequestCreate,
    ArchiveRequest,
    AssignStaffRequest,
    AttachmentOut,
    CreateMayorRequest,
    CreateMukhtarRequest,
    DistrictCreate,
    DistrictOut,
    DistrictUpdate,
    GovernorateOut,
    GovernorMunicipalityPerformance,
    GovernorPerformanceDashboard,
    GovernorPerformanceHighlights,
    InternalNoteRequest,
    MayorDistrictPerformance,
    MayorPerformanceDashboard,
    MayorPerformanceHighlights,
    MayorTeamPerformance,
    MaterialUsedCreate,
    MaterialUsedOut,
    MunicipalTeamCreate,
    MunicipalTeamOut,
    MunicipalTeamUpdate,
    MonthlyReport,
    NotificationOut,
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
    UserAdminUpdate,
    UserOut,
)
from app.sla import calculate_sla_status, can_transition, get_sla_deadline, ROLE_TRANSITIONS

settings = get_settings()
router = APIRouter(prefix="/admin", tags=["admin"])

ALLOWED_ROLES = ("district_admin", "municipal_admin", "staff", "governor", "mayor", "mukhtar")
ALERT_THRESHOLDS = {
    "district_unresolved_open": 8,
    "municipality_low_closure_rate": 45.0,
    "team_open_assigned": 12,
}


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


def _create_notification(
    db: Session,
    user_id: UUID,
    kind: str,
    title: str,
    message: str,
    severity: str = "info",
    related_entity_type: str | None = None,
    related_entity_id: str | None = None,
):
    db.add(Notification(
        user_id=user_id,
        kind=kind,
        severity=severity,
        title=title,
        message=message,
        related_entity_type=related_entity_type,
        related_entity_id=related_entity_id,
    ))


def _notify_request_scope(
    db: Session,
    req: ServiceRequest,
    kind: str,
    title: str,
    message: str,
    severity: str = "info",
):
    governor_users = (
        db.query(User.id)
        .join(Municipality, Municipality.governorate_id == User.governorate_id)
        .filter(
            Municipality.id == req.municipality_id,
            User.role == "governor",
            User.is_active.is_(True),
        )
        .all()
    )
    mayor_users = db.query(User.id).filter(
        User.role == "mayor",
        User.municipality_id == req.municipality_id,
        User.is_active.is_(True),
    ).all()
    mukhtar_users = db.query(User.id).filter(
        User.role == "mukhtar",
        User.district_id == req.district_id,
        User.is_active.is_(True),
    ).all()

    for row in governor_users + mayor_users + mukhtar_users:
        _create_notification(
            db=db,
            user_id=row[0],
            kind=kind,
            title=title,
            message=message,
            severity=severity,
            related_entity_type="service_request",
            related_entity_id=str(req.id),
        )


def _signal_from_ratio(value: float, good_threshold: float, moderate_threshold: float, invert: bool = False) -> str:
    """Map metric ratio/avg into good/moderate/poor."""
    if invert:
        if value <= good_threshold:
            return "good"
        if value <= moderate_threshold:
            return "moderate"
        return "poor"
    if value >= good_threshold:
        return "good"
    if value >= moderate_threshold:
        return "moderate"
    return "poor"


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
    """Generate a unique numeric-only complaint number (zero-padded 6-digit sequence)."""
    from sqlalchemy import func, cast, Integer

    # Find the current max numeric complaint number (PostgreSQL regex operator)
    max_num = (
        db.query(func.max(cast(ServiceRequest.complaint_number, Integer)))
        .filter(ServiceRequest.complaint_number.op("~")(r"^\d+$"))
        .scalar()
    )
    seq = (max_num or 0) + 1

    for attempt in range(100):
        candidate = f"{(seq + attempt):06d}"
        if not db.query(ServiceRequest).filter(
            ServiceRequest.complaint_number == candidate
        ).first():
            return candidate

    # Ultimate fallback (should not happen in normal operation)
    import logging
    logging.getLogger(__name__).warning(
        "Complaint number generation required fallback at seq=%d", seq
    )
    return f"{seq + 100:06d}"


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


@router.delete("/municipalities/{municipality_id}", status_code=204)
def delete_municipality(
    municipality_id: UUID,
    current_user: User = Depends(require_roles("governor")),
    db: Session = Depends(get_db),
):
    mun = db.query(Municipality).filter(
        Municipality.id == municipality_id,
        Municipality.governorate_id == current_user.governorate_id,
    ).first()
    if not mun:
        raise HTTPException(status_code=404, detail="Municipality not found")
    mun.is_active = False
    _log(db, current_user.id, "deactivate_municipality", "municipality", str(municipality_id))
    db.commit()


# ─── Districts ────────────────────────────────────────────────────────────────

@router.get("/districts", response_model=list[DistrictOut])
def list_districts_admin(
    current_user: User = Depends(require_roles("mayor", "municipal_admin", "governor")),
    db: Session = Depends(get_db),
):
    if current_user.role in ("mayor", "municipal_admin"):
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
    current_user: User = Depends(require_roles("mayor", "municipal_admin")),
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
    current_user: User = Depends(require_roles("mayor", "municipal_admin")),
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


@router.delete("/districts/{district_id}", status_code=204)
def delete_district(
    district_id: UUID,
    current_user: User = Depends(require_roles("mayor", "municipal_admin")),
    db: Session = Depends(get_db),
):
    district = db.query(District).filter(
        District.id == district_id,
        District.municipality_id == current_user.municipality_id,
    ).first()
    if not district:
        raise HTTPException(status_code=404, detail="District not found")
    district.is_active = False
    _log(db, current_user.id, "deactivate_district", "district", str(district_id))
    db.commit()


# ─── Municipal Teams ─────────────────────────────────────────────────────────

@router.get("/teams", response_model=list[MunicipalTeamOut])
def list_teams(
    municipality_id: Optional[UUID] = Query(None),
    current_user: User = Depends(require_roles("mayor", "municipal_admin", "governor")),
    db: Session = Depends(get_db),
):
    q = db.query(MunicipalTeam)
    if current_user.role in ("mayor", "municipal_admin"):
        q = q.filter(MunicipalTeam.municipality_id == current_user.municipality_id)
    else:
        from sqlalchemy import select
        mun_subq = select(Municipality.id).where(Municipality.governorate_id == current_user.governorate_id)
        q = q.filter(MunicipalTeam.municipality_id.in_(mun_subq))
        if municipality_id:
            q = q.filter(MunicipalTeam.municipality_id == municipality_id)
    return q.order_by(MunicipalTeam.created_at.desc()).all()


@router.post("/teams", response_model=MunicipalTeamOut, status_code=201)
def create_team(
    payload: MunicipalTeamCreate,
    current_user: User = Depends(require_roles("mayor", "municipal_admin")),
    db: Session = Depends(get_db),
):
    team = MunicipalTeam(
        municipality_id=current_user.municipality_id,
        team_name=payload.team_name.strip(),
        leader_name=payload.leader_name.strip(),
        leader_phone=payload.leader_phone.strip(),
        notes=payload.notes.strip() if payload.notes else None,
        is_active=True,
    )
    db.add(team)
    db.flush()
    _log(db, current_user.id, "create_team", "municipal_team", str(team.id), team.team_name)
    db.commit()
    db.refresh(team)
    return team


@router.patch("/teams/{team_id}", response_model=MunicipalTeamOut)
def update_team(
    team_id: UUID,
    payload: MunicipalTeamUpdate,
    current_user: User = Depends(require_roles("mayor", "municipal_admin")),
    db: Session = Depends(get_db),
):
    team = db.query(MunicipalTeam).filter(
        MunicipalTeam.id == team_id,
        MunicipalTeam.municipality_id == current_user.municipality_id,
    ).first()
    if not team:
        raise HTTPException(status_code=404, detail="Municipal team not found")
    if payload.team_name is not None:
        team.team_name = payload.team_name.strip()
    if payload.leader_name is not None:
        team.leader_name = payload.leader_name.strip()
    if payload.leader_phone is not None:
        team.leader_phone = payload.leader_phone.strip()
    if payload.notes is not None:
        team.notes = payload.notes.strip() or None
    if payload.is_active is not None:
        team.is_active = payload.is_active
    _log(db, current_user.id, "update_team", "municipal_team", str(team_id))
    db.commit()
    db.refresh(team)
    return team


@router.delete("/teams/{team_id}", status_code=204)
def delete_team(
    team_id: UUID,
    current_user: User = Depends(require_roles("mayor", "municipal_admin")),
    db: Session = Depends(get_db),
):
    team = db.query(MunicipalTeam).filter(
        MunicipalTeam.id == team_id,
        MunicipalTeam.municipality_id == current_user.municipality_id,
    ).first()
    if not team:
        raise HTTPException(status_code=404, detail="Municipal team not found")
    team.is_active = False
    _log(db, current_user.id, "deactivate_team", "municipal_team", str(team_id))
    db.commit()


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


# ─── Notifications ────────────────────────────────────────────────────────────

@router.get("/notifications", response_model=list[NotificationOut])
def list_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(100, ge=1, le=300),
    current_user: User = Depends(require_roles(*ALLOWED_ROLES)),
    db: Session = Depends(get_db),
):
    q = db.query(Notification).filter(Notification.user_id == current_user.id)
    if unread_only:
        q = q.filter(Notification.is_read.is_(False))
    return q.order_by(Notification.created_at.desc()).limit(limit).all()


@router.post("/notifications/{notification_id}/read", status_code=204)
def mark_notification_read(
    notification_id: UUID,
    current_user: User = Depends(require_roles(*ALLOWED_ROLES)),
    db: Session = Depends(get_db),
):
    notif = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id,
    ).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.is_read = True
    notif.read_at = datetime.now(timezone.utc)
    db.commit()


@router.post("/notifications/read-all", status_code=204)
def mark_all_notifications_read(
    current_user: User = Depends(require_roles(*ALLOWED_ROLES)),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read.is_(False),
    ).update({"is_read": True, "read_at": now}, synchronize_session=False)
    db.commit()


@router.post("/notifications/generate-alerts", status_code=204)
def generate_performance_alerts(
    current_user: User = Depends(require_roles("governor", "mayor", "mukhtar")),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    if current_user.role == "governor":
        mun_rows = (
            db.query(
                Municipality.name,
                func.count(ServiceRequest.id).label("total"),
                func.sum(case((ServiceRequest.status == "resolved", 1), else_=0)).label("resolved"),
                func.sum(
                    case(
                        (
                            and_(
                                ServiceRequest.closed_at.is_(None),
                                ServiceRequest.sla_deadline.isnot(None),
                                ServiceRequest.sla_deadline < now,
                            ),
                            1,
                        ),
                        else_=0,
                    )
                ).label("overdue_open"),
            )
            .join(ServiceRequest, ServiceRequest.municipality_id == Municipality.id)
            .filter(Municipality.governorate_id == current_user.governorate_id)
            .group_by(Municipality.name)
            .all()
        )
        for name, total, resolved, overdue_open in mun_rows:
            total = total or 0
            resolved = resolved or 0
            overdue_open = overdue_open or 0
            closure_rate = (resolved / total) * 100 if total else 0
            overdue_rate = (overdue_open / total) * 100 if total else 0
            if total >= ALERT_THRESHOLDS["district_unresolved_open"] and (closure_rate < ALERT_THRESHOLDS["municipality_low_closure_rate"] or overdue_rate > 25):
                _create_notification(
                    db=db,
                    user_id=current_user.id,
                    kind="performance_alert",
                    title="تنبيه أداء بلدية",
                    message=f"بلدية {name}: إنجاز {round(closure_rate, 1)}% وتأخر {round(overdue_rate, 1)}%",
                    severity="warning",
                    related_entity_type="municipality",
                )
    elif current_user.role == "mayor":
        district_rows = (
            db.query(District.name, func.count(ServiceRequest.id))
            .join(ServiceRequest, ServiceRequest.district_id == District.id)
            .filter(
                ServiceRequest.municipality_id == current_user.municipality_id,
                ServiceRequest.status.in_(["new", "under_review", "in_progress", "deferred"]),
            )
            .group_by(District.name)
            .all()
        )
        for district_name, open_count in district_rows:
            if open_count >= ALERT_THRESHOLDS["district_unresolved_open"]:
                _create_notification(
                    db=db,
                    user_id=current_user.id,
                    kind="performance_alert",
                    title="تنبيه تراكم شكاوى",
                    message=f"الحي {district_name} لديه {open_count} شكوى غير مغلقة.",
                    severity="warning",
                    related_entity_type="district",
                )
        team_rows = (
            db.query(MunicipalTeam.team_name, func.count(ServiceRequest.id))
            .join(ServiceRequest, ServiceRequest.responsible_team_id == MunicipalTeam.id)
            .filter(
                MunicipalTeam.municipality_id == current_user.municipality_id,
                ServiceRequest.status.in_(["new", "under_review", "in_progress", "deferred"]),
            )
            .group_by(MunicipalTeam.team_name)
            .all()
        )
        for team_name, open_count in team_rows:
            if open_count >= ALERT_THRESHOLDS["team_open_assigned"]:
                _create_notification(
                    db=db,
                    user_id=current_user.id,
                    kind="performance_alert",
                    title="تنبيه ضغط فرق",
                    message=f"الفريق {team_name} لديه {open_count} شكاوى مفتوحة مكلّف بها.",
                    severity="warning",
                    related_entity_type="team",
                )
    else:
        overdue_count = _scoped_requests(db, current_user).filter(
            ServiceRequest.closed_at.is_(None),
            ServiceRequest.sla_deadline.isnot(None),
            ServiceRequest.sla_deadline < now,
        ).count()
        if overdue_count > 0:
            _create_notification(
                db=db,
                user_id=current_user.id,
                kind="overdue_alert",
                title="تنبيه شكاوى متأخرة",
                message=f"يوجد {overdue_count} شكاوى متأخرة في نطاق الحي.",
                severity="warning",
                related_entity_type="district",
            )
    db.commit()


# ─── Requests ─────────────────────────────────────────────────────────────────

@router.get("/performance/governor", response_model=GovernorPerformanceDashboard)
def governor_performance_dashboard(
    sort_by: str = Query("open_complaints"),
    district_id: Optional[UUID] = Query(None),
    current_user: User = Depends(require_roles("governor")),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    valid_sort = {"open_complaints", "overdue_complaints", "slowest_resolution_time", "best_resolution_rate", "municipality_name"}
    if sort_by not in valid_sort:
        raise HTTPException(status_code=422, detail="sort_by غير صالح")

    q = (
        db.query(ServiceRequest, Municipality.name.label("municipality_name"))
        .join(Municipality, Municipality.id == ServiceRequest.municipality_id)
        .filter(Municipality.governorate_id == current_user.governorate_id)
    )
    if district_id is not None:
        district = (
            db.query(District)
            .join(Municipality, Municipality.id == District.municipality_id)
            .filter(
                District.id == district_id,
                Municipality.governorate_id == current_user.governorate_id,
            )
            .first()
        )
        if not district:
            raise HTTPException(status_code=404, detail="الحي غير موجود أو خارج النطاق")
        q = q.filter(ServiceRequest.district_id == district_id)

    rows = q.all()
    active_districts = dict(
        db.query(Municipality.id, func.count(District.id))
        .join(District, District.municipality_id == Municipality.id)
        .filter(
            Municipality.governorate_id == current_user.governorate_id,
            District.is_active.is_(True),
        )
        .group_by(Municipality.id)
        .all()
    )
    active_mukhtars = dict(
        db.query(Municipality.id, func.count(User.id))
        .join(District, District.municipality_id == Municipality.id)
        .join(User, User.district_id == District.id)
        .filter(
            Municipality.governorate_id == current_user.governorate_id,
            User.role == "mukhtar",
            User.is_active.is_(True),
        )
        .group_by(Municipality.id)
        .all()
    )

    stats: Dict[UUID, Dict[str, Any]] = {}
    for req, municipality_name in rows:
        entry = stats.setdefault(
            req.municipality_id,
            {
                "municipality_id": req.municipality_id,
                "municipality_name": municipality_name,
                "total": 0,
                "open": 0,
                "in_progress": 0,
                "resolved": 0,
                "rejected": 0,
                "deferred": 0,
                "overdue": 0,
                "resolved_hours_total": 0.0,
                "resolved_hours_count": 0,
                "last_activity_date": None,
                "category_counts": {},
                "team_counts": {},
            },
        )
        entry["total"] += 1
        if req.status in ("new", "under_review"):
            entry["open"] += 1
        if req.status == "in_progress":
            entry["in_progress"] += 1
        if req.status == "resolved":
            entry["resolved"] += 1
            if req.closed_at:
                entry["resolved_hours_total"] += max((req.closed_at - req.created_at).total_seconds(), 0) / 3600
                entry["resolved_hours_count"] += 1
        if req.status == "rejected":
            entry["rejected"] += 1
        if req.status == "deferred":
            entry["deferred"] += 1
        if req.closed_at is None and req.sla_deadline and req.sla_deadline < now:
            entry["overdue"] += 1

        if entry["last_activity_date"] is None or req.updated_at > entry["last_activity_date"]:
            entry["last_activity_date"] = req.updated_at
        entry["category_counts"][req.category] = entry["category_counts"].get(req.category, 0) + 1
        team_name = req.responsible_team_name or req.responsible_team
        if team_name:
            entry["team_counts"][team_name] = entry["team_counts"].get(team_name, 0) + 1

    municipalities: list[GovernorMunicipalityPerformance] = []
    for municipality_id, item in stats.items():
        total = item["total"]
        avg_hours = None
        if item["resolved_hours_count"] > 0:
            avg_hours = round(item["resolved_hours_total"] / item["resolved_hours_count"], 2)
        resolution_rate = round((item["resolved"] / total) * 100, 2) if total else 0.0
        overdue_rate = (item["overdue"] / total) if total else 0
        most_common_category = max(item["category_counts"], key=item["category_counts"].get) if item["category_counts"] else None
        most_assigned_team = max(item["team_counts"], key=item["team_counts"].get) if item["team_counts"] else None

        municipalities.append(
            GovernorMunicipalityPerformance(
                municipality_id=municipality_id,
                municipality_name=item["municipality_name"],
                total_complaints=total,
                open_complaints=item["open"],
                in_progress_complaints=item["in_progress"],
                resolved_complaints=item["resolved"],
                rejected_complaints=item["rejected"],
                deferred_complaints=item["deferred"],
                overdue_complaints=item["overdue"],
                resolution_rate=resolution_rate,
                average_resolution_time_hours=avg_hours,
                last_activity_date=item["last_activity_date"],
                most_common_category=most_common_category,
                most_assigned_team=most_assigned_team,
                active_districts_count=int(active_districts.get(municipality_id, 0)),
                active_mukhtars_count=int(active_mukhtars.get(municipality_id, 0)),
                closure_signal=_signal_from_ratio(resolution_rate, 75, 50),
                overdue_signal=_signal_from_ratio(overdue_rate, 0.05, 0.15, invert=True),
                speed_signal=_signal_from_ratio(avg_hours if avg_hours is not None else 9999, 72, 120, invert=True),
            )
        )

    if sort_by == "open_complaints":
        municipalities.sort(key=lambda x: x.open_complaints, reverse=True)
    elif sort_by == "overdue_complaints":
        municipalities.sort(key=lambda x: x.overdue_complaints, reverse=True)
    elif sort_by == "slowest_resolution_time":
        municipalities.sort(key=lambda x: x.average_resolution_time_hours or 0, reverse=True)
    elif sort_by == "best_resolution_rate":
        municipalities.sort(key=lambda x: x.resolution_rate, reverse=True)
    else:
        municipalities.sort(key=lambda x: x.municipality_name)

    def _score(m: GovernorMunicipalityPerformance) -> float:
        overdue_rate_pct = (m.overdue_complaints / m.total_complaints) * 100 if m.total_complaints else 0
        speed_penalty = m.average_resolution_time_hours or 999
        return (m.resolution_rate * 2) - overdue_rate_pct - (speed_penalty / 10)

    best = max(municipalities, key=_score).municipality_name if municipalities else None
    worst = min(municipalities, key=_score).municipality_name if municipalities else None
    backlog = max(municipalities, key=lambda m: m.open_complaints + m.in_progress_complaints).municipality_name if municipalities else None
    fastest = min(
        [m for m in municipalities if m.average_resolution_time_hours is not None],
        key=lambda m: m.average_resolution_time_hours,
    ).municipality_name if any(m.average_resolution_time_hours is not None for m in municipalities) else None

    return GovernorPerformanceDashboard(
        highlights=GovernorPerformanceHighlights(
            best_performing_municipality=best,
            worst_performing_municipality=worst,
            highest_backlog_municipality=backlog,
            fastest_closure_municipality=fastest,
        ),
        municipalities=municipalities,
    )


@router.get("/performance/mayor", response_model=MayorPerformanceDashboard)
def mayor_performance_dashboard(
    district_id: Optional[UUID] = Query(None),
    current_user: User = Depends(require_roles("mayor", "municipal_admin")),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    requests_q = db.query(ServiceRequest).filter(ServiceRequest.municipality_id == current_user.municipality_id)
    if district_id:
        district = db.query(District).filter(
            District.id == district_id,
            District.municipality_id == current_user.municipality_id,
        ).first()
        if not district:
            raise HTTPException(status_code=404, detail="الحي غير موجود أو خارج نطاق البلدية")
        requests_q = requests_q.filter(ServiceRequest.district_id == district_id)
    requests = requests_q.all()

    mukhtars = db.query(User).filter(
        User.role == "mukhtar",
        User.district_id.isnot(None),
        User.is_active.is_(True),
    ).all()
    mukhtar_by_district = {m.district_id: m.full_name for m in mukhtars}

    district_names = dict(
        db.query(District.id, District.name)
        .filter(District.municipality_id == current_user.municipality_id)
        .all()
    )
    district_stats: Dict[UUID, Dict[str, Any]] = {}
    for req in requests:
        entry = district_stats.setdefault(
            req.district_id,
            {
                "district_name": district_names.get(req.district_id, "—"),
                "total": 0,
                "open": 0,
                "resolved": 0,
                "overdue": 0,
                "resolved_hours_total": 0.0,
                "resolved_hours_count": 0,
                "last_activity_date": None,
                "category_counts": {},
                "mukhtar_name": mukhtar_by_district.get(req.district_id),
            },
        )
        entry["total"] += 1
        if req.status in ("new", "under_review", "in_progress"):
            entry["open"] += 1
        if req.status == "resolved":
            entry["resolved"] += 1
            if req.closed_at:
                entry["resolved_hours_total"] += max((req.closed_at - req.created_at).total_seconds(), 0) / 3600
                entry["resolved_hours_count"] += 1
        if req.closed_at is None and req.sla_deadline and req.sla_deadline < now:
            entry["overdue"] += 1
        if entry["last_activity_date"] is None or req.updated_at > entry["last_activity_date"]:
            entry["last_activity_date"] = req.updated_at
        entry["category_counts"][req.category] = entry["category_counts"].get(req.category, 0) + 1

    district_rows: list[MayorDistrictPerformance] = []
    for did, item in district_stats.items():
        avg_hours = None
        if item["resolved_hours_count"] > 0:
            avg_hours = round(item["resolved_hours_total"] / item["resolved_hours_count"], 2)
        closure_rate = (item["resolved"] / item["total"]) * 100 if item["total"] else 0
        overdue_rate = (item["overdue"] / item["total"]) if item["total"] else 0
        district_rows.append(
            MayorDistrictPerformance(
                district_id=did,
                district_name=item["district_name"],
                mukhtar_name=item["mukhtar_name"],
                total_complaints=item["total"],
                open_complaints=item["open"],
                resolved_complaints=item["resolved"],
                overdue_complaints=item["overdue"],
                average_resolution_time_hours=avg_hours,
                last_activity_date=item["last_activity_date"],
                most_common_category=max(item["category_counts"], key=item["category_counts"].get) if item["category_counts"] else None,
                closure_signal=_signal_from_ratio(closure_rate, 75, 50),
                overdue_signal=_signal_from_ratio(overdue_rate, 0.05, 0.15, invert=True),
                speed_signal=_signal_from_ratio(avg_hours if avg_hours is not None else 9999, 72, 120, invert=True),
            )
        )

    teams = db.query(MunicipalTeam).filter(MunicipalTeam.municipality_id == current_user.municipality_id).all()
    team_rows: list[MayorTeamPerformance] = []
    for team in teams:
        team_reqs = [r for r in requests if r.responsible_team_id == team.id]
        assigned = len(team_reqs)
        resolved_count = len([r for r in team_reqs if r.status == "resolved"])
        overdue_count = len([r for r in team_reqs if r.closed_at is None and r.sla_deadline and r.sla_deadline < now])
        closure_hours = [
            max((r.closed_at - r.created_at).total_seconds(), 0) / 3600
            for r in team_reqs
            if r.status == "resolved" and r.closed_at
        ]
        avg_closure = round(sum(closure_hours) / len(closure_hours), 2) if closure_hours else None
        closure_rate = (resolved_count / assigned) * 100 if assigned else 0
        overdue_rate = (overdue_count / assigned) if assigned else 0
        team_rows.append(
            MayorTeamPerformance(
                team_id=team.id,
                team_name=team.team_name,
                leader_name=team.leader_name,
                is_active=team.is_active,
                assigned_complaints=assigned,
                resolved_count=resolved_count,
                overdue_count=overdue_count,
                average_closure_time_hours=avg_closure,
                closure_signal=_signal_from_ratio(closure_rate, 75, 50),
                overdue_signal=_signal_from_ratio(overdue_rate, 0.05, 0.15, invert=True),
                speed_signal=_signal_from_ratio(avg_closure if avg_closure is not None else 9999, 72, 120, invert=True),
            )
        )

    district_rows.sort(key=lambda x: x.open_complaints + x.overdue_complaints, reverse=True)
    team_rows.sort(key=lambda x: x.assigned_complaints, reverse=True)
    best_district = max(district_rows, key=lambda d: (d.resolved_complaints, -d.overdue_complaints)).district_name if district_rows else None
    backlog_district = max(district_rows, key=lambda d: d.open_complaints).district_name if district_rows else None
    least_responsive = max(
        district_rows,
        key=lambda d: (d.average_resolution_time_hours or 9999, d.overdue_complaints),
    ).district_name if district_rows else None
    mukhtar_activity = {}
    for d in district_rows:
        if d.mukhtar_name:
            mukhtar_activity[d.mukhtar_name] = mukhtar_activity.get(d.mukhtar_name, 0) + d.total_complaints
    most_active_mukhtar = max(mukhtar_activity, key=mukhtar_activity.get) if mukhtar_activity else None
    productive_team = max(team_rows, key=lambda t: (t.resolved_count, -t.overdue_count)).team_name if team_rows else None

    return MayorPerformanceDashboard(
        highlights=MayorPerformanceHighlights(
            best_performing_district=best_district,
            highest_backlog_district=backlog_district,
            most_active_mukhtar=most_active_mukhtar,
            least_responsive_district=least_responsive,
            most_productive_team=productive_team,
        ),
        districts=district_rows,
        teams=team_rows,
    )

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
    archived: Optional[bool] = Query(None),
    archive_month: Optional[int] = Query(None, ge=1, le=12),
    archive_year: Optional[int] = Query(None, ge=2000, le=2100),
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

    if archived is not None:
        q = q.filter(ServiceRequest.is_archived == archived)
    if archive_month and archive_year:
        start, end_exclusive = _month_range(archive_year, archive_month)
        q = q.filter(ServiceRequest.closed_at >= start, ServiceRequest.closed_at < end_exclusive)

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
        event_type="created",
        is_internal=False,
    ))
    _notify_request_scope(
        db,
        req,
        kind="new_complaint",
        title="شكوى جديدة",
        message=f"تم تسجيل شكوى جديدة برقم {req.complaint_number or req.tracking_code}",
        severity="info",
    )
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
        event_type="staff_assigned",
        is_internal=True,
    )
    db.add(update)
    _notify_request_scope(
        db,
        req,
        kind="assignment",
        title="تعيين شكوى",
        message=f"تم تعيين الشكوى إلى {staff.name}",
        severity="info",
    )
    _log(db, current_user.id, "assign_staff", "service_request", req.id, str(staff.id))
    db.commit()
    db.refresh(req)
    return req


@router.post("/requests/{request_id}/status", response_model=ServiceRequestOut)
def update_status(
    request_id: UUID,
    payload: StatusUpdateRequest,
    current_user: User = Depends(require_roles("governor", "mayor", "municipal_admin", "mukhtar", "district_admin")),
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
    if payload.status == "resolved" and not (payload.note or "").strip():
        raise HTTPException(status_code=422, detail="completion note is required when resolving")

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
        req.completion_note = (payload.note or "").strip() or None

    req.sla_status = calculate_sla_status(
        req.created_at, req.category, req.priority, req.status,
        req.closed_at, req.sla_deadline
    )

    update = RequestUpdate(
        request_id=req.id,
        actor_user_id=current_user.id,
        actor_name=current_user.name,
        message=None,
        event_type="status_changed",
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
            event_type="rejection_reason",
            is_internal=False,
        ))

    if payload.note and payload.note.strip():
        db.add(RequestUpdate(
            request_id=req.id,
            actor_user_id=current_user.id,
            actor_name=current_user.name,
            message=f"ملاحظة داخلية: {payload.note}",
            event_type="note_added",
            is_internal=True,
        ))

    status_kind = {
        "resolved": "resolved",
        "rejected": "rejected",
        "deferred": "deferred",
    }.get(payload.status, "status_changed")
    _notify_request_scope(
        db,
        req,
        kind=status_kind,
        title="تحديث حالة شكوى",
        message=f"تم تغيير الحالة إلى {payload.status}",
        severity="success" if payload.status == "resolved" else "warning" if payload.status in ("rejected", "deferred") else "info",
    )

    _log(db, current_user.id, "status_change", "service_request", req.id,
         f"{old_status} -> {payload.status}")
    db.commit()
    db.refresh(req)
    return req


@router.post("/requests/{request_id}/priority", response_model=ServiceRequestOut)
def update_priority(
    request_id: UUID,
    payload: PriorityUpdateRequest,
    current_user: User = Depends(require_roles("district_admin", "municipal_admin", "mayor")),
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
        event_type="priority_changed",
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
    current_user: User = Depends(require_roles("governor", "mayor", "municipal_admin", "mukhtar", "district_admin")),
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
        event_type="note_added",
        is_internal=True,
    ))
    _log(db, current_user.id, "add_note", "service_request", req.id)
    db.commit()
    db.refresh(req)
    return req


@router.post("/requests/{request_id}/archive", response_model=ServiceRequestOut)
def archive_request(
    request_id: UUID,
    payload: ArchiveRequest,
    current_user: User = Depends(require_roles("governor", "mayor", "municipal_admin")),
    db: Session = Depends(get_db),
):
    req = _scoped_requests(db, current_user).filter(ServiceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if payload.is_archived and req.status not in ("resolved", "rejected", "deferred"):
        raise HTTPException(status_code=422, detail="لا يمكن أرشفة شكوى غير مغلقة")

    req.is_archived = payload.is_archived
    req.archived_at = datetime.now(timezone.utc) if payload.is_archived else None
    req.archived_by_user_id = current_user.id if payload.is_archived else None
    req.archive_note = (payload.note or "").strip() or None
    req.updated_at = datetime.now(timezone.utc)

    db.add(RequestUpdate(
        request_id=req.id,
        actor_user_id=current_user.id,
        actor_name=current_user.name,
        message=f"تم {'أرشفة' if payload.is_archived else 'إلغاء أرشفة'} الشكوى" + (f" — {req.archive_note}" if req.archive_note else ""),
        event_type="archive_changed",
        is_internal=True,
    ))
    _log(db, current_user.id, "archive_change", "service_request", req.id, str(payload.is_archived))
    db.commit()
    db.refresh(req)
    return req


@router.post("/requests/{request_id}/responsible-team", response_model=ServiceRequestOut)
def update_responsible_team(
    request_id: UUID,
    payload: ResponsibleTeamUpdateRequest,
    current_user: User = Depends(require_roles("mayor")),
    db: Session = Depends(get_db),
):
    """Mayor can assign/change the responsible municipal team for a request."""
    req = _scoped_requests(db, current_user).filter(ServiceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    team = None
    if payload.responsible_team_id is not None:
        team_q = db.query(MunicipalTeam).filter(
            MunicipalTeam.id == payload.responsible_team_id,
            MunicipalTeam.is_active.is_(True),
            MunicipalTeam.municipality_id == current_user.municipality_id,
        )
        team = team_q.first()
        if not team:
            raise HTTPException(status_code=404, detail="Municipal team not found")

    old_team = req.responsible_team_name or req.responsible_team
    req.responsible_team_id = team.id if team else None
    req.responsible_team = team.team_name if team else None
    req.responsible_team_name = team.team_name if team else None
    req.responsible_team_leader_name = team.leader_name if team else None
    req.responsible_team_leader_phone = team.leader_phone if team else None
    req.updated_at = datetime.now(timezone.utc)

    new_label = team.team_name if team else "—"
    db.add(RequestUpdate(
        request_id=req.id,
        actor_user_id=current_user.id,
        actor_name=current_user.name,
        message=f"تم تعيين الفريق المسؤول: {new_label}",
        event_type="team_assigned",
        is_internal=True,
    ))
    _notify_request_scope(
        db,
        req,
        kind="team_assigned",
        title="تعيين فريق",
        message=f"تم تعيين الفريق: {new_label}",
        severity="info",
    )
    _log(db, current_user.id, "update_responsible_team", "service_request", req.id,
         f"{old_team} -> {new_label}")
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
    current_user: User = Depends(require_roles("mayor", "municipal_admin", "district_admin")),
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
        event_type="material_added",
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
    current_user: User = Depends(require_roles("mayor", "municipal_admin", "district_admin")),
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
    current_user: User = Depends(require_roles("governor", "mayor", "municipal_admin", "mukhtar", "district_admin")),
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
    filename = f"{uuid.uuid4()}{ext}"
    os.makedirs(settings.upload_dir, exist_ok=True)
    file_path = os.path.join(settings.upload_dir, filename)

    import aiofiles
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    # Store original filename (sanitized) for display; use UUID filename for storage
    import re
    safe_display_name = re.sub(r"[^\w.\-]", "_", original_name)[:200] or filename

    attachment = Attachment(
        request_id=req.id,
        kind=kind,
        file_url=f"/uploads/{filename}",
        file_name=safe_display_name,
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
    created = db.query(User).filter(User.id == new_user.id).first()
    return created


@router.post("/users/mukhtars", response_model=UserOut, status_code=201)
def create_mukhtar(
    payload: CreateMukhtarRequest,
    current_user: User = Depends(require_roles("mayor", "municipal_admin")),
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
    created = db.query(User).filter(User.id == new_user.id).first()
    return created


@router.get("/users/mayors", response_model=list[UserOut])
def list_mayors(
    current_user: User = Depends(require_roles("governor")),
    db: Session = Depends(get_db),
):
    return (
        db.query(User)
        .join(Municipality, Municipality.id == User.municipality_id)
        .filter(
            User.role == "mayor",
            Municipality.governorate_id == current_user.governorate_id,
        )
        .order_by(User.created_at.desc())
        .all()
    )


@router.get("/users/mukhtars", response_model=list[UserOut])
def list_mukhtars(
    current_user: User = Depends(require_roles("mayor", "municipal_admin")),
    db: Session = Depends(get_db),
):
    return (
        db.query(User)
        .filter(
            User.role == "mukhtar",
            User.municipality_id == current_user.municipality_id,
        )
        .order_by(User.created_at.desc())
        .all()
    )


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user_admin(
    user_id: UUID,
    payload: UserAdminUpdate,
    current_user: User = Depends(require_roles("governor", "mayor")),
    db: Session = Depends(get_db),
):
    q = db.query(User).filter(User.id == user_id)
    if current_user.role == "governor":
        q = q.filter(User.role == "mayor")
    else:
        q = q.filter(User.role == "mukhtar", User.municipality_id == current_user.municipality_id)
    target = q.first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.username is not None and payload.username != target.username:
        exists = db.query(User.id).filter(User.username == payload.username, User.id != target.id).first()
        if exists:
            raise HTTPException(status_code=409, detail="اسم المستخدم مستخدم بالفعل")
        target.username = payload.username.strip()
    if payload.full_name is not None:
        target.full_name = payload.full_name.strip()
    if payload.is_active is not None:
        target.is_active = payload.is_active

    if current_user.role == "governor" and payload.municipality_id:
        mun = db.query(Municipality).filter(
            Municipality.id == payload.municipality_id,
            Municipality.governorate_id == current_user.governorate_id,
        ).first()
        if not mun:
            raise HTTPException(status_code=404, detail="Municipality not found")
        target.municipality_id = payload.municipality_id

    if current_user.role == "mayor" and payload.district_id:
        district = db.query(District).filter(
            District.id == payload.district_id,
            District.municipality_id == current_user.municipality_id,
        ).first()
        if not district:
            raise HTTPException(status_code=404, detail="District not found")
        target.district_id = payload.district_id
    _log(db, current_user.id, "update_user", "user", str(target.id))
    db.commit()
    db.refresh(target)
    return target


@router.delete("/users/{user_id}", status_code=204)
def delete_user_admin(
    user_id: UUID,
    current_user: User = Depends(require_roles("governor", "mayor")),
    db: Session = Depends(get_db),
):
    q = db.query(User).filter(User.id == user_id)
    if current_user.role == "governor":
        q = q.filter(User.role == "mayor")
    else:
        q = q.filter(User.role == "mukhtar", User.municipality_id == current_user.municipality_id)
    target = q.first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    target.is_active = False
    _log(db, current_user.id, "deactivate_user", "user", str(target.id))
    db.commit()


# ─── Monthly Reports ──────────────────────────────────────────────────────────

def _month_range(year: int, month: int):
    """Return (start_dt, end_exclusive_dt) UTC datetimes bracketing the given month."""
    start = datetime(year, month, 1, 0, 0, 0, tzinfo=timezone.utc)
    if month == 12:
        end_exclusive = datetime(year + 1, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    else:
        end_exclusive = datetime(year, month + 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    return start, end_exclusive


def _csv_response(filename: str, rows: list[list[Any]]) -> StreamingResponse:
    output = io.StringIO()
    writer = csv.writer(output)
    for row in rows:
        writer.writerow(row)
    output.seek(0)
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv; charset=utf-8", headers=headers)


@router.get("/exports/{dataset}")
def export_dataset(
    dataset: str,
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    current_user: User = Depends(require_roles("governor", "mayor", "municipal_admin", "mukhtar", "district_admin")),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    if dataset == "complaints":
        q = _scoped_requests(db, current_user)
        rows = [["رقم الشكوى", "رمز التتبع", "المحافظة", "البلدية", "الحي", "الفئة", "الأولوية", "الحالة", "تاريخ الإنشاء", "تاريخ الإغلاق", "مؤرشف"]]
        for req in q.order_by(ServiceRequest.created_at.desc()).all():
            rows.append([req.complaint_number or "", req.tracking_code, req.governorate_name or "", req.municipality_name or "", req.district_name or "", req.category, req.priority, req.status, req.created_at.isoformat(), req.closed_at.isoformat() if req.closed_at else "", "نعم" if req.is_archived else "لا"])
        return _csv_response(f"complaints-{now.date().isoformat()}.csv", rows)
    if dataset == "municipalities":
        if current_user.role != "governor":
            raise HTTPException(status_code=403, detail="غير مصرح")
        rows = [["البلدية", "نشطة"]]
        for mun in db.query(Municipality).filter(Municipality.governorate_id == current_user.governorate_id).order_by(Municipality.name).all():
            rows.append([mun.name, "نعم" if mun.is_active else "لا"])
        return _csv_response("municipalities.csv", rows)
    if dataset == "districts":
        rows = [["الحي", "البلدية", "نشط"]]
        q = db.query(District).join(Municipality, Municipality.id == District.municipality_id)
        if current_user.role in ("mayor", "municipal_admin"):
            q = q.filter(District.municipality_id == current_user.municipality_id)
        elif current_user.role in ("mukhtar", "district_admin"):
            q = q.filter(District.id == current_user.district_id)
        else:
            q = q.filter(Municipality.governorate_id == current_user.governorate_id)
        for dist, mun_name in q.with_entities(District, Municipality.name).order_by(District.name).all():
            rows.append([dist.name, mun_name, "نعم" if dist.is_active else "لا"])
        return _csv_response("districts.csv", rows)
    if dataset == "mayors":
        if current_user.role != "governor":
            raise HTTPException(status_code=403, detail="غير مصرح")
        rows = [["الاسم", "اسم المستخدم", "البلدية", "نشط"]]
        for u, mun_name in db.query(User, Municipality.name).join(Municipality, Municipality.id == User.municipality_id).filter(User.role == "mayor", Municipality.governorate_id == current_user.governorate_id).all():
            rows.append([u.full_name, u.username, mun_name, "نعم" if u.is_active else "لا"])
        return _csv_response("mayors.csv", rows)
    if dataset == "mukhtars":
        rows = [["الاسم", "اسم المستخدم", "الحي", "نشط"]]
        q = db.query(User, District.name).join(District, District.id == User.district_id).filter(User.role == "mukhtar")
        if current_user.role in ("mayor", "municipal_admin"):
            q = q.filter(User.municipality_id == current_user.municipality_id)
        elif current_user.role in ("mukhtar", "district_admin"):
            q = q.filter(User.district_id == current_user.district_id)
        else:
            q = q.join(Municipality, Municipality.id == User.municipality_id).filter(Municipality.governorate_id == current_user.governorate_id)
        for u, district_name in q.all():
            rows.append([u.full_name, u.username, district_name, "نعم" if u.is_active else "لا"])
        return _csv_response("mukhtars.csv", rows)
    if dataset == "teams":
        rows = [["الفريق", "القائد", "الهاتف", "البلدية", "نشط"]]
        q = db.query(MunicipalTeam, Municipality.name).join(Municipality, Municipality.id == MunicipalTeam.municipality_id)
        if current_user.role in ("mayor", "municipal_admin"):
            q = q.filter(MunicipalTeam.municipality_id == current_user.municipality_id)
        elif current_user.role == "governor":
            q = q.filter(Municipality.governorate_id == current_user.governorate_id)
        else:
            q = q.filter(MunicipalTeam.municipality_id == current_user.municipality_id)
        for t, mun_name in q.all():
            rows.append([t.team_name, t.leader_name, t.leader_phone, mun_name, "نعم" if t.is_active else "لا"])
        return _csv_response("teams.csv", rows)
    if dataset == "monthly-report":
        if not month or not year:
            raise HTTPException(status_code=422, detail="month and year are required")
        report = _build_report(db, _scoped_requests(db, current_user), month, year)
        rows = [["المؤشر", "القيمة"], ["الشهر", f"{month}/{year}"], ["إجمالي الشكاوى", report.total], ["مفتوحة", report.open], ["قيد المعالجة", report.in_progress], ["محلولة", report.resolved], ["معدل الإغلاق", report.closure_rate], ["معدل التأخر", report.overdue_rate], ["متوسط زمن المعالجة (ساعة)", report.average_resolution_time_hours or ""]]
        return _csv_response("monthly-report.csv", rows)

    raise HTTPException(status_code=404, detail="dataset not found")


def _build_report(
    db: Session,
    base_q,
    month: int,
    year: int,
    report_type: Optional[str] = None,
    entity_name: Optional[str] = None,
    top_district_query=None,
    best_worst_query=None,
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

    avg_resolution_time_hours = None
    resolved_rows = q.filter(ServiceRequest.closed_at.isnot(None)).with_entities(ServiceRequest.created_at, ServiceRequest.closed_at).all()
    if resolved_rows:
        total_hours = sum(max((closed - created).total_seconds(), 0) / 3600 for created, closed in resolved_rows if created and closed)
        avg_resolution_time_hours = round(total_hours / len(resolved_rows), 2) if resolved_rows else None

    backlog_open = open_count + in_progress
    closure_rate = round((resolved / total) * 100, 2) if total else 0.0
    overdue_rate = round((overdue / total) * 100, 2) if total else 0.0
    top_categories = [ReportCountEntry(name=r[0], count=r[1]) for r in by_category_rows[:5]]
    top_teams = [
        ReportCountEntry(name=r[0], count=r[1])
        for r in (
            q.filter(ServiceRequest.responsible_team_name.isnot(None))
            .with_entities(ServiceRequest.responsible_team_name, func.count(ServiceRequest.id).label("cnt"))
            .group_by(ServiceRequest.responsible_team_name)
            .order_by(func.count(ServiceRequest.id).desc())
            .limit(5)
            .all()
        )
    ]
    best_entities: list[ReportCountEntry] = []
    worst_entities: list[ReportCountEntry] = []
    if best_worst_query is not None:
        best_rows, worst_rows = best_worst_query(start, end_exclusive)
        best_entities = [ReportCountEntry(name=name, count=count) for name, count in best_rows]
        worst_entities = [ReportCountEntry(name=name, count=count) for name, count in worst_rows]

    return MonthlyReport(
        period={"month": month, "year": year},
        report_type=report_type,
        entity_name=entity_name,
        total=total,
        open=open_count,
        in_progress=in_progress,
        resolved=resolved,
        urgent=urgent,
        overdue=overdue,
        backlog_open=backlog_open,
        closure_rate=closure_rate,
        overdue_rate=overdue_rate,
        average_resolution_time_hours=avg_resolution_time_hours,
        most_common_category=most_common_category,
        most_assigned_team=most_assigned_team,
        top_district=top_district,
        top_categories=top_categories,
        top_teams=top_teams,
        best_performing_entities=best_entities,
        worst_performing_entities=worst_entities,
        by_category=[ReportCountEntry(name=r[0], count=r[1]) for r in by_category_rows],
        by_status=[ReportCountEntry(name=r[0], count=r[1]) for r in by_status_rows],
    )


@router.get("/reports/accountability", response_model=AccountabilityReport)
def accountability_report(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000, le=2100),
    municipality_id: Optional[UUID] = Query(None),
    district_id: Optional[UUID] = Query(None),
    current_user: User = Depends(require_roles("governor", "mayor", "municipal_admin")),
    db: Session = Depends(get_db),
):
    start, end_exclusive = _month_range(year, month)
    now = datetime.now(timezone.utc)
    base_q = db.query(ServiceRequest)

    if current_user.role == "governor":
        from sqlalchemy import select as sa_select
        mun_subq = sa_select(Municipality.id).where(Municipality.governorate_id == current_user.governorate_id)
        base_q = base_q.filter(ServiceRequest.municipality_id.in_(mun_subq))
        if municipality_id:
            mun = db.query(Municipality).filter(
                Municipality.id == municipality_id,
                Municipality.governorate_id == current_user.governorate_id,
            ).first()
            if not mun:
                raise HTTPException(status_code=404, detail="البلدية غير موجودة أو خارج النطاق")
            base_q = base_q.filter(ServiceRequest.municipality_id == municipality_id)
    else:
        base_q = base_q.filter(ServiceRequest.municipality_id == current_user.municipality_id)

    if district_id:
        district_q = db.query(District).filter(District.id == district_id)
        if current_user.role == "governor":
            district_q = district_q.join(Municipality, Municipality.id == District.municipality_id).filter(
                Municipality.governorate_id == current_user.governorate_id
            )
        else:
            district_q = district_q.filter(District.municipality_id == current_user.municipality_id)
        if not district_q.first():
            raise HTTPException(status_code=404, detail="الحي غير موجود أو خارج النطاق")
        base_q = base_q.filter(ServiceRequest.district_id == district_id)

    opened_q = base_q.filter(ServiceRequest.created_at >= start, ServiceRequest.created_at < end_exclusive)
    closed_q = base_q.filter(
        ServiceRequest.closed_at.isnot(None),
        ServiceRequest.closed_at >= start,
        ServiceRequest.closed_at < end_exclusive,
    )
    carried_q = base_q.filter(
        ServiceRequest.created_at < start,
        ServiceRequest.status.in_(["new", "under_review", "in_progress", "deferred"]),
    )
    overdue_q = base_q.filter(
        ServiceRequest.closed_at.is_(None),
        ServiceRequest.sla_deadline.isnot(None),
        ServiceRequest.sla_deadline < now,
    )

    opened = opened_q.count()
    closed = closed_q.count()
    carried = carried_q.count()
    overdue = overdue_q.count()
    closure_rate = round((closed / opened) * 100, 2) if opened else 0.0

    closed_rows = closed_q.with_entities(ServiceRequest.created_at, ServiceRequest.closed_at).all()
    avg_hours = None
    if closed_rows:
        total_hours = 0.0
        for created_at, closed_at in closed_rows:
            if created_at and closed_at:
                total_hours += max((closed_at - created_at).total_seconds(), 0) / 3600
        avg_hours = round(total_hours / len(closed_rows), 2)

    top_categories = [
        AccountabilityTopEntity(name=row[0], count=row[1])
        for row in (
            opened_q.with_entities(ServiceRequest.category, func.count(ServiceRequest.id))
            .group_by(ServiceRequest.category)
            .order_by(func.count(ServiceRequest.id).desc())
            .limit(5)
            .all()
        )
    ]
    top_teams = [
        AccountabilityTopEntity(name=row[0], count=row[1])
        for row in (
            opened_q.filter(ServiceRequest.responsible_team_name.isnot(None))
            .with_entities(ServiceRequest.responsible_team_name, func.count(ServiceRequest.id))
            .group_by(ServiceRequest.responsible_team_name)
            .order_by(func.count(ServiceRequest.id).desc())
            .limit(5)
            .all()
        )
    ]

    if district_id:
        delayed_entities = [
            AccountabilityTopEntity(name=row[0], count=row[1])
            for row in (
                overdue_q.with_entities(ServiceRequest.responsible_team_name, func.count(ServiceRequest.id))
                .filter(ServiceRequest.responsible_team_name.isnot(None))
                .group_by(ServiceRequest.responsible_team_name)
                .order_by(func.count(ServiceRequest.id).desc())
                .limit(5)
                .all()
            )
        ]
    elif municipality_id or current_user.role in ("mayor", "municipal_admin"):
        delayed_entities = [
            AccountabilityTopEntity(name=row[0], count=row[1])
            for row in (
                overdue_q.join(District, District.id == ServiceRequest.district_id)
                .with_entities(District.name, func.count(ServiceRequest.id))
                .group_by(District.name)
                .order_by(func.count(ServiceRequest.id).desc())
                .limit(5)
                .all()
            )
        ]
    else:
        delayed_entities = [
            AccountabilityTopEntity(name=row[0], count=row[1])
            for row in (
                overdue_q.join(Municipality, Municipality.id == ServiceRequest.municipality_id)
                .with_entities(Municipality.name, func.count(ServiceRequest.id))
                .group_by(Municipality.name)
                .order_by(func.count(ServiceRequest.id).desc())
                .limit(5)
                .all()
            )
        ]

    return AccountabilityReport(
        period={"month": month, "year": year},
        complaints_opened_during_period=opened,
        complaints_closed_during_period=closed,
        complaints_still_open_from_previous_periods=carried,
        overdue_complaints=overdue,
        closure_rate=closure_rate,
        average_time_to_resolution_hours=avg_hours,
        top_categories=top_categories,
        top_teams=top_teams,
        top_delayed_entities=delayed_entities,
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
    district_name = db.query(District.name).filter(District.id == target_district_id).scalar()
    return _build_report(db, base_q, month, year, report_type="district", entity_name=district_name)


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

    municipality_name = db.query(Municipality.name).filter(Municipality.id == target_municipality_id).scalar()

    def best_worst_fn(start, end_exclusive):
        rows = (
            db.query(District.name, func.count(ServiceRequest.id).label("resolved_cnt"))
            .join(ServiceRequest, ServiceRequest.district_id == District.id)
            .filter(
                ServiceRequest.municipality_id == target_municipality_id,
                ServiceRequest.status == "resolved",
                ServiceRequest.created_at >= start,
                ServiceRequest.created_at < end_exclusive,
            )
            .group_by(District.name)
            .order_by(func.count(ServiceRequest.id).desc())
            .all()
        )
        if not rows:
            return [], []
        return rows[:3], list(reversed(rows[-3:]))

    return _build_report(
        db,
        base_q,
        month,
        year,
        report_type="municipality",
        entity_name=municipality_name,
        top_district_query=top_district_fn,
        best_worst_query=best_worst_fn,
    )


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

    governorate_name = db.query(Governorate.name).filter(Governorate.id == current_user.governorate_id).scalar()

    def best_worst_fn(start, end_exclusive):
        rows = (
            db.query(Municipality.name, func.count(ServiceRequest.id).label("resolved_cnt"))
            .join(ServiceRequest, ServiceRequest.municipality_id == Municipality.id)
            .filter(
                Municipality.governorate_id == current_user.governorate_id,
                ServiceRequest.status == "resolved",
                ServiceRequest.created_at >= start,
                ServiceRequest.created_at < end_exclusive,
            )
            .group_by(Municipality.name)
            .order_by(func.count(ServiceRequest.id).desc())
            .all()
        )
        if not rows:
            return [], []
        return rows[:3], list(reversed(rows[-3:]))

    return _build_report(
        db,
        base_q,
        month,
        year,
        report_type="governorate",
        entity_name=governorate_name,
        top_district_query=top_district_fn,
        best_worst_query=best_worst_fn,
    )
