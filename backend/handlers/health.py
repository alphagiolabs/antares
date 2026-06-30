"""Health check handler with extended metrics."""

from __future__ import annotations

import os
import time
from typing import Any

from backend.utils.i18n import t


def _get_process_memory_mb() -> float | None:
    """Get current process memory usage in MB."""
    try:
        import psutil
        process = psutil.Process(os.getpid())
        mem_info = process.memory_info()
        return round(mem_info.rss / (1024 * 1024), 2)
    except (ImportError, Exception):
        return None


def _get_process_cpu_percent() -> float | None:
    """Get current process CPU usage percentage."""
    try:
        import psutil
        process = psutil.Process(os.getpid())
        return process.cpu_percent(interval=None)
    except (ImportError, Exception):
        return None


def health_check(params: dict[str, Any]) -> dict[str, Any]:
    """Extended health check with system metrics.
    
    Returns:
        - status: 'ok' | 'degraded' | 'error'
        - uptime_seconds: time since module load
        - memory_mb: process memory usage
        - cpu_percent: process CPU usage
        - scheduler: queue/worker metrics from WorkScheduler
        - warnings: list of degradation reasons (if any)
    """
    from backend.core.scheduler import get_scheduler
    
    scheduler = get_scheduler()
    scheduler_metrics = scheduler.metrics()
    
    # Calculate uptime
    uptime = time.time() - _module_load_time
    
    # Get process metrics
    memory_mb = _get_process_memory_mb()
    cpu_percent = _get_process_cpu_percent()
    
    # Determine health status
    warnings = []
    status = "ok"
    
    # Check for degradation conditions
    if scheduler_metrics.get("heavy_active", 0) >= scheduler_metrics.get("heavy_workers", 1):
        warnings.append("heavy_workers_saturated")
    
    if scheduler_metrics.get("heavy_queued", 0) > 0:
        warnings.append("heavy_queue_not_empty")
    
    # Memory threshold: warn if > 500MB
    if memory_mb is not None and memory_mb > 500:
        warnings.append("high_memory_usage")
        status = "degraded"
    
    if warnings and status == "ok":
        status = "degraded"
    
    return {
        "status": status,
        "uptime_seconds": round(uptime, 1),
        "memory_mb": memory_mb,
        "cpu_percent": cpu_percent,
        "scheduler": scheduler_metrics,
        "warnings": warnings,
    }


# Track module load time for uptime calculation
_module_load_time = time.time()


HANDLERS = {
    "health_check": health_check,
}
