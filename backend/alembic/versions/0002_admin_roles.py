"""add governor/mayor/mukhtar roles and governorate hierarchy

Revision ID: 0002
Revises: 0001
Create Date: 2024-01-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create governorates table
    op.create_table(
        "governorates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # 2. Add governorate_id and is_active to municipalities
    op.add_column(
        "municipalities",
        sa.Column("governorate_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("governorates.id"), nullable=True),
    )
    op.add_column(
        "municipalities",
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
    )

    # 3. Add is_active to districts
    op.add_column(
        "districts",
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
    )

    # 4. Extend user_role enum with new values
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'governor'")
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'mayor'")
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'mukhtar'")

    # 5. Add governorate_id to users and make municipality_id nullable
    op.add_column(
        "users",
        sa.Column("governorate_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("governorates.id"), nullable=True),
    )
    op.alter_column("users", "municipality_id", nullable=True)


def downgrade() -> None:
    op.alter_column("users", "municipality_id", nullable=False)
    op.drop_column("users", "governorate_id")
    op.drop_column("districts", "is_active")
    op.drop_column("municipalities", "is_active")
    op.drop_column("municipalities", "governorate_id")
    op.drop_table("governorates")
    # Note: PostgreSQL does not support removing enum values easily
