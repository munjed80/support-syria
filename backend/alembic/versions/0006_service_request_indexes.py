"""Add performance indexes to service_requests

Revision ID: 0006
Revises: 0005
Create Date: 2026-03-07 00:00:00.000000

Changes:
  - Add index on service_requests.district_id
  - Add index on service_requests.municipality_id
  - Add index on service_requests.status
  - Add index on service_requests.priority
  - Add index on service_requests.created_at
  - Add index on service_requests.responsible_team
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_service_requests_district_id",
        "service_requests",
        ["district_id"],
    )
    op.create_index(
        "ix_service_requests_municipality_id",
        "service_requests",
        ["municipality_id"],
    )
    op.create_index(
        "ix_service_requests_status",
        "service_requests",
        ["status"],
    )
    op.create_index(
        "ix_service_requests_priority",
        "service_requests",
        ["priority"],
    )
    op.create_index(
        "ix_service_requests_created_at",
        "service_requests",
        ["created_at"],
    )
    op.create_index(
        "ix_service_requests_responsible_team",
        "service_requests",
        ["responsible_team"],
    )


def downgrade() -> None:
    op.drop_index("ix_service_requests_responsible_team", table_name="service_requests")
    op.drop_index("ix_service_requests_created_at", table_name="service_requests")
    op.drop_index("ix_service_requests_priority", table_name="service_requests")
    op.drop_index("ix_service_requests_status", table_name="service_requests")
    op.drop_index("ix_service_requests_municipality_id", table_name="service_requests")
    op.drop_index("ix_service_requests_district_id", table_name="service_requests")
