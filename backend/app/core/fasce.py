"""Fasce orarie promesse al paziente.

Perché un modulo a parte: la validazione è una regola di prodotto ("dalle 15
alle 18", non "alle 17:43"), e va scritta una volta sola e provata. La fascia
vive su due campi della consegna: scheduled_time (inizio) e slot_to (fine).
"""
from datetime import datetime
from typing import Optional, Tuple

FORMATO = "%H:%M"
INIZIO_GIORNO = "06:00"
FINE_GIORNO = "23:00"

# Le fasce che il banco propone: poche, larghe, comprensibili al telefono.
FASCE_PRONTE = [
    {"etichetta": "La prima possibile", "da": None, "a": None},
    {"etichetta": "Mattina (9–12)", "da": "09:00", "a": "12:00"},
    {"etichetta": "Mezzogiorno (12–15)", "da": "12:00", "a": "15:00"},
    {"etichetta": "Pomeriggio (15–18)", "da": "15:00", "a": "18:00"},
    {"etichetta": "Sera (18–20)", "da": "18:00", "a": "20:00"},
]


def _minuti(valore: str) -> Optional[int]:
    try:
        ora = datetime.strptime(valore.strip(), FORMATO)
    except (ValueError, AttributeError):
        return None
    return ora.hour * 60 + ora.minute


def valida_fascia(da: Optional[str], a: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """Restituisce la coppia normalizzata. Solleva ValueError con un messaggio chiaro."""
    if not da and not a:
        return None, None
    if not da:
        raise ValueError("Una fascia oraria ha sempre un inizio")
    inizio = _minuti(da)
    if inizio is None:
        raise ValueError("L'orario di inizio deve essere nel formato HH:MM")
    if inizio < _minuti(INIZIO_GIORNO) or inizio > _minuti(FINE_GIORNO):
        raise ValueError(f"La consegna si pianifica fra le {INIZIO_GIORNO} e le {FINE_GIORNO}")
    if not a:
        return da.strip(), None
    fine = _minuti(a)
    if fine is None:
        raise ValueError("L'orario di fine deve essere nel formato HH:MM")
    if fine <= inizio:
        raise ValueError("La fine della fascia deve venire dopo l'inizio")
    return da.strip(), a.strip()


def descrivi_fascia(da: Optional[str], a: Optional[str]) -> Optional[str]:
    """Testo da mostrare al paziente: '09:00–12:00', oppure solo '09:00'."""
    if not da:
        return None
    return f"{da}–{a}" if a else da


def fascia_scaduta(da: Optional[str], a: Optional[str], adesso: datetime) -> bool:
    """Vero se la fascia promessa è già passata e la consegna è ancora aperta."""
    if not da:
        return False
    riferimento = a or da
    limite = _minuti(riferimento)
    if limite is None:
        return False
    return adesso.hour * 60 + adesso.minute > limite
