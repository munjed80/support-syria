"""initial schema

Revision ID: 0001
Revises:
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enums
    user_role = postgresql.ENUM(
        "citizen", "district_admin", "municipal_admin", "staff",
        name="user_role", create_type=True
    )
    request_category = postgresql.ENUM(
        "lighting", "water", "waste", "roads", "other",
        name="request_category", create_type=True
    )
    priority_level = postgresql.ENUM(
        "low", "normal", "high", "urgent",
        name="priority_level", create_type=True
    )
    request_status = postgresql.ENUM(
        "submitted", "received", "in_progress", "completed", "rejected",
        name="request_status", create_type=True
    )
    sla_status_enum = postgresql.ENUM(
        "met", "at_risk", "breached",
        name="sla_status", create_type=True
    )
    attachment_kind = postgresql.ENUM(
        "photo", "document",
        name="attachment_kind", create_type=True
    )

    for enum in (user_role, request_category, priority_level, request_status,
                 sla_status_enum, attachment_kind):
        enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "municipalities",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "districts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("municipality_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("municipalities.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.Enum(name="user_role"), nullable=False),
        sa.Column("municipality_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("municipalities.id"), nullable=False),
        sa.Column("district_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("districts.id"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "service_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("municipality_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("municipalities.id"), nullable=False),
        sa.Column("district_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("districts.id"), nullable=False),
        sa.Column("category", sa.Enum(name="request_category"), nullable=False),
        sa.Column("priority", sa.Enum(name="priority_level"), nullable=False, server_default="normal"),
        sa.Column("status", sa.Enum(name="request_status"), nullable=False, server_default="submitted"),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("tracking_code", sa.String(16), nullable=False, unique=True),
        sa.Column("location_lat", sa.Float, nullable=True),
        sa.Column("location_lng", sa.Float, nullable=True),
        sa.Column("address_text", sa.Text, nullable=True),
        sa.Column("assigned_to_user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=True),
        sa.Column("assigned_to_name", sa.String(255), nullable=True),
        sa.Column("rejection_reason", sa.Text, nullable=True),
        sa.Column("completion_photo_url", sa.Text, nullable=True),
        sa.Column("priority_escalated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_auto_escalated", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("sla_deadline", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sla_status", sa.Enum(name="sla_status"), nullable=True),
        sa.Column("sla_breached_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_service_requests_tracking_code", "service_requests", ["tracking_code"])

    op.create_table(
        "request_updates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("request_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("service_requests.id"), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=True),
        sa.Column("actor_name", sa.String(255), nullable=True),
        sa.Column("message", sa.Text, nullable=True),
        sa.Column("from_status", sa.Enum(name="request_status"), nullable=True),
        sa.Column("to_status", sa.Enum(name="request_status"), nullable=True),
        sa.Column("from_priority", sa.Enum(name="priority_level"), nullable=True),
        sa.Column("to_priority", sa.Enum(name="priority_level"), nullable=True),
        sa.Column("is_auto_escalation", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("is_internal", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("request_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("service_requests.id"), nullable=False),
        sa.Column("staff_user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("staff_name", sa.String(255), nullable=False),
        sa.Column("assigned_by_user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("assigned_by_name", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "attachments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("request_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("service_requests.id"), nullable=False),
        sa.Column("kind", sa.Enum(name="attachment_kind"), nullable=False, server_default="photo"),
        sa.Column("file_url", sa.Text, nullable=False),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "audit_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(255), nullable=False),
        sa.Column("entity_type", sa.String(100), nullable=False),
        sa.Column("entity_id", sa.String(255), nullable=False),
        sa.Column("details", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("audit_log")
    op.drop_table("attachments")
    op.drop_table("assignments")
    op.drop_table("request_updates")
    op.drop_index("ix_service_requests_tracking_code", table_name="service_requests")
    op.drop_table("service_requests")
    op.drop_table("users")
    op.drop_table("districts")
    op.drop_table("municipalities")

    for name in ("attachment_kind", "sla_status", "request_status",
                 "priority_level", "request_category", "user_role"):
        op.execute(f"DROP TYPE IF EXISTS {name}")
