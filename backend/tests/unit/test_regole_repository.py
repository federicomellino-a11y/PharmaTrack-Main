"""Regole di ordinamento del repository, controllate invece che raccontate.

Queste prove non verificano il comportamento dell'applicazione: verificano che
il repository resti leggibile e che nessuno, persona o programma che sia, possa
introdurre in silenzio un file fuori posto, un router scollegato, un segreto o
una scorciatoia. Se una di queste fallisce la correzione giusta e' quasi sempre
spostare o registrare la cosa nuova, non allargare la regola.

Sono prove di sola lettura sul file system: non serve il database, non serve la
rete, girano in un decimo di secondo.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

import pytest

RADICE = Path(__file__).resolve().parents[3]
BACKEND = RADICE / "backend"
APP = BACKEND / "app"
ROUTERS = APP / "routers"
FRONTEND_SRC = RADICE / "frontend" / "src"

# Cosa puo' stare nella radice di backend/ (le cartelle non si controllano).
AMMESSI_IN_RADICE_BACKEND = {"server.py", "requirements.txt", "runtime.txt", "Procfile"}

# Dipendenze che possono usare un intervallo invece del pin esatto.
PIN_LIBERI_AMMESSI = {"cloudinary"}

# Tetti di righe: servono a fermare la ricrescita dei file, non a contare.
TETTO_GENERICO = 700
TETTO_PAGINE = 650

SEGNAPOSTI = re.compile(r"\b(TODO|FIXME|XXX|HACK)\b")
NOME_SNAKE = re.compile(r"[a-z0-9_]+\.py$")
NOME_COMPONENTE = re.compile(r"[A-Z][A-Za-z0-9]*\.jsx?$")

# Firme di segreti veri. Le stringhe di esempio nella documentazione non
# contano: qui si guardano solo i file di codice e di configurazione.
FIRME_SEGRETI = [
    ("chiave Google", re.compile(r"AIza[0-9A-Za-z_-]{30,}")),
    ("token GitHub", re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}")),
    ("chiave OpenAI", re.compile(r"sk-[A-Za-z0-9]{20,}")),
    ("chiave AWS", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("chiave privata", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("Mongo con password", re.compile(r"mongodb(?:\+srv)?://[^:\s/]+:(?!pwd\b|password\b|example\b)[^@\s]{6,}@")),
]
ESTENSIONI_CODICE = {".py", ".js", ".jsx", ".ts", ".tsx", ".json", ".yml", ".yaml", ".toml", ".sh", ".ps1", ".ahk"}


def _file_codice(cartella: Path, estensioni: set[str]) -> list[Path]:
    trovati = []
    for percorso in cartella.rglob("*"):
        if not percorso.is_file() or percorso.suffix not in estensioni:
            continue
        parti = set(percorso.parts)
        if parti & {"node_modules", "__pycache__", "dist", "build", "__tests__", "test-results"}:
            continue
        trovati.append(percorso)
    return trovati


def _leggi(percorso: Path) -> str:
    return percorso.read_text(encoding="utf-8", errors="ignore")


def _registri_router() -> str:
    """Il blocco di server.py in cui i router vengono agganciati all'app."""
    sorgente = _leggi(BACKEND / "server.py")
    inizio = sorgente.find("for module in [")
    assert inizio != -1, "server.py non aggancia piu' i router con `for module in [...]`"
    fine = sorgente.find("]", inizio)
    assert fine != -1, "blocco dei router in server.py non chiuso"
    return sorgente[inizio:fine]


def test_radice_backend_contiene_solo_il_punto_di_ingresso():
    """In backend/ restano solo i file di configurazione e server.py.

    La logica vive in app/: se compare un .py nuovo in radice, o e' codice che
    va spostato, o e' uno script che va in scripts/.
    """
    estranei = sorted(
        voce.name
        for voce in BACKEND.iterdir()
        if voce.is_file() and voce.name not in AMMESSI_IN_RADICE_BACKEND and not voce.name.startswith(".")
    )
    assert estranei == [], f"file fuori posto in backend/: {estranei} (usa app/ o scripts/)"


def test_ogni_router_e_registrato_e_viceversa():
    """Un router nuovo che nessuno aggancia non risponde: meglio accorgersene qui.

    Il controllo va nei due sensi: un file in app/routers/ deve comparire nel
    blocco di server.py, e ogni nome del blocco deve avere il suo file.
    """
    registri = _registri_router()
    file_router = sorted(p.stem for p in ROUTERS.glob("*.py") if p.name != "__init__.py")
    assert file_router, "app/routers/ e' vuota"

    non_registrati = [
        nome for nome in file_router
        if not re.search(rf"\b{re.escape(nome)}(?:_router)?\b", registri)
    ]
    assert non_registrati == [], (
        f"router mai agganciati in server.py: {non_registrati} (aggiungili al blocco `for module in [...]`)"
    )

    nomi_registrati = {
        re.sub(r"_router$", "", pezzo.strip())
        for pezzo in re.split(r"[,\s\[\]]+", registri)
        if re.fullmatch(r"[a-z0-9_]+(?:_router)?", pezzo.strip() or "-")
    }
    nomi_registrati.discard("")
    fantasma = sorted(nome for nome in nomi_registrati if nome not in file_router and nome not in {"module", "for", "in"})
    assert fantasma == [], f"server.py aggancia router che non esistono in app/routers/: {fantasma}"


def test_ogni_router_espone_il_suo_router():
    """`module.router` deve esistere in ogni file di app/routers/."""
    senza = [
        p.name for p in ROUTERS.glob("*.py")
        if p.name != "__init__.py" and not re.search(r"^router\s*=\s*APIRouter\(", _leggi(p), re.MULTILINE)
    ]
    assert senza == [], f"router senza `router = APIRouter(...)` a livello di modulo: {senza}"


def test_nessun_segnaposto_nel_codice():
    """Niente TODO/FIXME lasciati dietro: o si fa, o si apre una issue."""
    trovati = []
    for cartella in (APP, FRONTEND_SRC):
        for percorso in _file_codice(cartella, {".py", ".js", ".jsx", ".ts", ".tsx"}):
            for numero, riga in enumerate(_leggi(percorso).splitlines(), 1):
                if SEGNAPOSTI.search(riga):
                    trovati.append(f"{percorso.relative_to(RADICE)}:{numero}")
    assert trovati == [], f"segnaposto nel codice: {trovati}"


def test_nessun_console_log_nel_frontend():
    """I log di debug vanno tolti prima del merge: finiscono nel bundle."""
    trovati = [
        str(p.relative_to(RADICE))
        for p in _file_codice(FRONTEND_SRC, {".js", ".jsx", ".ts", ".tsx"})
        if re.search(r"\bconsole\.log\s*\(", _leggi(p))
    ]
    assert trovati == [], f"console.log nel frontend: {trovati}"


def test_dipendenze_pinnate():
    """Ogni riga di requirements.txt e' un pin esatto.

    Un intervallo rende il deploy Render non riproducibile: la CI resta verde e
    il build fallisce solo in produzione (successo il 1/11).
    """
    righe = [
        riga.strip()
        for riga in _leggi(BACKEND / "requirements.txt").splitlines()
        if riga.strip() and not riga.strip().startswith("#")
    ]
    libere = []
    for riga in righe:
        nome = re.split(r"[=<>!~\[]", riga, maxsplit=1)[0].lower()
        if nome in PIN_LIBERI_AMMESSI:
            continue
        if not re.fullmatch(r"[A-Za-z0-9_.\-]+==[^=<>!~\s]+", riga):
            libere.append(riga)
    assert libere == [], f"dipendenze senza pin esatto: {libere}"


def test_nomi_dei_file_coerenti():
    """Python snake_case, componenti React con l'iniziale maiuscola."""
    py_ko = sorted(p.name for p in APP.rglob("*.py") if not NOME_SNAKE.fullmatch(p.name))
    assert py_ko == [], f"file Python non in snake_case: {py_ko}"

    componenti_ko = []
    for percorso in (FRONTEND_SRC / "components").rglob("*"):
        if not percorso.is_file() or percorso.suffix not in {".js", ".jsx"}:
            continue
        if "ui" in percorso.parts or "__tests__" in percorso.parts:
            continue
        if not NOME_COMPONENTE.fullmatch(percorso.name):
            componenti_ko.append(str(percorso.relative_to(RADICE)))
    assert componenti_ko == [], f"componenti senza iniziale maiuscola: {componenti_ko}"


def test_nessun_file_di_codice_troppo_lungo():
    """Un file troppo lungo non si legge, quindi non si modifica in sicurezza."""
    troppo = []
    for cartella in (APP, FRONTEND_SRC):
        for percorso in _file_codice(cartella, {".py", ".js", ".jsx", ".ts", ".tsx"}):
            righe = len(_leggi(percorso).splitlines())
            tetto = TETTO_PAGINE if "pages" in percorso.parts or "components" in percorso.parts else TETTO_GENERICO
            if righe > tetto:
                troppo.append(f"{percorso.relative_to(RADICE)} ({righe} righe, tetto {tetto})")
    assert troppo == [], f"file da spezzare: {troppo}"


@pytest.mark.parametrize("firma,descrizione", [(f, d) for d, f in FIRME_SEGRETI])
def test_nessun_segreto_nel_codice(firma, descrizione):
    """Nessuna credenziale nel codice: il repo e' pubblico e la storia resta."""
    trovati = []
    for cartella in (APP, FRONTEND_SRC, BACKEND / "scripts"):
        for percorso in _file_codice(cartella, ESTENSIONI_CODICE):
            if firma.search(_leggi(percorso)):
                trovati.append(str(percorso.relative_to(RADICE)))
    assert trovati == [], f"possibile {descrizione} versionata in: {trovati}"


def test_c_e_un_solo_comando_di_verifica():
    """`./verifica.sh` e' il controllo che chiunque deve poter lanciare.

    Se sparisce o perde il permesso di esecuzione, chi arriva non ha piu' un
    modo unico di verificare e ricomincia a lanciare i comandi a memoria.
    """
    script = RADICE / "verifica.sh"
    assert script.is_file(), "manca verifica.sh nella radice"
    assert os.access(script, os.X_OK), "verifica.sh non e' eseguibile (chmod +x)"


def test_i_documenti_di_ingresso_esistono():
    """Chi arriva, persona o programma, deve trovare le regole subito.

    AGENTS.md e' il file che gli strumenti automatici leggono per primi,
    CONTRIBUTING.md e' quello per le persone: se qualcuno li sposta o li
    rinomina, il README deve restare coerente.
    """
    for nome in ("AGENTS.md", "CONTRIBUTING.md", "README.md"):
        assert (RADICE / nome).is_file(), f"manca {nome} nella radice"

    readme = _leggi(RADICE / "README.md")
    for nome in ("AGENTS.md", "CONTRIBUTING.md"):
        assert nome in readme, f"README.md non rimanda a {nome}"
