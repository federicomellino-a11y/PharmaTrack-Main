"""L'ora italiana e gli stati delle consegne, in un posto solo.

Questi test nascono da un difetto vero: in deliveries.py la funzione che
calcolava "adesso" nominava ROME_TZ senza importarlo, il NameError veniva
catturato e il codice ripiegava in silenzio sull'UTC. Nessuno se ne accorgeva
perche' l'orario era sbagliato di un'ora, non rotto.
"""

from datetime import datetime, timezone
from pathlib import Path

from app.core.clock import ROME_TZ, adesso
from app.core.delivery_lifecycle import (
    ARCHIVED_STATUSES,
    BILLED_STATUSES,
    FOLLOW_UP_STATUSES,
)

APP = Path(__file__).resolve().parents[2] / "app"


def test_adesso_da_ora_italiana_e_non_utc():
    ora = adesso()
    assert ora.tzinfo is not None, "la data deve avere il fuso, non essere naive"
    assert str(ora.tzinfo) == "Europe/Rome"
    # coerente con l'UTC reale entro un minuto
    differenza = abs((ora - datetime.now(timezone.utc)).total_seconds())
    assert differenza < 60


def test_adesso_e_davvero_ora_italiana():
    # in nessun periodo dell'anno Roma coincide stabilmente con l'UTC
    assert ROME_TZ.utcoffset(datetime.now()) is not None
    assert ROME_TZ.key == "Europe/Rome"


def test_lo_stato_fatturato_sta_nell_archivio():
    for stato in BILLED_STATUSES:
        assert stato in ARCHIVED_STATUSES, f"{stato} non e' tra gli stati archiviati"


def test_le_consegne_da_seguire_includono_l_incasso_da_confermare():
    assert "delivered_pending_confirmation" in FOLLOW_UP_STATUSES
    assert "delivered" not in FOLLOW_UP_STATUSES


def test_nessun_router_riscrive_a_mano_l_elenco_degli_stati_fatturati():
    """Se qualcuno ricopia la lista, la farmacia torna a contare i soldi in due modi."""
    colpevoli = []
    for file in APP.rglob("*.py"):
        if file.name == "delivery_lifecycle.py":
            continue
        testo = file.read_text()
        if '"delivered", "delivered_pending_confirmation"' in testo or \
           '"delivered_pending_confirmation", "delivered"' in testo:
            colpevoli.append(file.name)
    assert not colpevoli, f"elenco degli stati ricopiato in: {colpevoli}"


def test_nessun_modulo_ridefinisce_il_fuso():
    colpevoli = [f.name for f in APP.rglob("*.py")
                 if f.name != "clock.py" and 'ZoneInfo("Europe/Rome")' in f.read_text()]
    assert not colpevoli, f"fuso ridefinito in: {colpevoli}"
