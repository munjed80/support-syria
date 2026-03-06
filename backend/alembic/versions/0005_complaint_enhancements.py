"""complaint enhancements: complaint_number, responsible_team, materials_used

Revision ID: 0005
Revises: 0004
Create Date: 2026-03-06 00:00:00.000000

Changes:
  - Add service_requests.complaint_number (varchar 50, nullable, unique)
  - Add service_requests.responsible_team (varchar 50, nullable)
  - Create materials_used table (id, request_id, name, quantity, notes, created_at)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add complaint_number to service_requests
    op.add_column(
        "service_requests",
        sa.Column("complaint_number", sa.String(50), nullable=True),
    )
    op.create_unique_constraint(
        "uq_service_requests_complaint_number",
        "service_requests",
        ["complaint_number"],
    )
    op.create_index(
        "ix_service_requests_complaint_number",
        "service_requests",
        ["complaint_number"],
    )

    # 2. Add responsible_team to service_requests
    op.add_column(
        "service_requests",
        sa.Column("responsible_team", sa.String(50), nullable=True),
    )

    # 3. Create materials_used table
    op.create_table(
        "materials_used",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "request_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("service_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("quantity", sa.String(100), nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_materials_used_request_id",
        "materials_used",
        ["request_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_materials_used_request_id", table_name="materials_used")
    op.drop_table("materials_used")

    op.drop_column("service_requests", "responsible_team")

    op.drop_index(
        "ix_service_requests_complaint_number", table_name="service_requests"
    )
    op.drop_constraint(
        "uq_service_requests_complaint_number",
        "service_requests",
        type_="unique",
    )
    op.drop_column("service_requests", "complaint_number")
