"""Gli errori di business non devono diventare allarmi su Sentry."""
from fastapi import HTTPException

from app.core.sentry import scarta_errori_di_business


def _evento(status):
    eccezione = HTTPException(status_code=status, detail="x")
    try:
        raise eccezione
    except HTTPException:
        import sys
        return sys.exc_info()


def test_un_403_non_arriva_a_sentry():
    info = _evento(403)
    assert scarta_errori_di_business({"evento": 1}, {"exc_info": info}) is None


def test_un_402_non_arriva_a_sentry():
    info = _evento(402)
    assert scarta_errori_di_business({"evento": 1}, {"exc_info": info}) is None


def test_un_500_arriva_a_sentry():
    info = _evento(500)
    assert scarta_errori_di_business({"evento": 1}, {"exc_info": info}) == {"evento": 1}


def test_un_errore_normale_arriva_a_sentry():
    try:
        raise ValueError("guasto vero")
    except ValueError:
        import sys
        info = sys.exc_info()
    assert scarta_errori_di_business({"evento": 2}, {"exc_info": info}) == {"evento": 2}


def test_senza_indizi_non_esplode():
    assert scarta_errori_di_business({"evento": 3}, {}) == {"evento": 3}
