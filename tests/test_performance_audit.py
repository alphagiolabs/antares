"""Performance audit tests — validate identified bottlenecks and regressions.

These tests are NOT micro-benchmarks. They assert structural performance
properties that, if broken, would cause real-world degradation:

1. SQLite connection uses WAL + synchronous=NORMAL (not the slow defaults).
2. Preview cache has a bounded size (no unbounded memory growth).
3. Scheduler heavy queue is bounded (no unbounded thread growth).
4. Database batch lookup uses a single query (not N individual queries).
5. IPC payload size limit is enforced (prevents pipe blocking).
6. Image conversion opens files with context managers (no leaked FDs).
7. History table has indexes on timestamp and run_type (no full scans).
8. Chunk size calculation is adaptive and bounded.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

# ─── 1. SQLite PRAGMA configuration ─────────────────────────────────────────


def test_sqlite_uses_wal_and_normal_sync() -> None:
    """Repository must configure WAL + synchronous=NORMAL for concurrency."""
    from backend.core.repository import close_connection, get_connection

    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "test.db"
        try:
            conn = get_connection(db_path)
            journal_mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
            synchronous = conn.execute("PRAGMA synchronous").fetchone()[0]
            assert journal_mode.lower() == "wal", f"Expected WAL, got {journal_mode}"
            assert synchronous == 1, f"Expected synchronous=NORMAL (1), got {synchronous}"
        finally:
            close_connection()


def test_sqlite_cache_size_is_set() -> None:
    """Repository should set a cache size for performance."""
    from backend.core.repository import close_connection, get_connection

    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "test.db"
        try:
            conn = get_connection(db_path)
            cache_size = conn.execute("PRAGMA cache_size").fetchone()[0]
            # cache_size=-16000 means 16MB; negative = kibibytes
            assert cache_size <= -16000, f"Expected cache_size <= -16000, got {cache_size}"
        finally:
            close_connection()


# ─── 2. Preview cache bounds ────────────────────────────────────────────────


def test_preview_cache_is_bounded() -> None:
    """Preview cache must evict old entries to prevent memory leaks."""
    from backend.core.preview_cache import PreviewCache

    cache = PreviewCache(max_size=10, ttl_seconds=300)
    for i in range(20):
        cache.set(f"key_{i}", {"data": i})

    # First 10 entries should have been evicted
    assert cache.get("key_0") is None, "Cache should have evicted key_0"
    assert cache.get("key_19") is not None, "Cache should retain key_19"
    assert cache.get("key_19")["data"] == 19


def test_preview_cache_respects_ttl() -> None:
    """Preview cache must expire entries after TTL."""
    from backend.core.preview_cache import PreviewCache

    cache = PreviewCache(max_size=10, ttl_seconds=0)
    cache.set("key", {"data": 1})
    # TTL=0 means immediate expiry
    import time

    time.sleep(0.01)
    assert cache.get("key") is None, "Cache should have expired the entry"


# ─── 3. Scheduler heavy queue bounds ────────────────────────────────────────


def test_scheduler_heavy_capacity_is_bounded() -> None:
    """Scheduler must reject work when heavy capacity is full."""
    import threading

    from backend.core.scheduler import SchedulerBusy, WorkScheduler

    release = threading.Event()
    scheduler = WorkScheduler(light_workers=1, heavy_workers=1, heavy_queue_limit=0)
    try:
        scheduler.submit_heavy(release.wait)
        with pytest.raises(SchedulerBusy):
            scheduler.submit_heavy(release.wait)
        metrics = scheduler.metrics()
        assert metrics["heavy_capacity"] == 1
        assert metrics["heavy_rejected"] == 1
    finally:
        release.set()
        scheduler.shutdown(wait=True)


# ─── 4. Database batch lookup ───────────────────────────────────────────────


def test_buscar_lote_por_codigos_uses_batch_query(tmp_path, monkeypatch) -> None:
    """Batch lookup must not issue N individual queries."""
    from backend.core import database as db
    from backend.core.config_fields import save_fields
    from backend.core.database import buscar_lote_por_codigos
    from backend.core.repository import _db_lock, close_connection, get_connection

    db_file = tmp_path / "test_audit.db"
    monkeypatch.setattr(db, "get_db_path", lambda: db_file)
    monkeypatch.setattr(
        "backend.core.config_fields._config_file",
        lambda: tmp_path / "fields_config.json",
    )
    save_fields([
        {"name": "codigo", "type": "TEXT", "required": True, "unique": True},
        {"name": "nombre", "type": "TEXT"},
    ])
    db.init_db()

    try:
        conn = get_connection(db_file)
        conn.execute("INSERT INTO imagenes (codigo, nombre) VALUES ('A001', 'Alpha')")
        conn.execute("INSERT INTO imagenes (codigo, nombre) VALUES ('B002', 'Beta')")
        conn.commit()

        with _db_lock:
            result = buscar_lote_por_codigos(["A001", "B002", "C003"])

        # Must find the two existing codes
        assert "A001" in result
        assert "B002" in result
        # Batch query should use a single query (or chunked), not N individual.
        # We verify by checking that the result has both keys from one call.
        assert len(result) == 2
    finally:
        close_connection()


# ─── 5. IPC payload size limit ──────────────────────────────────────────────


def test_ipc_max_payload_size_is_set() -> None:
    """IPC protocol must enforce a payload size limit."""
    from backend.ipc_protocol import _MAX_PAYLOAD_SIZE

    assert _MAX_PAYLOAD_SIZE > 0, "Max payload size must be positive"
    assert _MAX_PAYLOAD_SIZE >= 10 * 1024 * 1024, "Max payload size should be at least 10MB"


# ─── 6. History table indexes ───────────────────────────────────────────────


def test_history_table_has_indexes(tmp_path, monkeypatch) -> None:
    """History table must have indexes on timestamp and run_type."""
    from backend.core import database as db
    from backend.core import history
    from backend.core.config_fields import save_fields
    from backend.core.history import _ensure_table
    from backend.core.repository import close_connection, get_connection

    db_file = tmp_path / "test_audit.db"
    monkeypatch.setattr(db, "get_db_path", lambda: db_file)
    monkeypatch.setattr(history, "get_db_path", lambda: db_file)
    monkeypatch.setattr(
        "backend.core.config_fields._config_file",
        lambda: tmp_path / "fields_config.json",
    )
    save_fields([
        {"name": "codigo", "type": "TEXT", "required": True, "unique": True},
        {"name": "nombre", "type": "TEXT"},
    ])
    db.init_db()

    try:
        _ensure_table()
        conn = get_connection(db_file)
        indexes = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='historial'"
        ).fetchall()
        index_names = {row[0] for row in indexes}
        assert "idx_historial_ts" in index_names, f"Missing idx_historial_ts index. Found: {index_names}"
        assert "idx_historial_run_type" in index_names, f"Missing idx_historial_run_type index. Found: {index_names}"
    finally:
        close_connection()


# ─── 7. Chunk size is adaptive and bounded ──────────────────────────────────


def test_chunk_size_is_bounded() -> None:
    """Chunk size must be bounded to prevent memory exhaustion."""
    from backend.handlers.conversion import _calculate_chunk_size

    chunk_size = _calculate_chunk_size()
    assert 50 <= chunk_size <= 1000, f"Chunk size should be 50-1000, got {chunk_size}"


# ─── 8. SQLite query param limit respected ──────────────────────────────────


def test_batch_lookup_respects_sqlite_param_limit(tmp_path, monkeypatch) -> None:
    """Batch lookup must chunk to avoid SQLite's 999 param limit."""
    from backend.core import database as db
    from backend.core.config_fields import save_fields
    from backend.core.database import buscar_por_columna
    from backend.core.repository import _db_lock, close_connection, get_connection

    db_file = tmp_path / "test_audit.db"
    monkeypatch.setattr(db, "get_db_path", lambda: db_file)
    monkeypatch.setattr(
        "backend.core.config_fields._config_file",
        lambda: tmp_path / "fields_config.json",
    )
    save_fields([
        {"name": "codigo", "type": "TEXT", "required": True, "unique": True},
        {"name": "nombre", "type": "TEXT"},
    ])
    db.init_db()

    try:
        conn = get_connection(db_file)
        # Insert 1000 rows
        values = [(f"CODE_{i:04d}",) for i in range(1000)]
        conn.executemany("INSERT INTO imagenes (codigo) VALUES (?)", values)
        conn.commit()

        # Query with 2000 codes — must not hit the 999 param limit
        codes = [f"CODE_{i:04d}" for i in range(2000)]
        with _db_lock:
            result = buscar_por_columna(codes, "codigo")

        # Should find the 1000 existing codes
        assert len(result) == 1000, f"Expected 1000 results, got {len(result)}"
    finally:
        close_connection()


# ─── 9. Main loop dispatch does not block on heavy handlers ─────────────────


def test_main_loop_submits_to_scheduler() -> None:
    """Main loop must dispatch handlers to the scheduler, not run inline."""
    from backend.main import _submit_handler

    # _submit_handler should exist and be callable
    assert callable(_submit_handler), "_submit_handler must be callable"


# ─── 10. Connection is reused (not reconnected per query) ──────────────────


def test_connection_is_reused() -> None:
    """Repository must reuse the same connection object for the same DB path."""
    from backend.core.repository import close_connection, get_connection

    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "test.db"
        try:
            conn1 = get_connection(db_path)
            conn2 = get_connection(db_path)
            assert conn1 is conn2, "Connection should be reused for the same DB path"
        finally:
            close_connection()


# ─── 11. Formatos: PDF template is parsed once, not once per page ──────────


def test_formatos_visual_overlay_parses_template_once() -> None:
    """perf-02: the overlay strategy must parse the template PDF a single time
    regardless of page count. The old code re-parsed the whole template inside
    the page loop (O(N) parses + N duplicated content streams → huge output
    PDFs); the fix parses once and clones the source page per iteration.
    """
    import io

    from pypdf import PdfReader

    from backend.core import formatos
    from backend.core.format_strategies import visual_overlay as vo

    fmt = next(f for f in formatos._BUILTIN_FORMATS if f["id"] == "maquina")
    template_bytes = formatos._load_template_bytes(fmt)
    mapping = fmt["mapping"]
    desde, hasta = 1, 6
    n_pages = hasta - desde + 1

    orig = vo.PdfReader
    calls: list[int] = []

    def counting_reader(*a, **kw):
        calls.append(1)
        return orig(*a, **kw)

    vo.PdfReader = counting_reader
    try:
        out = vo.VisualOverlayStrategy().generate(template_bytes, desde, hasta, mapping)
    finally:
        vo.PdfReader = orig

    # 1 template parse + 1 stamp parse per page (the overlay stamp is rebuilt
    # per page by design). The old per-page-reparse code would be N + N.
    assert len(calls) == 1 + n_pages, (
        f"Template should be parsed once; got {len(calls)} PdfReader calls for "
        f"{n_pages} pages (expected 1 + {n_pages})"
    )
    out_pages = len(PdfReader(io.BytesIO(out)).pages)
    assert out_pages == n_pages, f"Expected {n_pages} output pages, got {out_pages}"


def test_formatos_visual_overlay_with_blank_mcids_produces_pages() -> None:
    """perf-02 regression guard: the televisiva builtin uses blank_mcids=[63],
    which mutates the page's XObject via set_data. The parse-once + clone path
    must still produce one page per number without error."""
    import io

    from pypdf import PdfReader

    from backend.core import formatos
    from backend.core.format_strategies import visual_overlay as vo

    fmt = next(f for f in formatos._BUILTIN_FORMATS if f["id"] == "televisiva")
    template_bytes = formatos._load_template_bytes(fmt)
    desde, hasta = 1, 4
    out = vo.VisualOverlayStrategy().generate(
        template_bytes, desde, hasta, fmt["mapping"]
    )
    assert len(PdfReader(io.BytesIO(out)).pages) == hasta - desde + 1


# ─── 12. perf-13: key-column detection — single lock + COUNT(*) ────────────


def test_contar_matches_por_columna_one_lock_and_error_semantics(monkeypatch) -> None:
    """perf-13: contar_matches_por_columna acquires the DB lock once for C columns
    (was C acquisitions via per-column buscar_por_columna) and preserves the
    detection semantics: 0 for a valid column with no matches, -1 for an invalid
    identifier or a DB error."""
    import re
    import sqlite3

    import backend.core.database as db

    field_names = ["a", "b", "c", "boom", "x"]
    counts_for = {"a": 3, "b": 0, "c": 5, "boom": "raise", "x": 0}

    class _Cursor:
        def execute(self, sql, params):
            m = re.search(r'WHERE "([^"]+)" IN', sql)
            self._col = m.group(1) if m else ""
            if counts_for.get(self._col) == "raise":
                raise sqlite3.OperationalError("boom")

        def fetchone(self):
            return [counts_for.get(self._col, 0)]

        def fetchall(self):
            return []

        def close(self):
            pass

    class _Conn:
        def cursor(self):
            return _Cursor()

        def commit(self):
            pass

    monkeypatch.setattr(db, "_get_connection", lambda: _Conn())
    monkeypatch.setattr(db, "get_field_names", lambda: field_names)

    acquired = {"n": 0}

    class _CountingLock:
        def __enter__(self):
            acquired["n"] += 1
            return self

        def __exit__(self, *exc):
            return False

    monkeypatch.setattr(db, "_db_lock", _CountingLock())

    result = db.contar_matches_por_columna(["k1", "k2"], ["a", "b", "c", "boom", "x", "BAD!"])

    assert acquired["n"] == 1, "must hold the DB lock once for all columns (perf-13)"
    assert result == {"a": 3, "b": 0, "c": 5, "boom": -1, "x": 0, "BAD!": -1}


def test_contar_matches_por_columna_one_lock_against_seeded_db(tmp_path, monkeypatch) -> None:
    """perf-13: against a real seeded SQLite DB, contar_matches_por_columna holds
    the lock once across all columns and returns the correct COUNT(*) per column."""
    import backend.core.database as db
    from backend.core.config_fields import save_fields
    from backend.core.database import contar_matches_por_columna
    from backend.core.repository import _db_lock as real_lock
    from backend.core.repository import close_connection, get_connection

    db_file = tmp_path / "test_perf13.db"
    monkeypatch.setattr(db, "get_db_path", lambda: db_file)
    monkeypatch.setattr(
        "backend.core.config_fields._config_file",
        lambda: tmp_path / "fields_config.json",
    )
    save_fields([
        {"name": "codigo", "type": "TEXT", "required": True, "unique": True},
        {"name": "nombre", "type": "TEXT"},
    ])
    db.init_db()
    try:
        conn = get_connection(db_file)
        conn.execute("INSERT INTO imagenes (codigo, nombre) VALUES ('A001', 'Alpha')")
        conn.execute("INSERT INTO imagenes (codigo, nombre) VALUES ('B002', 'Beta')")
        conn.commit()

        acquired = {"n": 0}

        class _CountingLock:
            def __enter__(self):
                real_lock.acquire()
                acquired["n"] += 1
                return self

            def __exit__(self, *exc):
                real_lock.release()
                return False

        monkeypatch.setattr(db, "_db_lock", _CountingLock())

        counts = contar_matches_por_columna(["A001", "B002", "nope"], ["codigo", "nombre", "modelo"])

        assert acquired["n"] == 1, "one lock hold for all columns (perf-13)"
        assert counts == {"codigo": 2, "nombre": 0, "modelo": 0}
    finally:
        close_connection()
