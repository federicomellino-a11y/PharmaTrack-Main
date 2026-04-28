"""Seed test data for PharmaTrack development."""
import asyncio
import os
from datetime import datetime, timezone, timedelta
import uuid
import bcrypt
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

async def main():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    # Pharmacy
    pharmacy_email = "test@farmaciaprova.it"
    pharmacy = await db.users.find_one({"email": pharmacy_email})
    if not pharmacy:
        pharmacy_id = f"user_{uuid.uuid4().hex[:12]}"
        pwd_hash = bcrypt.hashpw("Test1234!".encode(), bcrypt.gensalt()).decode()
        pharmacy = {
            "user_id": pharmacy_id,
            "email": pharmacy_email,
            "role": "pharmacy",
            "name": "Mario Rossi",
            "password_hash": pwd_hash,
            "picture": None,
            "is_active": True,
            "pharmacy_name": "Farmacia Prova",
            "pharmacy_address": "Via Roma 12, Roma",
            "pharmacy_phone": "0612345678",
            "pharmacy_lat": 41.9028,
            "pharmacy_lng": 12.4964,
            "settings": {"notifications_enabled": True, "sound_enabled": True, "driver_tracking_enabled": True},
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(pharmacy)
        print("Created pharmacy:", pharmacy_email)
    pharmacy_id = pharmacy["user_id"]

    # Driver
    driver_email = "luca@fattorino.it"
    driver = await db.drivers.find_one({"email": driver_email})
    if not driver:
        driver_id = f"drv_{uuid.uuid4().hex[:12]}"
        pwd_hash = bcrypt.hashpw("Driver123!".encode(), bcrypt.gensalt()).decode()
        driver = {
            "driver_id": driver_id,
            "pharmacy_id": pharmacy_id,
            "name": "Luca Bianchi",
            "phone": "3331112233",
            "email": driver_email,
            "password_hash": pwd_hash,
            "vehicle_type": "scooter",
            "is_active": True,
            "current_lat": None,
            "current_lng": None,
            "last_location_update": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.drivers.insert_one(driver)
        print("Created driver:", driver_email)
    driver_id = driver["driver_id"]

    # Customers
    customers_data = [
        {"name": "Anna Verdi",   "phone": "3201112222", "address": "Via Milano 5, Roma"},
        {"name": "Giovanni Neri","phone": "3202223333", "address": "Via Napoli 18, Roma"},
        {"name": "Sara Esposito","phone": "3203334444", "address": "Via Torino 9, Roma"},
    ]
    customer_ids = []
    for c in customers_data:
        existing = await db.customers.find_one({"phone": c["phone"], "pharmacy_id": pharmacy_id})
        if existing:
            customer_ids.append(existing["customer_id"])
            continue
        cid = f"cust_{uuid.uuid4().hex[:12]}"
        await db.customers.insert_one({
            "customer_id": cid,
            "pharmacy_id": pharmacy_id,
            "name": c["name"], "phone": c["phone"], "address": c["address"],
            "email": None, "fiscal_code": None, "birth_date": None, "notes": None,
            "customer_lat": 41.9028, "customer_lng": 12.4964,
            "place_id": None, "extra_phones": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        customer_ids.append(cid)
        print("Created customer:", c["name"])

    # Deliveries (only seed if no existing deliveries for this pharmacy)
    existing_count = await db.deliveries.count_documents({"pharmacy_id": pharmacy_id})
    if existing_count == 0:
        statuses = [
            ("da_preparare", None),
            ("pronta", None),
            ("assigned", driver_id),
            ("in_transit", driver_id),
            ("delivered_pending_confirmation", driver_id),  # ← per testare conferma incasso
        ]
        amounts = [12.5, 24.9, 8.0, 35.0, 18.4]
        for idx, ((status, did), amount) in enumerate(zip(statuses, amounts)):
            cid = customer_ids[idx % len(customer_ids)]
            customer = await db.customers.find_one({"customer_id": cid})
            now = datetime.now(timezone.utc)
            doc = {
                "delivery_id": f"del_{uuid.uuid4().hex[:12]}",
                "pharmacy_id": pharmacy_id,
                "customer_id": cid,
                "driver_id": did,
                "customer_name": customer["name"],
                "customer_phone": customer["phone"],
                "customer_address": customer["address"],
                "customer_lat": customer.get("customer_lat"),
                "customer_lng": customer.get("customer_lng"),
                "notes": "Antibiotico + ricetta rossa" if idx == 0 else None,
                "status": status,
                "payment_method": "cash" if idx % 2 == 0 else "pos",
                "amount": amount,
                "amount_given": amount + 5 if idx % 2 == 0 else amount,
                "change_due": 5 if idx % 2 == 0 else 0,
                "payment_collected": False,
                "scheduled_date": None,
                "scheduled_time": None,
                "priority": "high" if idx == 0 else "normal",
                "estimated_delivery": None,
                "actual_delivery": now.isoformat() if status == "delivered_pending_confirmation" else None,
                "delivered_by_driver_at": now.isoformat() if status == "delivered_pending_confirmation" else None,
                "created_at": (now - timedelta(hours=idx)).isoformat(),
                "updated_at": now.isoformat(),
                "auto_assigned": False,
            }
            await db.deliveries.insert_one(doc)
        print(f"Created {len(statuses)} test deliveries")
    else:
        print(f"Deliveries already exist ({existing_count})")

    print("\n✓ Seed completato")
    print(f"  Pharmacy: {pharmacy_email} / Test1234!")
    print(f"  Driver:   {driver_email} / Driver123!")
    print(f"  Admin:    Admin@superadmin.it / Admin1234!")

    client.close()

if __name__ == "__main__":
    asyncio.run(main())
