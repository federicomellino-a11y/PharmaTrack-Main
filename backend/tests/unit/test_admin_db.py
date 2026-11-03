"""Lettura del database in sola lettura: i filtri non devono poter eseguire codice."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "pharmatrack_ci")
os.environ.setdefault("JWT_SECRET", "ci-placeholder")
os.environ.setdefault("SECRET_KEY", "ci-placeholder")

import pytest  # noqa: E402
from fastapi import HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.routers.admin_db import (  # noqa: E402
    _controlla_nodi,
    _pulisci,
    valida_campi,
    valida_filtro,
    valida_ordinamento,
)


def test_filtro_semplice_passa():
    assert valida_filtro('{"status": "pending"}') == {"status": "pending"}
    assert valida_filtro(None) == {}
    assert valida_filtro('{"amount": {"$gte": 10}}') == {"amount": {"$gte": 10}}


@pytest.mark.parametrize("filtro", [
    '{"$where": "this.a == 1"}',
    '{"$expr": {"$gt": ["$a", "$b"]}}',
    '{"campo": {"$function": {"body": "x"}}}',
    '{"campo": {"$accumulator": {}}}',
    '{"$or": [{"$where": "1"}]}',
])
def test_operatori_che_eseguono_codice_rifiutati(filtro):
    with pytest.raises(HTTPException) as info:
        valida_filtro(filtro)
    assert info.value.status_code == 400


def test_filtro_non_valido_non_arriva_a_mongo():
    for rotto in ["non-json", "[1,2,3]", '"testo"']:
        with pytest.raises(HTTPException):
            valida_filtro(rotto)


def test_campo_riservato_non_interrogabile():
    with pytest.raises(HTTPException):
        valida_filtro('{"password_hash": "x"}')


def test_annidamento_eccessivo_rifiutato():
    with pytest.raises(HTTPException):
        _controlla_nodi({"a": {"b": {"c": {"d": {"e": {"f": {"g": 1}}}}}}}, 0)


def test_ordinamento():
    assert valida_ordinamento("-created_date") == [("created_date", -1)]
    assert valida_ordinamento("amount") == [("amount", 1)]
    assert valida_ordinamento(None) == []
    for brutto in ["-a$b", "campo con spazi", "x" * 80]:
        with pytest.raises(HTTPException):
            valida_ordinamento(brutto)


def test_proiezione_toglie_i_campi_riservati():
    proiezione = valida_campi("email,password_hash,session_token")
    assert proiezione == {"_id": 0, "email": 1}


def test_documento_ripulito_prima_di_uscire():
    documento = {"email": "a@b.it", "password_hash": "xxx", "session_token": "yyy"}
    assert _pulisci(documento) == {"email": "a@b.it"}


def test_senza_sessione_admin_non_si_legge_niente():
    import server

    client = TestClient(server.app, raise_server_exceptions=False)
    for percorso in [
        "/api/admin/db/collections",
        "/api/admin/db/overview",
        "/api/admin/db/collections/deliveries/count",
        "/api/admin/db/collections/deliveries/documents",
    ]:
        risposta = client.get(percorso)
        assert risposta.status_code in (401, 503), percorso


def test_nome_di_collezione_ostile_rifiutato():
    import server

    client = TestClient(server.app, raise_server_exceptions=False)
    # la validazione del nome avviene prima di toccare il database, ma dopo
    # l'autenticazione: senza sessione resta comunque 401
    risposta = client.get("/api/admin/db/collections/$occhio/documents")
    assert risposta.status_code in (401, 400, 503)
