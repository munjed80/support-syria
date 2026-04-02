"""archive and formal reporting fields

Revision ID: 0008
Revises: 0007
Create Date: 2026-04-02 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("service_requests", sa.Column("completion_note", sa.Text(), nullable=True))
    op.add_column("service_requests", sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("service_requests", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("service_requests", sa.Column("archived_by_user_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("service_requests", sa.Column("archive_note", sa.Text(), nullable=True))
    op.create_foreign_key(
        "fk_service_requests_archived_by_user_id",
        "service_requests",
        "users",
        ["archived_by_user_id"],
        ["id"],
    )

    op.add_column("request_updates", sa.Column("event_type", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("request_updates", "event_type")
    op.drop_constraint("fk_service_requests_archived_by_user_id", "service_requests", type_="foreignkey")
    op.drop_column("service_requests", "archive_note")
    op.drop_column("service_requests", "archived_by_user_id")
    op.drop_column("service_requests", "archived_at")
    op.drop_column("service_requests", "is_archived")
    op.drop_column("service_requests", "completion_note")
