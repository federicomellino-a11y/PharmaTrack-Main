import logging
from typing import Dict, List, Optional

from fastapi import HTTPException, WebSocket

from app.core.security import get_current_driver, get_current_user
from app.core.security_middleware import origine_ammessa

logger = logging.getLogger(__name__)


async def identita_websocket(websocket: WebSocket, user_type: str, richiesto: str,
                             consentite: Optional[List[str]]) -> Optional[dict]:
    """Chi apre il canale deve essere davvero quella farmacia o quel fattorino.

    Il browser manda da solo il cookie di sessione anche sull'handshake del
    WebSocket: si legge quello, come per le rotte HTTP. L'origine si controlla
    perche' il cookie e' SameSite=None e un sito altrui potrebbe aprire il
    canale a nome dell'utente (cross-site WebSocket hijacking).
    """
    origine = websocket.headers.get("origin")
    if origine and not origine_ammessa(origine, consentite):
        return None
    try:
        if user_type == "pharmacy":
            utente = await get_current_user(websocket)
            return utente if utente.get("user_id") == richiesto else None
        if user_type == "driver":
            fattorino = await get_current_driver(websocket)
            return fattorino if fattorino.get("driver_id") == richiesto else None
    except HTTPException:
        return None
    return None


class ConnectionManager:
    """Ogni utente puo' avere piu' schermi aperti: PC del banco e telefono."""

    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.user_sockets: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str, user_type: str):
        await websocket.accept()
        self.user_sockets.setdefault(f"{user_type}_{user_id}", []).append(websocket)
        self.active_connections.setdefault(user_type, []).append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: str, user_type: str):
        key = f"{user_type}_{user_id}"
        aperti = self.user_sockets.get(key, [])
        if websocket in aperti:
            aperti.remove(websocket)
        if not aperti:
            self.user_sockets.pop(key, None)
        tutti = self.active_connections.get(user_type, [])
        if websocket in tutti:
            tutti.remove(websocket)

    async def send_personal_message(self, message: dict, user_id: str, user_type: str):
        key = f"{user_type}_{user_id}"
        for websocket in list(self.user_sockets.get(key, [])):
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.error(f"Error sending message to {key}: {e}")
                self.disconnect(websocket, user_id, user_type)

    async def broadcast_to_type(self, message: dict, user_type: str):
        for connection in list(self.active_connections.get(user_type, [])):
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Broadcast error: {e}")

manager = ConnectionManager()

# Codice di chiusura "sessione non piu' valida": il frontend non riprova a collegarsi.
CHIUSURA_SESSIONE_REVOCATA = 4401


async def _ancora_valida(websocket: WebSocket, user_type: str, user_id: str) -> bool:
    try:
        if user_type == "pharmacy":
            return (await get_current_user(websocket)).get("user_id") == user_id
        return (await get_current_driver(websocket)).get("driver_id") == user_id
    except HTTPException:
        return False


async def richiudi_canali_revocati(user_type: Optional[str] = None, user_id: Optional[str] = None) -> int:
    """Chiude i canali la cui sessione non vale piu' (logout, revoca, account disattivato).

    Si ricontrolla il cookie dell'handshake con le stesse regole delle rotte
    HTTP. Senza argomenti passa tutti i canali aperti: lo fa il controllo
    periodico, che copre anche le sessioni scadute o revocate da un'altra istanza.
    """
    chiusi = 0
    for chiave, aperti in list(manager.user_sockets.items()):
        tipo, _, uid = chiave.partition("_")
        if (user_type and tipo != user_type) or (user_id and uid != user_id):
            continue
        for websocket in list(aperti):
            if await _ancora_valida(websocket, tipo, uid):
                continue
            manager.disconnect(websocket, uid, tipo)
            chiusi += 1
            try:
                await websocket.close(code=CHIUSURA_SESSIONE_REVOCATA)
            except Exception:  # noqa: BLE001 — gia' chiuso dall'altra parte
                pass
    return chiusi


async def sorveglia_canali(intervallo: float = 60):
    """Ogni minuto chiude i canali rimasti aperti con una sessione scaduta o revocata."""
    import asyncio
    while True:
        await asyncio.sleep(intervallo)
        try:
            await richiudi_canali_revocati()
        except Exception as exc:  # noqa: BLE001 — il controllo non deve fermarsi
            logger.warning("Controllo dei canali in tempo reale non riuscito: %s", exc)
