"""
Seed script – creates Damascus governorate, municipality, districts, and user accounts.
Run: python seed.py

Requires DATABASE_URL to be set (or uses the default from config).
"""
import os
import sys

# Allow running from repo root: python backend/seed.py
sys.path.insert(0, os.path.dirname(__file__))

from app.auth import hash_password
from app.database import SessionLocal, engine
from app.models import Base, District, Governorate, Municipality, ServiceRequest, RequestUpdate, User
from app.sla import get_sla_deadline, calculate_sla_status
from datetime import datetime, timezone
import uuid

Base.metadata.create_all(bind=engine)


def seed():
    db = SessionLocal()
    try:
        if db.query(Governorate).count() > 0:
            print("Database already seeded. Skipping.")
            return

        # Governorate
        gov = Governorate(name="محافظة دمشق", is_active=True)
        db.add(gov)
        db.flush()

        # Municipality
        mun = Municipality(name="بلدية دمشق", governorate_id=gov.id, is_active=True)
        db.add(mun)
        db.flush()

        # Districts (16)
        district_names = [
            "دمر",
            "المزة",
            "كفرسوسة",
            "الميدان",
            "القدم",
            "اليرموك",
            "الشاغور",
            "جوبر",
            "القابون",
            "برزة",
            "ركن الدين",
            "الصالحية",
            "ساروجة",
            "المهاجرين",
            "القنوات",
            "دمشق القديمة",
        ]
        districts = []
        for name in district_names:
            d = District(municipality_id=mun.id, name=name, is_active=True)
            db.add(d)
            districts.append(d)
        db.flush()

        # Users
        users_data = [
            {
                "email": "governor@damascus.sy",
                "password": "gov123",
                "role": "governor",
                "name": "المحافظ - محافظة دمشق",
                "governorate_id": gov.id,
                "municipality_id": None,
                "district_id": None,
            },
            {
                "email": "mayor@damascus.sy",
                "password": "mayor123",
                "role": "mayor",
                "name": "رئيس بلدية دمشق",
                "governorate_id": None,
                "municipality_id": mun.id,
                "district_id": None,
            },
            {
                "email": "mukhtar.damar@damascus.sy",
                "password": "mukhtar123",
                "role": "mukhtar",
                "name": "مختار حي دمر",
                "governorate_id": None,
                "municipality_id": mun.id,
                "district_id": districts[0].id,  # دمر
            },
            {
                "email": "mukhtar.mazzeh@damascus.sy",
                "password": "mukhtar123",
                "role": "mukhtar",
                "name": "مختار حي المزة",
                "governorate_id": None,
                "municipality_id": mun.id,
                "district_id": districts[1].id,  # المزة
            },
            {
                "email": "mukhtar.midan@damascus.sy",
                "password": "mukhtar123",
                "role": "mukhtar",
                "name": "مختار حي الميدان",
                "governorate_id": None,
                "municipality_id": mun.id,
                "district_id": districts[3].id,  # الميدان
            },
        ]

        for u in users_data:
            user = User(
                email=u["email"],
                password_hash=hash_password(u["password"]),
                role=u["role"],
                governorate_id=u["governorate_id"],
                municipality_id=u["municipality_id"],
                district_id=u["district_id"],
                name=u["name"],
            )
            db.add(user)

        db.flush()

        # Sample service requests
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

        db.commit()
        print("✅ تم تهيئة قاعدة البيانات بنجاح.")
        print()
        print("بيانات الدخول:")
        print("  المحافظ     : governor@damascus.sy       / gov123")
        print("  رئيس البلدية: mayor@damascus.sy          / mayor123")
        print("  مختار دمر   : mukhtar.damar@damascus.sy  / mukhtar123")
        print("  مختار المزة : mukhtar.mazzeh@damascus.sy / mukhtar123")
        print("  مختار الميدان: mukhtar.midan@damascus.sy / mukhtar123")

    except Exception as e:
        db.rollback()
        print(f"❌ فشل التهيئة: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
