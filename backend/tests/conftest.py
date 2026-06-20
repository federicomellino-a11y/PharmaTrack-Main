"""Pytest fixtures for PharmaTrack backend tests."""
import asyncio
import os
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

# Point to a test DB so we never touch production
os.environ.setdefault("DB_NAME", "pharmatrack_test")

# Import app after env is set
from server import app  # noqa: E402


@pytest.fixture(scope="session")
def event_loop():
    """Single event loop for the whole test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def client():
    """Async HTTP client wired to the FastAPI ASGI app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture(scope="session")
async def pharma_cookies(client: AsyncClient):
    """Return cookies for an authenticated pharmacy session (test account)."""
    resp = await client.post(
        "/api/auth/login",
        json={"email": "test@farmaciaprova.it", "password": "Test1234!"},
    )
    if resp.status_code != 200:
        pytest.skip(f"Test pharmacy not available (HTTP {resp.status_code})")
    return {"session_token": resp.cookies.get("session_token", "")}
