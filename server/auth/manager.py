"""Authentication manager.

Responsibilities:
- register new accounts (username + password -> hashed credential)
- validate credentials (login)
- create authenticated sessions
- invalidate sessions (logout)

Errors are raised as AuthError so the connection layer can translate them
into protocol error responses without leaking internals to the client.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from server.auth.security import hash_password, verify_password
from server.shared_types import User, Session, new_id, now_iso


def _utcnow() -> datetime:
    """Current UTC time (mockable in tests)."""
    return datetime.now(timezone.utc)


class AuthError(Exception):
    """Controlled authentication failure.

    Messages are intentionally generic so we never reveal whether a username
    exists (prevents username enumeration).
    """
    pass


class AuthManager:
    def __init__(self, store: Any, settings: Any, bus: Any) -> None:
        self._store = store
        self._settings = settings
        self._bus = bus

    # -- registration --------------------------------------------------------

    async def register(self, username: str, display_name: str,
                       password: str) -> User:
        username = username.strip().lower()
        display_name = display_name.strip()[: self._settings.max_display_name_length]

        if not username or not password:
            raise AuthError("Usuário e senha são obrigatórios.")
        if len(username) > self._settings.max_username_length:
            raise AuthError(f"Nome de usuário muito longo (máx. {self._settings.max_username_length}).")
        if len(password) < 6:
            raise AuthError("A senha deve ter no mínimo 6 caracteres.")

        if self._store.get_user_by_username(username):
            raise AuthError("Este nome de usuário já está em uso.")

        user = User(
            user_id=new_id(),
            username=username,
            display_name=display_name,
            password_hash=hash_password(password),
        )
        self._store.create_user(
            user.user_id, user.username, user.display_name,
            user.password_hash, user.created_at,
        )
        return user

    # -- login ---------------------------------------------------------------

    async def authenticate(self, username: str, password: str) -> Session:
        username = username.strip().lower()
        if not username or not password:
            raise AuthError("Usuário e senha são obrigatórios.")

        row = self._store.get_user_by_username(username)
        if not row:
            raise AuthError("Usuário ou senha inválidos.")

        if not verify_password(row["password_hash"], password):
            raise AuthError("Usuário ou senha inválidos.")

        # A user is online from exactly one session at a time. The server core
        # is responsible for evicting the in-memory session; here we only keep
        # the persistent store consistent.
        self._store.delete_user_sessions(row["user_id"])

        session = Session(session_id=new_id(), user_id=row["user_id"])
        self._store.upsert_session(
            session.session_id, session.user_id,
            session.started_at, session.last_seen_at,
        )
        return session

    # -- session restore (reconnection) --------------------------------------

    async def restore_session(self, session_id: str) -> Optional[Session]:
        row = self._store.get_session(session_id)
        if not row:
            return None

        # Stabilization item 4: session TTL enforcement
        last_seen = datetime.fromisoformat(row["last_seen_at"])
        age = _utcnow() - last_seen
        if age.total_seconds() > (self._settings.session_ttl_minutes * 60):
            self._store.delete_session(session_id)
            return None

        return Session(
            session_id=row["session_id"],
            user_id=row["user_id"],
            started_at=row["started_at"],
            last_seen_at=row["last_seen_at"],
        )

    # -- logout --------------------------------------------------------------

    async def invalidate_session(self, session_id: str) -> None:
        self._store.delete_session(session_id)

    # -- activity (Item 5) ---------------------------------------------------

    def touch_session(self, session: Session) -> None:
        """Update the session's last_seen_at in memory and SQLite."""
        session.last_seen_at = now_iso()
        self._store.touch_session(session.session_id, session.last_seen_at)
