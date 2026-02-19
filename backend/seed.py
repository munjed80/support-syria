"""
Seed script – creates default municipality, districts, and user accounts.
Run: python seed.py

Requires DATABASE_URL to be set (or uses the default from config).
"""
import os
import sys

# Allow running from repo root: python backend/seed.py
sys.path.insert(0, os.path.dirname(__file__))

from app.auth import hash_password
from app.database import SessionLocal, engine
from app.models import Base, District, Municipality, ServiceRequest, RequestUpdate, User
from app.sla import get_sla_deadline, calculate_sla_status
from datetime import datetime, timezone
import uuid

Base.metadata.create_all(bind=engine)


def seed():
    db = SessionLocal()
    try:
        if db.query(Municipality).count() > 0:
            print("Database already seeded. Skipping.")
            return

        # Municipality
        mun = Municipality(name="بلدية الرياض")
        db.add(mun)
        db.flush()

        # Districts
        district_names = [
            "حي العليا",
            "حي الملز",
            "حي النسيم",
            "حي الربوة",
            "حي السليمانية",
        ]
        districts = []
        for name in district_names:
            d = District(municipality_id=mun.id, name=name)
            db.add(d)
            districts.append(d)
        db.flush()

        # Users
        users_data = [
            {
                "email": "admin@mun.sa",
                "password": "admin123",
                "role": "municipal_admin",
                "name": "أحمد المدير العام",
                "district_id": None,
            },
            {
                "email": "district1@mun.sa",
                "password": "pass123",
                "role": "district_admin",
                "name": "خالد مدير حي العليا",
                "district_id": districts[0].id,
            },
            {
                "email": "district2@mun.sa",
                "password": "pass123",
                "role": "district_admin",
                "name": "عبدالله مدير حي الملز",
                "district_id": districts[1].id,
            },
            {
                "email": "staff1@mun.sa",
                "password": "staff123",
                "role": "staff",
                "name": "محمد الفني - العليا",
                "district_id": districts[0].id,
            },
            {
                "email": "staff2@mun.sa",
                "password": "staff123",
                "role": "staff",
                "name": "سعد الفني - الملز",
                "district_id": districts[1].id,
            },
        ]

        for u in users_data:
            user = User(
                email=u["email"],
                password_hash=hash_password(u["password"]),
                role=u["role"],
                municipality_id=mun.id,
                district_id=u["district_id"],
                name=u["name"],
            )
            db.add(user)

        db.flush()

        # Sample service requests
        sample_requests = [
            {
                "district": districts[0],
                "category": "lighting",
                "description": "عمود إنارة مكسور في شارع الملك فهد",
                "priority": "high",
                "status": "in_progress",
            },
            {
                "district": districts[0],
                "category": "water",
                "description": "تسرب مياه في الرصيف",
                "priority": "urgent",
                "status": "received",
            },
            {
                "district": districts[1],
                "category": "waste",
                "description": "حاويات القمامة لم تُفرغ منذ 3 أيام",
                "priority": "normal",
                "status": "submitted",
            },
            {
                "district": districts[1],
                "category": "roads",
                "description": "حفرة كبيرة في الطريق الرئيسي",
                "priority": "high",
                "status": "submitted",
            },
        ]

        import secrets
        TRACKING_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

        def gen_code():
            return "".join(secrets.choice(TRACKING_CHARS) for _ in range(8))

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
                to_status="submitted",
                is_internal=False,
            ))

        db.commit()
        print("✅ Database seeded successfully.")
        print()
        print("Default credentials:")
        print("  Municipal Admin : admin@mun.sa        / admin123")
        print("  District Admin 1: district1@mun.sa    / pass123")
        print("  District Admin 2: district2@mun.sa    / pass123")
        print("  Staff 1         : staff1@mun.sa       / staff123")
        print("  Staff 2         : staff2@mun.sa       / staff123")

    except Exception as e:
        db.rollback()
        print(f"❌ Seeding failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
