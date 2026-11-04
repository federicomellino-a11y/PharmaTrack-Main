"""Secondo fattore per la console di amministrazione, senza dipendenze esterne.

La console legge i dati di tutte le farmacie e finora era protetta da una sola
password. Il TOTP qui sotto e' l'algoritmo standard (RFC 6238, HMAC-SHA1, passo
di 30 secondi, 6 cifre) scritto con la libreria standard: cosi' entra in un
codice che deve restare installabile con i pin attuali, senza aggiungere un
pacchetto che poi va aggiornato.

Si attiva impostando ADMIN_TOTP_SECRET su Render: senza quella variabile il
login funziona come prima, quindi si puo' accendere e spegnere senza rilasci.
"""
import base64
import hashlib
import hmac
import struct
import time

PASSO = 30
CIFRE = 6
# Quanti passi in dietro e in avanti accettare: gli orologi dei telefoni
# sbagliano di qualche decina di secondi e un codice rifiutato per 15 secondi
# di scarto e' solo un fastidio.
FINESTRA = 1


def _chiave(segreto_b32: str) -> bytes:
    ripulito = (segreto_b32 or "").strip().replace(" ", "").upper()
    if not ripulito:
        raise ValueError("segreto TOTP vuoto")
    riempimento = "=" * (-len(ripulito) % 8)
    return base64.b32decode(ripulito + riempimento, casefold=True)


def genera_codice(segreto_b32: str, quando: float | None = None,
                  passo: int = PASSO, cifre: int = CIFRE) -> str:
    """Codice valido per l'istante indicato (adesso se non specificato)."""
    contatore = int((time.time() if quando is None else quando) // passo)
    digest = hmac.new(_chiave(segreto_b32), struct.pack(">Q", contatore), hashlib.sha1).digest()
    scarto = digest[-1] & 0x0F
    numero = struct.unpack(">I", digest[scarto:scarto + 4])[0] & 0x7FFFFFFF
    return str(numero % (10 ** cifre)).zfill(cifre)


def verifica_codice(segreto_b32: str, codice: str | None, quando: float | None = None,
                    finestra: int = FINESTRA, passo: int = PASSO,
                    cifre: int = CIFRE) -> bool:
    """Vero se il codice e' quello atteso, con tolleranza sull'orologio."""
    candidato = (codice or "").strip().replace(" ", "")
    if len(candidato) != cifre or not candidato.isdigit():
        return False
    adesso = time.time() if quando is None else quando
    for scarto in range(-finestra, finestra + 1):
        atteso = genera_codice(segreto_b32, adesso + scarto * passo, passo, cifre)
        # confronto a tempo costante: non deve trapelare quante cifre erano giuste
        if hmac.compare_digest(atteso, candidato):
            return True
    return False


def uri_attivazione(segreto_b32: str, account: str, emittente: str = "PharmaTrack") -> str:
    """URI otpauth:// da incollare nell'app di autenticazione."""
    from urllib.parse import quote
    return (f"otpauth://totp/{quote(emittente)}:{quote(account)}"
            f"?secret={(segreto_b32 or '').replace(' ', '').upper()}"
            f"&issuer={quote(emittente)}&algorithm=SHA1&digits={CIFRE}&period={PASSO}")


def nuovo_segreto() -> str:
    """Segreto base32 nuovo, senza caratteri di riempimento."""
    import os
    return base64.b32encode(os.urandom(20)).decode().rstrip("=")
