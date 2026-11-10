"""Le terapie croniche e i pazienti spariti: due liste, una regola sola.

Perche' esiste questo file: la farmacia non deve ricordarsi a mano chi torna
ogni 30 giorni, e soprattutto non deve accorgersi per caso che un paziente non
ordina da due mesi. Sono le due domande che il banco si fa al telefono
("quando le tocca?" e "chi si e' perso?"), quindi il calcolo sta qui, puro e
testabile, e i due router si limitano a leggere il database.

Regole decise con Federico (8/11), da non cambiare senza motivo:
- niente "ripeti consegna" con gli importi copiati: gli importi cambiano, e una
  consegna sbagliata e' peggio di una consegna da fare. Il paziente ricorrente
  produce un promemoria, non una consegna gia' pronta.
- il riferimento e' l'ultimo ordine (data di creazione della consegna), non
  l'ultima consegnata: se un ordine e' rimasto in sospeso il conteggio dei
  giorni non deve ripartire.
- una ricorrenza scaduta resta "da fare" finche' non si prepara l'ordine: non
  sparisce da sola il giorno dopo, altrimenti il promemoria non serve a niente.
"""
from datetime import date, datetime, timedelta
from typing import Optional

from app.core.fasce import descrivi_fascia

GIORNI_RICHIAMO = 45
GIORNI_IN_ARRIVO = 7

# Stati che non contano come ordine: una consegna annullata non e' un paziente
# che ha ordinato, e non deve far ripartire i 30 giorni.
STATI_DA_IGNORARE = ("cancelled", "not_delivered")


def _giorno(valore) -> Optional[date]:
    """Data da stringa ISO, datetime o date. None se non si capisce."""
    if not valore:
        return None
    if isinstance(valore, datetime):
        return valore.date()
    if isinstance(valore, date):
        return valore
    testo = str(valore).strip()
    if not testo:
        return None
    try:
        return datetime.fromisoformat(testo.replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return date.fromisoformat(testo[:10])
        except ValueError:
            return None


def ultimo_ordine_per_cliente(consegne) -> dict:
    """customer_id -> data dell'ordine piu' recente (stringa ISO).

    Passa solo cio' che conta: le annullate si scartano, e di ogni consegna
    vale la data di creazione perche' e' quella in cui il paziente ha chiesto.
    """
    ultimi = {}
    for consegna in consegne or []:
        if (consegna.get("status") or "") in STATI_DA_IGNORARE:
            continue
        cliente = consegna.get("customer_id")
        giorno = _giorno(consegna.get("created_at"))
        if not cliente or giorno is None:
            continue
        precedente = ultimi.get(cliente)
        if precedente is None or giorno > precedente:
            ultimi[cliente] = giorno
    return ultimi


def _voce(cliente: dict, base: Optional[date], oggi: date) -> dict:
    return {
        "customer_id": cliente.get("customer_id"),
        "name": cliente.get("name"),
        "phone": cliente.get("phone"),
        "address": cliente.get("address"),
        "giorni_ricorrenza": cliente.get("ricorrenza_giorni"),
        "fascia": descrivi_fascia(cliente.get("ricorrenza_da"), cliente.get("ricorrenza_a")),
        # i due estremi servono al modulo che riapre la ricorrenza
        "fascia_da": cliente.get("ricorrenza_da"),
        "fascia_a": cliente.get("ricorrenza_a"),
        "ultimo_ordine": base.isoformat() if base else None,
        "giorni_da_ultimo_ordine": (oggi - base).days if base else None,
    }


def raggruppa(clienti, consegne, oggi: Optional[date] = None,
              giorni_richiamo: int = GIORNI_RICHIAMO) -> dict:
    """Le tre liste che il banco guarda, in ordine di urgenza.

    - da_fare: ricorrenza scaduta (oggi o prima), la piu' vecchia per prima
    - in_arrivo: ricorrenza nei prossimi 7 giorni, la piu' vicina per prima
    - richiami: nessuna ricorrenza e nessun ordine da piu' di `giorni_richiamo`

    Un paziente con ricorrenza attiva non finisce mai nei richiami: se ha la
    ricorrenza impostata lo sta gia' seguendo la farmacia, e comparire in due
    liste diverse vorrebbe dire due telefonate.
    """
    oggi = oggi or date.today()
    ultimi = ultimo_ordine_per_cliente(consegne)
    da_fare, in_arrivo, richiami = [], [], []

    for cliente in clienti or []:
        if cliente.get("is_active") is False:
            continue
        cliente_id = cliente.get("customer_id")
        base = ultimi.get(cliente_id) or _giorno(cliente.get("ricorrenza_dal"))
        giorni = cliente.get("ricorrenza_giorni")
        attiva = bool(cliente.get("ricorrenza_attiva")) and isinstance(giorni, int) and giorni > 0

        if attiva:
            if base is None:
                # Ricorrenza impostata senza nessun ordine e senza data di
                # partenza: non si inventa una scadenza, si parte da oggi.
                base = oggi
            prossima = base + timedelta(days=giorni)
            voce = _voce(cliente, base, oggi)
            voce["prossima"] = prossima.isoformat()
            voce["giorni_di_ritardo"] = max(0, (oggi - prossima).days)
            if prossima <= oggi:
                da_fare.append(voce)
            elif prossima <= oggi + timedelta(days=GIORNI_IN_ARRIVO):
                voce["giorni_alla_prossima"] = (prossima - oggi).days
                in_arrivo.append(voce)
            continue

        if base is None:
            # Nessun ordine mai fatto: conta da quando il paziente e' entrato
            # in anagrafica, se e' abbastanza vecchio.
            base = _giorno(cliente.get("created_at"))
        if base is None:
            continue
        giorni_da = (oggi - base).days
        if giorni_da >= giorni_richiamo:
            voce = _voce(cliente, base, oggi)
            voce["giorni_da_ultimo_ordine"] = giorni_da
            richiami.append(voce)

    da_fare.sort(key=lambda v: (-v["giorni_di_ritardo"], v["name"] or ""))
    in_arrivo.sort(key=lambda v: (v["prossima"], v["name"] or ""))
    richiami.sort(key=lambda v: (-v["giorni_da_ultimo_ordine"], v["name"] or ""))

    return {
        "oggi": oggi.isoformat(),
        "giorni_richiamo": giorni_richiamo,
        "da_fare": da_fare,
        "in_arrivo": in_arrivo,
        "richiami": richiami,
        "totali": {
            "da_fare": len(da_fare),
            "in_arrivo": len(in_arrivo),
            "richiami": len(richiami),
        },
    }
