"""
Seed script – creates Damascus governorate, municipality, districts, and user accounts.
Run: python seed.py

Requires DATABASE_URL to be set (or uses the default from config).
Set ENVIRONMENT=production to seed only structural data + admin accounts (no demo requests).

Tables are managed by Alembic – run ``alembic upgrade head`` before this script.
"""
import os
import sys

# Allow running from repo root: python backend/seed.py
sys.path.insert(0, os.path.dirname(__file__))

from app.auth import hash_password
from app.database import SessionLocal
from app.models import District, Governorate, Municipality, ServiceRequest, RequestUpdate, User
from app.sla import get_sla_deadline, calculate_sla_status
from datetime import datetime, timezone

IS_PRODUCTION = os.getenv("ENVIRONMENT", "development").lower() == "production"


def _ensure_structural_data(db):
    """Create governorate if it doesn't exist.

    Municipality and districts are NOT seeded – the governor creates them manually.
    Returns (governorate, None, []).
    """
    gov = db.query(Governorate).first()
    if gov is not None:
        print("ℹ️  Governorate already exists. Reusing.")
        return gov, None, []

    # Governorate only
    gov = Governorate(name="محافظة دمشق", is_active=True)
    db.add(gov)
    db.flush()

    print("✅ Governorate created. Municipalities and districts should be added by the governor.")
    return gov, None, []


def _ensure_initial_users(db, gov, mun, districts):
    """Create initial admin/user accounts that are missing.

    Only the governor account is guaranteed to be created.
    Mayor and mukhtar accounts require a municipality and districts to exist
    (created by the governor through the UI).

    Returns the number of newly created users.
    """
    initial_users = [
        {
            "username": "gov_damascus",
            "password": "password123",
            "role": "governor",
            "full_name": "المحافظ - محافظة دمشق",
            "governorate_id": gov.id,
            "municipality_id": None,
            "district_id": None,
        },
    ]

    # Only seed mayor/mukhtar accounts if a municipality and districts exist
    if mun and districts:
        mezzeh = districts[1] if len(districts) > 1 else districts[0]
        initial_users.append({
            "username": "mayor_damascus",
            "password": "password123",
            "role": "mayor",
            "full_name": "رئيس بلدية دمشق",
            "governorate_id": None,
            "municipality_id": mun.id,
            "district_id": None,
        })
        initial_users.append({
            "username": "mukhtar_mezzeh",
            "password": "password123",
            "role": "mukhtar",
            "full_name": "مختار حي المزة",
            "governorate_id": None,
            "municipality_id": mun.id,
            "district_id": mezzeh.id,
        })

        if not IS_PRODUCTION:
            # Development-only accounts
            initial_users += [
                {
                    "username": "mukhtar_damar",
                    "password": "password123",
                    "role": "mukhtar",
                    "full_name": "مختار حي دمر",
                    "governorate_id": None,
                    "municipality_id": mun.id,
                    "district_id": districts[0].id,
                },
                {
                    "username": "mukhtar_midan",
                    "password": "password123",
                    "role": "mukhtar",
                    "full_name": "مختار حي الميدان",
                    "governorate_id": None,
                    "municipality_id": mun.id,
                    "district_id": districts[3].id,
                },
            ]

    existing_usernames = {
        row[0] for row in db.query(User.username).all()
    }

    created = 0
    for u in initial_users:
        if u["username"] in existing_usernames:
            continue
        user = User(
            username=u["username"],
            full_name=u["full_name"],
            password_hash=hash_password(u["password"]),
            role=u["role"],
            governorate_id=u["governorate_id"],
            municipality_id=u["municipality_id"],
            district_id=u["district_id"],
            is_active=True,
            must_change_password=IS_PRODUCTION,
        )
        db.add(user)
        created += 1
        print(f"  + user '{u['username']}' ({u['role']})")

    return created


def seed():
    db = SessionLocal()
    try:
        # Phase 1 – structural data (governorate / municipality / districts)
        gov, mun, districts = _ensure_structural_data(db)

        # Phase 2 – initial user accounts (always checked, idempotent)
        created = _ensure_initial_users(db, gov, mun, districts)
        if created == 0:
            print("ℹ️  All initial users already exist. Nothing to do.")
        else:
            print(f"✅ Created {created} user(s).")

        # Phase 3 – demo service requests (development only, one-time)
        if not IS_PRODUCTION and mun and districts:
            _seed_demo_requests(db, mun, districts)

        db.commit()

        # Print credentials
        print()
        print("بيانات الدخول (اسم المستخدم / كلمة المرور):")
        print("  المحافظ      : gov_damascus     / password123")
        if mun and districts:
            print("  رئيس البلدية : mayor_damascus   / password123")
            print("  مختار المزة  : mukhtar_mezzeh   / password123")
            if not IS_PRODUCTION:
                print("  مختار دمر    : mukhtar_damar    / password123")
                print("  مختار الميدان: mukhtar_midan    / password123")
        else:
            print("  (أنشئ البلديات والأحياء من لوحة المحافظ ثم أضف رؤساء البلديات والمخاتير)")
        if IS_PRODUCTION:
            print()
            print("⚠️  يُنصح بتغيير كلمات المرور بعد أول تسجيل دخول.")

    except Exception as e:
        db.rollback()
        print(f"❌ فشل التهيئة: {e}")
        raise
    finally:
        db.close()


def _seed_demo_requests(db, mun, districts):
    """Create sample service requests (development only, skipped if any exist)."""
    if db.query(ServiceRequest).count() > 0:
        return

    import secrets
    TRACKING_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

    def gen_code():
        return "".join(secrets.choice(TRACKING_CHARS) for _ in range(8))

    sample_requests = [
        {
            "district": districts[0],  # دمر
            "category": "lighting",
            "description": "عمود إنارة مكسور في شارع الوحدة",
            "priority": "high",
            "status": "in_progress",
        },
        {
            "district": districts[1],  # المزة
            "category": "water",
            "description": "تسرب مياه في الرصيف الغربي",
            "priority": "urgent",
            "status": "under_review",
        },
        {
            "district": districts[3],  # الميدان
            "category": "waste",
            "description": "حاويات القمامة لم تُفرغ منذ 3 أيام",
            "priority": "normal",
            "status": "new",
        },
        {
            "district": districts[4],  # القدم
            "category": "roads",
            "description": "حفرة كبيرة في الطريق الرئيسي",
            "priority": "high",
            "status": "new",
        },
    ]

    now = datetime.now(timezone.utc)
    for sr_data in sample_requests:
        dist = sr_data["district"]
        code = gen_code()
        sla_dl = get_sla_deadline(now, sr_data["category"], sr_data["priority"])
        sla_st = calculate_sla_status(now, sr_data["category"], sr_data["priority"],
                                       sr_data["status"], sla_deadline=sla_dl)
        req = ServiceRequest(
            municipality_id=mun.id,
            district_id=dist.id,
            category=sr_data["category"],
            priority=sr_data["priority"],
            status=sr_data["status"],
            description=sr_data["description"],
            tracking_code=code,
            sla_deadline=sla_dl,
            sla_status=sla_st,
        )
        db.add(req)
        db.flush()
        db.add(RequestUpdate(
            request_id=req.id,
            message="تم استلام الطلب",
            to_status="new",
            is_internal=False,
        ))

    print("✅ Demo service requests created.")


if __name__ == "__main__":
    seed()
