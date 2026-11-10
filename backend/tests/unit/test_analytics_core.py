"""Il calcolo dei KPI vive in app/core/analytics.py, il router fa solo la cache.

Questi due controlli impediscono che il calcolo torni dentro il router: se
qualcuno riappiccica 200 righe nella funzione dell'endpoint, il test lo dice
subito invece di farlo scoprire a chi apre il file fra sei mesi.
"""

import inspect

from app.core.analytics import calcola_analytics, variazione
from app.routers import analytics as router_analytics


def test_il_calcolo_e_una_funzione_a_se():
    assert inspect.iscoroutinefunction(calcola_analytics)
    firma = inspect.signature(calcola_analytics)
    assert list(firma.parameters) == ["pharmacy_id", "period"]


def test_il_router_non_contiene_il_calcolo():
    sorgente = inspect.getsource(router_analytics.get_analytics)
    assert "calcola_analytics" in sorgente
    assert len(sorgente.splitlines()) < 25, "il router sta ricrescendo: il calcolo va in app/core/analytics.py"
    assert "$group" not in sorgente, "aggregazione Mongo dentro il router"


def test_variazione_dice_quanto_e_cambiato():
    assert variazione(120, 100) == 20.0
    assert variazione(80, 100) == -20.0
    assert variazione(100, 100) == 0.0


def test_variazione_senza_termine_di_paragone_non_inventa():
    """Prima non c'era niente: non è -100%, è "non lo so"."""
    assert variazione(100, 0) is None
    assert variazione(0, 0) is None
