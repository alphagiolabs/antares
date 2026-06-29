"""Stress and scale tests for the conversion pipeline."""

from __future__ import annotations

import threading

import pytest

from backend.core.jobs import Job, JobManager
from backend.handlers import conversion


class _ImmediateFuture:
    def __init__(self, result: tuple[bool, str, str]) -> None:
        self._result = result

    def result(self) -> tuple[bool, str, str]:
        return self._result

    def cancelled(self) -> bool:
        return False

    def cancel(self) -> bool:
        return False


class _ImmediateScheduler:
    def submit_heavy(self, fn, task, *, block=False, cancel_check=None):  # type: ignore[no-untyped-def]
        return _ImmediateFuture(fn(task))


def _stress_params(tmp_path, file_count: int) -> dict:
    dest = tmp_path / "out"
    dest.mkdir()
    return {
        "files": [str(tmp_path / f"img_{index:05d}.jpg") for index in range(file_count)],
        "destino": str(dest),
        "conversion_enabled": False,
        "usar_rename": False,
        "locale": "es",
        "job_id": f"stress-{file_count}",
    }


def _run_conversion_stress(monkeypatch, tmp_path, file_count: int) -> None:
    monkeypatch.setattr(conversion, "get_scheduler", lambda: _ImmediateScheduler())
    monkeypatch.setattr(conversion, "es_video", lambda _path: False)
    monkeypatch.setattr(conversion, "copiar_archivo", lambda _src, _dst: None)
    monkeypatch.setattr("backend.core.history.save_run", lambda **_kwargs: None)
    monkeypatch.setattr(conversion, "send_notification", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(conversion, "_calculate_chunk_size", lambda: 500)

    job = Job(
        id=f"stress-{file_count}",
        job_type="conversion",
        params=_stress_params(tmp_path, file_count),
    )
    with job.state._lock:
        job.state.running = True
        job.state.total = file_count

    conversion._run_conversion_job(job)

    assert job.result is not None
    assert job.result["ok_count"] == file_count
    assert job.result["err_count"] == 0
    assert job.result["cancelled"] is False
    with job.state._lock:
        assert job.state.progress == 100


def test_conversion_queue_accepts_1000_files(monkeypatch, tmp_path) -> None:
    """Fast scale check — runs in default CI."""
    _run_conversion_stress(monkeypatch, tmp_path, 1000)


@pytest.mark.slow
def test_conversion_queue_accepts_10k_files(monkeypatch, tmp_path) -> None:
    """Full audit stress target — opt-in via `pytest -m slow`."""
    _run_conversion_stress(monkeypatch, tmp_path, 10_000)


def test_process_start_accepts_large_file_list(monkeypatch, tmp_path) -> None:
    mgr = JobManager(max_concurrent=2)
    monkeypatch.setattr(conversion, "get_job_manager", lambda: mgr)
    monkeypatch.setattr(conversion, "_run_conversion_job", lambda job: setattr(job, "result", {"ok_count": len(job.params["files"])}))

    params = _stress_params(tmp_path, 2500)
    result = conversion.process_start(params)

    assert result["started"] is True
    job = mgr.get_job(result["job_id"])
    assert job is not None
    job.thread.join(timeout=10)
    with job.state._lock:
        assert job.state.total == 2500


def test_two_conversion_jobs_run_in_parallel() -> None:
    entered = threading.Barrier(2, timeout=5)
    release = threading.Event()
    peak_running = {"value": 0}
    lock = threading.Lock()

    def _target(job: Job) -> None:
        with lock:
            peak_running["value"] = max(
                peak_running["value"],
                sum(1 for current in mgr._jobs.values() if current.state.running),
            )
        entered.wait()
        release.wait(timeout=5)
        job.result = {"ok_count": 1, "err_count": 0, "cancelled": False}

    mgr = JobManager(max_concurrent=4)
    first = mgr.create_job("conversion", {"files": ["a.jpg"]}, _target, job_id="parallel-a")
    second = mgr.create_job("conversion", {"files": ["b.jpg"]}, _target, job_id="parallel-b")

    assert first["started"] is True
    assert second["started"] is True

    release.set()
    mgr.get_job("parallel-a").thread.join(timeout=10)
    mgr.get_job("parallel-b").thread.join(timeout=10)

    assert peak_running["value"] >= 2
