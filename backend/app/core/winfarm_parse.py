"""Riconoscere una vendita dal testo che il gestionale mostra a schermo.

Winfarm non espone API, quindi l'unico modo per non far ribattere a mano i dati
e' leggere quello che il programma ha gia' sullo schermo. Questo modulo fa il
lavoro sporco: prende il testo (incollato, copiato dal bridge o letto da OCR) e
restituisce i campi della consegna con un livello di fiducia per ciascuno.

Il riconoscimento vive qui e non nello script desktop per tre motivi: si
migliora in un punto solo guardando il testo vero delle farmacie, non serve
reinstallare niente sul PC quando cambia una regola, e il server puo' mostrare
all'utente cosa ha capito prima di creare la consegna.

Nessuna scrittura, nessun effetto: e' una funzione pura sul testo.
"""
from __future__ import annotations

import re
import unicodedata

# Etichette che i gestionali italiani usano per gli stessi concetti. Sono
# minuscole e senza accenti: il confronto avviene sul testo normalizzato.
ETICHETTE: dict[str, tuple[str, ...]] = {
    "cliente": (
        "cliente", "nominativo", "intestatario", "acquirente", "paziente",
        "sig", "sig.ra", "sig.re", "signor", "signora", "nome cliente",
    ),
    "indirizzo": (
        "indirizzo", "via", "viale", "piazza", "corso", "domicilio",
        "residenza", "indirizzo di consegna", "luogo di consegna",
    ),
    "telefono": (
        "telefono", "tel", "tel.", "cellulare", "cell", "mobile",
        "recapito telefonico", "recapito tel",
    ),
    "cf": (
        "codice fiscale", "c.f", "c.f.", "cf", "cod. fiscale", "cod fiscale",
    ),
    "importo": (
        "totale", "totale documento", "totale complessivo", "totale da pagare",
        "importo", "importo totale", "da pagare", "da incassare", "netto a pagare",
        "totale vendita",
    ),
    "pagamento": (
        "pagamento", "modalita di pagamento", "metodo di pagamento",
        "forma di pagamento", "tipo pagamento",
    ),
    "ricette": (
        "ricetta", "ricette", "nre", "n. ricetta", "numeri ricette",
    ),
}

PAGAMENTI = (
    ("satispay", "satispay"),
    ("contant", "cash"),
    ("contanti", "cash"),
    ("carta", "card"),
    ("bancomat", "card"),
    ("pos", "card"),
    ("elettronic", "card"),
    ("bonifico", "bonifico"),
    ("assegno", "assegno"),
)

RE_CF = re.compile(r"\b([A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z])\b", re.IGNORECASE)
RE_TELEFONO = re.compile(r"(?:\+?39[\s./-]?)?((?:3\d{2}|0\d{1,3})[\s./-]?\d{3,4}[\s./-]?\d{3,4})")
# un numero italiano: o con i separatori di migliaia (1.234,56) o scritto di
# seguito (1234,56). L'ordine delle alternative conta: la prima deve provare
# per prima, altrimenti "1234" viene spezzato in "123" + "4".
RE_IMPORTO = re.compile(r"\d{1,3}(?:[.\s]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?")


def normalizza(testo: str) -> str:
    """Minuscolo e senza accenti, cosi' 'Modalità' e 'modalita' sono la stessa cosa."""
    sgonfio = unicodedata.normalize("NFKD", testo or "")
    senza_accenti = "".join(c for c in sgonfio if not unicodedata.combining(c))
    return senza_accenti.lower()


def _valore_dopo_etichetta(riga: str, etichette: tuple[str, ...]) -> str | None:
    """Il testo che segue l'etichetta nella stessa riga, se c'e'.

    Regge sia 'Cliente: Mario Rossi' sia 'Cliente    Mario Rossi' sia le griglie
    copiate con i tab, dove l'etichetta e il valore stanno in due celle.
    """
    bassa = normalizza(riga)
    for etichetta in etichette:
        posizione = bassa.find(etichetta)
        if posizione < 0:
            continue
        # l'etichetta deve stare a inizio riga o dopo un separatore: evita di
        # pescare "via" dentro "travi" o "tel" dentro "hotel"
        prima = bassa[:posizione].strip(" \t|-:;")
        if prima and not prima.endswith(("|", ":", "-", "\t")):
            if not re.search(r"(^|[\s:|\-])$", prima):
                continue
        resto = riga[posizione + len(etichetta):]
        valore = resto.strip(" \t:;-|>")
        valore = re.split(r"[\t|;]", valore)[0].strip()
        if valore and not re.fullmatch(r"[:\-.\s]*", valore):
            return valore
    return None


def _importo_da(testo: str) -> float | None:
    """Numeri scritti come li scrive un gestionale italiano."""
    if not testo:
        return None
    pulito = re.sub(r"(?i)\b(eur|euro)\b", " ", testo).replace("\u20ac", " ")
    trovati = RE_IMPORTO.findall(pulito)
    if not trovati:
        return None
    grezzo = trovati[-1].replace(" ", "").strip()
    if "," in grezzo and "." in grezzo:
        # vince l'ultimo separatore incontrato: 1.234,56 -> virgola decimale
        if grezzo.rfind(",") > grezzo.rfind("."):
            grezzo = grezzo.replace(".", "").replace(",", ".")
        else:
            grezzo = grezzo.replace(",", "")
    elif "," in grezzo:
        grezzo = grezzo.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"\d{1,3}(?:\.\d{3})+", grezzo):
        # solo punti in gruppi di tre: sono migliaia, non decimali
        grezzo = grezzo.replace(".", "")
    try:
        valore = float(grezzo)
    except ValueError:
        return None
    # un totale farmacia sopra i 100.000 euro e' quasi sempre un errore di lettura
    return valore if 0 <= valore <= 100000 else None


def _telefono_da(testo: str) -> str | None:
    for trovato in RE_TELEFONO.finditer(testo or ""):
        cifre = re.sub(r"\D", "", trovato.group(1))
        if cifre.startswith("0039"):
            cifre = cifre[4:]
        elif cifre.startswith("39") and len(cifre) > 10:
            cifre = cifre[2:]
        if 9 <= len(cifre) <= 11:
            return cifre
    return None


def _pagamento_da(testo: str) -> str | None:
    basso = normalizza(testo or "")
    for chiave, valore in PAGAMENTI:
        if chiave in basso:
            return valore
    return None


def estrai_vendita(testo: str) -> dict:
    """Campi della consegna riconosciuti nel testo, con la fiducia di ciascuno.

    La fiducia e' "alta" quando l'etichetta e' esplicita nella riga, "media"
    quando il dato arriva da un riconoscimento sul testo intero, "assente"
    quando non c'e'. Serve all'interfaccia per far vedere in un colpo d'occhio
    cosa controllare prima di confermare.
    """
    righe = [r for r in (testo or "").splitlines() if r.strip()]
    testo_normalizzato = normalizza(testo or "")

    cliente = indirizzo = telefono = cf = pagamento = ricette = None
    importo = None
    fiducia: dict[str, str] = {}

    for riga in righe:
        if cliente is None:
            valore = _valore_dopo_etichetta(riga, ETICHETTE["cliente"])
            if valore:
                cliente, fiducia["cliente"] = valore, "alta"
        if indirizzo is None:
            valore = _valore_dopo_etichetta(riga, ETICHETTE["indirizzo"])
            # "Via Roma 12, Napoli" e' un indirizzo, "Via" da solo non lo e'
            if valore and re.search(r"\d", valore):
                indirizzo, fiducia["indirizzo"] = valore, "alta"
        if telefono is None:
            valore = _valore_dopo_etichetta(riga, ETICHETTE["telefono"])
            if valore:
                trovato = _telefono_da(valore)
                if trovato:
                    telefono, fiducia["telefono"] = trovato, "alta"
        if cf is None:
            valore = _valore_dopo_etichetta(riga, ETICHETTE["cf"])
            if valore:
                trovato = RE_CF.search(valore)
                if trovato:
                    cf, fiducia["cf"] = trovato.group(1).upper(), "alta"
        if importo is None:
            valore = _valore_dopo_etichetta(riga, ETICHETTE["importo"])
            if valore:
                trovato = _importo_da(valore)
                if trovato is not None:
                    importo, fiducia["importo"] = trovato, "alta"
        if pagamento is None:
            valore = _valore_dopo_etichetta(riga, ETICHETTE["pagamento"])
            if valore:
                trovato = _pagamento_da(valore)
                if trovato:
                    pagamento, fiducia["pagamento"] = trovato, "alta"
        if ricette is None:
            valore = _valore_dopo_etichetta(riga, ETICHETTE["ricette"])
            if valore:
                ricette, fiducia["ricette"] = valore, "alta"

    # ripieghi sul testo intero: succedono con le griglie copiate senza etichette
    if telefono is None:
        trovato = _telefono_da(testo or "")
        if trovato:
            telefono, fiducia["telefono"] = trovato, "media"
    if cf is None:
        trovato = RE_CF.search(testo or "")
        if trovato:
            cf, fiducia["cf"] = trovato.group(1).upper(), "media"
    if pagamento is None:
        trovato = _pagamento_da(testo or "")
        if trovato:
            pagamento, fiducia["pagamento"] = trovato, "media"
    if importo is None and "totale" in testo_normalizzato:
        riga_totale = next((r for r in righe if "totale" in normalizza(r)), None)
        if riga_totale:
            trovato = _importo_da(riga_totale)
            if trovato is not None:
                importo, fiducia["importo"] = trovato, "media"

    campi = {
        "cliente": cliente,
        "indirizzo": indirizzo,
        "telefono": telefono,
        "codice_fiscale": cf,
        "importo": importo,
        "pagamento": pagamento,
        "ricette": ricette,
    }
    for nome in campi:
        fiducia.setdefault(nome, "assente")

    riconosciuti = [n for n, v in campi.items() if v not in (None, "")]
    # la consegna ha senso con un nome e un indirizzo: senza, l'utente deve
    # scriverli e l'interfaccia glielo deve dire chiaramente
    utilizzabile = bool(campi["cliente"] and campi["indirizzo"])
    return {
        "campi": campi,
        "fiducia": fiducia,
        "riconosciuti": riconosciuti,
        "utilizzabile": utilizzabile,
        "righe_lette": len(righe),
        "caratteri_letti": len(testo or ""),
    }
