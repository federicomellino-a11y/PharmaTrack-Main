"""Test per gli endpoint di billing/abbonamento (Stripe)."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_plans_public(client: AsyncClient):
    """L'elenco piani è pubblico e non richiede autenticazione."""
    resp = await client.get("/api/billing/plans")
    assert resp.status_code == 200
    data = resp.json()
    assert "basic" in data["plans"]
    assert "pro" in data["plans"]
    assert data["trial_days"] == 14


@pytest.mark.asyncio
async def test_subscription_requires_auth(client: AsyncClient):
    resp = await client.get("/api/billing/subscription")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_checkout_requires_auth(client: AsyncClient):
    resp = await client.post("/api/billing/checkout", json={"plan": "basic"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_checkout_rejects_invalid_plan(client: AsyncClient, pharma_cookies: dict):
    resp = await client.post(
        "/api/billing/checkout",
        json={"plan": "does_not_exist"},
        cookies=pharma_cookies,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_checkout_fails_without_stripe_key(client: AsyncClient, pharma_cookies: dict, monkeypatch):
    """Senza STRIPE_SECRET_KEY configurata, l'endpoint deve rispondere 503 (non un errore 500 generico)."""
    import server
    monkeypatch.setattr(server, "STRIPE_SECRET_KEY", None)
    resp = await client.post(
        "/api/billing/checkout",
        json={"plan": "basic"},
        cookies=pharma_cookies,
    )
    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_webhook_without_secret_configured(client: AsyncClient, monkeypatch):
    import server
    monkeypatch.setattr(server, "STRIPE_WEBHOOK_SECRET", None)
    monkeypatch.setattr(server, "STRIPE_SECRET_KEY", "sk_test_dummy")
    resp = await client.post("/api/billing/webhook", content=b"{}")
    assert resp.status_code == 503
