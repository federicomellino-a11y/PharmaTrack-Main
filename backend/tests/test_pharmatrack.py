"""
PharmaTrack backend regression tests.

Coverage:
- Auth (pharmacy + driver login)
- Deliveries CRUD
- Double-confirmation flow (driver delivered -> delivered_pending_confirmation -> pharmacy confirm/dispute)
- Driver shifts (start/current/close) + pharmacy settle
- Customers / Drivers basic GET
"""
import os
import time
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # Fallback to frontend env file (this script runs in container)
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
DRIVER_EMAIL = "luca@fattorino.it"
DRIVER_PASS = "Driver123!"

# ---- Mongo helper for direct DB inspection ----
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "pharmatrack")
_mongo = MongoClient(MONGO_URL)
mdb = _mongo[DB_NAME]


# ========== Fixtures ==========

@pytest.fixture(scope="session")
def pharma_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": PHARMA_EMAIL, "password": PHARMA_PASS}, timeout=15)
    assert r.status_code == 200, f"Pharmacy login failed: {r.status_code} {r.text}"
    assert "session_token" in s.cookies, "Cookie session_token not set on pharmacy login"
    return s


@pytest.fixture(scope="session")
def driver_session():
    s = requests.Session()
    r = s.post(f"{API}/driver/login", json={"email": DRIVER_EMAIL, "password": DRIVER_PASS}, timeout=15)
    assert r.status_code == 200, f"Driver login failed: {r.status_code} {r.text}"
    assert "driver_session_token" in s.cookies, "Cookie driver_session_token not set on driver login"
    return s


@pytest.fixture(scope="session")
def pharmacy_user(pharma_session):
    r = pharma_session.get(f"{API}/auth/me", timeout=10)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="session")
def driver_user(driver_session):
    r = driver_session.get(f"{API}/driver/me", timeout=10)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="session")
def primary_customer_id(pharma_session):
    r = pharma_session.get(f"{API}/customers", timeout=10)
    assert r.status_code == 200
    customers = r.json()
    assert customers, "No customers in seed data"
    return customers[0]["customer_id"]


@pytest.fixture(scope="session")
def primary_driver_id(driver_user):
    return driver_user["driver_id"]


def _create_delivery(pharma_session, customer_id, driver_id, amount=20.0, payment_method="cash"):
    payload = {
        "customer_id": customer_id,
        "driver_id": driver_id,
        "payment_method": payment_method,
        "amount": amount,
        "amount_given": amount + 5 if payment_method == "cash" else amount,
        "priority": "normal",
        "notes": f"TEST_{uuid.uuid4().hex[:6]}",
    }
    r = pharma_session.post(f"{API}/deliveries", json=payload, timeout=15)
    assert r.status_code == 200, f"Create delivery failed: {r.status_code} {r.text}"
    return r.json()


# ========== AUTH ==========

class TestAuth:
    def test_health(self):
        r = requests.get(f"{API}/health", timeout=10)
        assert r.status_code == 200

    def test_pharmacy_login(self, pharma_session):
        # already logged in by fixture; confirm /auth/me works
        r = pharma_session.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == PHARMA_EMAIL
        assert data["role"] == "pharmacy"
        assert "password_hash" not in data

    def test_pharmacy_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": PHARMA_EMAIL, "password": "wrong"}, timeout=10)
        assert r.status_code == 401

    def test_driver_login(self, driver_session):
        r = driver_session.get(f"{API}/driver/me", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == DRIVER_EMAIL
        assert "password_hash" not in data

    def test_driver_login_wrong_password(self):
        r = requests.post(f"{API}/driver/login", json={"email": DRIVER_EMAIL, "password": "wrong"}, timeout=10)
        assert r.status_code == 401


# ========== CRUD REGRESSION ==========

class TestCRUDRegression:
    def test_get_customers(self, pharma_session):
        r = pharma_session.get(f"{API}/customers", timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_drivers(self, pharma_session):
        r = pharma_session.get(f"{API}/drivers", timeout=10)
        assert r.status_code == 200
        drivers = r.json()
        assert isinstance(drivers, list)
        assert any(d.get("email") == DRIVER_EMAIL for d in drivers)

    def test_get_deliveries(self, pharma_session):
        r = pharma_session.get(f"{API}/deliveries", timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_update_delete_delivery(self, pharma_session, primary_customer_id, primary_driver_id):
        # CREATE
        delivery = _create_delivery(pharma_session, primary_customer_id, primary_driver_id, amount=10.0, payment_method="pos")
        delivery_id = delivery["delivery_id"]
        assert delivery["customer_id"] == primary_customer_id
        assert delivery["driver_id"] == primary_driver_id
        # status assigned because driver was passed
        assert delivery["status"] == "assigned"

        # GET single
        r = pharma_session.get(f"{API}/deliveries/{delivery_id}", timeout=10)
        assert r.status_code == 200
        assert r.json()["delivery_id"] == delivery_id

        # UPDATE - change priority + notes
        r = pharma_session.put(f"{API}/deliveries/{delivery_id}", json={"priority": "high", "notes": "TEST_updated"}, timeout=10)
        assert r.status_code == 200
        # Verify persistence
        r = pharma_session.get(f"{API}/deliveries/{delivery_id}", timeout=10)
        assert r.json()["priority"] == "high"
        assert r.json()["notes"] == "TEST_updated"

        # DELETE
        r = pharma_session.delete(f"{API}/deliveries/{delivery_id}", timeout=10)
        assert r.status_code == 200
        # Confirm gone
        r = pharma_session.get(f"{API}/deliveries/{delivery_id}", timeout=10)
        assert r.status_code == 404


# ========== DOUBLE CONFIRMATION FLOW ==========

class TestDoubleConfirmFlow:
    def test_driver_delivered_becomes_pending_confirmation(self, pharma_session, driver_session, primary_customer_id, primary_driver_id):
        # Setup: create new delivery assigned to driver
        delivery = _create_delivery(pharma_session, primary_customer_id, primary_driver_id, amount=30.0, payment_method="cash")
        delivery_id = delivery["delivery_id"]

        # Driver marks delivered
        r = driver_session.put(f"{API}/driver/deliveries/{delivery_id}/status", json={"status": "delivered"}, timeout=10)
        assert r.status_code == 200, f"driver mark delivered failed: {r.text}"
        body = r.json()
        # CRITICAL: API response must use delivered_pending_confirmation, NOT delivered
        assert body["status"] == "delivered_pending_confirmation", f"Expected pending_confirmation, got {body['status']}"
        assert body.get("delivered_by_driver_at") is not None
        assert body.get("actual_delivery") is not None

        # Verify in DB directly
        db_doc = mdb.deliveries.find_one({"delivery_id": delivery_id})
        assert db_doc is not None
        assert db_doc["status"] == "delivered_pending_confirmation", f"DB status: {db_doc['status']}"

        # Pharmacy GET active should still include it
        r = pharma_session.get(f"{API}/deliveries?status=active", timeout=10)
        assert r.status_code == 200
        ids_active = [d["delivery_id"] for d in r.json()]
        assert delivery_id in ids_active, "Delivery in pending_confirmation should still appear under 'active'"

        # Pharmacy GET pending_confirmation should include it
        r = pharma_session.get(f"{API}/deliveries?status=pending_confirmation", timeout=10)
        assert r.status_code == 200
        ids_pending = [d["delivery_id"] for d in r.json()]
        assert delivery_id in ids_pending

        # Pharmacy confirm payment
        r = pharma_session.post(
            f"{API}/deliveries/{delivery_id}/confirm-payment",
            json={"confirmed_amount": 30.0, "note": "OK"},
            timeout=10,
        )
        assert r.status_code == 200, f"confirm-payment failed: {r.text}"
        confirmed = r.json()
        assert confirmed["status"] == "delivered"
        assert confirmed["payment_collected"] is True
        assert confirmed.get("payment_confirmed_at") is not None
        assert confirmed.get("confirmed_amount") == 30.0
        assert confirmed.get("confirm_note") == "OK"

        # After confirmation, must NOT appear under active
        r = pharma_session.get(f"{API}/deliveries?status=active", timeout=10)
        ids_active = [d["delivery_id"] for d in r.json()]
        assert delivery_id not in ids_active

        # Cleanup
        pharma_session.delete(f"{API}/deliveries/{delivery_id}")

    def test_dispute_payment_keeps_pending(self, pharma_session, driver_session, primary_customer_id, primary_driver_id):
        delivery = _create_delivery(pharma_session, primary_customer_id, primary_driver_id, amount=40.0, payment_method="cash")
        delivery_id = delivery["delivery_id"]
        # Driver delivers
        r = driver_session.put(f"{API}/driver/deliveries/{delivery_id}/status", json={"status": "delivered"}, timeout=10)
        assert r.status_code == 200
        assert r.json()["status"] == "delivered_pending_confirmation"

        # Pharmacy disputes
        r = pharma_session.post(
            f"{API}/deliveries/{delivery_id}/dispute-payment",
            json={"reason": "manca 5 euro"},
            timeout=10,
        )
        assert r.status_code == 200, f"dispute failed: {r.text}"
        body = r.json()
        assert body["status"] == "delivered_pending_confirmation"
        assert body.get("payment_dispute") is True
        assert body.get("payment_dispute_reason") == "manca 5 euro"
        assert body.get("payment_collected") is False

        # Cleanup
        pharma_session.delete(f"{API}/deliveries/{delivery_id}")


# ========== DRIVER SHIFTS ==========

class TestDriverShifts:
    @pytest.fixture(autouse=True)
    def _close_open_shifts(self, driver_session, primary_driver_id):
        """Ensure no open shift before each test."""
        # Forcibly mark any open shift as closed in DB
        mdb.driver_shifts.update_many(
            {"driver_id": primary_driver_id, "status": "open"},
            {"$set": {"status": "settled"}}
        )
        yield
        mdb.driver_shifts.update_many(
            {"driver_id": primary_driver_id, "status": "open"},
            {"$set": {"status": "settled"}}
        )

    def test_start_shift_returns_open(self, driver_session):
        r = driver_session.post(f"{API}/driver/shifts/start", json={}, timeout=10)
        assert r.status_code == 200, f"start shift failed: {r.text}"
        data = r.json()
        assert "shift" in data
        shift = data["shift"]
        assert shift["status"] == "open"
        assert "shift_id" in shift
        assert "totals" in shift

    def test_current_shift(self, driver_session):
        # Start one
        driver_session.post(f"{API}/driver/shifts/start", json={}, timeout=10)
        r = driver_session.get(f"{API}/driver/shifts/current", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["shift"] is not None
        assert data["shift"]["status"] == "open"

    def test_full_shift_lifecycle(self, pharma_session, driver_session, primary_customer_id, primary_driver_id):
        # 1) Start shift
        r = driver_session.post(f"{API}/driver/shifts/start", json={}, timeout=10)
        assert r.status_code == 200
        shift_id = r.json()["shift"]["shift_id"]

        # 2) Create delivery + driver delivers it (cash)
        d1 = _create_delivery(pharma_session, primary_customer_id, primary_driver_id, amount=25.0, payment_method="cash")
        time.sleep(0.5)
        r = driver_session.put(f"{API}/driver/deliveries/{d1['delivery_id']}/status", json={"status": "delivered"}, timeout=10)
        assert r.status_code == 200
        assert r.json()["status"] == "delivered_pending_confirmation"

        # 3) Verify shift current includes the delivery
        r = driver_session.get(f"{API}/driver/shifts/current", timeout=10)
        assert r.status_code == 200
        shift_now = r.json()["shift"]
        assert d1["delivery_id"] in (shift_now.get("delivery_ids") or [])

        # 4) Driver close shift
        r = driver_session.post(f"{API}/driver/shifts/close", json={"declared_cash": 25.0, "note": "fine giro"}, timeout=10)
        assert r.status_code == 200, f"close shift failed: {r.text}"
        shift = r.json()["shift"]
        assert shift["status"] == "closed_by_driver"
        totals = shift.get("totals", {})
        assert totals.get("delivered_count", 0) >= 1
        assert totals.get("cash_total", 0) >= 25.0

        # 5) Pharmacy GET shifts
        r = pharma_session.get(f"{API}/shifts", timeout=10)
        assert r.status_code == 200
        ids = [s["shift_id"] for s in r.json()]
        assert shift_id in ids

        # 6) Pharmacy GET shift detail
        r = pharma_session.get(f"{API}/shifts/{shift_id}", timeout=10)
        assert r.status_code == 200
        detail = r.json()
        assert detail["shift_id"] == shift_id
        assert "deliveries" in detail
        deliv_ids = [d["delivery_id"] for d in detail["deliveries"]]
        assert d1["delivery_id"] in deliv_ids

        # 7) Pharmacy settle shift with confirm_all_deliveries=True
        r = pharma_session.post(
            f"{API}/shifts/{shift_id}/settle",
            json={"confirmed_cash": 25.0, "note": "OK", "confirm_all_deliveries": True},
            timeout=10,
        )
        assert r.status_code == 200, f"settle failed: {r.text}"
        settled = r.json()
        assert settled["status"] == "settled"
        assert settled.get("confirmed_cash") == 25.0
        assert settled.get("expected_cash") == 25.0
        assert settled.get("discrepancy") == 0.0

        # 8) Verify the pending delivery has been auto-confirmed
        r = pharma_session.get(f"{API}/deliveries/{d1['delivery_id']}", timeout=10)
        assert r.status_code == 200
        d_after = r.json()
        assert d_after["status"] == "delivered", f"Expected delivered, got {d_after['status']}"
        assert d_after.get("payment_collected") is True
        assert d_after.get("payment_confirmed_via_shift") == shift_id

        # Cleanup
        pharma_session.delete(f"{API}/deliveries/{d1['delivery_id']}")


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-v", "--tb=short"]))
