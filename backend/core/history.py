"""History store for processing runs."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from typing import Any

from backend.core.database import get_db_path


def _ensure_table() -> None:
    """Create the historial table if it doesn't exist."""
    db = get_db_path()
    with sqlite3.connect(str(db)) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS historial (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                files_json TEXT NOT NULL,
                options_json TEXT NOT NULL,
                patron TEXT,
                formato TEXT,
                calidad INTEGER,
                resize TEXT,
                ok_count INTEGER DEFAULT 0,
                err_count INTEGER DEFAULT 0
            )
            """
        )


def save_run(
    files: list[str],
    options: dict[str, Any],
    patron: str,
    formato: str,
    calidad: int,
    resize: str | None,
    ok_count: int,
    err_count: int,
) -> int:
    """Save a processing run to history and return its ID."""
    _ensure_table()
    db = get_db_path()
    with sqlite3.connect(str(db)) as conn:
        cursor = conn.execute(
            """
            INSERT INTO historial (timestamp, files_json, options_json, patron, formato, calidad, resize, ok_count, err_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                datetime.now().isoformat(),
                json.dumps(files),
                json.dumps(options),
                patron,
                formato,
                calidad,
                resize,
                ok_count,
                err_count,
            ),
        )
        conn.commit()
        return cursor.lastrowid or 0


def list_runs(limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
    """List recent processing runs, newest first."""
    _ensure_table()
    db = get_db_path()
    with sqlite3.connect(str(db)) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM historial ORDER BY timestamp DESC LIMIT ? OFFSET ?",
            (limit, offset)
        ).fetchall()
    return [dict(r) for r in rows]


def get_run(run_id: int) -> dict[str, Any] | None:
    """Get a single run by ID."""
    _ensure_table()
    db = get_db_path()
    with sqlite3.connect(str(db)) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM historial WHERE id = ?", (run_id,)).fetchone()
    return dict(row) if row else None


def delete_run(run_id: int) -> bool:
    """Delete a run by ID."""
    _ensure_table()
    db = get_db_path()
    with sqlite3.connect(str(db)) as conn:
        cursor = conn.execute("DELETE FROM historial WHERE id = ?", (run_id,))
        conn.commit()
        return cursor.rowcount > 0
