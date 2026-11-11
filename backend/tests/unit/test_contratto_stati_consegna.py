"""Nessun router cambia lo stato di una consegna a mano.

Lo stato di una consegna decide soldi e visibilita': una consegna "consegnata"
senza incasso entra nei report, una "annullata" non torna piu' nel giro del
fattorino. La regola su cosa puo' diventare cosa sta in un posto solo,
`app/core/delivery_lifecycle.py`, e si applica con `valuta_scrittura()` o con i
costruttori `build_*_updates()`.

Questo test guarda i router e pretende che ogni scrittura di uno stato
letterale passi da li'. Le letture (filtri `{"status": "delivered"}` e
`query["status"] = ...`) sono legittime e restano: sono domande, non decisioni.
"""
from __future__ import annotations

import ast
from pathlib import Path

import pytest

RADICE = Path(__file__).resolve().parents[2]
ROUTER = RADICE / "app" / "routers"


def _stati_conosciuti() -> set[str]:
    from app.core.delivery_lifecycle import ACTIVE_STATUSES, ARCHIVED_STATUSES

    return set(ACTIVE_STATUSES) | set(ARCHIVED_STATUSES)


class _Scritture(ast.NodeVisitor):
    """Raccoglie le scritture di stato, saltando i filtri.

    Un filtro e' un dict dentro `$match` (aggregation) oppure un'assegnazione su
    una variabile che si chiama query/filtro/match: li' lo stato non si scrive,
    si cerca.
    """

    # Chiamate che leggono: il dict che ricevono e' un filtro, non una scrittura.
    LETTURE = {"find", "find_one", "aggregate", "count_documents", "distinct", "estimated_document_count"}

    # Chiamate che leggono: quello che ricevono e' un filtro, non una scrittura.
    LETTURE = {"find", "find_one", "aggregate", "count_documents", "distinct", "estimated_document_count"}

    def __init__(self, stati: set[str]):
        self.stati = stati
        self.trovate: list[tuple[int, str]] = []
        self.in_filtro = 0

    def visit_Call(self, nodo: ast.Call):
        nome = getattr(nodo.func, "attr", getattr(nodo.func, "id", ""))
        if nome in self.LETTURE:
            self.in_filtro += 1
            self.generic_visit(nodo)
            self.in_filtro -= 1
            return
        self.generic_visit(nodo)

    def visit_Dict(self, nodo: ast.Dict):
        for chiave, valore in zip(nodo.keys, nodo.values):
            if isinstance(chiave, ast.Constant) and chiave.value == "$match" and isinstance(valore, ast.Dict):
                # il filtro dell'aggregation: una domanda, non una decisione
                self.in_filtro += 1
                self.visit(valore)
                self.in_filtro -= 1
                continue
            if (
                not self.in_filtro
                and isinstance(chiave, ast.Constant)
                and chiave.value == "status"
                and isinstance(valore, ast.Constant)
                and valore.value in self.stati
            ):
                self.trovate.append((nodo.lineno, valore.value))
                continue
            self.visit(valore)

    def visit_Assign(self, nodo: ast.Assign):
        for bersaglio in nodo.targets:
            if (
                isinstance(bersaglio, ast.Subscript)
                and isinstance(bersaglio.slice, ast.Constant)
                and bersaglio.slice.value == "status"
                and isinstance(nodo.value, ast.Constant)
                and nodo.value.value in self.stati
            ):
                nome = bersaglio.value.id if isinstance(bersaglio.value, ast.Name) else ""
                if nome.lower() in {"query", "filtro", "filtri", "match", "filtro_query"}:
                    continue
                self.trovate.append((nodo.lineno, nodo.value.value))
        self.generic_visit(nodo)


def _valida(nodo: ast.AST) -> bool:
    """La funzione applica la regola? (valuta_scrittura o un costruttore build_*)"""
    for figlio in ast.walk(nodo):
        if isinstance(figlio, ast.Call):
            nome = getattr(figlio.func, "id", getattr(figlio.func, "attr", ""))
            if nome == "valuta_scrittura":
                return True
        if isinstance(figlio, ast.Name) and figlio.id.startswith("build_"):
            return True
    return False


def _scritture_per_funzione(file: Path, stati: set[str]):
    albero = ast.parse(file.read_text(encoding="utf-8"))
    for nodo in ast.walk(albero):
        if not isinstance(nodo, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        cercatore = _Scritture(stati)
        for figlio in nodo.body:
            cercatore.visit(figlio)
        if cercatore.trovate:
            yield nodo, cercatore.trovate


def test_nessun_router_scrive_uno_stato_a_mano():
    stati = _stati_conosciuti()
    assert {"delivered", "cancelled", "assigned"} <= stati, "letti stati inattesi dal modulo di vita"

    illeciti = []
    controllate = 0
    for file in sorted(ROUTER.glob("*.py")):
        for funzione, scritture in _scritture_per_funzione(file, stati):
            controllate += 1
            if _valida(funzione):
                continue
            elenco = ", ".join(f"riga {riga} -> {stato}" for riga, stato in scritture)
            illeciti.append(f"  {file.name}:{funzione.lineno} {funzione.name}: {elenco}")

    assert controllate >= 6, f"trovate solo {controllate} funzioni che scrivono lo stato: il test non guarda niente"
    assert not illeciti, (
        "queste funzioni scrivono uno stato senza passare da delivery_lifecycle:\n"
        + "\n".join(illeciti)
        + "\nUsa valuta_scrittura() o un costruttore build_*_updates()."
    )


def test_i_filtri_non_vengono_scambiati_per_scritture():
    """Il test deve saper distinguere una domanda da una decisione.

    Se questa distinzione si rompesse, il test precedente diventerebbe rumore e
    qualcuno lo disattiverebbe: qui si verifica su un caso vero del repo.
    """
    stati = _stati_conosciuti()
    testo = "async def f():\n" \
            "    cursore = db.deliveries.find({'status': 'delivered'})\n" \
            "    query = {}\n" \
            "    query['status'] = 'cancelled'\n" \
            "    return None\n"
    albero = ast.parse(testo)
    cercatore = _Scritture(stati)
    for figlio in albero.body[0].body:
        cercatore.visit(figlio)
    assert cercatore.trovate == [], f"un filtro e' stato scambiato per una scrittura: {cercatore.trovate}"

    testo_2 = "async def f():\n" \
              "    update = {'status': 'delivered'}\n" \
              "    return update\n"
    albero_2 = ast.parse(testo_2)
    cercatore_2 = _Scritture(stati)
    for figlio in albero_2.body[0].body:
        cercatore_2.visit(figlio)
    assert cercatore_2.trovate == [(2, "delivered")], "una scrittura vera non e' stata vista"


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
