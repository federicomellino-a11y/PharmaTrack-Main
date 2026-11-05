"""La sottoscrizione push non deve piu' andare in conflitto su created_at."""
from app.core.notifications import documento_sottoscrizione

SOTTOSCRIZIONE = {
    "endpoint": "https://fcm.googleapis.com/fcm/send/abc",
    "keys": {"p256dh": "chiave", "auth": "auth"},
}


def _aggiornamento(**kwargs):
    return documento_sottoscrizione("user_1", "pharmacy", SOTTOSCRIZIONE["endpoint"],
                                    SOTTOSCRIZIONE, "Mozilla/5.0", **kwargs)


def test_created_at_sta_solo_in_set_on_insert():
    """Il bug: created_at in entrambi gli operatori, Mongo risponde 500."""
    aggiornamento = _aggiornamento()
    assert "created_at" in aggiornamento["$setOnInsert"]
    assert "created_at" not in aggiornamento["$set"]


def test_nessun_campo_in_conflitto_fra_i_due_operatori():
    aggiornamento = _aggiornamento()
    comuni = set(aggiornamento["$set"]) & set(aggiornamento["$setOnInsert"])
    assert comuni == set(), f"campi in conflitto: {comuni}"


def test_i_campi_attesi_ci_sono_tutti():
    aggiornamento = _aggiornamento()
    for campo in ("user_id", "user_type", "endpoint", "subscription", "user_agent", "updated_at"):
        assert campo in aggiornamento["$set"], campo


def test_updated_at_e_created_at_condividono_l_istante():
    aggiornamento = _aggiornamento(now="2026-11-05T10:00:00+00:00")
    assert aggiornamento["$set"]["updated_at"] == "2026-11-05T10:00:00+00:00"
    assert aggiornamento["$setOnInsert"]["created_at"] == "2026-11-05T10:00:00+00:00"
