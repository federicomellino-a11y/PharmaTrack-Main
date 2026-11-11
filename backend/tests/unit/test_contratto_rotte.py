"""Ogni rotta dell'app ha una pagina vera e almeno una prova che la apre.

E' cosi' che sono passati due guasti che nessuno ha visto prima della
produzione: `SchedaCliente` rotta e `<Phone/>` non importato. Una rotta nuova
senza nessuno che la guardi e' codice che non ha testimoni.

Il test legge `App.tsx` e pretende, per ogni rotta:

1. che il componente della pagina esista in `src/pages/`;
2. che il percorso compaia in almeno un file di `frontend/e2e/`, che e' la prova
   che qualcuno la apre davvero (per le rotte con parametro basta il prefisso).

Se una rotta non puo' avere un test E2E, va scritta in `ESENTI` con il motivo:
la lista e' verificata, quindi una voce che non serve piu' fa fallire il test
invece di restare li' per sempre.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

RADICE = Path(__file__).resolve().parents[3]
FRONTEND = RADICE / "frontend"
APP = FRONTEND / "src" / "App.tsx"
E2E = FRONTEND / "e2e"
PAGINE = FRONTEND / "src" / "pages"

# Rotte senza prova E2E, con il motivo. Vuoto: al 12/11 le coprono tutte.
ESENTI: dict[str, str] = {}

# Percorsi che non sono stringhe (costanti da env, catch-all): non c'e' niente
# da cercare in un test E2E, ma devono esistere ancora in App.tsx.
NON_LETTERALI: dict[str, str] = {
    "SECRET_ADMIN_LOGIN_PATH": "login admin segreto: il percorso arriva da una variabile d'ambiente",
    "SECRET_ADMIN_DASHBOARD_PATH": "console admin segreta: percorso da variabile d'ambiente",
    "*": "catch-all: mostra la pagina 404, non e' una schermata da aprire",
}

ROTTA = re.compile(r"<Route\s+path=(?:\"([^\"]+)\"|\{([^}]+)\})\s+element=\{(.+?)\}\s*/>", re.S)
COMPONENTE = re.compile(r"<([A-Z][A-Za-z0-9]*)")


def _rotte() -> list[tuple[str, list[str]]]:
    """(percorso, componenti citati) per ogni rotta scritta in modo leggibile."""
    testo = APP.read_text(encoding="utf-8")
    rotte = []
    for trovato in ROTTA.finditer(testo):
        letterale, espressione, elemento = trovato.group(1), trovato.group(2), trovato.group(3)
        percorso = letterale or espressione.strip()
        rotte.append((percorso, COMPONENTE.findall(elemento)))
    return rotte


IMPORT_PIGRO = re.compile(r"(?:const\s+)?([A-Z][A-Za-z0-9]*)\s*=\s*(?:lazyWithRetry|React\.lazy|lazy)\s*\(\s*\(\)\s*=>\s*import\(\s*['\"]([^'\"]+)['\"]")
IMPORT_DIRETTO = re.compile(r"import\s+([A-Z][A-Za-z0-9]*)\s+from\s+['\"]([^'\"]+)['\"]")


def _pagine_importate() -> dict[str, Path]:
    """Componente -> file, letto dagli import di App.tsx (fonte di verita')."""
    mappa = {}
    testo = APP.read_text(encoding="utf-8")
    for nome, percorso in IMPORT_PIGRO.findall(testo) + IMPORT_DIRETTO.findall(testo):
        relativo = percorso.lstrip("./")
        file = FRONTEND / "src" / (relativo if relativo.startswith("pages") else relativo)
        if not file.suffix:
            for estensione in (".jsx", ".tsx", ".js"):
                if file.with_suffix(estensione).exists():
                    file = file.with_suffix(estensione)
                    break
        mappa[nome] = file
    return mappa


def _e2e() -> str:
    return "\n".join(file.read_text(encoding="utf-8") for file in E2E.glob("*.js"))


@pytest.fixture(scope="module")
def rotte():
    elenco = _rotte()
    assert len(elenco) >= 25, f"lette solo {len(elenco)} rotte: il test non controllerebbe niente"
    return elenco


def test_ogni_rotta_ha_una_pagina_che_esiste(rotte):
    mappa = _pagine_importate()
    assert len(mappa) > 20, f"letti solo {len(mappa)} import: il test non controllerebbe niente"
    mancanti = []
    for percorso, componenti in rotte:
        if percorso in NON_LETTERALI:
            continue
        pagine = [c for c in componenti if c in mappa]
        if not pagine:
            mancanti.append(f"  {percorso} -> nessuna pagina importata fra {componenti}")
            continue
        for nome in pagine:
            if not mappa[nome].exists():
                mancanti.append(f"  {percorso} -> {nome} punta a {mappa[nome].relative_to(FRONTEND)} che non esiste")
    assert not mancanti, "rotte senza una pagina vera:\n" + "\n".join(mancanti)


def test_ogni_rotta_ha_una_prova_e2e(rotte):
    testo = _e2e()
    scoperte = []
    for percorso, _ in rotte:
        if percorso in ESENTI:
            continue
        if percorso in NON_LETTERALI:
            continue
        if not percorso.startswith("/"):
            scoperte.append(f"  {percorso} -> percorso non letterale, dichiaralo in NON_LETTERALI")
            continue
        base = percorso.split("/:")[0] or "/"
        coperta = any(
            f"{virgola}{base}{virgola}" in testo or f"{virgola}{base}/" in testo
            for virgola in ("'", '"', "`")
        )
        if not coperta:
            scoperte.append(f"  {percorso} -> nessun test in frontend/e2e che la apra")
    assert not scoperte, "rotte senza prova:\n" + "\n".join(scoperte)


def test_le_esenzioni_sono_ancora_vere(rotte):
    percorsi = {percorso for percorso, _ in rotte}
    for percorso, motivo in ESENTI.items():
        assert percorso in percorsi, f"l'esenzione {percorso} non serve piu' ({motivo}): toglila"
    for percorso, motivo in NON_LETTERALI.items():
        assert percorso in percorsi, f"la rotta {percorso} non c'e' piu' ({motivo}): togli la voce"
