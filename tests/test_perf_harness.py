"""perf measurement harnesses for the "medir primero" cluster.

These are NOT CI gates — they are @pytest.mark.slow benchmarks excluded by the
default `addopts = "-m 'not slow'"`. Run them on demand to get real numbers that
justify (or reject) a fix, per the project rule "Medir antes de optimizar":

    cd backend && ../venv312/Scripts/python.exe -m pytest ../tests/test_perf_harness.py -m slow -v -s

Each harness asserts structural invariants (correct counts / output sizes /
quality floor) so it is a runnable check, and prints the timing delta + a
decision rule for human review.
"""

import time

import pytest

import backend.core.database as db
from backend.core.config_fields import save_fields
from backend.core.repository import close_connection, get_connection

# --- perf-06: global RLock serializes all reads ------------------------------------


@pytest.mark.slow
def test_perf06_sqlite_read_serialization_baseline(tmp_path, monkeypatch) -> None:
    """perf-06 measure: how much does the global RLock serialize concurrent reads?

    Seeds N rows, then runs READERS parallel obtener_todos() two ways:
      - locked:   the real _db_lock (current behaviour — reads serialize).
      - unlocked: a no-op lock (reads share the WAL connection with no app-level
                  lock; check_same_thread=False + WAL allow concurrent readers).
    Reports wall-time for both + the speedup an RWLock fix could unlock.

    Decision rule (printed): implement RWLock only if speedup >> 1 (lock
    serialisation dominates); if speedup ≈ 1 the GIL already serialises the
    Python row-building and an RWLock would not help — skip and record.
    """
    from concurrent.futures import ThreadPoolExecutor

    rows_to_seed = 20000
    readers = 8

    db_file = tmp_path / "test_perf06.db"
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
        conn.executemany(
            "INSERT INTO imagenes (codigo, nombre) VALUES (?, ?)",
            [(f"CODE_{i:05d}", f"Name {i}") for i in range(rows_to_seed)],
        )
        conn.commit()

        def _read() -> int:
            return len(db.obtener_todos())

        class _NoOpLock:
            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

            def acquire(self, *a, **k):
                pass

            def release(self):
                pass

        def _run_concurrent() -> tuple[float, list[int]]:
            with ThreadPoolExecutor(max_workers=readers) as ex:
                results = list(ex.map(lambda _i: _read(), range(readers)))
            return time.perf_counter() - t0, results

        # warm the SQLite page cache so we measure steady-state, not cold disk
        _read()

        t0 = time.perf_counter()
        locked_wall, locked_results = _run_concurrent()
        assert all(r == rows_to_seed for r in locked_results), "every locked read must see all seeded rows"

        monkeypatch.setattr(db, "_db_lock", _NoOpLock())
        t0 = time.perf_counter()
        unlocked_wall, unlocked_results = _run_concurrent()
        assert all(r == rows_to_seed for r in unlocked_results), "every unlocked read must see all seeded rows"

        speedup = locked_wall / unlocked_wall if unlocked_wall > 0 else float("inf")
        print(
            f"\n[perf-06] rows={rows_to_seed} readers={readers} "
            f"locked_wall={locked_wall * 1000:.1f}ms "
            f"unlocked_wall={unlocked_wall * 1000:.1f}ms "
            f"speedup={speedup:.2f}x  "
            f"(implement RWLock if speedup >> 1; skip if ~1)"
        )
    finally:
        close_connection()


# --- perf-15: LANCZOS without reducing_gap on heavy downscale ----------------------


def _psnr_rgb(a, b) -> float:
    """PSNR (dB) between two same-size RGB images, stdlib + Pillow only (no skimage)."""
    import math

    from PIL import ImageChops

    diff = ImageChops.difference(a.convert("RGB"), b.convert("RGB")).convert("L")
    hist = diff.histogram()
    n = a.size[0] * a.size[1]
    sse = sum(i * i * hist[i] for i in range(256))
    mse = sse / n
    return float("inf") if mse == 0 else 10.0 * math.log10(255.0 * 255.0 / mse)


@pytest.mark.slow
def test_perf15_lanczos_reducing_gap_comparison() -> None:
    """perf-15 measure: LANCZOS vs LANCZOS+reducing_gap=2.0 for a heavy downscale
    (6000x4000 -> 400x267). Reports median time of both + PSNR between outputs.

    Decision rule (printed): apply reducing_gap only if time gain > 5% AND
    PSNR >= 30 dB (quality equivalence); else record and skip.
    """
    import numpy as np
    from PIL import Image

    rng = np.random.default_rng(0)
    yy, xx = np.mgrid[0:4000, 0:6000]
    arr = np.stack(
        [
            (xx * 255 // 6000).astype(np.int16),
            (yy * 255 // 4000).astype(np.int16),
            ((xx + yy) * 255 // 10000).astype(np.int16),
        ],
        axis=-1,
    )
    arr = (arr + rng.integers(-25, 25, arr.shape, dtype=np.int16)).clip(0, 255).astype(np.uint8)

    def _median_ms(fn, runs: int = 3):
        times = []
        out = None
        for _ in range(runs):
            t0 = time.perf_counter()
            out = fn()
            times.append(time.perf_counter() - t0)
        times.sort()
        return times[len(times) // 2] * 1000.0, out

    def _baseline():
        return Image.fromarray(arr, "RGB").resize((400, 267), Image.Resampling.LANCZOS)

    def _reducing_gap():
        # perf-15 shipped path: exact-size resize with reducing_gap (matches
        # converter.py / ubicaciones.py), not thumbnail.
        return Image.fromarray(arr, "RGB").resize(
            (400, 267), Image.Resampling.LANCZOS, reducing_gap=2.0
        )

    base_ms, base_img = _median_ms(_baseline)
    cand_ms, cand_img = _median_ms(_reducing_gap)

    psnr = _psnr_rgb(base_img, cand_img)
    gain_pct = (base_ms - cand_ms) / base_ms * 100.0 if base_ms > 0 else 0.0

    assert base_img.size == (400, 267), "baseline output must be 400x267"
    assert cand_img.size == (400, 267), "reducing_gap output must match target size"
    assert psnr >= 30.0, f"quality equivalence failed: PSNR {psnr:.1f} dB < 30 dB"

    print(
        f"\n[perf-15] 6000x4000 -> 400x267  "
        f"baseline_LANCZOS={base_ms:.1f}ms  reducing_gap2.0={cand_ms:.1f}ms  "
        f"gain={gain_pct:.1f}%  PSNR={psnr:.1f}dB  "
        f"(apply if gain > 5% AND PSNR >= 30 dB)"
    )
