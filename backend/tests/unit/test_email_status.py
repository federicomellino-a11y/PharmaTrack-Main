"""Diagnosi del provider email: la chiave revocata non deve passare per buona."""
import importlib

from app.core import notifications


def test_chiave_api_riconosciuta(monkeypatch):
    monkeypatch.setattr(notifications, "SMTP_PASSWORD", "xkeysib-abc123")
    assert notifications.email_provider() == "brevo-api"


def test_chiave_smtp_riconosciuta(monkeypatch):
    monkeypatch.setattr(notifications, "SMTP_PASSWORD", "xsmtpsib-abc123")
    assert notifications.email_provider() == "brevo-smtp"


def test_smtp_generico(monkeypatch):
    monkeypatch.setattr(notifications, "SMTP_PASSWORD", "una-password")
    monkeypatch.setattr(notifications, "SMTP_HOST", "smtp.esempio.it")
    monkeypatch.setattr(notifications, "SMTP_USERNAME", "utente")
    assert notifications.email_provider() == "smtp"


def test_senza_credenziali(monkeypatch):
    monkeypatch.setattr(notifications, "SMTP_PASSWORD", "")
    assert notifications.email_provider() == "non configurato"


def test_verdetto_200_e_ok():
    esito = notifications.brevo_verdict(200, '{"email":"x@y.it"}')
    assert esito["ok"] is True
    assert esito["errore"] is None


def test_verdetto_401_riporta_il_motivo():
    esito = notifications.brevo_verdict(401, '{"message":"API Key is not enabled","code":"unauthorized"}')
    assert esito["ok"] is False
    assert esito["stato"] == 401
    assert "401" in esito["errore"]
    assert "API Key is not enabled" in esito["errore"]


def test_verdetto_rete_assente():
    esito = notifications.brevo_verdict(None, "timeout")
    assert esito["ok"] is False
    assert "non raggiungibile" in esito["errore"].lower()


def test_esito_invio_registrato(monkeypatch):
    monkeypatch.setitem(notifications.STATO_EMAIL, "ultimo_errore", None)
    monkeypatch.setitem(notifications.STATO_EMAIL, "ultimo_successo", None)
    notifications.registra_esito_email(False, "Brevo 401: chiave non abilitata")
    assert notifications.STATO_EMAIL["ultimo_errore"]["errore"].startswith("Brevo 401")
    notifications.registra_esito_email(True)
    assert notifications.STATO_EMAIL["ultimo_errore"] is None
    assert notifications.STATO_EMAIL["ultimo_successo"] is not None


def test_health_espone_il_provider(monkeypatch):
    """La risposta di health deve dire quale strada usa l'invio, non solo che le variabili ci sono."""
    monkeypatch.setattr(notifications, "SMTP_PASSWORD", "xkeysib-abc123")
    import app.routers.health as health

    importlib.reload(health)
    assert health.email_provider() == "brevo-api"
