"""Server configuration.

Sources (in priority order):
1. Environment variables (e.g. MSN_PORT) — secrets/override never live in code
2. Explicit kwargs passed to ServerSettings.from_env()
3. Sensible defaults

All values are validated on creation; invalid values raise ValueError so that
the server fails to start in a controlled way (see initialization module).
"""

from __future__ import annotations

import os
from urllib.parse import urlsplit
from typing import Optional, Any


class ServerSettings:
    def __init__(
        self,
        host: str,
        port: int,
        data_dir: str,
        max_message_length: int,
        max_username_length: int,
        max_display_name_length: int,
        max_messages_per_minute: int,
        session_ttl_minutes: int,
        allowed_origins: Optional[list[str]],
    ) -> None:
        self.host = host
        self.port = port
        self.data_dir = data_dir
        self.max_message_length = max_message_length
        self.max_username_length = max_username_length
        self.max_display_name_length = max_display_name_length
        self.max_messages_per_minute = max_messages_per_minute
        self.session_ttl_minutes = session_ttl_minutes
        self.allowed_origins = allowed_origins

    @staticmethod
    def _parse_allowed_origins(raw: Any) -> Optional[list[str]]:
        if raw is None:
            return None
        if isinstance(raw, str):
            values = [item.strip() for item in raw.split(",") if item.strip()]
        elif isinstance(raw, (list, tuple)):
            values = [item.strip() for item in raw if isinstance(item, str) and item.strip()]
            if len(values) != len(raw):
                raise ValueError("MSN_ALLOWED_ORIGINS deve conter apenas strings não vazias.")
        else:
            raise ValueError("MSN_ALLOWED_ORIGINS deve ser texto ou lista de origens.")

        if not values:
            return None
        for origin in values:
            parsed = urlsplit(origin)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                raise ValueError(
                    f"Origem inválida: {origin!r}; use uma URL http:// ou https://."
                )
        return values

    @classmethod
    def from_env(cls, **overrides: object) -> ServerSettings:
        def get(name: str, default: object) -> object:
            return overrides.get(name, os.environ.get(name, default))

        port = int(get("MSN_PORT", 8765))
        if not (1 <= port <= 65535):
            raise ValueError(f"MSN_PORT must be between 1 and 65535, got {port}")

        max_msg = int(get("MSN_MAX_MESSAGE_LENGTH", 20_000))
        max_username = int(get("MSN_MAX_USERNAME_LENGTH", 64))
        max_display = int(get("MSN_MAX_DISPLAY_NAME_LENGTH", 64))
        max_messages = int(get("MSN_MAX_MESSAGES_PER_MINUTE", 30))
        session_ttl = int(get("MSN_SESSION_TTL_MINUTES", 60))
        for name, value in {
            "MSN_MAX_MESSAGE_LENGTH": max_msg,
            "MSN_MAX_USERNAME_LENGTH": max_username,
            "MSN_MAX_DISPLAY_NAME_LENGTH": max_display,
            "MSN_MAX_MESSAGES_PER_MINUTE": max_messages,
            "MSN_SESSION_TTL_MINUTES": session_ttl,
        }.items():
            if value <= 0:
                raise ValueError(f"{name} deve ser positivo")

        origins = cls._parse_allowed_origins(get("MSN_ALLOWED_ORIGINS", None))
        return cls(
            host=str(get("MSN_HOST", "0.0.0.0")),
            port=port,
            data_dir=str(get("MSN_DATA_DIR", "./data")),
            max_message_length=max_msg,
            max_username_length=max_username,
            max_display_name_length=max_display,
            max_messages_per_minute=max_messages,
            session_ttl_minutes=session_ttl,
            allowed_origins=origins,
        )
