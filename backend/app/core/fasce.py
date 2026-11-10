"""Fasce orarie promesse al paziente.

Perché un modulo a parte: la validazione è una regola di prodotto ("dalle 15
alle 18", non "alle 17:43"), e va scritta una volta sola e provata. La fascia
vive su due campi della consegna: scheduled_time (inizio) e slot_to (fine).
"""
from datetime import date, datetime
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


GIORNI = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"]


def descrivi_giorno(giorno, adesso: datetime) -> Optional[str]:
    """Il giorno della promessa come lo direbbe il banco: "oggi", "domani", "giovedì".

    Serve al paziente che apre il link: sapere "15:00-18:00" senza il giorno non
    risponde alla domanda vera, che e' "quando". Oltre la settimana si scrive la
    data, perche' "fra undici giorni" non aiuta nessuno.
    """
    mio = _giorno(giorno)
    if mio is None:
        return None
    distanza = (mio - adesso.date()).days
    if distanza == 0:
        return "oggi"
    if distanza == 1:
        return "domani"
    if distanza == -1:
        return "ieri"
    if 1 < distanza < 7:
        return GIORNI[mio.weekday()]
    return mio.strftime("%d/%m/%Y")


def _giorno(valore) -> Optional[date]:
    if not valore:
        return None
    if isinstance(valore, datetime):
        return valore.date()
    if isinstance(valore, date):
        return valore
    testo = str(valore).strip()[:10]
    try:
        return datetime.strptime(testo, "%Y-%m-%d").date()
    except ValueError:
        return None


def fascia_scaduta(
    da: Optional[str],
    a: Optional[str],
    adesso: datetime,
    giorno=None,
) -> bool:
    """Vero se la fascia promessa è passata e la consegna è ancora aperta.

    Il giorno conta: una promessa "15:00-18:00" di ieri è scaduta anche se
    adesso sono le 10 del mattino dopo. Se il giorno non si conosce si guarda
    solo l'orario, che è meglio di niente ma va usato sapendo cosa significa.
    """
    if not da:
        return False
    limite = _minuti(a or da)
    if limite is None:
        return False

    giorno_promessa = _giorno(giorno)
    if giorno_promessa is not None:
        oggi = adesso.date()
        if giorno_promessa < oggi:
            return True
        if giorno_promessa > oggi:
            return False
    return adesso.hour * 60 + adesso.minute > limite
