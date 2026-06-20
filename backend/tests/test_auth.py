"""Tests for authentication endpoints."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    """Health endpoint returns 200."""
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("status") == "ok"


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    """Wrong password returns 401 with structured error."""
    resp = await client.post(
        "/api/auth/login",
        json={"email": "test@farmaciaprova.it", "password": "WrongPass999!"},
    )
    assert resp.status_code == 401
    body = resp.json()
    # Custom exception handler wraps in {error: {...}}
    assert "error" in body
    assert body["error"]["code"] == 401


@pytest.mark.asyncio
async def test_login_missing_fields(client: AsyncClient):
    """Missing fields returns 422."""
    resp = await client.post("/api/auth/login", json={"email": "only@email.com"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_me_unauthenticated(client: AsyncClient):
    """/auth/me without session returns 401."""
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_success_sets_cookie(client: AsyncClient, pharma_cookies):
    """Successful login sets session_token cookie and returns user data."""
    assert pharma_cookies.get("session_token"), "session_token cookie must be set"


@pytest.mark.asyncio
async def test_me_authenticated(client: AsyncClient, pharma_cookies):
    """/auth/me with valid session returns user object."""
    resp = await client.get("/api/auth/me", cookies=pharma_cookies)
    assert resp.status_code == 200
    data = resp.json()
    assert "user_id" in data
    assert "email" in data
    assert "password_hash" not in data  # must be stripped


@pytest.mark.asyncio
async def test_rate_limit_login(client: AsyncClient):
    """Login rate limiter blocks after 5 consecutive failures from same IP."""
    for _ in range(5):
        await client.post(
            "/api/auth/login",
            json={"email": "victim@test.it", "password": "wrong"},
        )
    resp = await client.post(
        "/api/auth/login",
        json={"email": "victim@test.it", "password": "wrong"},
    )
    # slowapi returns 429 after limit is exceeded
    assert resp.status_code == 429


@pytest.mark.asyncio
async def test_api_token_no_token(client: AsyncClient, pharma_cookies):
    """GET /auth/token with no token returns 404."""
    # First revoke any existing token
    await client.delete("/api/auth/token", cookies=pharma_cookies)
    resp = await client.get("/api/auth/token", cookies=pharma_cookies)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_api_token_generate_and_revoke(client: AsyncClient, pharma_cookies):
    """Generate token, read it back, then revoke it."""
    gen = await client.post("/api/auth/token", cookies=pharma_cookies)
    assert gen.status_code == 200
    token_data = gen.json()
    assert token_data["token"].startswith("pt_")
    assert "created_at" in token_data

    # Read it back
    get_resp = await client.get("/api/auth/token", cookies=pharma_cookies)
    assert get_resp.status_code == 200

    # Revoke
    del_resp = await client.delete("/api/auth/token", cookies=pharma_cookies)
    assert del_resp.status_code == 200
    assert del_resp.json()["revoked"] is True

    # Confirm it's gone
    after = await client.get("/api/auth/token", cookies=pharma_cookies)
    assert after.status_code == 404
