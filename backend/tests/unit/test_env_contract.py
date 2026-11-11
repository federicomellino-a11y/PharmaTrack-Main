"""Contratto delle variabili d'ambiente.

Perché esiste questo test
-------------------------
Il 12 novembre `backend/.env.example` diceva `MONGO_DB_NAME` mentre il codice
legge `DB_NAME` (che non ha default: `os.environ['DB_NAME']` -> KeyError al
primo avvio). Prometteva anche `SESSION_SECRET`, che nessuno legge: chi lo
impostava credeva di firmare le sessioni, e le sessioni invece sono righe nel
database. Nello stesso periodo `render.yaml` dichiarava tre variabili morte
(`SMTP_FROM_NAME`, `VAPID_CLAIM_EMAIL`, `COOKIE_DOMAIN`).

Nessuna di queste cose rompe la CI, ma tutte rompono la persona che arriva
dopo: perde mezz'ora su un KeyError, o peggio crede di aver configurato una
difesa che non esiste. Questo test chiude quella categoria di errore:

  * il codice legge una variabile che non è documentata -> rosso
  * il file di esempio documenta una variabile che nessuno legge -> rosso
  * `render.yaml` dichiara una variabile che nessuno legge -> rosso
  * il frontend legge un `import.meta.env.VITE_*` non documentato -> rosso

Limite noto: la ricerca sul codice è statica, quindi non vede le letture
indirette (un nome costruito in un ciclo). L'unica che esiste oggi è
`RENDER_EXTERNAL_URL`, elencata in `LETTURE_INDIRETTE` con il motivo.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2]
RADICE = BACKEND.parent
FRONTEND = RADICE / "frontend"

# Variabili che il codice legge senza scriverne il nome per esteso.
LETTURE_INDIRETTE = {
    # app/routers/integrations.py le prova in un ciclo:
    #   for chiave in ("API_PUBLIC_URL", "RENDER_EXTERNAL_URL")
    "RENDER_EXTERNAL_URL",
}

# Variabili che non leggiamo noi ma che la piattaforma usa (Render la onora).
CHIAVI_DI_PIATTAFORMA = {"PYTHON_VERSION"}

# import.meta.env.* che non sono variabili nostre ma costanti di Vite.
COSTANTI_VITE = {"DEV", "PROD", "MODE", "BASE_URL", "SSR"}

LETTURA_ENV = re.compile(
    r"""os\.(?:getenv|environ\.get)\(\s*["']([A-Z0-9_]+)["']"""
    r"""|os\.environ\[\s*["']([A-Z0-9_]+)["']\s*\]"""
)


def _codice_backend() -> list[Path]:
    file = [p for p in (BACKEND / "app").rglob("*.py") if "__pycache__" not in p.parts]
    file.append(BACKEND / "server.py")
    return file


def variabili_lette_dal_backend() -> set[str]:
    lette: set[str] = set()
    for percorso in _codice_backend():
        testo = percorso.read_text(encoding="utf-8", errors="ignore")
        for gruppo in LETTURA_ENV.finditer(testo):
            lette.add(gruppo.group(1) or gruppo.group(2))
    return lette | LETTURE_INDIRETTE


def variabili_obbligatorie() -> set[str]:
    """Quelle lette con os.environ[...]: senza di loro il server non parte."""
    obbligatorie: set[str] = set()
    for percorso in _codice_backend():
        testo = percorso.read_text(encoding="utf-8", errors="ignore")
        obbligatorie.update(re.findall(r"""os\.environ\[\s*["']([A-Z0-9_]+)["']\s*\]""", testo))
    return obbligatorie


def chiavi_env(percorso: Path) -> set[str]:
    chiavi: set[str] = set()
    if not percorso.exists():
        return chiavi
    for riga in percorso.read_text(encoding="utf-8").splitlines():
        riga = riga.strip()
        if not riga or riga.startswith("#") or "=" not in riga:
            continue
        chiavi.add(riga.split("=", 1)[0].strip())
    return chiavi


def chiavi_render_yaml() -> set[str]:
    testo = (RADICE / "render.yaml").read_text(encoding="utf-8")
    return set(re.findall(r"^\s*-\s*key:\s*([A-Z0-9_]+)\s*$", testo, re.MULTILINE))


def variabili_frontend() -> set[str]:
    lette: set[str] = set()
    for percorso in (FRONTEND / "src").rglob("*"):
        if percorso.suffix not in {".js", ".jsx", ".ts", ".tsx"}:
            continue
        testo = percorso.read_text(encoding="utf-8", errors="ignore")
        lette.update(re.findall(r"import\.meta\.env\.([A-Z0-9_]+)", testo))
    return lette - COSTANTI_VITE


def test_il_codice_non_legge_variabili_non_documentate():
    mancanti = variabili_lette_dal_backend() - chiavi_env(BACKEND / ".env.example")
    assert not mancanti, (
        "Il backend legge variabili che non sono in backend/.env.example: "
        f"{sorted(mancanti)}. Chi clona il repo non sa che esistono."
    )


def test_le_variabili_obbligatorie_sono_documentate():
    """DB_NAME e MONGO_URL sono lette con os.environ[]: se mancano, KeyError."""
    obbligatorie = variabili_obbligatorie()
    assert obbligatorie, "La ricerca non ha trovato nessuna variabile obbligatoria: regex da rivedere"
    mancanti = obbligatorie - chiavi_env(BACKEND / ".env.example")
    assert not mancanti, f"Senza queste il server non parte e non sono documentate: {sorted(mancanti)}"


def test_il_file_di_esempio_non_promette_variabili_inesistenti():
    morte = chiavi_env(BACKEND / ".env.example") - variabili_lette_dal_backend()
    assert not morte, (
        "backend/.env.example documenta variabili che nessuno legge: "
        f"{sorted(morte)}. Chi le imposta crede di aver configurato qualcosa."
    )


def test_render_yaml_non_dichiara_variabili_inesistenti():
    morte = chiavi_render_yaml() - variabili_lette_dal_backend() - CHIAVI_DI_PIATTAFORMA
    assert not morte, (
        f"render.yaml dichiara variabili che il codice non legge: {sorted(morte)}"
    )


def test_il_frontend_non_legge_variabili_non_documentate():
    morte = variabili_frontend() - chiavi_env(FRONTEND / ".env.example")
    assert not morte, (
        f"Il frontend legge import.meta.env non documentate: {sorted(morte)}"
    )


def test_il_file_di_esempio_del_frontend_non_ha_variabili_morte():
    morte = chiavi_env(FRONTEND / ".env.example") - variabili_frontend()
    assert not morte, (
        f"frontend/.env.example documenta variabili che nessuno legge: {sorted(morte)}"
    )


@pytest.mark.parametrize("percorso", ["backend/.env.example", "frontend/.env.example"])
def test_nessun_segreto_compilato_nei_file_di_esempio(percorso):
    """Un .env.example con una password vera è un segreto pubblicato."""
    testo = (RADICE / percorso).read_text(encoding="utf-8")
    for riga in testo.splitlines():
        if "=" not in riga or riga.strip().startswith("#"):
            continue
        chiave, valore = riga.split("=", 1)
        if re.search(r"PASSWORD|SECRET|TOKEN|API_KEY", chiave.upper()) and len(valore.strip()) > 20:
            pytest.fail(f"{percorso}: {chiave.strip()} sembra una credenziale vera, non un esempio")
