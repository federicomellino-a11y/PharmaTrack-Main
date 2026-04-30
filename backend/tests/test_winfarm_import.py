"""
Winfarm import bridge regression tests.

Covers POST /api/integrations/winfarm/import (pharmacy auth via cookie).

Test cases:
 1. Existing customer matched by phone (fuzzy suffix) -> reuse, customer_created=false
 2. Existing customer matched by name (case-insensitive) -> reuse
 3. New customer when only name provided (no phone match, no name match) -> create
 4. 400 when none of customer_id / customer_phone / customer_name provided
 5. 404 when phone provided but no match AND no name to create
 6. Delivery fields: imported_from='winfarm', external_ref populated, status='da_preparare'
 7. A notification row is created for the pharmacy user

Also verifies the quick regression of Phase-1 flows (double-confirm + shifts)
is still covered by the pre-existing test_pharmatrack.py file and we don't
duplicate those checks here.

Cleanup: every test records inserted delivery_id / created customer_id / notif
ids and removes them at teardown so re-runs stay idempotent.
"""
import os
import time
import uuid
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv
from pathlib import Path

# --- Config ---
load_dotenv(Path("/app/backend/.env"))

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip()
                    break
    except Exception:
        pass
BASE_URL = (BASE_URL or "").rstrip("/")
API = f"{BASE_URL}/api"

PHARMA_EMAIL = "test@farmaciaprova.it"
PHARMA_PASS = "Test1234!"

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
_mongo = MongoClient(MONGO_URL)
mdb = _mongo[DB_NAME]


# --- Cleanup tracking ---
_created_delivery_ids: list[str] = []
_created_customer_ids: list[str] = []
_created_notif_refs: list[str] = []  # delivery_ids used in notif.data


# --- Fixtures ---
@pytest.fixture(scope="module")
def pharma_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": PHARMA_EMAIL, "password": PHARMA_PASS}, timeout=15)
    assert r.status_code == 200, f"Pharmacy login failed: {r.status_code} {r.text}"
    assert "session_token" in s.cookies, "Missing session_token cookie"
    return s


@pytest.fixture(scope="module")
def pharmacy_user_id(pharma_session):
    r = pharma_session.get(f"{API}/auth/me", timeout=10)
    assert r.status_code == 200
    return r.json()["user_id"]


@pytest.fixture(scope="module")
def seed_customer(pharma_session, pharmacy_user_id):
    """Return a pre-existing customer (phone + name) belonging to the pharmacy."""
    doc = mdb.customers.find_one(
        {"pharmacy_id": pharmacy_user_id, "phone": {"$ne": ""}},
        {"_id": 0, "customer_id": 1, "name": 1, "phone": 1},
    )
    assert doc, "Seed data missing: no customer with phone for pharmacy"
    return doc


@pytest.fixture(scope="module", autouse=True)
def _cleanup(pharma_session):
    yield
    # Teardown - remove anything we inserted
    if _created_delivery_ids:
        mdb.deliveries.delete_many({"delivery_id": {"$in": _created_delivery_ids}})
    if _created_customer_ids:
        mdb.customers.delete_many({"customer_id": {"$in": _created_customer_ids}})
    if _created_notif_refs:
        mdb.notifications.delete_many({"data.delivery_id": {"$in": _created_notif_refs}})


# --- Helpers ---
def _do_import(session: requests.Session, payload: dict, expected_status: int = 200):
    r = session.post(f"{API}/integrations/winfarm/import", json=payload, timeout=20)
    assert r.status_code == expected_status, (
        f"winfarm/import expected {expected_status} got {r.status_code}: {r.text}"
    )
    return r


# ================= TESTS =================

class TestWinfarmImport:
    """POST /api/integrations/winfarm/import"""

    # 1) Existing customer by phone -> reuse
    def test_existing_customer_by_phone(self, pharma_session, seed_customer, pharmacy_user_id):
        payload = {
            "telefono": seed_customer["phone"],       # alias for customer_phone
            "importo": 15.50,                          # alias for amount
            "pagamento": "cash",                       # alias for payment_method
            "note": "TEST_WINFARM_PHONE",
            "ricevuta": f"SCO-{uuid.uuid4().hex[:6]}",  # alias for external_ref
        }
        r = _do_import(pharma_session, payload)
        data = r.json()
        _created_delivery_ids.append(data["delivery"]["delivery_id"])
        _created_notif_refs.append(data["delivery"]["delivery_id"])

        assert data["customer_created"] is False, "Should reuse existing customer"
        assert data["customer"]["customer_id"] == seed_customer["customer_id"]
        assert data["delivery"]["customer_id"] == seed_customer["customer_id"]
        assert data["delivery"]["status"] == "da_preparare"
        assert data["delivery"]["imported_from"] == "winfarm"
        assert data["delivery"]["external_ref"] == payload["ricevuta"]
        assert data["delivery"]["amount"] == 15.5
        assert data["delivery"]["payment_method"] == "cash"
        # Sanity: pharmacy-scoped
        assert data["delivery"]["pharmacy_id"] == pharmacy_user_id

        # Verify persistence in DB
        db_doc = mdb.deliveries.find_one({"delivery_id": data["delivery"]["delivery_id"]})
        assert db_doc is not None
        assert db_doc["imported_from"] == "winfarm"
        assert db_doc["status"] == "da_preparare"

    # 1b) Phone suffix match (regex-based): send last N digits of stored phone
    def test_existing_customer_by_phone_suffix(self, pharma_session, seed_customer):
        original = seed_customer["phone"]
        # Current backend logic: regex {digits_input}$ against customer.phone.
        # So input digits MUST be a trailing substring of stored phone.
        suffix = original[-7:]  # last 7 digits - should match stored phone
        payload = {
            "telefono": f"  {suffix}  ",  # whitespace, will be stripped
            "importo": 7.0,
        }
        r = _do_import(pharma_session, payload)
        data = r.json()
        _created_delivery_ids.append(data["delivery"]["delivery_id"])
        _created_notif_refs.append(data["delivery"]["delivery_id"])
        assert data["customer_created"] is False, "Phone suffix should match existing customer"
        assert data["customer"]["customer_id"] == seed_customer["customer_id"]

    # 2) Existing customer by name (case insensitive)
    def test_existing_customer_by_name_case_insensitive(self, pharma_session, seed_customer):
        mixed = seed_customer["name"].swapcase()  # e.g. "Anna Verdi" -> "aNNA vERDI"
        payload = {
            "cliente": mixed,                 # alias for customer_name
            "indirizzo": "Via Test 1",
            "amount": 8.25,
        }
        r = _do_import(pharma_session, payload)
        data = r.json()
        _created_delivery_ids.append(data["delivery"]["delivery_id"])
        _created_notif_refs.append(data["delivery"]["delivery_id"])
        assert data["customer_created"] is False
        assert data["customer"]["customer_id"] == seed_customer["customer_id"]
        assert data["delivery"]["customer_name"] == seed_customer["name"]

    # 3) New customer when only name provided and doesn't match
    def test_new_customer_when_only_unique_name(self, pharma_session, pharmacy_user_id):
        unique_name = f"TEST_WINFARM_{uuid.uuid4().hex[:8].upper()}"
        payload = {
            "customer_name": unique_name,
            "customer_address": "Via Winfarm 42",
            "amount": 22.00,
            "payment_method": "pos",
            "external_ref": "SCO-NEW-001",
        }
        r = _do_import(pharma_session, payload)
        data = r.json()
        _created_delivery_ids.append(data["delivery"]["delivery_id"])
        _created_customer_ids.append(data["customer"]["customer_id"])
        _created_notif_refs.append(data["delivery"]["delivery_id"])

        assert data["customer_created"] is True, "Should create a brand-new customer"
        assert data["customer"]["name"] == unique_name
        assert data["customer"]["pharmacy_id"] == pharmacy_user_id
        assert data["customer"].get("imported_from") == "winfarm"
        assert data["delivery"]["customer_id"] == data["customer"]["customer_id"]
        assert data["delivery"]["customer_address"] == "Via Winfarm 42"
        assert data["delivery"]["payment_method"] == "pos"
        assert data["delivery"]["external_ref"] == "SCO-NEW-001"
        # Verify customer row actually in DB
        db_cust = mdb.customers.find_one({"customer_id": data["customer"]["customer_id"]})
        assert db_cust is not None
        assert db_cust["imported_from"] == "winfarm"

    # 4) 400 when no identifier at all
    def test_400_when_no_customer_identifier(self, pharma_session):
        r = _do_import(pharma_session, {"amount": 5.0}, expected_status=400)
        body = r.json()
        assert "customer_id" in body.get("detail", "")

    # 5) 404 when phone has no match and no name provided
    def test_404_when_phone_no_match_and_no_name(self, pharma_session):
        # Use a phone that surely won't match any customer
        bogus = f"000000{uuid.uuid4().hex[:6]}"  # 12 chars of digits-ish
        # Ensure digits only so regex path triggers and fails
        bogus_digits = "9" * 12
        r = _do_import(
            pharma_session,
            {"customer_phone": bogus_digits, "amount": 3.33},
            expected_status=404,
        )
        body = r.json()
        assert "Cliente non trovato" in body.get("detail", "")

    # 6) Delivery has imported_from + external_ref (covered above but explicit)
    def test_delivery_has_winfarm_metadata(self, pharma_session, seed_customer):
        ext = f"WF-{uuid.uuid4().hex[:8]}"
        r = _do_import(
            pharma_session,
            {"customer_id": seed_customer["customer_id"], "amount": 9.99, "external_ref": ext},
        )
        data = r.json()
        _created_delivery_ids.append(data["delivery"]["delivery_id"])
        _created_notif_refs.append(data["delivery"]["delivery_id"])
        assert data["delivery"]["imported_from"] == "winfarm"
        assert data["delivery"]["external_ref"] == ext
        # also status default
        assert data["delivery"]["status"] == "da_preparare"
        assert data["delivery"]["driver_id"] is None

    # 7) Notification created for the pharmacy
    def test_notification_created(self, pharma_session, seed_customer, pharmacy_user_id):
        r = _do_import(
            pharma_session,
            {"customer_phone": seed_customer["phone"], "amount": 11.11,
             "external_ref": "NOTIF-CHECK"},
        )
        data = r.json()
        del_id = data["delivery"]["delivery_id"]
        _created_delivery_ids.append(del_id)
        _created_notif_refs.append(del_id)

        # Small wait for notification insert to be visible (it's awaited but safe)
        time.sleep(0.3)
        notif = mdb.notifications.find_one({"data.delivery_id": del_id})
        assert notif is not None, "Expected a notification doc for the imported delivery"
        assert notif["user_id"] == pharmacy_user_id
        assert notif["user_type"] == "pharmacy"
        assert "Winfarm" in notif["title"]
        assert notif.get("type") == "delivery"

    # 8) Unauthenticated request must be blocked
    def test_unauthenticated_is_rejected(self):
        r = requests.post(
            f"{API}/integrations/winfarm/import",
            json={"customer_name": "X"},
            timeout=10,
        )
        assert r.status_code in (401, 403), f"Expected 401/403 got {r.status_code}: {r.text}"
