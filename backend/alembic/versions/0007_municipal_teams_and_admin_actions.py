"""municipal teams and responsible team assignment fields

Revision ID: 0007
Revises: 0006
Create Date: 2026-04-02 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "municipal_teams",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("municipality_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("municipalities.id"), nullable=False),
        sa.Column("team_name", sa.String(length=255), nullable=False),
        sa.Column("leader_name", sa.String(length=255), nullable=False),
        sa.Column("leader_phone", sa.String(length=50), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("municipality_id", "team_name", name="uq_municipal_team_name_per_municipality"),
    )

    op.add_column("service_requests", sa.Column("responsible_team_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("service_requests", sa.Column("responsible_team_name", sa.String(length=255), nullable=True))
    op.add_column("service_requests", sa.Column("responsible_team_leader_name", sa.String(length=255), nullable=True))
    op.add_column("service_requests", sa.Column("responsible_team_leader_phone", sa.String(length=50), nullable=True))
    op.create_foreign_key(
        "fk_service_requests_responsible_team_id",
        "service_requests",
        "municipal_teams",
        ["responsible_team_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_service_requests_responsible_team_id", "service_requests", type_="foreignkey")
    op.drop_column("service_requests", "responsible_team_leader_phone")
    op.drop_column("service_requests", "responsible_team_leader_name")
    op.drop_column("service_requests", "responsible_team_name")
    op.drop_column("service_requests", "responsible_team_id")
    op.drop_table("municipal_teams")
