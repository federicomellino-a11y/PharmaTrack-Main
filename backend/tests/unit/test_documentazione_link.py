"""La documentazione non deve puntare a cose che non esistono piu'.

Chi arriva sul progetto nuovo legge `AGENTS.md` e `docs/`: se un link porta a un
file spostato o a una sezione rinominata, smette di fidarsi del resto. Costa
poco tenerlo onesto e costa molto accorgersene quando serve davvero.

Controlla i link relativi in README.md, AGENTS.md e docs/**.md: il file di
destra deve esistere e, se il link ha un'ancora, la sezione deve esserci.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

RADICE = Path(__file__).resolve().parents[3]
LINK = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")


def _file_documentazione() -> list[Path]:
    file = [RADICE / "README.md", RADICE / "AGENTS.md"]
    file += sorted((RADICE / "docs").rglob("*.md"))
    return [f for f in file if f.exists()]


def _ancora(titolo: str) -> str:
    """Come GitHub trasforma un titolo in ancora: minuscole, spazi in -, senza punteggiatura."""
    testo = titolo.strip().lower()
    testo = re.sub(r"[^\w\s\u00c0-\u024f-]", "", testo)
    return re.sub(r"\s+", "-", testo)


def _ancore_di(file: Path) -> set[str]:
    testo = file.read_text(encoding="utf-8")
    ancore = set()
    duplicati: dict[str, int] = {}
    for riga in testo.splitlines():
        if riga.startswith("#"):
            titolo = riga.lstrip("#").strip()
            base = _ancora(titolo)
            numero = duplicati.get(base, 0)
            duplicati[base] = numero + 1
            ancore.add(base if numero == 0 else f"{base}-{numero}")
    return ancore


def _link(file: Path):
    testo = file.read_text(encoding="utf-8")
    # niente codice dentro i blocchi ricopiato come link
    testo = re.sub(r"```.*?```", "", testo, flags=re.S)
    for trovato in LINK.finditer(testo):
        destinazione = trovato.group(1)
        if destinazione.startswith(("http://", "https://", "mailto:", "tel:")):
            continue
        yield destinazione


def test_la_documentazione_esiste():
    file = _file_documentazione()
    nomi = {f.name for f in file}
    assert {"README.md", "AGENTS.md", "ARCHITETTURA.md", "SICUREZZA.md", "PIANO-FINALE.md"} <= nomi
    assert len(file) >= 8, f"letti solo {len(file)} file: il test non guarda la documentazione"


def test_i_link_relativi_puntano_a_file_esistenti():
    rotti = []
    controllati = 0
    for file in _file_documentazione():
        for destinazione in _link(file):
            percorso, _, ancora = destinazione.partition("#")
            controllati += 1
            if not percorso:
                # link alla sezione dello stesso file
                if ancora and ancora not in _ancore_di(file):
                    rotti.append(f"  {file.relative_to(RADICE)} -> ancora #{ancora} inesistente")
                continue
            bersaglio = (file.parent / percorso).resolve()
            if not bersaglio.exists():
                rotti.append(f"  {file.relative_to(RADICE)} -> {destinazione} (file inesistente)")
            elif ancora and bersaglio.suffix == ".md" and ancora not in _ancore_di(bersaglio):
                rotti.append(
                    f"  {file.relative_to(RADICE)} -> {destinazione} (sezione inesistente in {bersaglio.name})"
                )
    # Al 12/11 i link relativi sono 10: se scendono, qualcuno ha tolto i rimandi
    # incrociati invece di aggiungerne (la documentazione resta leggibile solo
    # se i pezzi si parlano).
    assert controllati >= 8, f"controllati solo {controllati} link: il test non guarda niente"
    assert not rotti, "link rotti nella documentazione:\n" + "\n".join(rotti)


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
