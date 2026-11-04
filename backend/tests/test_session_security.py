"""Sicurezza della sessione, provata contro l'API viva.

I test unitari non possono coprire questa parte: la sessione e' una riga nel
database, quindi la domanda "un cookie inventato funziona?" ha senso solo con
un database vero davanti. Girano nel workflow notturno insieme ai test di
isolamento tra farmacie.

Regola che questi test difendono: il cookie e' l'unica cosa che tiene aperta
la sessione di una farmacia, quindi non deve essere indovinabile, non deve
sopravvivere al logout, e non deve valere per un'altra area dell'app.
"""
import os
import time

import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://pharmatrack-api.onrender.com/api").rstrip("/")
EMAIL = os.environ.get("PT_TEST_EMAIL")
PASSWORD = os.environ.get("PT_TEST_PASSWORD")
TIMEOUT = 45

pytestmark = pytest.mark.skipif(
    not (EMAIL and PASSWORD), reason="PT_TEST_EMAIL / PT_TEST_PASSWORD non impostati"
)


def _sessione():
    return requests.Session()


def _login(s):
    risposta = s.post(f"{BASE_URL}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=TIMEOUT)
    # Il login e' limitato a 10 tentativi al minuto per IP: se la suite gira
    # subito dopo un'altra, il 429 non e' un difetto dell'app. Un secondo
    # tentativo dopo venti secondi distingue i due casi invece di far
    # sembrare rosso un test che va bene.
    if risposta.status_code == 429:
        time.sleep(20)
        risposta = s.post(f"{BASE_URL}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=TIMEOUT)
    return risposta


@pytest.fixture(scope="module")
def sessione_autenticata():
    """Un solo login per tutto il file: il limite e' 10 al minuto per IP."""
    s = _sessione()
    risposta = _login(s)
    assert risposta.status_code == 200, f"login di prova fallito: {risposta.status_code}"
    yield s
    s.post(f"{BASE_URL}/auth/logout", timeout=TIMEOUT)


def test_senza_cookie_non_si_entra():
    risposta = _sessione().get(f"{BASE_URL}/auth/me", timeout=TIMEOUT)
    assert risposta.status_code == 401


def test_cookie_inventato_non_apre_niente():
    for finto in ["sess_0000000000000000000000000000000a", "sess_", "amministratore"]:
        risposta = _sessione().get(
            f"{BASE_URL}/auth/me", cookies={"session_token": finto}, timeout=TIMEOUT
        )
        assert risposta.status_code == 401, f"il cookie {finto!r} e' stato accettato"


def test_cookie_manomesso_non_apre_niente(sessione_autenticata):
    valido = sessione_autenticata.cookies.get("session_token")
    assert valido
    for manomesso in [valido + "a", valido[:-1] + ("0" if valido[-1] != "0" else "1")]:
        risposta = _sessione().get(
            f"{BASE_URL}/auth/me", cookies={"session_token": manomesso}, timeout=TIMEOUT
        )
        assert risposta.status_code == 401, "un token alterato di un carattere e' stato accettato"


def test_cookie_chiuso_e_morto_dopo_il_logout():
    """Un cookie usa e getta: verifico com'e' fatto, poi che il logout lo uccida.

    httponly: non leggibile da JavaScript. secure: non viaggia in chiaro.
    samesite=none serve al frontend su un altro dominio, ed e' proprio per
    questo che la protezione CSRF deve stare altrove (CORS + corpo JSON).
    """
    s = _sessione()
    risposta = _login(s)
    assert risposta.status_code == 200
    intestazioni = risposta.headers.get("set-cookie", "").lower()
    assert "httponly" in intestazioni, "il cookie di sessione deve essere HttpOnly"
    assert "secure" in intestazioni, "il cookie di sessione deve essere Secure"
    assert "samesite=none" in intestazioni

    valido = s.cookies.get("session_token")
    s.post(f"{BASE_URL}/auth/logout", timeout=TIMEOUT)
    dopo = _sessione().get(f"{BASE_URL}/auth/me", cookies={"session_token": valido}, timeout=TIMEOUT)
    assert dopo.status_code == 401, "dopo il logout il vecchio cookie deve essere morto"


def test_la_sessione_della_farmacia_non_apre_il_fattorino(sessione_autenticata):
    risposta = sessione_autenticata.get(f"{BASE_URL}/driver/me", timeout=TIMEOUT)
    assert risposta.status_code in (401, 403), "una farmacia non deve risultare un fattorino"


def test_la_sessione_della_farmacia_non_apre_l_amministrazione(sessione_autenticata):
    for percorso in ["/admin/me", "/admin/db/collections", "/admin/db/overview", "/csp-reports"]:
        risposta = sessione_autenticata.get(f"{BASE_URL}{percorso}", timeout=TIMEOUT)
        assert risposta.status_code in (401, 403), f"{percorso} ha accettato una sessione farmacia"


def test_il_cookie_di_una_farmacia_non_legge_i_dati_come_amministratore(sessione_autenticata):
    # La lettura del database e' riservata al super amministratore: se una
    # sessione farmacia la aprisse, chiunque abbia un account leggerebbe tutto.
    for percorso in [
        "/admin/db/collections/deliveries/documents",
        "/admin/db/collections/users/documents",
        "/admin/db/collections/audit_log/documents",
    ]:
        risposta = sessione_autenticata.get(f"{BASE_URL}{percorso}", timeout=TIMEOUT)
        assert risposta.status_code in (401, 403), f"{percorso} ha accettato una sessione farmacia"
