"""Quali funzioni stanno nel piano e quali no: la serratura, in un posto solo.

La divisione, in una riga: **il piano base serve a lavorare** (consegne,
clienti, anagrafica, tracking, chat, archivio, turni), **il Professional sono
le cose che fanno risparmiare tempo o soldi** (analisi del singolo cliente,
ricorrenze e richiami, report avanzati).

Tre regole che non vanno perse:

- chi non ha il campo "piano" (gli account nati prima) non ha serrature:
  non si spegne una farmacia che sta già lavorando;
- durante la prova le funzioni Pro sono aperte tutte, perché una prova che non
  mostra il prodotto non serve a nessuno (indicazione di Federico del 10/11);
- a prova finita si chiudono solo queste, con un messaggio che dice cosa fare.
  Non si chiudono mai i dati già scritti: si smette di aggiungerne.
"""
from typing import Optional

from fastapi import Depends, HTTPException

from app.core.database import db
from app.core.piani import GIORNI_PROVA, piano_corrente
from app.core.security import get_current_user

FUNZIONI = {
    "analisi_cliente": {
        "nome": "Analisi del cliente",
        "descrizione": "Spesa mese per mese, confronto con la media della farmacia, tendenza e abitudini del paziente",
        "dove": "Scheda cliente",
    },
    "ricorrenze": {
        "nome": "Ricorrenze e richiami",
        "descrizione": "Chi aspetta la consegna periodica, chi non ordina da troppo tempo, i richiami da fare",
        "dove": "Pagina Richiami",
    },
    "report_avanzati": {
        "nome": "Report avanzati",
        "descrizione": "Fatturato, consegne per fattorino, top clienti e fasce orarie con export",
        "dove": "Pagina Report",
    },
}

# I piani che comprendono le funzioni Pro. Un eventuale piano base futuro non
# va messo qui: è tutto il senso della divisione.
PIANI_CON_PRO = {"prova", "pro", "catena"}


def funzioni_sbloccate(piano: dict) -> bool:
    """Vero se il piano apre le funzioni Pro. Funzione pura: si può testare."""
    if not piano.get("piano"):
        return True
    if piano.get("scaduto"):
        return False
    return piano.get("piano") in PIANI_CON_PRO


def verifica_funzione(piano: dict, chiave: str) -> Optional[str]:
    """None se la funzione è aperta, altrimenti il motivo in italiano."""
    if chiave not in FUNZIONI:
        # Chiave sconosciuta: meglio lasciar passare che chiudere per errore.
        return None
    if funzioni_sbloccate(piano):
        return None
    return (
        f"{FUNZIONI[chiave]['nome']} è compresa nel piano Professional. "
        f"La prova l'ha mostrata per {GIORNI_PROVA} giorni: per continuare a usarla "
        "attiva un piano da Impostazioni → Piano. I dati già salvati restano."
    )


def elenco_funzioni(piano: dict) -> list:
    """Cosa vede la pagina Impostazioni: ogni funzione con il suo lucchetto."""
    aperto = funzioni_sbloccate(piano)
    return [
        {
            "chiave": chiave,
            "nome": valori["nome"],
            "descrizione": valori["descrizione"],
            "dove": valori["dove"],
            "sbloccata": aperto,
        }
        for chiave, valori in FUNZIONI.items()
    ]


def richiedi_pro(chiave: str):
    """Dipendenza FastAPI: 402 con un motivo leggibile se la funzione è chiusa.

    Serve per gli endpoint che *sono* la funzione Pro (una pagina intera, un
    elenco). Il blocco arriva qui perché un limite va fermato dove fa danno,
    non solo dove si vede.
    """

    async def dipendenza(user: dict = Depends(get_current_user)) -> dict:
        farmacia = await db.users.find_one(
            {"user_id": user["user_id"]}, {"_id": 0, "piano": 1, "prova_scadenza": 1}
        ) or {}
        motivo = verifica_funzione(piano_corrente(farmacia), chiave)
        if motivo:
            raise HTTPException(
                status_code=402,
                detail={"codice": "funzione_pro", "funzione": chiave, "motivo": motivo},
            )
        return user

    return dipendenza
