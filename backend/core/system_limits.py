"""Hardware-aware resource limits for the ANTARES backend.

Single source of truth for limits derived from CPU and RAM. Consumed by both
JobManager (top-level concurrent user jobs) and WorkScheduler (thread-pool
heavy/light slots). See issues/simplification/014.
"""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class HardwareLimits:
    cpu_count: int
    ram_available_gb: float

    @property
    def max_concurrent_jobs(self) -> int:
        try:
            ram_limited = max(1, int(self.ram_available_gb // 2))
            return max(4, min(self.cpu_count, ram_limited, 16))
        except Exception:
            return 4

    @property
    def light_workers(self) -> int:
        return max(2, min(self.cpu_count, 4))

    @property
    def heavy_workers(self) -> int:
        ram_limited = max(1, int(self.ram_available_gb // 3))
        return max(2, min(max(1, self.cpu_count // 2), ram_limited, 6))

    @property
    def heavy_queue_limit(self) -> int:
        return max(self.heavy_workers, self.heavy_workers * 2)


def detect_hardware_limits() -> HardwareLimits:
    cpu_count = os.cpu_count() or 2
    try:
        import psutil

        ram_available_gb = psutil.virtual_memory().available / (1024 ** 3)
    except Exception:
        ram_available_gb = 4.0
    return HardwareLimits(cpu_count=cpu_count, ram_available_gb=ram_available_gb)
