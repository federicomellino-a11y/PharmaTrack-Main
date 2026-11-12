import os
import re
import uuid
import secrets
import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, Request, Response

from app.core.database import db
from app.core.websocket import manager
from app.core.delivery_creation import costruisci_consegna
from app.core.security import (
    get_current_user,
)
from app.core.notifications import (
    create_notification_internal,
)
from app.core.winfarm_tray import con_bom, render_tray_script
from app.core.winfarm_parse import estrai_vendita, estrai_vendita_da_controlli

logger = logging.getLogger(__name__)
router = APIRouter()


# Il vocabolario dei pagamenti e' uno solo per tutta l'app: cash, pos, other.
# Il riconoscimento di Winfarm pero' parla di "card", e prima questo valore
# diventava "cash" in silenzio: un pagamento POS registrato come contanti e' un
# errore che si scopre a fine giornata, quando la cassa non torna.
PAGAMENTI = {
    "cash": "cash", "contanti": "cash", "contante": "cash", "contanti.": "cash",
    "pos": "pos", "card": "pos", "carta": "pos", "bancomat": "pos",
    "carta di credito": "pos", "elettronico": "pos", "elettronica": "pos",
    "other": "other", "altro": "other",
}


# Versione del pulsante magico che il server considera corrente. La stessa
# cifra finisce dentro lo script scaricato: quando la alzo, i PC in farmacia la
# leggono al giro successivo e si aggiornano da soli.
VERSIONE_PULSANTE = 4

def _api_pubblico(request: Request) -> str:
    """L'indirizzo dell'API, che non e' quello del sito.

    Il programma in farmacia deve mandare i POST qui: il sito (Vercel) non li
    accetta e risponde 405, che e' esattamente quello che e' successo il 6/11.
    """
    for chiave in ("API_PUBLIC_URL", "RENDER_EXTERNAL_URL"):
        valore = (os.environ.get(chiave) or "").strip()
        if valore:
            return valore.rstrip("/")
    return str(request.base_url).rstrip("/")





def serve_aggiornamento(versione_client: object) -> bool:
    """True se il client e' indietro rispetto alla versione corrente.

    Il confronto e' numerico: un client che non dichiara la versione (la prima
    release non lo faceva) vale come zero, quindi si aggiorna.
    """
    try:
        return int(versione_client or 0) < VERSIONE_PULSANTE
    except (TypeError, ValueError):
        return True


def client_online(ultimo_battito: object, adesso: datetime | None = None) -> bool:
    """Il programma e' vivo se ha battuto negli ultimi minuti.

    Cinque minuti di battito piu' due di tolleranza: sotto questa soglia dire
    "collegato" e' un fatto, non una speranza.
    """
    if not ultimo_battito:
        return False
    try:
        quando = datetime.fromisoformat(str(ultimo_battito))
    except ValueError:
        return False
    if quando.tzinfo is None:
        quando = quando.replace(tzinfo=timezone.utc)
    riferimento = adesso or datetime.now(timezone.utc)
    return (riferimento - quando) <= timedelta(minutes=7)


def normalizza_pagamento(valore: object, predefinito: str = "cash") -> str:
    """Traduce qualunque modo di scrivere il pagamento nei tre valori dell'app."""
    if valore in (None, ""):
        return predefinito
    return PAGAMENTI.get(str(valore).strip().lower(), "other")


def normalizza_cf(valore: object) -> str | None:
    """Tiene solo un codice fiscale completo: 16 caratteri alfanumerici.

    Un CF troncato o inventato non deve guidare la ricerca del cliente, perche'
    sbagliare cliente vuol dire consegnare il pacco alla persona sbagliata.
    """
    cf = re.sub(r"[^A-Z0-9]", "", str(valore or "").upper())
    return cf if len(cf) == 16 else None


def filtri_cliente(pharmacy_id: str, body: dict) -> list[dict]:
    """Come cercare il cliente, dal dato piu' affidabile al piu' debole.

    Ordine deciso con Federico: prima il codice fiscale, poi nome e cognome,
    poi il telefono. Il codice cliente esplicito, se c'e', viene prima di tutto
    perche' e' una scelta dell'utente, non un'ipotesi.
    """
    customer_id = body.get("customer_id")
    cf = normalizza_cf(body.get("codice_fiscale") or body.get("fiscal_code") or body.get("cf"))
    nome = (body.get("customer_name") or body.get("cliente") or "").strip()
    telefono = (body.get("customer_phone") or body.get("telefono") or "").strip()

    filtri: list[dict] = []
    if customer_id:
        filtri.append({"customer_id": customer_id, "pharmacy_id": pharmacy_id})
    if cf:
        filtri.append({"pharmacy_id": pharmacy_id, "fiscal_code": cf})
    if nome:
        # re.escape: un cognome con parentesi o punto non deve rompere la ricerca
        filtri.append({"pharmacy_id": pharmacy_id, "name": {"$regex": f"^{re.escape(nome)}$", "$options": "i"}})
    cifre = "".join(c for c in telefono if c.isdigit())
    if cifre:
        coda = cifre[-9:] if len(cifre) >= 9 else cifre
        filtri.append({"pharmacy_id": pharmacy_id, "phone": {"$regex": re.escape(coda) + "$"}})
    return filtri


async def _winfarm_create_delivery(pharmacy_id: str, body: dict) -> dict:
    """Crea (o riusa) una consegna da una vendita Winfarm. Condiviso tra il
    bridge desktop (token) e l'endpoint REST (sessione).
    Alias italiani accettati: cliente/telefono/indirizzo/importo/pagamento/note."""
    customer_id = body.get("customer_id")
    customer_phone = (body.get("customer_phone") or body.get("telefono") or "").strip()
    customer_name = (body.get("customer_name") or body.get("cliente") or "").strip()
    customer_address = body.get("customer_address") or body.get("indirizzo")
    amount = body.get("amount") or body.get("importo")
    payment_method = body.get("payment_method") or body.get("pagamento") or "cash"
    notes = body.get("notes") or body.get("note")
    external_ref = body.get("external_ref") or body.get("ricevuta") or body.get("scontrino")
    codice_fiscale = normalizza_cf(body.get("codice_fiscale") or body.get("fiscal_code") or body.get("cf"))

    if not (customer_id or customer_phone or customer_name):
        raise HTTPException(status_code=400, detail="Specifica customer_id, customer_phone o customer_name")

    try:
        amount_val = float(str(amount).replace(",", ".")) if amount not in (None, "") else None
    except (TypeError, ValueError):
        amount_val = None

    # --- Anti doppio: prima per riferimento della vendita, poi per tempo ---
    if external_ref:
        # Se il programma conosce il numero dello scontrino, quello comanda:
        # vale per sempre, non solo nei minuti successivi.
        dup = await db.deliveries.find_one({
            "pharmacy_id": pharmacy_id,
            "imported_from": "winfarm",
            "external_ref": external_ref,
        }, {"_id": 0})
        if dup:
            return {"delivery": dup, "customer_created": False, "duplicate": True}
    else:
        # Senza riferimento vale la finestra: dieci minuti coprono il doppio
        # clic e la pressione ripetuta, senza bloccare una seconda vendita vera
        # dello stesso cliente piu' tardi nella giornata.
        dieci_minuti_fa = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        dup = await db.deliveries.find_one({
            "pharmacy_id": pharmacy_id,
            "imported_from": "winfarm",
            "created_at": {"$gte": dieci_minuti_fa},
            "customer_name": customer_name,
            "amount": amount_val,
        }, {"_id": 0})
        if dup:
            return {"delivery": dup, "customer_created": False, "duplicate": True}

    customer = None
    for filtro in filtri_cliente(pharmacy_id, body):
        customer = await db.customers.find_one(filtro, {"_id": 0})
        if customer:
            break

    created_customer = False
    if not customer:
        # Non si crea un cliente alla cieca: senza indirizzo la consegna non e'
        # fattibile, e un cliente sbagliato in anagrafica resta per sempre.
        indirizzo_fornito = (customer_address or "").strip()
        if not (customer_name and indirizzo_fornito):
            raise HTTPException(status_code=422, detail={
                "codice": "cliente_da_inserire",
                "messaggio": "Cliente non trovato in anagrafica: inseriscilo a mano con l'indirizzo di consegna.",
                "cliente": {
                    "nome": customer_name,
                    "codice_fiscale": codice_fiscale,
                    "telefono": customer_phone,
                },
                "importo": amount_val,
            })
        customer = {
            "customer_id": f"cust_{uuid.uuid4().hex[:12]}",
            "pharmacy_id": pharmacy_id,
            "name": customer_name,
            "phone": customer_phone or "",
            "address": indirizzo_fornito,
            "email": None, "fiscal_code": codice_fiscale, "birth_date": None, "notes": None,
            "customer_lat": None, "customer_lng": None, "place_id": None,
            "extra_phones": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "imported_from": "winfarm",
        }
        await db.customers.insert_one(customer)
        customer.pop("_id", None)
        created_customer = True

    if codice_fiscale and not customer.get("fiscal_code"):
        # Il codice fiscale letto dalla schermata e' il dato piu' affidabile che
        # abbiamo: se il cliente c'era ma senza CF, glielo scriviamo adesso.
        await db.customers.update_one(
            {"customer_id": customer["customer_id"], "pharmacy_id": pharmacy_id},
            {"$set": {"fiscal_code": codice_fiscale}})
        customer["fiscal_code"] = codice_fiscale

    delivery_data = costruisci_consegna(
        pharmacy_id=pharmacy_id,
        customer=customer,
        delivery_id=f"del_{uuid.uuid4().hex[:12]}",
        notes=notes,
        payment_method=normalizza_pagamento(payment_method),
        amount=amount_val,
        imported_from="winfarm",
        external_ref=external_ref,
    )
    await db.deliveries.insert_one(delivery_data)

    await create_notification_internal(
        pharmacy_id, "pharmacy",
        "Nuova consegna da Winfarm",
        f"{customer['name']} · {('€' + format(amount_val, '.2f')) if amount_val is not None else 'importo da definire'}",
        "delivery", {"delivery_id": delivery_data["delivery_id"]},
    )
    try:
        await manager.send_personal_message(
            {"type": "new_delivery", "delivery_id": delivery_data["delivery_id"]}, pharmacy_id, "pharmacy")
    except Exception:
        logger.warning("WebSocket notify fallita per %s", delivery_data["delivery_id"])

    return {
        "delivery": {k: v for k, v in delivery_data.items() if k != "_id"},
        "customer_created": created_customer,
        "customer": customer,
        "duplicate": False,
    }


async def _bridge_pharmacy(request: Request) -> dict:
    """Autentica il bridge desktop con il token della farmacia."""
    token = request.headers.get("X-Bridge-Token") or request.query_params.get("t") or ""
    token = token.strip()
    if not token:
        raise HTTPException(status_code=401, detail="Token bridge mancante")
    user = await db.users.find_one({"bridge_token": token}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Token bridge non valido")
    return user


@router.get("/integrations/winfarm/status")
async def winfarm_status(request: Request, user: dict = Depends(get_current_user)):
    """Stato del bridge: token configurato, ultimo import, conteggi."""
    # Leggere non deve scrivere: il token nasce al primo download del
    # programma, dove serve davvero. Prima questa GET lo creava, e una
    # richiesta di sola lettura cambiava il database.
    token = user.get("bridge_token")
    last = await db.deliveries.find_one(
        {"pharmacy_id": user["user_id"], "imported_from": "winfarm"}, {"_id": 0}, sort=[("created_at", -1)])
    today_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    imports_today = await db.deliveries.count_documents({
        "pharmacy_id": user["user_id"], "imported_from": "winfarm",
        "created_at": {"$gte": today_iso}})
    total = await db.deliveries.count_documents({"pharmacy_id": user["user_id"], "imported_from": "winfarm"})
    return {
        "configured": True,
        "token_configurato": bool(token),
        "token_preview": f"{token[:5]}...{token[-4:]}" if token else None,
        "last_import": last.get("created_at") if last else None,
        "last_import_customer": last.get("customer_name") if last else None,
        "imports_today": imports_today,
        "imports_total": total,
        "bridge_last_seen": user.get("bridge_last_seen"),
        "bridge_version": user.get("bridge_version"),
        "bridge_online": client_online(user.get("bridge_last_seen")),
        "pharmacy_name": user.get("pharmacy_name") or user.get("name"),
        "base_url": (request.headers.get("origin") or "").rstrip("/"),
    }


@router.get("/integrations/winfarm/tray/download")
async def winfarm_tray_download(request: Request):
    """Pulsante magico (icona + tasto) gia' configurato con indirizzo e token.

    Accetta la sessione del browser e anche il token del PC: e' cosi' che il
    programma si riscarica da solo quando c'e' una versione nuova.
    """
    if (request.headers.get("X-Bridge-Token") or "").strip():
        user = await _bridge_pharmacy(request)
    else:
        user = await get_current_user(request)
    token = user.get("bridge_token")
    if not token:
        token = f"wf_{secrets.token_urlsafe(24)}"
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"bridge_token": token}})
    base_url = (request.query_params.get("base") or request.headers.get("origin")
                or os.environ.get("APP_BASE_URL") or "https://pharmatrack-zeta.vercel.app")
    script = render_tray_script(
        base_url,
        token,
        user.get("pharmacy_name") or user.get("name") or "",
        api_url=_api_pubblico(request),
    )
    return Response(
        content=con_bom(script),
        media_type="application/octet-stream",
        headers={"Content-Disposition": 'attachment; filename="pharmatrack-pulsante-magico.ps1"'},
    )


@router.post("/integrations/winfarm/heartbeat")
async def winfarm_heartbeat(request: Request):
    """Il programma dice "sono vivo" e chiede se c'e' una versione nuova.

    Una chiamata sola fa due cose: rende vero lo stato in pagina (invece di
    dedurlo dall'ultimo import) e dice al PC se deve aggiornarsi.
    """
    pharmacy = await _bridge_pharmacy(request)
    try:
        body = await request.json()
    except Exception:
        body = {}
    body = body or {}
    adesso = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"user_id": pharmacy["user_id"]},
        {"$set": {
            "bridge_last_seen": adesso,
            "bridge_version": body.get("versione"),
            "bridge_host": (str(body.get("host") or "")[:60] or None),
        }},
    )
    return {
        "ok": True,
        "versione_ultima": VERSIONE_PULSANTE,
        "aggiorna": serve_aggiornamento(body.get("versione")),
        "scaricabile": "/api/integrations/winfarm/tray/download",
    }


@router.post("/integrations/winfarm/parse")
async def winfarm_parse(request: Request):
    """Legge una vendita e dice cosa ha riconosciuto. Non crea nulla.

    Due sorgenti, perche' i gestionali si leggono in due modi:

    - "controlli": l'elenco dei testi che Windows espone all'accessibilita'.
      E' la via buona quando c'e': nessun errore di lettura, nessuna
      dipendenza dalla risoluzione dello schermo.
    - "testo": il testo incollato o letto da OCR, per i gestionali che non
      espongono niente.

    Serve a due cose: far provare il riconoscimento alla farmacia con una
    vendita vera, e dare al programma desktop un cervello che si migliora lato
    server senza reinstallare niente sul PC. Niente viene salvato.

    Due modi per autenticarsi: la sessione della farmacia quando la prova parte
    dalla pagina Integrazioni, oppure il token del bridge quando la chiamata
    arriva dal programma sul PC. Senza il secondo, il pulsante magico dovrebbe
    tenere aperto un browser solo per farsi leggere una schermata.
    """
    if (request.headers.get("X-Bridge-Token") or "").strip():
        await _bridge_pharmacy(request)
    else:
        await get_current_user(request)
    if len(await request.body()) > 40000:
        raise HTTPException(status_code=413, detail="Testo troppo lungo")
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Payload non valido")
    body = body or {}
    controlli = body.get("controlli")
    if controlli is not None:
        if not isinstance(controlli, list) or len(controlli) > 3000:
            raise HTTPException(status_code=400, detail="Elenco controlli non valido")
        return estrai_vendita_da_controlli([str(c) for c in controlli if c is not None])
    testo = str(body.get("testo") or "")
    if not testo.strip():
        raise HTTPException(status_code=400, detail="Serve 'controlli' oppure 'testo'")
    return estrai_vendita(testo)


@router.post("/integrations/winfarm/bridge")
async def winfarm_bridge_import(request: Request):
    """Endpoint chiamato dallo script desktop: token della farmacia nell'header."""
    pharmacy = await _bridge_pharmacy(request)
    body = dict(request.query_params)
    if not body.get("cliente") and not body.get("telefono"):
        try:
            payload = await request.json()
            if isinstance(payload, dict):
                body.update(payload)
        except Exception:
            pass
    result = await _winfarm_create_delivery(pharmacy["user_id"], body)
    if result.get("duplicate"):
        raise HTTPException(status_code=409, detail="Consegna già importata")
    return result


@router.post("/integrations/winfarm/import")
async def winfarm_import(request: Request, user: dict = Depends(get_current_user)):
    """Endpoint REST (sessione farmacia). Accetta JSON con alias italiani."""
    body = await request.json()
    return await _winfarm_create_delivery(user["user_id"], body or {})
