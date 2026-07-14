import logging
from typing import Dict, List
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.user_sockets: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: str, user_type: str):
        await websocket.accept()
        key = f"{user_type}_{user_id}"
        self.user_sockets[key] = websocket
        if user_type not in self.active_connections:
            self.active_connections[user_type] = []
        self.active_connections[user_type].append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: str, user_type: str):
        key = f"{user_type}_{user_id}"
        if key in self.user_sockets:
            del self.user_sockets[key]
        if user_type in self.active_connections and websocket in self.active_connections[user_type]:
            self.active_connections[user_type].remove(websocket)

    async def send_personal_message(self, message: dict, user_id: str, user_type: str):
        key = f"{user_type}_{user_id}"
        if key in self.user_sockets:
            try:
                await self.user_sockets[key].send_json(message)
            except Exception as e:
                logger.error(f"Error sending message to {key}: {e}")

    async def broadcast_to_type(self, message: dict, user_type: str):
        if user_type in self.active_connections:
            for connection in self.active_connections[user_type]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.error(f"Broadcast error: {e}")

manager = ConnectionManager()
