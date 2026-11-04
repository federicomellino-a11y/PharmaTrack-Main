"""Fotografia del database: struttura, indici e difetti dei dati.

Sola lettura: nessuna scrittura, nessuna modifica di schema. Serve a rispondere
a due domande: com'e' fatto il database oggi, e quali problemi sono gia'
presenti o si presenteranno quando i dati crescono.

Uso:  MONGO_URL='mongodb+srv://...' python audit_db.py [--json]
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone

from pymongo import MongoClient

MASCHERA = re.compile(r"^(.{2}).*(@.*)$")
COLLEZIONI_ATTESE = [
    "users", "customers", "drivers", "deliveries", "messages", "chat_threads",
    "notifications", "driver_shifts", "delivery_photos", "photo_files",
    "doctors_list", "useful_numbers", "notes", "user_sessions",
    "driver_sessions", "admin_sessions", "password_reset_tokens",
    "email_verifications", "push_subscriptions", "audit_log", "client_errors",
    "csp_reports",
]
SESSIONI = {
    "user_sessions": "session_token",
    "driver_sessions": "session_token",
    "admin_sessions": "session_token",
}
SCADENZA = {
    "password_reset_tokens": "expires_at",
    "email_verifications": "expires_at",
    "user_sessions": "expires_at",
    "driver_sessions": "expires_at",
    "admin_sessions": "expires_at",
}
# Riferimenti da controllare: campo -> collezione dove deve esistere
RIFERIMENTI = [
    ("deliveries", "customer_id", "customers", "customer_id"),
    ("deliveries", "driver_id", "drivers", "driver_id"),
    ("deliveries", "pharmacy_id", "users", "user_id"),
    ("deliveries", "created_by", "users", "user_id"),
    ("drivers", "pharmacy_id", "users", "user_id"),
    ("customers", "pharmacy_id", "users", "user_id"),
    ("messages", "sender_id", None, None),
    ("messages", "conversation_id", "chat_threads", "conversation_id"),
    ("driver_shifts", "driver_id", "drivers", "driver_id"),
    ("driver_shifts", "pharmacy_id", "users", "user_id"),
    ("audit_log", "actor", "users", "user_id"),
    ("delivery_photos", "delivery_id", "deliveries", "delivery_id"),
]
CAMPI_CHIAVE = {
    "users": ["user_id", "email", "role", "pharmacy_name"],
    "customers": ["customer_id", "name", "address", "pharmacy_id"],
    "deliveries": ["delivery_id", "status", "customer_id", "pharmacy_id", "created_at"],
    "drivers": ["driver_id", "name", "phone", "pharmacy_id"],
    "driver_shifts": ["shift_id", "driver_id", "started_at", "status"],
    "notifications": ["notification_id", "user_id", "user_type", "is_read"],
    "chat_threads": ["conversation_id", "pharmacy_id"],
    "messages": ["conversation_id", "content", "created_at"],
}
UNIVOCI = {
    "users": "user_id",
    "customers": "customer_id",
    "deliveries": "delivery_id",
    "drivers": "driver_id",
    "driver_shifts": "shift_id",
    "chat_threads": "conversation_id",
}
# Campi che DEVONO stare sotto un indice, altrimenti la query peggiora con i dati
QUERY_FREQUENTI = {
    "user_sessions": ["session_token"],
    "driver_sessions": ["session_token"],
    "admin_sessions": ["session_token"],
    "deliveries": ["pharmacy_id", "status", "driver_id"],
    "drivers": ["pharmacy_id"],
    "customers": ["pharmacy_id"],
    "notifications": ["user_id", "user_type"],
    "messages": ["conversation_id"],
    "audit_log": ["entity_id"],
}


def maschera(valore):
    if isinstance(valore, str) and "@" in valore:
        return MASCHERA.sub(r"\1***\2", valore)
    return valore


def tipo(valore):
    if valore is None:
        return "null"
    if isinstance(valore, bool):
        return "bool"
    if isinstance(valore, (int, float)):
        return "numero"
    if isinstance(valore, datetime):
        return "data"
    if isinstance(valore, str):
        return "testo"
    if isinstance(valore, (list, tuple)):
        return "lista"
    if isinstance(valore, dict):
        return "oggetto"
    return type(valore).__name__


def analizza_documenti(collezione, limite=3000):
    """Campi presenti, tipi visti, nulli e conflitti di tipo."""
    campi = defaultdict(lambda: {"presente": 0, "nulli": 0, "tipi": Counter()})
    totale = 0
    for doc in collezione.find({}).limit(limite):
        totale += 1
        for nome, valore in doc.items():
            if nome == "_id":
                continue
            info = campi[nome]
            info["presente"] += 1
            if valore is None:
                info["nulli"] += 1
            info["tipi"][tipo(valore)] += 1
    return totale, campi


INDICI_SICURI = {
    # collezione: [(campi, unico)]
    "audit_log": [([("entity_id", 1), ("created_at", -1)], False), ([("delivery_id", 1)], False)],
    "client_errors": [([("created_at", -1)], False)],
    "delivery_photos": [([("delivery_id", 1)], False), ([("pharmacy_id", 1), ("uploaded_at", -1)], False)],
    "password_reset_tokens": [([("token", 1)], True), ([("user_id", 1)], False)],
}


def crea_indici(client, nomi_db):
    """Aggiunge solo indici che mancano. Non tocca documenti."""
    for nome_db in nomi_db:
        d = client[nome_db]
        presenti = set(d.list_collection_names())
        for coll, elenco in INDICI_SICURI.items():
            if coll not in presenti:
                continue
            esistenti = [" ".join(k for k, _ in defn["key"]) for defn in d[coll].index_information().values()]
            for campi, unico in elenco:
                firma = " ".join(k for k, _ in campi)
                if firma in esistenti:
                    continue
                nome = coll + "_" + "_".join(k for k, _ in campi) + "_idx"
                d[coll].create_index(campi, name=nome[:120], unique=unico, background=True)
                print(f"indice creato: {nome_db}.{coll} su {firma}{' (unico)' if unico else ''}")


def main():
    url = os.environ.get("MONGO_URL", "")
    if not url:
        sys.exit("Manca MONGO_URL")
    client = MongoClient(url, serverSelectionTimeoutMS=20000)
    out = {"quando": datetime.now(timezone.utc).isoformat(), "problemi": [], "note": []}
    if "--crea-indici" in sys.argv:
        crea_indici(client, [n for n in client.list_database_names()
                             if n not in ("admin", "local", "config")])
    problema = out["problemi"].append

    nomi_db = [n for n in client.list_database_names() if n not in ("admin", "local", "config")]
    out["database"] = nomi_db

    for nome_db in nomi_db:
        dbase = client[nome_db]
        if not any(dbase[c].estimated_document_count() > 0 for c in dbase.list_collection_names() if not c.startswith("system.")):
            out["note"].append(f"database {nome_db} senza documenti")
        for nome in sorted(dbase.list_collection_names()):
            if nome.startswith("system."):
                continue
            coll = dbase[nome]
            quanti = coll.estimated_document_count()
            if quanti == 0:
                continue
            info = {"collezione": f"{nome_db}.{nome}", "documenti": quanti}

            # indici
            indici = []
            for nome_indice, defn in coll.index_information().items():
                chiavi = [f"{k}:{v}" for k, v in defn["key"]]
                indici.append({
                    "nome": nome_indice,
                    "campi": chiavi,
                    "unico": bool(defn.get("unique")),
                    "ttl": defn.get("expireAfterSeconds"),
                })
            info["indici"] = indici

            # struttura dei documenti
            esaminati, campi = analizza_documenti(coll)
            info["campi"] = {}
            for campo, dati in sorted(campi.items(), key=lambda x: -x[1]["presente"]):
                prevalente = dati["tipi"].most_common(1)[0][0]
                info["campi"][campo] = {
                    "in": round(100 * dati["presente"] / esaminati),
                    "tipo": prevalente,
                    "nulli": dati["nulli"],
                }
                if len([t for t, n in dati["tipi"].items() if n > 0 and t != "null"]) > 1:
                    problema(f"{nome_db}.{nome}: il campo {campo} ha tipi diversi {dict(dati['tipi'])}")

            # campi mancanti su collezioni con schema atteso
            for campo in CAMPI_CHIAVE.get(nome, []):
                if campo not in campi:
                    problema(f"{nome_db}.{nome}: manca il campo atteso {campo}")

            # duplicati su chiavi logiche e indici unici
            campo_unico = UNIVOCI.get(nome)
            if campo_unico:
                gruppi = list(coll.aggregate([
                    {"$match": {campo_unico: {"$exists": True, "$ne": None}}},
                    {"$group": {"_id": f"${campo_unico}", "n": {"$sum": 1}}},
                    {"$match": {"n": {"$gt": 1}}},
                    {"$limit": 5},
                ], allowDiskUse=True))
                if gruppi:
                    problema(f"{nome_db}.{nome}: {len(gruppi)}+ valori duplicati su {campo_unico}")
                if not any(i["unico"] and campo_unico in " ".join(i["campi"]) for i in indici):
                    out.setdefault("indici_mancanti", []).append(f"{nome_db}.{nome}.{campo_unico} (unico)")

            # indici attesi dalle query frequenti
            for campo in QUERY_FREQUENTI.get(nome, []):
                if not any(campo in " ".join(i["campi"]) for i in indici):
                    out.setdefault("indici_mancanti", []).append(f"{nome_db}.{nome}.{campo}")

            # scadenze: sessioni e token vecchi
            if nome in SCADENZA:
                campo_scad = SCADENZA[nome]
                adesso = datetime.now(timezone.utc)
                try:
                    vecchie = dbase[nome].count_documents({campo_scad: {"$lt": adesso}})
                    senza = dbase[nome].count_documents({campo_scad: {"$exists": False}})
                    info["scadute"] = vecchie
                    if vecchie > 0:
                        problema(f"{nome_db}.{nome}: {vecchie} righe scadute ancora presenti "
                                 f"(crescita inutile, e se la scadenza non viene controllata "
                                 f"diventano una porta aperta)")
                    if senza > 0:
                        problema(f"{nome_db}.{nome}: {senza} righe senza {campo_scad}")
                except Exception as errore:
                    out["note"].append(f"{nome_db}.{nome}: scadenza non verificabile ({type(errore).__name__})")
                if not any(i["ttl"] for i in indici):
                    out.setdefault("indici_mancanti", []).append(f"{nome_db}.{nome}.{campo_scad} (TTL)")

            out.setdefault("collezioni", []).append(info)

    # riferimenti rotti
    for nome, campo, coll_dest, campo_dest in RIFERIMENTI:
        if coll_dest is None:
            continue
        for nome_db in nomi_db:
            dbase = client[nome_db]
            if nome not in dbase.list_collection_names() or coll_dest not in dbase.list_collection_names():
                continue
            validi = set(dbase[coll_dest].distinct(campo_dest))
            orfani = 0
            esempi = []
            for doc in dbase[nome].find({campo: {"$exists": True, "$ne": None}}, {campo: 1}):
                if doc.get(campo) not in validi:
                    orfani += 1
                    if len(esempi) < 3:
                        esempi.append(maschera(doc.get(campo)))
            if orfani:
                problema(f"{nome_db}.{nome}.{campo}: {orfani} riferimenti a {coll_dest} inesistenti "
                         f"({', '.join(map(str, esempi))})")

    # fotografie rimaste senza la loro consegna (la cancellazione non le tocca)
    for nome_db in nomi_db:
        d = client[nome_db]
        if "delivery_photos" in d.list_collection_names() and "deliveries" in d.list_collection_names():
            vive = set(d.deliveries.distinct("delivery_id"))
            orfane = [p for p in d.delivery_photos.distinct("delivery_id") if p not in vive]
            if orfane:
                problema(f"{nome_db}.delivery_photos: {len(orfane)} foto di consegne cancellate "
                         f"({', '.join(map(str, orfane[:3]))}): il file resta occupando spazio")

    # turni chiusi senza ora di fine
    for nome_db in nomi_db:
        d = client[nome_db]
        if "driver_shifts" in d.list_collection_names():
            incoerenti = d.driver_shifts.count_documents({
                "status": {"$in": ["closed", "settled"]},
                "ended_at": None,
            })
            if incoerenti:
                problema(f"{nome_db}.driver_shifts: {incoerenti} turni chiusi senza ended_at "
                         f"(i conti tornano ma la durata del turno è ignota)")

    # token e sessioni scaduti rimasti in giro (le date sono stringhe, niente TTL)
    for nome_db in nomi_db:
        d = client[nome_db]
        for nome in ("password_reset_tokens", "email_verifications"):
            if nome not in d.list_collection_names():
                continue
            adesso = datetime.now(timezone.utc).isoformat()
            vecchi = d[nome].count_documents({"expires_at": {"$lt": adesso}})
            if vecchi:
                out["note"].append(f"{nome_db}.{nome}: {vecchi} righe scadute ancora presenti "
                                   f"(la scadenza è controllata in lettura, quindi non sono un "
                                   f"pericolo, ma la tabella cresce senza pulizia)")

    # collezioni attese che non esistono
    for nome_db in nomi_db:
        presenti = set(client[nome_db].list_collection_names())
        for attesa in COLLEZIONI_ATTESE:
            if attesa in presenti and client[nome_db][attesa].estimated_document_count() == 0:
                out["note"].append(f"{nome_db}.{attesa} esiste ma è vuota")

    client.close()
    if "--json" in sys.argv:
        print(json.dumps(out, indent=2, ensure_ascii=False, default=str))
    else:
        print("DATABASE:", ", ".join(out["database"]))
        for c in out.get("collezioni", []):
            print(f"\n{c['collezione']} ({c['documenti']} documenti)")
            print("  indici:", "; ".join(
                f"{i['nome']}[{','.join(i['campi'])}]{' unico' if i['unico'] else ''}{' ttl' if i['ttl'] else ''}"
                for i in c["indici"]) or "NESSUNO")
            print("  campi:", ", ".join(f"{k}({v['in']}%,{v['tipo']})" for k, v in list(c["campi"].items())[:12]))
        if out.get("indici_mancanti"):
            print("\nINDICI DA AGGIUNGERE:")
            for i in sorted(set(out["indici_mancanti"])):
                print("  -", i)
        print("\nPROBLEMI:", len(out["problemi"]))
        for p in out["problemi"]:
            print("  !", p)
        if out["note"]:
            print("\nNOTE:")
            for n in out["note"]:
                print("  ·", n)


if __name__ == "__main__":
    main()
