"""Ora italiana, definita una volta sola.

Prima di questo modulo il fuso Europe/Rome era ricreato in tre router, e in
deliveries.py veniva perfino nominato senza import: l'eccezione finiva in un
tranello che ripiegava in silenzio sull'UTC, quindi i link di tracking
nascevano con l'ora sbagliata senza che nessuno se ne accorgesse.
"""

from datetime import datetime
from zoneinfo import ZoneInfo

ROME_TZ = ZoneInfo("Europe/Rome")


def adesso() -> datetime:
    """Adesso, ora italiana, con il fuso attaccato (non naive)."""
    return datetime.now(ROME_TZ)
