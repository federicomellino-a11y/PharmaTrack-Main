"""Le chiamate del frontend devono esistere nel backend.

Il difetto piu' frequente non e' una funzione scritta male: e' un rinominamento
fatto su un lato solo. Se qualcuno cambia `/api/deliveries/{id}/settle` e il
frontend continua a chiamare il vecchio nome, la CI resta verde e il 404 arriva
in produzione.

Qui si confrontano due elenchi veri, non due intenzioni:

- il frontend, cercando ogni `${API}/...` nei sorgenti (i `${...}` interni
  diventano un segmento "parametro");
- il backend, leggendo le rotte dell'app FastAPI.

Le chiamate costruite a runtime (`${API}${percorso}`) non sono leggibili da
un'analisi statica: stanno in `DINAMICHE` con il motivo, e il test fallisce se
quel codice sparisce (cosi' la lista non invecchia da sola).
"""
from __future__ import annotations

import os
import re
from pathlib import Path

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "pharmatrack_test")

RADICE = Path(__file__).resolve().parents[3]
FRONTEND = RADICE / "frontend" / "src"

# Chiamate che un'analisi statica non puo' risolvere, con il motivo.
DINAMICHE = {
    "${API}${percorso}": "helper generico in src/lib/api.js: il percorso arriva da chi lo chiama",
    "${API}${url}": "unico punto di chiamata per i verbi HTTP generici",
}


# Un'espressione semplice dentro ${...}: un parametro del percorso.
PARAMETRO = re.compile(r"^\s*[A-Za-z_$][\w.$\[\]]*\s*$")


def _pulisci(percorso: str) -> str:
    """Toglie le parti che non sono un percorso.

    ``/deliveries${status ? `?status=...` : ''}`` contiene una scelta, non un
    parametro: dopo quel punto la strada non e' piu' deducibile, quindi si tiene
    solo la parte prima (che e' quella che il backend deve conoscere).
    """
    for trovato in re.finditer(r"\$\{([^}]*)\}", percorso):
        if not PARAMETRO.match(trovato.group(1)):
            percorso = percorso[: trovato.start()]
            break
    # un "${" senza chiusura: il testo e' stato troncato a meta' espressione
    aperto = re.search(r"\$\{[^}]*$", percorso)
    if aperto:
        percorso = percorso[: aperto.start()]
    return percorso


def _segmenti(percorso: str) -> list[str]:
    """Divide un percorso in segmenti normalizzati: ogni parametro diventa {}."""
    percorso = _pulisci(percorso).split("?")[0].split("#")[0].strip()
    percorso = percorso.rstrip("/")
    segmenti = []
    for pezzo in percorso.split("/"):
        if pezzo.startswith("{") or pezzo.startswith("${") or pezzo.startswith(":"):
            segmenti.append("{}")
        else:
            segmenti.append(pezzo)
    return segmenti


# "${API}" davanti al percorso...
SCOPERTA = re.compile(r"\$\{API\}(\S*?)(?=[`'\"\s]|$)")
# ...oppure un percorso passato a una chiamata HTTP senza "${API}":
#   get('/customers'), getLista(`/drivers/${id}/stats`), axios.post('/auth/login', ...)
LETTURA = re.compile(r"\b(?:get|getLista|axios\.(?:get|post|put|patch|delete))\s*\(\s*[`'\"](/[^`'\"]*)[`'\"]")


def _chiamate_frontend() -> dict[str, list[str]]:
    """Ogni chiamata API scritta nei sorgenti, con i file che la contengono."""
    trovate: dict[str, list[str]] = {}
    for file in FRONTEND.rglob("*"):
        if file.suffix not in {".js", ".jsx", ".ts", ".tsx"} or "__tests__" in file.parts:
            continue
        testo = file.read_text(encoding="utf-8", errors="ignore")
        relativo = str(file.relative_to(RADICE))
        for trovato in SCOPERTA.finditer(testo):
            coda = trovato.group(1)
            # una concatenazione con variabile ("+ id") non e' un percorso leggibile
            if "+" in coda or "'" in coda:
                continue
            trovate.setdefault("${API}" + coda, []).append(relativo)
        for trovato in LETTURA.finditer(testo):
            # il parametro ${...} puo' stare a meta' percorso: normalizzato dopo
            trovate.setdefault("${API}" + trovato.group(1), []).append(relativo)
    return trovate


def _rotte_backend() -> set[tuple[str, ...]]:
    from server import app

    rotte = set()
    for rotta in app.routes:
        percorso = getattr(rotta, "path", None)
        if percorso and percorso.startswith("/api"):
            rotte.add(tuple(_segmenti(percorso)))
    return rotte


def _compatibile(chiamata: list[str], rotta: tuple[str, ...]) -> bool:
    if len(chiamata) != len(rotta):
        return False
    for mio, suo in zip(chiamata, rotta):
        if mio == "{}":
            if suo != "{}":
                return False
        elif mio != suo:
            return False
    return True


@pytest.fixture(scope="module")
def rotte():
    return _rotte_backend()


def test_il_confronto_vede_le_rotte_vere(rotte):
    """Se l'introspezione si rompesse, il test passerebbe sempre: non deve."""
    assert len(rotte) > 50, "nessuna rotta letta dal backend: il test non controllerebbe niente"
    assert ("", "api", "deliveries") in rotte
    assert ("", "api", "auth", "demo") in rotte


def test_ogni_chiamata_del_frontend_esiste_nel_backend(rotte):
    orfane = {}
    for chiave, file in _chiamate_frontend().items():
        if chiave in DINAMICHE:
            continue
        finale = chiave[len("${API}"):]
        segmenti = _segmenti("/api" + finale)
        if not any(_compatibile(segmenti, rotta) for rotta in rotte):
            orfane[chiave] = file
    dettaglio = "\n".join(f"  {chiave}  <- {', '.join(sorted(file))}" for chiave, file in sorted(orfane.items()))
    assert not orfane, f"chiamate del frontend senza rotta nel backend:\n{dettaglio}"


def test_le_chiamate_dinamiche_esistono_ancora():
    """Una voce in DINAMICHE che non c'e' piu' nel codice e' zavorra: va tolta."""
    testo = "\n".join(
        file.read_text(encoding="utf-8", errors="ignore")
        for file in FRONTEND.rglob("*")
        if file.suffix in {".js", ".jsx", ".ts", ".tsx"} and "__tests__" not in file.parts
    )
    for chiave, motivo in DINAMICHE.items():
        assert chiave in testo, f"{chiave} non c'e' piu' nei sorgenti: togli la voce ({motivo})"
