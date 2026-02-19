import os
import string
import secrets
import uuid
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import District, RequestUpdate, ServiceRequest
from app.schemas import (
    DistrictOut,
    PublicCitizenUpdate,
    PublicSubmitRequest,
    ServiceRequestDetail,
    ServiceRequestOut,
)
from app.sla import calculate_sla_status, get_sla_deadline

settings = get_settings()
router = APIRouter(prefix="/public", tags=["public"])
limiter = Limiter(key_func=get_remote_address)

TRACKING_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


@router.get("/districts", response_model=list[DistrictOut])
def list_districts(db: Session = Depends(get_db)):
    """Return all districts (used by the public submission form)."""
    return db.query(District).order_by(District.name).all()


def _generate_tracking_code(length: int = 8) -> str:
    return "".join(secrets.choice(TRACKING_CHARS) for _ in range(length))


@router.post("/requests", response_model=ServiceRequestOut, status_code=201)
@limiter.limit(f"{settings.rate_limit_per_hour}/hour")
def submit_request(
    request: Request,
    payload: PublicSubmitRequest,
    db: Session = Depends(get_db),
):
    district = db.query(District).filter(District.id == payload.district_id).first()
    if not district:
        raise HTTPException(status_code=404, detail="District not found")

    # Generate unique tracking code
    for _ in range(10):
        code = _generate_tracking_code()
        if not db.query(ServiceRequest).filter(ServiceRequest.tracking_code == code).first():
            break
    else:
        raise HTTPException(status_code=500, detail="Could not generate unique tracking code")

    now = datetime.now(timezone.utc)
    sla_deadline = get_sla_deadline(now, payload.category, "normal")
    sla_status = calculate_sla_status(now, payload.category, "normal", "submitted",
                                       sla_deadline=sla_deadline)

    new_req = ServiceRequest(
        municipality_id=district.municipality_id,
        district_id=district.id,
        category=payload.category,
        priority="normal",
        status="submitted",
        description=payload.description,
        tracking_code=code,
        address_text=payload.address_text,
        location_lat=payload.location_lat,
        location_lng=payload.location_lng,
        sla_deadline=sla_deadline,
        sla_status=sla_status,
    )
    db.add(new_req)
    db.flush()  # get new_req.id

    db.add(RequestUpdate(
        request_id=new_req.id,
        message="تم استلام الطلب",
        to_status="submitted",
        is_internal=False,
    ))
    db.commit()
    db.refresh(new_req)
    return new_req


@router.get("/requests/{tracking_code}", response_model=ServiceRequestDetail)
def track_request(tracking_code: str, db: Session = Depends(get_db)):
    req = db.query(ServiceRequest).filter(
        ServiceRequest.tracking_code == tracking_code.upper()
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Tracking code not found")

    # Filter out internal updates before returning
    req.updates = [u for u in req.updates if not u.is_internal]
    return req


@router.post("/requests/{tracking_code}/update", response_model=ServiceRequestDetail)
@limiter.limit(f"{settings.rate_limit_per_hour}/hour")
def citizen_update(
    request: Request,
    tracking_code: str,
    payload: PublicCitizenUpdate,
    db: Session = Depends(get_db),
):
    req = db.query(ServiceRequest).filter(
        ServiceRequest.tracking_code == tracking_code.upper()
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Tracking code not found")

    db.add(RequestUpdate(
        request_id=req.id,
        message=payload.message,
        is_internal=False,
    ))
    db.commit()
    db.refresh(req)

    req.updates = [u for u in req.updates if not u.is_internal]
    return req
