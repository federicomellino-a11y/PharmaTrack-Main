"""Lettura del database dal pannello di amministrazione, in sola lettura.

Serve a rispondere dal telefono a domande sui dati veri ("quante consegne
aperte ci sono", "chi e' rimasto senza fattorino") e a controllare che un
ripristino abbia riportato i numeri giusti, senza aprire una shell sul
database e senza esporre la porta 27017.

Qui non si scrive niente e non si esegue niente: solo `find` e conteggi con
un filtro validato. Mongo accetta nei filtri operatori che eseguono codice
(`$where`, `$function`, `$accumulator`): un filtro costruito male, o scritto
da un client compromesso, diventerebbe esecuzione arbitraria sul database.
Per questo gli operatori sono un elenco chiuso e tutto il resto viene
rifiutato con un errore esplicito, invece di essere passato a Mongo.
"""
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.core.database import db
from app.core.security import get_current_admin

logger = logging.getLogger(__name__)
router = APIRouter()

LIMITE_MASSIMO = 100
LIMITE_PREDEFINITO = 20
SALTO_MASSIMO = 10000

# Operatori ammessi: tutti leggono e confrontano, nessuno esegue codice.
OPERATORI_AMMESSI = {
    "$eq", "$ne", "$gt", "$gte", "$lt", "$lte",
    "$in", "$nin", "$exists", "$regex", "$or", "$and", "$not",
}

# Campi che non escono mai dal database, nemmeno per un amministratore che ha
# perso il telefono ma non la sessione.
CAMPI_RISERVATI = {
    "password_hash", "password", "hashed_password", "session_token",
    "hashed_token", "refresh_token", "secret", "api_key", "token",
    "password_reset_token", "vapid_private_key",
}


def _errore(messaggio: str) -> HTTPException:
    return HTTPException(status_code=400, detail=messaggio)


def valida_filtro(grezzo: str | None) -> dict:
    """Trasforma il filtro JSON della richiesta in un filtro sicuro per Mongo."""
    if not grezzo:
        return {}
    try:
        filtro = json.loads(grezzo)
    except json.JSONDecodeError as exc:
        raise _errore(f"Filtro non valido: non e' JSON ({exc.msg})") from exc
    if not isinstance(filtro, dict):
        raise _errore("Il filtro deve essere un oggetto JSON")
    _controlla_nodi(filtro, profondita=0)
    return filtro


def _controlla_nodi(nodo: Any, profondita: int) -> None:
    if profondita > 5:
        raise _errore("Filtro troppo annidato")
    if isinstance(nodo, dict):
        for chiave, valore in nodo.items():
            if chiave.startswith("$"):
                if chiave not in OPERATORI_AMMESSI:
                    raise _errore(
                        f"Operatore {chiave} non ammesso. Ammessi: "
                        + ", ".join(sorted(OPERATORI_AMMESSI))
                    )
            elif chiave in CAMPI_RISERVATI:
                raise _errore(f"Campo {chiave} non interrogabile")
            _controlla_nodi(valore, profondita + 1)
    elif isinstance(nodo, list):
        for elemento in nodo:
            _controlla_nodi(elemento, profondita + 1)


def valida_ordinamento(grezzo: str | None) -> list[tuple[str, int]]:
    """`-created_date` diventa [("created_date", -1)]."""
    if not grezzo:
        return []
    if "$" in grezzo or len(grezzo) > 60:
        raise _errore("Ordinamento non valido")
    direzione = -1 if grezzo.startswith("-") else 1
    campo = grezzo.lstrip("-+")
    if not re.fullmatch(r"[A-Za-z0-9_.]{1,50}", campo):
        raise _errore("Campo di ordinamento non valido")
    return [(campo, direzione)]


def valida_campi(grezzo: str | None) -> dict:
    """Trasforma `a,b,c` nella proiezione di Mongo, togliendo i campi riservati.

    `_id` esce sempre: e' un ObjectId di BSON, che FastAPI non sa trasformare
    in JSON. Senza questa esclusione la risposta diventa un errore 500, ed e'
    esattamente quello che succedeva leggendo le collezioni senza indicare i
    campi.
    """
    if not grezzo:
        return {"_id": 0}
    campi = [c.strip() for c in grezzo.split(",") if c.strip()]
    if not campi or len(campi) > 40:
        raise _errore("Elenco di campi non valido")
    proiezione: dict[str, int] = {"_id": 0}
    for campo in campi:
        if not re.fullmatch(r"[A-Za-z0-9_.]{1,50}", campo):
            raise _errore(f"Campo non valido: {campo}")
        if campo not in CAMPI_RISERVATI:
            proiezione[campo] = 1
    return proiezione


def _pulisci(documento: dict) -> dict:
    """Ultima rete di sicurezza: toglie i campi riservati prima di rispondere."""
    return {k: v for k, v in documento.items() if k not in CAMPI_RISERVATI}


async def _nomi_collezioni() -> list[str]:
    nomi = await db.list_collection_names()
    return sorted(n for n in nomi if not n.startswith("system."))


async def _collezione(nome: str):
    if not re.fullmatch(r"[A-Za-z0-9_]{1,64}", nome):
        raise _errore("Nome di collezione non valido")
    if nome not in await _nomi_collezioni():
        raise HTTPException(status_code=404, detail=f"Collezione {nome} inesistente")
    return db[nome]


@router.get("/admin/db/collections")
async def elenca_collezioni(_admin: dict = Depends(get_current_admin)):
    """Elenco delle collezioni con il numero di documenti."""
    risultato = []
    for nome in await _nomi_collezioni():
        try:
            totale = await db[nome].estimated_document_count()
        except Exception:  # pragma: no cover - dipende dal database
            totale = None
        risultato.append({"collezione": nome, "documenti": totale})
    return {
        "collezioni": risultato,
        "totale_collezioni": len(risultato),
        "documenti": sum(r["documenti"] or 0 for r in risultato),
    }


@router.get("/admin/db/collections/{nome}/count")
async def conta_documenti(
    nome: str,
    filtro: str | None = Query(None, description="Filtro JSON, es. {\"status\":\"pending\"}"),
    _admin: dict = Depends(get_current_admin),
):
    collezione = await _collezione(nome)
    query = valida_filtro(filtro)
    totale = await collezione.count_documents(query)
    return {"collezione": nome, "filtro": query, "documenti": totale}


@router.get("/admin/db/collections/{nome}/documents")
async def leggi_documenti(
    nome: str,
    request: Request,
    filtro: str | None = Query(None, description="Filtro JSON"),
    limite: int = Query(LIMITE_PREDEFINITO, ge=1, le=LIMITE_MASSIMO),
    salto: int = Query(0, ge=0, le=SALTO_MASSIMO),
    ordina: str | None = Query(None, description="Campo, con - davanti per decrescente"),
    campi: str | None = Query(None, description="Elenco separato da virgole"),
    _admin: dict = Depends(get_current_admin),
):
    """Legge documenti da una collezione, con filtro, ordinamento e proiezione."""
    collezione = await _collezione(nome)
    query = valida_filtro(filtro)
    ordinamento = valida_ordinamento(ordina)
    proiezione = valida_campi(campi)

    cursore = collezione.find(query, proiezione)
    if ordinamento:
        cursore = cursore.sort(ordinamento)
    documenti = await cursore.skip(salto).limit(limite).to_list(length=limite)
    totale = await collezione.count_documents(query)

    await _registra_lettura(request, _admin, nome, query, limite, salto, len(documenti))

    return {
        "collezione": nome,
        "documenti": [_pulisci(d) for d in documenti],
        "restituiti": len(documenti),
        "totale_con_filtro": totale,
        "salto": salto,
        "altri_documenti": max(0, totale - salto - len(documenti)),
    }


@router.get("/admin/db/overview")
async def panoramica(_admin: dict = Depends(get_current_admin)):
    """Fotografia dei dati: collezioni grandi e attività recente."""
    collezioni = []
    for nome in await _nomi_collezioni():
        voce = {"collezione": nome, "documenti": None, "ultimo": None}
        try:
            voce["documenti"] = await db[nome].estimated_document_count()
            ultimo = await db[nome].find_one({}, {"_id": 0, "created_date": 1, "created_at": 1},
                                             sort=[("_id", -1)])
            if ultimo:
                voce["ultimo"] = ultimo.get("created_date") or ultimo.get("created_at")
        except Exception:  # pragma: no cover - dipende dal database
            pass
        collezioni.append(voce)
    collezioni.sort(key=lambda v: v["documenti"] or 0, reverse=True)
    return {
        "collezioni": collezioni,
        "database": db.name,
        "letto_il": datetime.now(timezone.utc).isoformat(),
    }


async def _registra_lettura(request: Request, admin: dict, nome: str, query: dict,
                            limite: int, salto: int, restituiti: int) -> None:
    """Traccia chi legge cosa: senza traccia, un accesso anomalo e' invisibile."""
    try:
        await db.audit_log.insert_one({
            "audit_id": f"aud_{datetime.now(timezone.utc).timestamp():.0f}",
            "entity": "database", "entity_id": nome, "action": "db_read",
            "actor": admin.get("email"), "actor_role": "super_admin",
            "detail": {"filtro": query, "limite": limite, "salto": salto,
                       "restituiti": restituiti,
                       "ip": request.client.host if request.client else None},
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:  # pragma: no cover - la lettura non deve fallire per l'audit
        logger.warning("audit della lettura database non registrato per %s", nome)
