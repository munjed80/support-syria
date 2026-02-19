import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, Column, DateTime, Enum, ForeignKey,
    Float, String, Text, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Municipality(Base):
    __tablename__ = "municipalities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    districts = relationship("District", back_populates="municipality")
    users = relationship("User", back_populates="municipality")
    service_requests = relationship("ServiceRequest", back_populates="municipality")


class District(Base):
    __tablename__ = "districts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    municipality_id = Column(UUID(as_uuid=True), ForeignKey("municipalities.id"), nullable=False)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    municipality = relationship("Municipality", back_populates="districts")
    users = relationship("User", back_populates="district")
    service_requests = relationship("ServiceRequest", back_populates="district")


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(
        Enum("citizen", "district_admin", "municipal_admin", "staff", name="user_role"),
        nullable=False,
    )
    municipality_id = Column(UUID(as_uuid=True), ForeignKey("municipalities.id"), nullable=False)
    district_id = Column(UUID(as_uuid=True), ForeignKey("districts.id"), nullable=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    municipality = relationship("Municipality", back_populates="users")
    district = relationship("District", back_populates="users")
    audit_logs = relationship("AuditLog", back_populates="actor")


class ServiceRequest(Base):
    __tablename__ = "service_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    municipality_id = Column(UUID(as_uuid=True), ForeignKey("municipalities.id"), nullable=False)
    district_id = Column(UUID(as_uuid=True), ForeignKey("districts.id"), nullable=False)
    category = Column(
        Enum("lighting", "water", "waste", "roads", "other", name="request_category"),
        nullable=False,
    )
    priority = Column(
        Enum("low", "normal", "high", "urgent", name="priority_level"),
        nullable=False,
        default="normal",
    )
    status = Column(
        Enum("submitted", "received", "in_progress", "completed", "rejected", name="request_status"),
        nullable=False,
        default="submitted",
    )
    description = Column(Text, nullable=False)
    tracking_code = Column(String(16), nullable=False, unique=True, index=True)
    location_lat = Column(Float, nullable=True)
    location_lng = Column(Float, nullable=True)
    address_text = Column(Text, nullable=True)
    assigned_to_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    assigned_to_name = Column(String(255), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    completion_photo_url = Column(Text, nullable=True)
    priority_escalated_at = Column(DateTime(timezone=True), nullable=True)
    is_auto_escalated = Column(Boolean, default=False, nullable=False)
    sla_deadline = Column(DateTime(timezone=True), nullable=True)
    sla_status = Column(
        Enum("met", "at_risk", "breached", name="sla_status"),
        nullable=True,
    )
    sla_breached_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
    closed_at = Column(DateTime(timezone=True), nullable=True)

    municipality = relationship("Municipality", back_populates="service_requests")
    district = relationship("District", back_populates="service_requests")
    assigned_to = relationship("User", foreign_keys=[assigned_to_user_id])
    updates = relationship("RequestUpdate", back_populates="request", cascade="all, delete-orphan")
    assignments = relationship("Assignment", back_populates="request", cascade="all, delete-orphan")
    attachments = relationship("Attachment", back_populates="request", cascade="all, delete-orphan")


class RequestUpdate(Base):
    __tablename__ = "request_updates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id = Column(UUID(as_uuid=True), ForeignKey("service_requests.id"), nullable=False)
    actor_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    actor_name = Column(String(255), nullable=True)
    message = Column(Text, nullable=True)
    from_status = Column(
        Enum("submitted", "received", "in_progress", "completed", "rejected", name="request_status"),
        nullable=True,
    )
    to_status = Column(
        Enum("submitted", "received", "in_progress", "completed", "rejected", name="request_status"),
        nullable=True,
    )
    from_priority = Column(
        Enum("low", "normal", "high", "urgent", name="priority_level"),
        nullable=True,
    )
    to_priority = Column(
        Enum("low", "normal", "high", "urgent", name="priority_level"),
        nullable=True,
    )
    is_auto_escalation = Column(Boolean, default=False, nullable=False)
    is_internal = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    request = relationship("ServiceRequest", back_populates="updates")
    actor = relationship("User", foreign_keys=[actor_user_id])


class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id = Column(UUID(as_uuid=True), ForeignKey("service_requests.id"), nullable=False)
    staff_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    staff_name = Column(String(255), nullable=False)
    assigned_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    assigned_by_name = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    request = relationship("ServiceRequest", back_populates="assignments")
    staff = relationship("User", foreign_keys=[staff_user_id])
    assigned_by = relationship("User", foreign_keys=[assigned_by_user_id])


class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id = Column(UUID(as_uuid=True), ForeignKey("service_requests.id"), nullable=False)
    kind = Column(Enum("photo", "document", name="attachment_kind"), nullable=False, default="photo")
    file_url = Column(Text, nullable=False)
    file_name = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    request = relationship("ServiceRequest", back_populates="attachments")


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    action = Column(String(255), nullable=False)
    entity_type = Column(String(100), nullable=False)
    entity_id = Column(String(255), nullable=False)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    actor = relationship("User", back_populates="audit_logs")
