"""Analisi di un singolo paziente: come ordina, quando, e rispetto agli altri.

Perche' un modulo a parte: il profilo cliente racconta una storia ("questo
paziente spende il doppio della media, ordina sempre il giovedi' pomeriggio,
sta rallentando"), e una storia sbagliata e' peggio di nessuna storia. Quindi
i conti stanno qui, puri e provati, e il router si limita a passare le consegne.

Regole fisse:
- contano solo le consegne concluse (status delivered): un ordine annullato non
  e' un acquisto e falserebbe spesa media e frequenza;
- il mese di riferimento e' quello dell'ordine (created_at), non quello in cui
  il fattorino ha suonato il campanello;
- i mesi senza ordini restano nella serie con zero: un grafico che salta i mesi
  vuoti fa credere che il paziente sia costante.
"""
from datetime import date, datetime
from typing import Optional

from app.core.fasce import descrivi_fascia

MESI_SERIE = 6
NOMI_MESI = ["gen", "feb", "mar", "apr", "mag", "giu",
             "lug", "ago", "set", "ott", "nov", "dic"]
GIORNI = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"]


def _data(valore) -> Optional[datetime]:
    if not valore:
        return None
    if isinstance(valore, datetime):
        return valore
    try:
        return datetime.fromisoformat(str(valore).replace("Z", "+00:00"))
    except ValueError:
        return None


def concluse(consegne) -> list:
    """Le sole consegne che valgono come acquisto."""
    return [c for c in (consegne or []) if (c.get("status") or "") == "delivered"]


def _mese_precedente(anno: int, mese: int) -> tuple:
    return (anno - 1, 12) if mese == 1 else (anno, mese - 1)


def serie_mensile(consegne, mesi: int = MESI_SERIE, oggi: Optional[date] = None) -> list:
    """Ultimi `mesi` mesi, dal piu' vecchio al piu' recente, con gli zeri dentro."""
    oggi = oggi or date.today()
    chiavi = []
    anno, mese = oggi.year, oggi.month
    for _ in range(mesi):
        chiavi.append((anno, mese))
        anno, mese = _mese_precedente(anno, mese)
    chiavi.reverse()

    totali = {chiave: {"consegne": 0, "speso": 0.0} for chiave in chiavi}
    for consegna in concluse(consegne):
        quando = _data(consegna.get("created_at"))
        if not quando:
            continue
        chiave = (quando.year, quando.month)
        if chiave not in totali:
            continue
        totali[chiave]["consegne"] += 1
        totali[chiave]["speso"] += consegna.get("amount") or 0

    return [
        {
            "mese": f"{anno:04d}-{mese:02d}",
            "etichetta": f"{NOMI_MESI[mese - 1]} {str(anno)[2:]}",
            "consegne": totali[(anno, mese)]["consegne"],
            "speso": round(totali[(anno, mese)]["speso"], 2),
        }
        for anno, mese in chiavi
    ]


def fascia_preferita(consegne) -> Optional[dict]:
    """La fascia in cui il paziente ordina piu' spesso. None se non c'e' storia."""
    conteggi = {}
    for consegna in concluse(consegne):
        da = consegna.get("scheduled_time")
        a = consegna.get("slot_to")
        if not da:
            continue
        conteggi[(da, a)] = conteggi.get((da, a), 0) + 1
    if not conteggi:
        return None
    (da, a), quante = max(conteggi.items(), key=lambda voce: voce[1])
    return {"da": da, "a": a, "etichetta": descrivi_fascia(da, a), "quantita": quante}


def giorno_preferito(consegne) -> Optional[dict]:
    """Il giorno della settimana in cui ordina piu' spesso."""
    conteggi = {}
    for consegna in concluse(consegne):
        quando = _data(consegna.get("created_at"))
        if not quando:
            continue
        conteggi[quando.weekday()] = conteggi.get(quando.weekday(), 0) + 1
    if not conteggi:
        return None
    indice, quante = max(conteggi.items(), key=lambda voce: voce[1])
    return {"giorno": GIORNI[indice], "quantita": quante}


def confronto_con_farmacia(media_cliente, media_farmacia) -> Optional[dict]:
    """Quanto spende questo paziente rispetto alla media della farmacia."""
    if not media_farmacia or media_cliente is None:
        return None
    differenza = round(((media_cliente - media_farmacia) / media_farmacia) * 100, 1)
    return {
        "media_cliente": round(media_cliente, 2),
        "media_farmacia": round(media_farmacia, 2),
        "differenza_percento": differenza,
        "sopra_la_media": differenza >= 0,
    }


def analisi_cliente(consegne, media_farmacia=None, mesi: int = MESI_SERIE,
                    oggi: Optional[date] = None) -> dict:
    """Tutto quello che serve alla schermata Analisi, in una chiamata sola."""
    buone = concluse(consegne)
    speso = sum(c.get("amount") or 0 for c in buone)
    media = round(speso / len(buone), 2) if buone else None
    serie = serie_mensile(consegne, mesi=mesi, oggi=oggi)
    con_ordini = [m for m in serie if m["consegne"]]
    tendenza = None
    if len(con_ordini) >= 2:
        ultimo, penultimo = serie[-1], serie[-2]
        if penultimo["speso"]:
            tendenza = round(((ultimo["speso"] - penultimo["speso"]) / penultimo["speso"]) * 100, 1)

    return {
        "ordini_conclusi": len(buone),
        "speso_totale": round(speso, 2),
        "spesa_media": media,
        "serie_mensile": serie,
        "mesi_con_ordini": len(con_ordini),
        "fascia_preferita": fascia_preferita(consegne),
        "giorno_preferito": giorno_preferito(consegne),
        "confronto": confronto_con_farmacia(media, media_farmacia),
        "tendenza_mese_percento": tendenza,
    }
