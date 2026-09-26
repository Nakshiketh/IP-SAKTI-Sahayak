"""The member tables, in the accounts database.

Same file as the old `accounts` table (`data/accounts.sqlite3`), and the same
convention as every other store in this project: plain `sqlite3`, the schema
created idempotently on connect. There is no migration tool here. The
`auth_schema` row records which version the tables are at, so a later change
is a deliberate step and not something `CREATE TABLE IF NOT EXISTS` would
silently skip.

Times are Unix seconds (REAL), as in the accounts table beside them.

Only hashes are stored: of passwords (argon2id), card tokens (SHA-256),
one-time codes (HMAC) and session ids (SHA-256). `auth_events` records what
happened and to whom, never a secret.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from app.core.settings import get_settings

SCHEMA_VERSION = 2

SCHEMA = """
CREATE TABLE IF NOT EXISTS auth_schema (
    version     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id             TEXT NOT NULL UNIQUE,
    name                  TEXT NOT NULL,
    username              TEXT NOT NULL UNIQUE,
    email                 TEXT NOT NULL UNIQUE,
    role                  TEXT NOT NULL,
    institution           TEXT NOT NULL,
    password_hash         TEXT NOT NULL,
    must_change_password  INTEGER NOT NULL DEFAULT 1,
    is_active             INTEGER NOT NULL DEFAULT 1,
    failed_login_count    INTEGER NOT NULL DEFAULT 0,
    locked_until          REAL,
    password_changed_at   REAL,
    created_at            REAL NOT NULL,
    updated_at            REAL NOT NULL,
    last_login_at         REAL,
    CHECK (username = lower(username)),
    CHECK (email = lower(email))
);

CREATE TABLE IF NOT EXISTS member_qr_tokens (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    member_fk       INTEGER NOT NULL REFERENCES members(id),
    token_hash      TEXT NOT NULL,
    issued_at       REAL NOT NULL,
    revoked_at      REAL,
    revoked_reason  TEXT
);
-- One active card per member, and one member per active card. A revoked row
-- stays as history, which is why these are partial rather than plain UNIQUE.
CREATE UNIQUE INDEX IF NOT EXISTS member_qr_tokens_one_active
    ON member_qr_tokens(member_fk) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS member_qr_tokens_active_hash
    ON member_qr_tokens(token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS member_qr_tokens_hash ON member_qr_tokens(token_hash);

CREATE TABLE IF NOT EXISTS auth_challenges (
    id            TEXT PRIMARY KEY,
    member_fk     INTEGER REFERENCES members(id),
    purpose       TEXT NOT NULL CHECK (purpose IN ('login', 'password_reset')),
    created_at    REAL NOT NULL,
    expires_at    REAL NOT NULL,
    completed_at  REAL
);

CREATE TABLE IF NOT EXISTS otp_codes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    challenge_fk    TEXT NOT NULL REFERENCES auth_challenges(id),
    code_hash       TEXT NOT NULL,
    expires_at      REAL NOT NULL,
    attempts        INTEGER NOT NULL DEFAULT 0,
    max_attempts    INTEGER NOT NULL DEFAULT 5,
    used_at         REAL,
    invalidated_at  REAL,
    created_at      REAL NOT NULL,
    requester_ip    TEXT
);
CREATE INDEX IF NOT EXISTS otp_codes_challenge ON otp_codes(challenge_fk);

CREATE TABLE IF NOT EXISTS sessions (
    id_hash       TEXT PRIMARY KEY,
    member_fk     INTEGER NOT NULL REFERENCES members(id),
    restricted    INTEGER NOT NULL,
    created_at    REAL NOT NULL,
    last_seen_at  REAL NOT NULL,
    expires_at    REAL NOT NULL,
    revoked_at    REAL,
    user_agent    TEXT,
    ip            TEXT
);
CREATE INDEX IF NOT EXISTS sessions_member ON sessions(member_fk);

-- Version 2: the single-use token a verified password-reset code earns, held
-- in an HttpOnly cookie for ten minutes. Only its HMAC is stored.
CREATE TABLE IF NOT EXISTS reset_tokens (
    id_hash     TEXT PRIMARY KEY,
    member_fk   INTEGER NOT NULL REFERENCES members(id),
    created_at  REAL NOT NULL,
    expires_at  REAL NOT NULL,
    used_at     REAL
);

CREATE TABLE IF NOT EXISTS auth_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    member_fk   INTEGER REFERENCES members(id),
    event       TEXT NOT NULL,
    ip          TEXT,
    user_agent  TEXT,
    created_at  REAL NOT NULL
);
"""


def connect(path: Path | None = None) -> sqlite3.Connection:
    """Open the accounts database with the member tables in place."""
    target = path or get_settings().members_db_path
    target.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(target)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.executescript(SCHEMA)
    if connection.execute("SELECT 1 FROM auth_schema").fetchone() is None:
        connection.execute("INSERT INTO auth_schema (version) VALUES (?)", (SCHEMA_VERSION,))
    else:
        # Every change so far only adds tables, which the script above creates;
        # the row just records that it has run.
        connection.execute(
            "UPDATE auth_schema SET version = ? WHERE version < ?", (SCHEMA_VERSION, SCHEMA_VERSION)
        )
    connection.commit()
    return connection
