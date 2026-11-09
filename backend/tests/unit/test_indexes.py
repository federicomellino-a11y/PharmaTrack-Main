"""Gli indici si dichiarano una volta sola.

Il 9/11 all'avvio in produzione compariva:

    Index creation skipped (notifications.notifications_user_created_idx):
    Index already exists with a different name:
    notifications_user_type_created_idx

Erano due righe in server.py che dichiaravano lo stesso indice (stessi campi,
stesso ordine) con due nomi diversi: la seconda non poteva mai riuscire. Non
rompeva niente, ma sporcava i log a ogni deploy e faceva credere a un problema
di database. Questo test legge server.py e lo impedisce.
"""

import ast
import collections
from pathlib import Path

SERVER = Path(__file__).resolve().parents[2] / "server.py"


def _dichiarazioni():
    albero = ast.parse(SERVER.read_text())
    for nodo in ast.walk(albero):
        if isinstance(nodo, ast.Call) and getattr(nodo.func, "id", "") == "safe_create_index":
            if len(nodo.args) < 2:
                continue
            collezione = getattr(nodo.args[0], "attr", None)
            chiavi = ast.unparse(nodo.args[1])
            nome = next((ast.unparse(k.value) for k in nodo.keywords if k.arg == "name"), None)
            if collezione:
                yield collezione, chiavi, nome, nodo.lineno


def test_nessun_indice_dichiarato_due_volte_con_nomi_diversi():
    gruppi = collections.defaultdict(list)
    for collezione, chiavi, nome, riga in _dichiarazioni():
        gruppi[(collezione, chiavi)].append((nome, riga))

    conflitti = {
        chiave: elenco for chiave, elenco in gruppi.items()
        if len({nome for nome, _ in elenco}) > 1
    }
    messaggi = [
        f"{coll} su {chiavi}: " + ", ".join(f"{nome} (riga {riga})" for nome, riga in elenco)
        for (coll, chiavi), elenco in conflitti.items()
    ]
    assert not messaggi, "stesso indice dichiarato con nomi diversi -> " + " | ".join(messaggi)


def test_gli_indici_dichiarati_hanno_un_nome():
    senza_nome = [f"{coll} riga {riga}" for coll, _, nome, riga in _dichiarazioni() if not nome]
    assert not senza_nome, f"indici senza nome: {senza_nome}"
