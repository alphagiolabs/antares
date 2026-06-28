"""Detect the database column that best matches parsed file codes.

Single implementation shared by the three key-column helpers in
``backend.handlers.conversion`` (``_detect_best_key_column``,
``_resolve_key_column`` and the ``db_detect_key_column`` IPC handler).

The algorithm is a verbatim copy of the previous per-function
implementations: parse a sample of file names, count matches per DB
column under a single DB lock via ``contar_matches_por_columna``
(perf-13), and pick the column with the most matches.

``contar_matches_por_columna`` is imported lazily inside the function so
that test monkeypatches on ``backend.core.database.contar_matches_por_columna``
keep intercepting at runtime (see the simplification-002 lesson: binding
the reference at module load breaks those patches).
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from backend.utils.validators import parse_filename_parts


def detect_best_key_column(
    files: list[str],
    db_columns: list[str],
    *,
    preferred: str | None = None,
    sample_size: int = 30,
) -> tuple[str, int, list[dict[str, Any]]]:
    """Probe each DB column and return ``(column, best_count, per_column)``.

    ``db_columns`` must contain at least two entries; callers handle the
    empty / single-column edge cases themselves to preserve their own
    distinct return shapes. When the parsed file codes yield no search
    key, returns ``(db_columns[0], 0, [])`` — matching the previous
    early-returns of all three callers (no DB lock acquired).

    When ``preferred`` is supplied and matches at least as well as the
    best column with a positive match count, it wins the tie-break. This
    preserves the user-column preference in ``_resolve_key_column``; the
    other two callers pass ``preferred=None`` and get pure best-match.
    """
    from backend.core.database import contar_matches_por_columna

    sample_files = files[:sample_size]
    codigos: list[str] = []
    stems: list[str] = []
    for f in sample_files:
        p = Path(f)
        code, _ = parse_filename_parts(p.name)
        codigos.append(code)
        stems.append(p.stem)
    search_keys = list(set(codigos + stems))
    if not search_keys:
        return db_columns[0], 0, []

    # perf-13: one lock hold + COUNT(*) across all columns (was C buscar_por_columna calls).
    counts = contar_matches_por_columna(search_keys, db_columns)

    best_col = db_columns[0]
    best_count = -1
    user_count = -1
    column_results: list[dict[str, Any]] = []
    for col in db_columns:
        count = counts.get(col, -1)
        column_results.append({"name": col, "matches": count})
        if col == preferred:
            user_count = count
        if count > best_count:
            best_count = count
            best_col = col

    final_col = best_col
    # Keep the user's choice if it matches equally well as the best (and actually matches).
    if (
        preferred
        and preferred in db_columns
        and user_count >= 0
        and user_count >= best_count
        and user_count > 0
    ):
        final_col = preferred

    return final_col, best_count, column_results
