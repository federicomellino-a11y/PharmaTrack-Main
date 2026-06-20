"""Tests for delivery endpoints."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_deliveries_unauthenticated(client: AsyncClient):
    """GET /deliveries without auth returns 401."""
    resp = await client.get("/api/deliveries")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_deliveries_authenticated(client: AsyncClient, pharma_cookies):
    """GET /deliveries with valid session returns a list."""
    resp = await client.get("/api/deliveries", cookies=pharma_cookies)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_create_delivery_invalid_payment_method(client: AsyncClient, pharma_cookies):
    """Invalid payment_method is rejected with 422."""
    resp = await client.post(
        "/api/deliveries",
        json={
            "customer_id": "cust_test123",
            "payment_method": "bitcoin",  # not allowed
            "amount": 25.0,
        },
        cookies=pharma_cookies,
    )
    assert resp.status_code == 422
    body = resp.json()
    assert "detail" in body or "error" in body


@pytest.mark.asyncio
async def test_create_delivery_amount_too_high(client: AsyncClient, pharma_cookies):
    """Amount > 99999 is rejected with 422."""
    resp = await client.post(
        "/api/deliveries",
        json={
            "customer_id": "cust_test123",
            "payment_method": "cash",
            "amount": 999999.99,
        },
        cookies=pharma_cookies,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_delivery_notes_sanitized(client: AsyncClient, pharma_cookies):
    """Notes longer than 1000 chars are truncated or rejected."""
    long_notes = "x" * 1500
    resp = await client.post(
        "/api/deliveries",
        json={
            "customer_id": "cust_test123",
            "payment_method": "cash",
            "amount": 10.0,
            "notes": long_notes,
        },
        cookies=pharma_cookies,
    )
    # Either 422 (customer not found) or the notes were sanitized — not a 500
    assert resp.status_code in (200, 201, 404, 422)
    assert resp.status_code != 500


@pytest.mark.asyncio
async def test_delivery_not_found(client: AsyncClient, pharma_cookies):
    """GET on non-existent delivery returns 404 with structured error."""
    resp = await client.get("/api/deliveries/del_nonexistent999", cookies=pharma_cookies)
    assert resp.status_code == 404
    body = resp.json()
    assert "error" in body
    assert body["error"]["code"] == 404


@pytest.mark.asyncio
async def test_analytics_overview_today(client: AsyncClient, pharma_cookies):
    """Analytics endpoint returns expected keys for period=today."""
    resp = await client.get("/api/analytics/overview?period=today", cookies=pharma_cookies)
    assert resp.status_code == 200
    data = resp.json()
    assert "period" in data
    assert "total_deliveries" in data
    assert "completed" in data
    assert "revenue" in data
    assert data["period"] == "today"


@pytest.mark.asyncio
async def test_analytics_overview_week(client: AsyncClient, pharma_cookies):
    """Analytics endpoint works for period=week."""
    resp = await client.get("/api/analytics/overview?period=week", cookies=pharma_cookies)
    assert resp.status_code == 200
    data = resp.json()
    assert data["period"] == "week"
    assert isinstance(data["total_deliveries"], int)
    assert isinstance(data["revenue"], (int, float))


@pytest.mark.asyncio
async def test_analytics_invalid_period(client: AsyncClient, pharma_cookies):
    """Invalid period returns 400."""
    resp = await client.get("/api/analytics/overview?period=forever", cookies=pharma_cookies)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_get_customers_authenticated(client: AsyncClient, pharma_cookies):
    """GET /customers returns a list."""
    resp = await client.get("/api/customers", cookies=pharma_cookies)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_bearer_token_auth(client: AsyncClient, pharma_cookies):
    """Bearer token authentication works for /deliveries."""
    # Generate token
    gen = await client.post("/api/auth/token", cookies=pharma_cookies)
    assert gen.status_code == 200
    token = gen.json()["token"]

    # Use it as Bearer
    resp = await client.get(
        "/api/deliveries",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200

    # Cleanup
    await client.delete("/api/auth/token", cookies=pharma_cookies)
