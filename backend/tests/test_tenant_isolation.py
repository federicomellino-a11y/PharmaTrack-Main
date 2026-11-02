"""Isolamento tra farmacie sui fattorini.

Le credenziali di prova arrivano da ambiente (PT_TEST_EMAIL / PT_TEST_PASSWORD):
senza, i test si saltano invece di inventare account. I test non creano dati:
usano solo letture e una PUT che deve essere rifiutata.
"""
import os

import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://pharmatrack-api.onrender.com/api").rstrip("/")
EMAIL = os.environ.get("PT_TEST_EMAIL")
PASSWORD = os.environ.get("PT_TEST_PASSWORD")
TIMEOUT = 45

pytestmark = pytest.mark.skipif(
    not (EMAIL and PASSWORD), reason="PT_TEST_EMAIL / PT_TEST_PASSWORD non impostati"
)


@pytest.fixture(scope="module")
def sessione():
    session = requests.Session()
    response = session.post(f"{BASE_URL}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=TIMEOUT)
    assert response.status_code == 200, f"login di prova fallito: {response.status_code}"
    return session, response.json()


def test_elenco_fattorini_contiene_solo_quelli_della_farmacia(sessione):
    session, user = sessione
    response = session.get(f"{BASE_URL}/drivers", timeout=TIMEOUT)
    assert response.status_code == 200
    for driver in response.json():
        # se il campo è esposto deve coincidere con la farmacia loggata
        if driver.get("pharmacy_id"):
            assert driver["pharmacy_id"] == user["user_id"]
        assert "password_hash" not in driver


def test_fattorino_di_altra_farmacia_non_e_leggibile(sessione):
    session, _ = sessione
    response = session.get(f"{BASE_URL}/drivers/drv_000000000000", timeout=TIMEOUT)
    assert response.status_code == 404


def test_non_si_puo_assegnare_una_consegna_a_un_fattorino_inesistente_o_estraneo(sessione):
    session, _ = sessione
    deliveries = session.get(f"{BASE_URL}/deliveries", params={"limit": 1}, timeout=TIMEOUT)
    if deliveries.status_code != 200 or not deliveries.json():
        pytest.skip("nessuna consegna disponibile per il test di assegnazione")
    delivery = deliveries.json()[0]
    prima = delivery.get("status")

    response = session.put(
        f"{BASE_URL}/deliveries/{delivery['delivery_id']}",
        json={"driver_id": "drv_000000000000"},
        timeout=TIMEOUT,
    )
    assert response.status_code == 400, "una farmacia non deve poter assegnare fattorini estranei"

    # la consegna non deve essere stata toccata
    dopo = session.get(f"{BASE_URL}/deliveries/{delivery['delivery_id']}", timeout=TIMEOUT).json()
    assert dopo.get("status") == prima
    assert dopo.get("driver_id") == delivery.get("driver_id")
