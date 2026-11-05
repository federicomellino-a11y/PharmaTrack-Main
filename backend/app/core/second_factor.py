"""Secondo fattore via email per la console di amministrazione.

Serve perche' l'app di autenticazione non sempre e' una strada percorribile:
Federico ha provato con Google Authenticator senza riuscire a configurarlo.
Il codice a 6 cifre per email e' piu' debole del TOTP (dipende dalla casella),
ma e' molto piu' forte di una password sola e non richiede nessuna app.

Regole che rendono il codice utilizzabile ma non indovinabile:
- si genera con secrets, mai con random;
- nel database non finisce il codice, ma la sua impronta con un sale nuovo;
- vive dieci minuti;
- cinque tentativi sbagliati e si brucia, cosi' 6 cifre non si indovinano;
- si usa una volta sola: la verifica riuscita cancella il record.
"""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

CIFRE = 6
VALIDITA_MINUTI = 10
TENTATIVI_MASSIMI = 5


def genera_codice() -> str:
    """Codice numerico a 6 cifre, con gli zeri iniziali rispettati."""
    return str(secrets.randbelow(10 ** CIFRE)).zfill(CIFRE)


def nuovo_sale() -> str:
    return secrets.token_hex(16)


def impronta_codice(codice: str, sale: str) -> str:
    """Impronta del codice: dal database non si puo' risalire alle 6 cifre."""
    return hmac.new(sale.encode(), (codice or "").strip().encode(), hashlib.sha256).hexdigest()


def impronta_valida(attesa: str, calcolata: str) -> bool:
    return hmac.compare_digest((attesa or "").encode(), (calcolata or "").encode())


def scadenza(adesso: datetime | None = None) -> datetime:
    return (adesso or datetime.now(timezone.utc)) + timedelta(minutes=VALIDITA_MINUTI)


def verdetto(record: dict | None, codice: str, adesso: datetime | None = None) -> str:
    """Dice se il codice puo' passare, senza toccare il database.

    Valori: "ok", "assente", "scaduto", "tentativi", "sbagliato".
    """
    if not record:
        return "assente"
    momento = adesso or datetime.now(timezone.utc)
    scade = record.get("scade")
    if isinstance(scade, str):
        try:
            scade = datetime.fromisoformat(scade)
        except ValueError:
            return "assente"
    if not isinstance(scade, datetime):
        return "assente"
    if scade.tzinfo is None:
        scade = scade.replace(tzinfo=timezone.utc)
    if momento > scade:
        return "scaduto"
    if int(record.get("tentativi") or 0) >= TENTATIVI_MASSIMI:
        return "tentativi"
    atteso = record.get("impronta") or ""
    calcolata = impronta_codice(codice, record.get("sale") or "")
    return "ok" if impronta_valida(atteso, calcolata) else "sbagliato"
