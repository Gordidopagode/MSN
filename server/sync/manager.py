"""Synchronization manager.

When a client connects or reconnects, the server pushes a deterministic,
ordered sync payload so the client can fully rebuild its local state:

Order:
  1. identity          (own user profile)
  2. sessions          (active session token the client should keep)
  3. presence_all      (presence snapshot of EVERY user in the system,
                        including offline — so the client can render the
                        full contact list)
  4. conversations     (list of conversations the user participates in)
  5. recent history    (last N messages per conversation, newest first,
                        delivered as history:chunk with conversation_id)

Versioning: the sync envelope carries a protocol version; a future server
with a different layout can negotiate by version before sending anything.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from server.shared_types import now_iso

log = logging.getLogger("msn.sync")

SYNC_PROTOCOL_VERSION = "1.0.0"


class SyncManager:
    def __init__(self, settings: Any, sessions: Any, presence: Any,
                 conversations: Any, messages: Any) -> None:
        self._settings = settings
        self._sessions = sessions
        self._presence = presence
        self._conversations = conversations
        self._messages = messages

    def build_sync(self, session_id: str, user_id: str,
                   history_limit: int = 50) -> dict[str, Any]:
        """Build the full sync payload for a (re)connected client."""
        user = self._sessions.get_user(user_id)
        if user is None:
            raise ValueError(f"User not found in session directory: {user_id}")

        conversations = self._conversations.list_user_conversations(user_id)

        history: dict[str, list[dict[str, Any]]] = {}
        for conv in conversations:
            try:
                history[conv.conversation_id] = self._messages.get_history(
                    conv.conversation_id, user_id, limit=history_limit
                )
            except Exception:  # never let one broken conversation poison sync
                log.exception("Skipping history for %s during sync", conv.conversation_id)
                history[conv.conversation_id] = []

        return {
            "version": SYNC_PROTOCOL_VERSION,
            "timestamp": now_iso(),
            "data": {
                "identity": {
                    "user_id": user["user_id"],
                    "username": user["username"],
                    "display_name": user["display_name"],
                },
                "session": {
                    "session_id": session_id,
                },
                "presence": self._presence.all_presence(),
                "conversations": [c.to_dict() for c in conversations],
                "history": history,
            },
        }
