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

import difflib
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

# Quando nessun cliente e' selezionato Winfarm scrive cosi'. Non e' un nome:
# e' l'assenza di un nome, e trattarlo come dato sarebbe peggio che ignorarlo.
# Parole che sulla schermata stanno dentro etichette e pulsanti e che, lette
# come valori, sembrano nomi: "Fedelta Paziente Cronico" produceva un cliente
# chiamato "Cronico".
PAROLE_INTERFACCIA = {
    "cronico", "fedelta", "storico", "ricetta", "ricette", "scontrino",
    "totale", "pezzi", "presc", "cerca", "codice", "libera", "ticket",
}

# Oltre al cliente generico, sulla schermata ci sono i pulsanti di stato
# "Vendita Aperta" e "Cliente Aperto": il loro testo non e' un nome.
CLIENTI_GENERICI = {"cliente generico", "generico", "cliente", "nessuno", "-", "aperto", "chiuso"}

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

# Per il riconoscimento sul testo intero contano solo gli indicatori forti: la
# parola "Pos." compare anche nei pannelli contabili di Winfarm e non e' un
# metodo di pagamento.
PAGAMENTI_SENZA_ETICHETTA = (
    ("satispay", "satispay"),
    ("contant", "cash"),
    ("carta", "card"),
    ("bancomat", "card"),
    ("elettronic", "card"),
    ("assegno", "assegno"),
    ("bonifico", "bonifico"),
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


def _somiglia(a: str, b: str, soglia: float = 0.72) -> bool:
    """Due testi sono la stessa cosa, per come li legge un OCR.

    L'OCR a bassa risoluzione sbaglia le lettere singole: "CLIENTE GENERICO"
    diventa "CUENTE GENERICO". Confrontare le stringhe esatte non basta, e
    prendere per buono quel testo significherebbe creare una consegna a un
    cliente che non esiste.
    """
    confronto = difflib.SequenceMatcher(None, normalizza(a).strip(), normalizza(b).strip())
    return confronto.ratio() >= soglia


def _nome_plausibile(valore: str | None) -> bool:
    """Un nome di persona ha almeno due lettere.

    Serve perche' sulla schermata ci sono anche righe come "Storico Cliente | ?":
    l'etichetta c'e', il valore no, e senza questo controllo nascerebbe un
    cliente chiamato "?".
    """
    if not valore:
        return False
    parole = {normalizza(parola).strip(" .,:;") for parola in valore.split()}
    if parole and parole <= PAROLE_INTERFACCIA:
        return False
    return re.search(r"[^\W\d_]{2,}", valore, re.UNICODE) is not None


def _pulisci(valore: str | None) -> str | None:
    """Toglie le parentesi e le virgolette che l'intestazione di Winfarm si porta dietro."""
    if valore is None:
        return None
    pulito = valore.strip(" []<>\"'")
    return pulito or None


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
        # l'etichetta deve stare a inizio riga o subito dopo un separatore: cosi'
        # "Storico Cliente" non passa per un cliente, e "travi" non passa per "via"
        prima = bassa[:posizione]
        if prima and prima[-1] not in " \t|:;-([":
            continue
        resto = riga[posizione + len(etichetta):]
        valore = resto.strip(" \t:;-|>")
        valore = re.split(r"[\t|;]", valore)[0].strip()
        if valore and not re.fullmatch(r"[:\-.\s]*", valore):
            return valore
    return None


def _intestazione(testo: str) -> dict:
    """I dati che Winfarm scrive nella riga in alto, separati da barre o parentesi."""
    basso = normalizza(testo or "")
    dati: dict = {}
    trovato = re.search(r"vendita del\s+(\d{1,2}/\d{1,2}/\d{2,4})", basso)
    if trovato:
        dati["data_vendita"] = trovato.group(1)
    trovato = re.search(r"operatore:?\s*([^|\]\[]+)", basso)
    if trovato:
        dati["operatore"] = _pulisci(trovato.group(1))
    trovato = re.search(r"terminale:?\s*([^|\]\[]+)", basso)
    if trovato:
        dati["terminale"] = _pulisci(trovato.group(1))
    dati["vendita_libera"] = "vendita libera" in basso
    dati["scontrino_non_fiscale"] = "scontrino non fiscale" in basso
    return dati


def _importo_senza_etichetta(testo: str) -> float | None:
    """Il totale grande in basso a destra, che nessuna etichetta accompagna.

    Sulla schermata di vendita di Winfarm il totale compare da solo sopra i
    pulsanti "Vendita Aperta" e "Cliente Aperto": un numero isolato su una riga.
    Lo si accetta solo se quei pulsanti ci sono, altrimenti si rischia di
    prendere un prezzo qualsiasi della griglia.
    """
    if "vendita aperta" not in normalizza(testo or ""):
        return None
    candidati = []
    for riga in (testo or "").splitlines():
        for pezzo in re.split(r"[|\t]", riga):
            pezzo = pezzo.strip()
            # un importo isolato: niente percentuali, niente parentesi, niente testo
            if not re.fullmatch(r"€?\s*\d{1,3}(?:[.\s]\d{3})*[.,]\d{2}\s*€?", pezzo):
                continue
            candidati.append(pezzo)
    for pezzo in reversed(candidati):
        valore = _importo_da(pezzo)
        if valore is not None:
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


def _pagamento_da(testo: str, solo_forti: bool = False) -> str | None:
    basso = normalizza(testo or "")
    elenco = PAGAMENTI_SENZA_ETICHETTA if solo_forti else PAGAMENTI
    for chiave, valore in elenco:
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
            valore = _pulisci(_valore_dopo_etichetta(riga, ETICHETTE["cliente"]))
            if valore and _nome_plausibile(valore) and not any(
                normalizza(valore).strip() == generico or _somiglia(valore, generico)
                for generico in CLIENTI_GENERICI
            ):
                cliente, fiducia["cliente"] = valore, "alta"
        if indirizzo is None:
            valore = _pulisci(_valore_dopo_etichetta(riga, ETICHETTE["indirizzo"]))
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
                    cf, fiducia["codice_fiscale"] = trovato.group(1).upper(), "alta"
        if importo is None:
            valore = _valore_dopo_etichetta(riga, ETICHETTE["importo"])
            # "Totale Pezzi 1" e' un conteggio, non un importo: le lettere lo escludono
            if valore and re.fullmatch(r"\s*(?:€|eur)?\s*[\d.,\s]+\s*(?:€|eur)?\s*", valore, re.IGNORECASE):
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
            # un numero di ricetta contiene cifre: "Presc." e' un'intestazione
            if valore and re.search(r"\d", valore):
                ricette, fiducia["ricette"] = valore, "alta"

    # ripieghi sul testo intero: succedono con le griglie copiate senza etichette
    if telefono is None:
        trovato = _telefono_da(testo or "")
        if trovato:
            telefono, fiducia["telefono"] = trovato, "media"
    if cf is None:
        trovato = RE_CF.search(testo or "")
        if trovato:
            cf, fiducia["codice_fiscale"] = trovato.group(1).upper(), "media"
    if pagamento is None:
        trovato = _pagamento_da(testo or "", solo_forti=True)
        if trovato:
            pagamento, fiducia["pagamento"] = trovato, "media"
    if importo is None and "totale" in testo_normalizzato:
        riga_totale = next((r for r in righe if "totale" in normalizza(r)), None)
        if riga_totale:
            trovato = _importo_da(riga_totale)
            if trovato is not None:
                importo, fiducia["importo"] = trovato, "media"

    if importo is None:
        trovato = _importo_senza_etichetta(testo or "")
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
    # Basta il cliente e l'importo: l'indirizzo non compare sulla schermata di
    # vendita, e' un dato del cliente che PharmaTrack ha gia' in anagrafica.
    utilizzabile = bool(campi["cliente"] and campi["importo"] is not None)
    return {
        "campi": campi,
        "intestazione": _intestazione(testo or ""),
        "fiducia": fiducia,
        "riconosciuti": riconosciuti,
        "utilizzabile": utilizzabile,
        "indirizzo_da_chiedere": campi["indirizzo"] is None,
        "righe_lette": len(righe),
        "caratteri_letti": len(testo or ""),
    }
