"""Tests for analytics and CSV export endpoints."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_analytics_overview_today(client: AsyncClient, pharma_cookies):
    resp = await client.get("/api/analytics/overview", params={"period": "today"}, cookies=pharma_cookies)
    assert resp.status_code == 200
    d = resp.json()
    for key in ("period", "total_deliveries", "completed", "cancelled", "in_progress", "revenue", "daily_avg", "top_drivers"):
        assert key in d, f"missing key: {key}"
    assert d["period"] == "today"
    assert isinstance(d["total_deliveries"], int)
    assert isinstance(d["revenue"], (int, float))


@pytest.mark.asyncio
async def test_analytics_overview_week(client: AsyncClient, pharma_cookies):
    resp = await client.get("/api/analytics/overview", params={"period": "week"}, cookies=pharma_cookies)
    assert resp.status_code == 200
    assert resp.json()["period"] == "week"


@pytest.mark.asyncio
async def test_analytics_overview_month(client: AsyncClient, pharma_cookies):
    resp = await client.get("/api/analytics/overview", params={"period": "month"}, cookies=pharma_cookies)
    assert resp.status_code == 200
    assert resp.json()["period"] == "month"


@pytest.mark.asyncio
async def test_analytics_invalid_period(client: AsyncClient, pharma_cookies):
    resp = await client.get("/api/analytics/overview", params={"period": "forever"}, cookies=pharma_cookies)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_analytics_hourly_today(client: AsyncClient, pharma_cookies):
    resp = await client.get("/api/analytics/hourly", params={"period": "today"}, cookies=pharma_cookies)
    assert resp.status_code == 200
    d = resp.json()
    assert "hourly" in d
    assert len(d["hourly"]) == 24
    for h in d["hourly"]:
        assert "hour" in h and "label" in h and "count" in h
        assert 0 <= h["hour"] <= 23
        assert h["count"] >= 0


@pytest.mark.asyncio
async def test_analytics_hourly_week(client: AsyncClient, pharma_cookies):
    resp = await client.get("/api/analytics/hourly", params={"period": "week"}, cookies=pharma_cookies)
    assert resp.status_code == 200
    d = resp.json()
    assert "peak_hour" in d


@pytest.mark.asyncio
async def test_analytics_hourly_invalid(client: AsyncClient, pharma_cookies):
    resp = await client.get("/api/analytics/hourly", params={"period": "bad"}, cookies=pharma_cookies)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_export_csv_month(client: AsyncClient, pharma_cookies):
    resp = await client.get("/api/analytics/export/csv", params={"period": "month"}, cookies=pharma_cookies)
    assert resp.status_code == 200
    ct = resp.headers.get("content-type", "")
    assert "csv" in ct
    cd = resp.headers.get("content-disposition", "")
    assert ".csv" in cd
    # Content should have BOM + header row
    body = resp.content.decode("utf-8-sig")
    assert "ID Consegna" in body


@pytest.mark.asyncio
async def test_export_csv_unauthenticated(client: AsyncClient):
    resp = await client.get("/api/analytics/export/csv", params={"period": "month"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_export_csv_invalid_period(client: AsyncClient, pharma_cookies):
    resp = await client.get("/api/analytics/export/csv", params={"period": "nope"}, cookies=pharma_cookies)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_security_headers_present(client: AsyncClient):
    """Verify security headers are added to all responses."""
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    assert "x-content-type-options" in resp.headers
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert "x-frame-options" in resp.headers
    assert resp.headers["x-frame-options"] == "DENY"
    assert "referrer-policy" in resp.headers
