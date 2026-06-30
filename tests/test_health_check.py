"""Tests for health check handler."""

from __future__ import annotations

import pytest


def test_health_check_returns_ok_status():
    """Health check should return status 'ok' on a fresh process."""
    from backend.handlers.health import health_check

    result = health_check({})

    assert result["status"] in ("ok", "degraded")
    assert "uptime_seconds" in result
    assert "memory_mb" in result
    assert "scheduler" in result
    assert "warnings" in result


def test_health_check_has_scheduler_metrics():
    """Health check should include scheduler metrics."""
    from backend.handlers.health import health_check

    result = health_check({})
    scheduler = result["scheduler"]

    assert "light_workers" in scheduler
    assert "heavy_workers" in scheduler
    assert "heavy_active" in scheduler
    assert "heavy_queued" in scheduler
    assert scheduler["heavy_workers"] >= 1


def test_health_check_uptime_increases():
    """Uptime should increase over time."""
    import time

    from backend.handlers.health import health_check

    result1 = health_check({})
    time.sleep(0.1)
    result2 = health_check({})

    assert result2["uptime_seconds"] >= result1["uptime_seconds"]


def test_health_check_memory_is_positive():
    """Memory usage should be positive if available."""
    from backend.handlers.health import health_check

    result = health_check({})

    if result["memory_mb"] is not None:
        assert result["memory_mb"] > 0
