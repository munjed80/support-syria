"""new status workflow and attachment kind update

Revision ID: 0003
Revises: 0002
Create Date: 2024-01-03 00:00:00.000000

Migrates:
  - request_status enum: submitted→new, received→under_review,
    completed→resolved, adds deferred
  - attachment_kind enum: photo→before, document→other, adds after

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. request_status enum ───────────────────────────────────────────────
    # PostgreSQL doesn't allow removing enum values, so we:
    # a) rename old type, b) create new type, c) migrate columns, d) drop old

    # Rename existing enum type
    op.execute("ALTER TYPE request_status RENAME TO request_status_old")

    # Create new enum type with updated values
    op.execute(
        "CREATE TYPE request_status AS ENUM "
        "('new', 'under_review', 'in_progress', 'resolved', 'rejected', 'deferred')"
    )

    # Migrate service_requests.status
    op.execute(
        "ALTER TABLE service_requests "
        "ALTER COLUMN status TYPE request_status "
        "USING CASE status::text "
        "  WHEN 'submitted'  THEN 'new'::request_status "
        "  WHEN 'received'   THEN 'under_review'::request_status "
        "  WHEN 'in_progress' THEN 'in_progress'::request_status "
        "  WHEN 'completed'  THEN 'resolved'::request_status "
        "  WHEN 'rejected'   THEN 'rejected'::request_status "
        "  ELSE 'new'::request_status END"
    )

    # Migrate request_updates.from_status
    op.execute(
        "ALTER TABLE request_updates "
        "ALTER COLUMN from_status TYPE request_status "
        "USING CASE from_status::text "
        "  WHEN 'submitted'  THEN 'new'::request_status "
        "  WHEN 'received'   THEN 'under_review'::request_status "
        "  WHEN 'in_progress' THEN 'in_progress'::request_status "
        "  WHEN 'completed'  THEN 'resolved'::request_status "
        "  WHEN 'rejected'   THEN 'rejected'::request_status "
        "  ELSE NULL END"
    )

    # Migrate request_updates.to_status
    op.execute(
        "ALTER TABLE request_updates "
        "ALTER COLUMN to_status TYPE request_status "
        "USING CASE to_status::text "
        "  WHEN 'submitted'  THEN 'new'::request_status "
        "  WHEN 'received'   THEN 'under_review'::request_status "
        "  WHEN 'in_progress' THEN 'in_progress'::request_status "
        "  WHEN 'completed'  THEN 'resolved'::request_status "
        "  WHEN 'rejected'   THEN 'rejected'::request_status "
        "  ELSE NULL END"
    )

    # Drop old enum type
    op.execute("DROP TYPE request_status_old")

    # ── 2. attachment_kind enum ──────────────────────────────────────────────
    op.execute("ALTER TYPE attachment_kind RENAME TO attachment_kind_old")

    op.execute(
        "CREATE TYPE attachment_kind AS ENUM ('before', 'after', 'other')"
    )

    op.execute(
        "ALTER TABLE attachments "
        "ALTER COLUMN kind TYPE attachment_kind "
        "USING CASE kind::text "
        "  WHEN 'photo'    THEN 'before'::attachment_kind "
        "  WHEN 'document' THEN 'other'::attachment_kind "
        "  ELSE 'other'::attachment_kind END"
    )

    op.execute("DROP TYPE attachment_kind_old")


def downgrade() -> None:
    # ── attachment_kind: revert ──────────────────────────────────────────────
    op.execute("ALTER TYPE attachment_kind RENAME TO attachment_kind_new")
    op.execute(
        "CREATE TYPE attachment_kind AS ENUM ('photo', 'document')"
    )
    op.execute(
        "ALTER TABLE attachments "
        "ALTER COLUMN kind TYPE attachment_kind "
        "USING CASE kind::text "
        "  WHEN 'before' THEN 'photo'::attachment_kind "
        "  WHEN 'after'  THEN 'photo'::attachment_kind "
        "  ELSE 'document'::attachment_kind END"
    )
    op.execute("DROP TYPE attachment_kind_new")

    # ── request_status: revert ───────────────────────────────────────────────
    op.execute("ALTER TYPE request_status RENAME TO request_status_new")
    op.execute(
        "CREATE TYPE request_status AS ENUM "
        "('submitted', 'received', 'in_progress', 'completed', 'rejected')"
    )
    op.execute(
        "ALTER TABLE service_requests "
        "ALTER COLUMN status TYPE request_status "
        "USING CASE status::text "
        "  WHEN 'new'          THEN 'submitted'::request_status "
        "  WHEN 'under_review' THEN 'received'::request_status "
        "  WHEN 'in_progress'  THEN 'in_progress'::request_status "
        "  WHEN 'resolved'     THEN 'completed'::request_status "
        "  WHEN 'rejected'     THEN 'rejected'::request_status "
        "  WHEN 'deferred'     THEN 'in_progress'::request_status "
        "  ELSE 'submitted'::request_status END"
    )
    op.execute(
        "ALTER TABLE request_updates "
        "ALTER COLUMN from_status TYPE request_status "
        "USING CASE from_status::text "
        "  WHEN 'new'          THEN 'submitted'::request_status "
        "  WHEN 'under_review' THEN 'received'::request_status "
        "  WHEN 'in_progress'  THEN 'in_progress'::request_status "
        "  WHEN 'resolved'     THEN 'completed'::request_status "
        "  WHEN 'rejected'     THEN 'rejected'::request_status "
        "  ELSE NULL END"
    )
    op.execute(
        "ALTER TABLE request_updates "
        "ALTER COLUMN to_status TYPE request_status "
        "USING CASE to_status::text "
        "  WHEN 'new'          THEN 'submitted'::request_status "
        "  WHEN 'under_review' THEN 'received'::request_status "
        "  WHEN 'in_progress'  THEN 'in_progress'::request_status "
        "  WHEN 'resolved'     THEN 'completed'::request_status "
        "  WHEN 'rejected'     THEN 'rejected'::request_status "
        "  ELSE NULL END"
    )
    op.execute("DROP TYPE request_status_new")
