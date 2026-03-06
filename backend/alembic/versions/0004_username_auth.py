"""switch to username-based auth

Revision ID: 0004
Revises: 0003
Create Date: 2024-01-04 00:00:00.000000

Changes:
  - Add users.username (unique, indexed, NOT NULL) – backfilled from email or 'user_<id>'
  - Rename users.name → users.full_name
  - Add users.is_active (boolean, default true)
  - Add users.created_by_user_id (FK users.id, nullable)
  - Add users.must_change_password (boolean, default true)
  - Drop users.email (no longer needed)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Rename users.name → users.full_name
    op.alter_column("users", "name", new_column_name="full_name")

    # 2. Add username column (nullable first, fill, then make NOT NULL + unique)
    op.add_column(
        "users",
        sa.Column("username", sa.String(255), nullable=True),
    )

    # Back-fill: derive username from email (part before @), fallback to 'user_<short_id>'
    op.execute(
        """
        UPDATE users
        SET username = COALESCE(
            CASE WHEN email IS NOT NULL AND email <> '' THEN split_part(email, '@', 1) ELSE NULL END,
            'user_' || left(id::text, 8)
        )
        WHERE username IS NULL
        """
    )

    op.alter_column("users", "username", nullable=False)
    op.create_unique_constraint("uq_users_username", "users", ["username"])
    op.create_index("ix_users_username", "users", ["username"])

    # 3. Add is_active
    op.add_column(
        "users",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
    )

    # 4. Add created_by_user_id
    op.add_column(
        "users",
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
    )

    # 5. Add must_change_password
    op.add_column(
        "users",
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default="true"),
    )

    # 6. Drop email column (no longer used for auth)
    op.drop_column("users", "email")


def downgrade() -> None:
    # Re-add email column (nullable to avoid constraint issues)
    op.add_column(
        "users",
        sa.Column("email", sa.String(255), nullable=True),
    )
    # Restore email from username (best-effort)
    op.execute("UPDATE users SET email = username || '@restored.local'")
    op.alter_column("users", "email", nullable=False)

    op.drop_column("users", "must_change_password")
    op.drop_column("users", "created_by_user_id")
    op.drop_column("users", "is_active")

    op.drop_index("ix_users_username", table_name="users")
    op.drop_constraint("uq_users_username", "users", type_="unique")
    op.drop_column("users", "username")

    op.alter_column("users", "full_name", new_column_name="name")
