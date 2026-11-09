"""Allineamento dei documenti consegna scritti prima del costruttore unico.

Il costruttore (app/core/delivery_creation.py) scrive telefono e indirizzo del
cliente sempre come stringa: "" quando il cliente non li ha. I documenti nati
prima hanno None, e la differenza si vede dove il dato viene mostrato o
esportato (link tel:, apertura mappa, CSV). Questo passo li porta tutti alla
stessa forma ed e' idempotente: ai riavvii successivi non trova piu' niente da
cambiare.
"""

# Solo i campi che il costruttore garantisce stringa. "notes" resta fuori:
# il costruttore la riceve gia' formata dal chiamante, quindi non e' una
# garanzia del documento.
CAMPI_TESTO = ("customer_phone", "customer_address")


async def allinea_testi_consegne(db) -> int:
    """Porta a stringa vuota i campi di testo nulli. Ritorna i documenti toccati."""
    modificati = 0
    for campo in CAMPI_TESTO:
        risultato = await db.deliveries.update_many({campo: None}, {"$set": {campo: ""}})
        modificati += risultato.modified_count
    return modificati
