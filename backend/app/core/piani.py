"""Piani e limiti: una sola verità, in un posto solo.

Perché esiste questo file: senza limiti non si vende un abbonamento, ma i limiti
non devono mai rompere una farmacia che sta già lavorando. Quindi:
- chi non ha il campo "piano" (gli account nati prima) resta senza limiti;
- chi si registra da oggi parte in prova per N giorni;
- a prova scaduta si blocca solo la creazione (consegne e fattorini), non la
  lettura né la consegna già in corso: si chiude il giro, non si butta fuori.
"""
import calendar
from datetime import datetime, timezone, timedelta
from typing import Optional

GIORNI_PROVA = 14

PIANI = {
    "prova": {
        "nome": "Prova",
        "prezzo_mese": 0,
        "max_fattorini": 3,
        "max_consegne_mese": 200,
    },
    "pro": {
        "nome": "Professional",
        "prezzo_mese": 49,
        "max_fattorini": 5,
        "max_consegne_mese": 2000,
    },
    "catena": {
        "nome": "Catena",
        "prezzo_mese": 99,
        "max_fattorini": 50,
        "max_consegne_mese": 20000,
    },
}

# I campi della farmacia che servono a calcolare il piano: una proiezione sola.
CAMPI_PIANO = {"_id": 0, "piano": 1, "prova_scadenza": 1, "pro_admin": 1}

# Piani scaduti o sconosciuti: si applicano i limiti della prova, senza scadenza.
PIANO_RIPIEGO = "prova"


def _adesso() -> datetime:
    return datetime.now(timezone.utc)


def _data(valore) -> Optional[datetime]:
    if not valore:
        return None
    if isinstance(valore, datetime):
        return valore if valore.tzinfo else valore.replace(tzinfo=timezone.utc)
    try:
        testo = str(valore).replace("Z", "+00:00")
        data = datetime.fromisoformat(testo)
        return data if data.tzinfo else data.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def assegnazione_pro(utente: dict, adesso: Optional[datetime] = None) -> Optional[dict]:
    """La scelta dell'amministratore sulle funzioni Pro, se c'e' ed e' ancora valida.

    Un'assegnazione attiva oltre la sua scadenza non conta piu': la farmacia
    torna alle regole normali (prova o piano), senza che nessuno debba spegnerla.
    """
    scelta = (utente or {}).get("pro_admin")
    if not isinstance(scelta, dict):
        return None
    adesso = adesso or _adesso()
    attivo = bool(scelta.get("attivo"))
    scadenza = _data(scelta.get("scadenza")) if attivo else None
    if scadenza and scadenza <= adesso:
        return None
    return {
        "attivo": attivo,
        "scadenza": scadenza.isoformat() if scadenza else None,
        "giorni_rimasti": (scadenza - adesso).days if scadenza else None,
    }


def _piu_mesi(quando: datetime, mesi: int) -> datetime:
    indice = quando.month - 1 + mesi
    anno, mese = quando.year + indice // 12, indice % 12 + 1
    giorno = min(quando.day, calendar.monthrange(anno, mese)[1])
    return quando.replace(year=anno, month=mese, day=giorno)


def nuova_assegnazione(stato: str, mesi: Optional[int] = None, scadenza: Optional[str] = None,
                       adesso: Optional[datetime] = None) -> Optional[dict]:
    """Cosa scrivere in `pro_admin`. None vuol dire "togli la scelta" (automatico).

    - "attivo": Pro aperto per `mesi`, fino a `scadenza` (giorno compreso) o senza fine;
    - "spento": Pro chiuso finche' l'amministratore non cambia idea;
    - "automatico": valgono di nuovo prova e piano.
    """
    adesso = adesso or _adesso()
    if stato == "automatico":
        return None
    if stato == "spento":
        return {"attivo": False, "scadenza": None, "assegnato_il": adesso.isoformat()}
    if stato != "attivo":
        raise ValueError("Stato non valido")
    fine = None
    if scadenza:
        giorno = _data(scadenza)
        if not giorno:
            raise ValueError("Data di scadenza non valida")
        fine = giorno.replace(hour=23, minute=59, second=59, microsecond=0)
        if fine <= adesso:
            raise ValueError("La scadenza deve essere nel futuro")
    elif mesi:
        fine = _piu_mesi(adesso, mesi)
    return {"attivo": True, "scadenza": fine.isoformat() if fine else None, "assegnato_il": adesso.isoformat()}


def piano_corrente(utente: dict, adesso: Optional[datetime] = None) -> dict:
    """Fotografia del piano di una farmacia. Funzione pura: si può testare."""
    adesso = adesso or _adesso()
    base = _piano_base(utente, adesso)
    assegnazione = assegnazione_pro(utente, adesso)
    base["assegnazione"] = assegnazione
    # Pro assegnato a una farmacia in prova (anche scaduta): lavora come Professional.
    # Chi e' senza limiti o ha gia' un piano a pagamento tiene i suoi limiti.
    if assegnazione and assegnazione["attivo"] and base["piano"] == "prova":
        limiti = PIANI["pro"]
        base.update({
            "piano": "pro",
            "nome": limiti["nome"],
            "prezzo_mese": limiti["prezzo_mese"],
            "limiti": {"max_fattorini": limiti["max_fattorini"], "max_consegne_mese": limiti["max_consegne_mese"]},
            "in_prova": False,
            "scaduto": False,
            "giorni_rimasti": None,
            "scadenza": None,
        })
    return base


def _piano_base(utente: dict, adesso: datetime) -> dict:
    piano = (utente or {}).get("piano")
    scadenza = _data((utente or {}).get("prova_scadenza"))

    senza_limiti = not piano
    if senza_limiti:
        return {
            "piano": None,
            "nome": "Senza limiti",
            "prezzo_mese": 0,
            "limiti": {"max_fattorini": None, "max_consegne_mese": None},
            "in_prova": False,
            "scaduto": False,
            "giorni_rimasti": None,
            "scadenza": None,
        }

    chiave = piano if piano in PIANI else PIANO_RIPIEGO
    limiti = PIANI[chiave]
    in_prova = chiave == "prova" and scadenza is not None
    giorni_rimasti = None
    scaduto = False
    if in_prova:
        giorni_rimasti = (scadenza - adesso).days
        scaduto = giorni_rimasti < 0

    return {
        "piano": chiave,
        "nome": limiti["nome"],
        "prezzo_mese": limiti["prezzo_mese"],
        "limiti": {
            "max_fattorini": limiti["max_fattorini"],
            "max_consegne_mese": limiti["max_consegne_mese"],
        },
        "in_prova": in_prova,
        "scaduto": scaduto,
        "giorni_rimasti": giorni_rimasti,
        "scadenza": scadenza.isoformat() if scadenza else None,
    }


def verifica_consegne(piano: dict, usate: int) -> Optional[str]:
    """None se si può creare, altrimenti il motivo in italiano."""
    if piano.get("scaduto"):
        return ("La prova è finita. Per continuare a creare consegne attiva un piano "
                "da Impostazioni: le consegne già aperte si chiudono normalmente.")
    tetto = piano["limiti"].get("max_consegne_mese")
    if tetto is not None and usate >= tetto:
        return (f"Hai raggiunto le {tetto} consegne del mese comprese nel piano "
                f"{piano['nome']}. Si sblocca passando a un piano superiore.")
    return None


def verifica_fattorini(piano: dict, usati: int) -> Optional[str]:
    """None se si può aggiungere un fattorino, altrimenti il motivo."""
    tetto = piano["limiti"].get("max_fattorini")
    if tetto is not None and usati >= tetto:
        return (f"Il piano {piano['nome']} comprende {tetto} fattorini. "
                "Per aggiungerne altri serve un piano superiore.")
    return None


def inizio_mese(adesso: Optional[datetime] = None) -> datetime:
    """Primo giorno del mese corrente, a mezzanotte UTC."""
    adesso = adesso or _adesso()
    return adesso.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def nuovo_profilo_piano(adesso: Optional[datetime] = None) -> dict:
    """Campi da scrivere su una farmacia appena registrata."""
    adesso = adesso or _adesso()
    return {
        "piano": "prova",
        "prova_scadenza": (adesso + timedelta(days=GIORNI_PROVA)).isoformat(),
        "piano_attivato_il": adesso.isoformat(),
    }
