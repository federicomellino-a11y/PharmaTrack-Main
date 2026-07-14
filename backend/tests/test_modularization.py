"""
FASE 2 + FASE 4 tests: Swagger/OpenAPI, standardized errors, admin login,
and the analytics endpoint (with cache-hit consistency).

Note: the login rate limiter (10/minute per IP) is NOT exercised here to avoid
blocking the rest of the suite; it is verified separately via curl.
"""
import os
import requests

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
ADMIN_EMAIL = "Admin@superadmin.it"
ADMIN_PASS = "Admin"


def _pharma_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": PHARMA_EMAIL, "password": PHARMA_PASS}, timeout=15)
    assert r.status_code == 200, f"Pharmacy login failed: {r.status_code} {r.text}"
    return s


# ---------- FASE 2: Swagger ----------

def test_swagger_docs_reachable():
    r = requests.get(f"{API}/docs", timeout=15)
    assert r.status_code == 200


def test_openapi_metadata():
    r = requests.get(f"{API}/openapi.json", timeout=15)
    assert r.status_code == 200
    spec = r.json()
    assert spec["info"]["title"] == "PharmaTrack API"
    assert spec["info"]["version"]
    tag_names = {t["name"] for t in spec.get("tags", [])}
    assert {"auth", "deliveries", "shifts", "analytics"}.issubset(tag_names)
    assert len(spec["paths"]) > 50


# ---------- FASE 2: Standardized errors ----------

def test_unauthenticated_returns_401_detail():
    r = requests.get(f"{API}/auth/me", timeout=15)
    assert r.status_code == 401
    assert "detail" in r.json()


def test_validation_error_422():
    r = requests.post(f"{API}/auth/login", json={"email": "x@x.it"}, timeout=15)  # missing password
    assert r.status_code == 422
    assert "detail" in r.json()


# ---------- Admin login ----------

def test_admin_login_and_overview():
    s = requests.Session()
    r = s.post(f"{API}/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    r2 = s.get(f"{API}/admin/overview", timeout=15)
    assert r2.status_code == 200
    assert isinstance(r2.json(), dict)


# ---------- FASE 4: Analytics + cache ----------

def test_analytics_shape_and_cache():
    s = _pharma_session()
    r1 = s.get(f"{API}/analytics?period=month", timeout=20)
    assert r1.status_code == 200
    data = r1.json()
    for key in ["summary", "payment_split", "daily_revenue", "top_customers", "driver_performance"]:
        assert key in data, f"Missing analytics key: {key}"
    for key in ["total_revenue", "delivered_count", "completion_rate", "avg_order_value"]:
        assert key in data["summary"]
    # Second call should hit cache and be identical
    r2 = s.get(f"{API}/analytics?period=month", timeout=20)
    assert r2.status_code == 200
    assert r2.json() == data
