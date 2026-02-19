import os
import uuid
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps import get_current_user, require_roles, require_district_scope, require_municipality_scope
from app.models import Attachment, AuditLog, RequestUpdate, ServiceRequest, User
from app.schemas import (
    AssignStaffRequest,
    AttachmentOut,
    InternalNoteRequest,
    PaginatedRequests,
    PriorityUpdateRequest,
    ServiceRequestDetail,
    ServiceRequestOut,
    StatusUpdateRequest,
)
from app.sla import calculate_sla_status, can_transition, get_sla_deadline

settings = get_settings()
router = APIRouter(prefix="/admin", tags=["admin"])

ALLOWED_ROLES = ("district_admin", "municipal_admin", "staff")


def _scoped_requests(db: Session, user: User):
    """Return a base query scoped to the user's access level."""
    q = db.query(ServiceRequest)
    if user.role == "municipal_admin":
        q = q.filter(ServiceRequest.municipality_id == user.municipality_id)
    elif user.role == "district_admin":
        q = q.filter(ServiceRequest.district_id == user.district_id)
    elif user.role == "staff":
        q = q.filter(ServiceRequest.district_id == user.district_id)
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


@router.get("/requests", response_model=PaginatedRequests)
def list_requests(
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    district_id: Optional[UUID] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_roles(*ALLOWED_ROLES)),
    db: Session = Depends(get_db),
):
    q = _scoped_requests(db, current_user)

    if current_user.role == "staff":
        # staff sees all district requests in "all" view; my_tasks filter done client-side
        pass

    if status:
        q = q.filter(ServiceRequest.status == status)
    if category:
        q = q.filter(ServiceRequest.category == category)
    if priority:
        q = q.filter(ServiceRequest.priority == priority)
    if district_id and current_user.role == "municipal_admin":
        q = q.filter(ServiceRequest.district_id == district_id)

    total = q.count()
    items = (
        q.order_by(ServiceRequest.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
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


@router.post("/requests/{request_id}/assign", response_model=ServiceRequestOut)
def assign_staff(
    request_id: UUID,
    payload: AssignStaffRequest,
    current_user: User = Depends(require_roles("district_admin", "municipal_admin")),
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

    if not can_transition(req.status, payload.status):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot transition from '{req.status}' to '{payload.status}'",
        )

    if payload.status == "rejected" and not (payload.rejection_reason or "").strip():
        raise HTTPException(status_code=422, detail="rejection_reason is required when rejecting")

    if payload.status == "completed" and not (payload.completion_photo_url or "").strip():
        raise HTTPException(status_code=422, detail="completion_photo_url is required when completing")

    now = datetime.now(timezone.utc)
    old_status = req.status
    req.status = payload.status
    req.updated_at = now

    if payload.status in ("completed", "rejected"):
        req.closed_at = now

    if payload.status == "rejected" and payload.rejection_reason:
        req.rejection_reason = payload.rejection_reason

    if payload.status == "completed" and payload.completion_photo_url:
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
    current_user: User = Depends(require_roles("district_admin", "municipal_admin")),
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
    current_user: User = Depends(require_roles(*ALLOWED_ROLES)),
    db: Session = Depends(get_db),
):
    req = _scoped_requests(db, current_user).filter(ServiceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    # Validate size (5 MB)
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 5 MB)")

    ext = os.path.splitext(file.filename or "")[1].lower()
    kind = "photo" if ext in (".jpg", ".jpeg", ".png", ".gif", ".webp") else "document"
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
    _log(db, current_user.id, "upload_attachment", "service_request", req.id, filename)
    db.commit()
    db.refresh(attachment)
    return attachment
