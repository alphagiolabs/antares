"""Entrypoint: backend IPC Python para Electron.

Lee mensajes JSON-RPC desde stdin, enruta a handlers, escribe respuestas a stdout.
Incluye un mecanismo de handshake para reportar "ready" al proceso padre (Electron).
"""

from __future__ import annotations

import sys
from pathlib import Path

# Force UTF-8 for stdio streams to prevent encoding issues in IPC pipes on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

try:
    from bootstrap import adjust_backend_import_path  # type: ignore[import-not-found]
except ModuleNotFoundError:
    from backend.bootstrap import adjust_backend_import_path

# Ensure backend package is importable when running main.py directly.
# When executing `python backend/main.py`, Python adds the script's directory
# to sys.path[0], causing `from backend.core...` to fail because `backend`
# resolves to the directory itself instead of the parent directory.
_backend_dir = Path(__file__).resolve().parent
sys.path = adjust_backend_import_path(
    sys.path,
    _backend_dir,
    frozen=bool(getattr(sys, "frozen", False)),
)

import locale
import logging
import re
import signal
import time
import traceback
import warnings
from concurrent.futures import Future
from dataclasses import dataclass

from backend.core.database import init_db
from backend.core.plugins import load_plugins_from_dir
from backend.core.repository import close_connection
from backend.core.scheduler import SchedulerBusy, get_scheduler
from backend.handlers import HANDLERS
from backend.ipc_protocol import _SKIP, read_message, send_notification, send_response
from backend.utils.i18n import t

_shutdown_requested = False

# Silence tkinter deprecation warning on macOS
warnings.filterwarnings("ignore", category=DeprecationWarning)



def _signal_handler(_signum, _frame) -> None:
    """Handle termination signals gracefully.

    Only sets a flag — avoids non-async-signal-safe calls (logging, I/O)
    that can deadlock inside a signal handler.
    """
    global _shutdown_requested
    _shutdown_requested = True


if hasattr(signal, "SIGTERM"):
    signal.signal(signal.SIGTERM, _signal_handler)
if hasattr(signal, "SIGINT"):
    signal.signal(signal.SIGINT, _signal_handler)

# Windows doesn't have SIGHUP
if hasattr(signal, "SIGHUP"):
    signal.signal(signal.SIGHUP, _signal_handler)


# Logging to stderr so stdout stays clean for IPC
logging.basicConfig(
    level=logging.INFO,
    format="[%(levelname)s] %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(__name__)


@dataclass
class ErrorBudget:
    """Tracks consecutive main-loop errors to avoid spamming logs / spinning on
    persistent issues. Encapsulates the counter + thresholds that were
    previously ad-hoc locals in main() (simplification-004). Behavior preserved
    1:1: same max (100), same recovery sleep (0.5s), same break-on-exhaustion.
    """

    consecutive: int = 0
    max_consecutive: int = 100
    recovery_sleep_seconds: float = 0.5

    def record_error(self) -> bool:
        """Increment on error; return True when the budget is exhausted."""
        self.consecutive += 1
        return self.consecutive >= self.max_consecutive

    def record_success(self) -> None:
        """Full reset on a dispatched or cleanly rejected message."""
        self.consecutive = 0

    def record_skip(self) -> None:
        """Partial recovery on a skipped (already-responded) parse error."""
        self.consecutive = max(0, self.consecutive - 1)

    def sleep_recovery(self) -> None:
        time.sleep(self.recovery_sleep_seconds)


HEAVY_METHODS = {
    "db_import",
    "db_export",
    "db_clear",
    "preview_image",
    "process_start",
    "formatos_generate",
    "formatos_render_template_page",
    "image_optimizer_zip",
    "image_optimizer_save_files",
    "sellador_apply",
    "sellador_inspect_pdf",
    "sellador_render_page",
    "technical_reports_import_file",
    "technical_reports_render_html",
    "technical_reports_render_consolidated_html",
    "panel_aviso_corte_parse_excel",
    "panel_aviso_corte_compute_match",
    "panel_aviso_corte_render_pdf",
    "generar_ubicaciones",
    "preview_ubicacion",
}


def _validate_encoding() -> None:
    """Validate that system supports required encoding."""
    import os as _os

    try:
        _os.environ["PYTHONIOENCODING"] = "utf-8"
        _os.environ["PYTHONUTF8"] = "1"

        utf8_locales = ["C.UTF-8", "en_US.UTF-8"]
        if sys.platform == "win32":
            utf8_locales.extend(["es-MX", "Spanish_Mexico.UTF-8"])
        locale_ok = False
        for candidate in utf8_locales:
            try:
                locale.setlocale(locale.LC_ALL, candidate)
                locale_ok = True
                break
            except locale.Error:
                continue

        enc = locale.getpreferredencoding()
        logger.info("System encoding: %s | locale: %s", enc, (locale_ok and candidate) or "default")

    except Exception as e:
        logger.exception("Encoding validation failed: %s", e)
        raise


# Call at startup
_validate_encoding()


# SEC-007: redact path-like substrings from messages echoed to the renderer.
# Full detail (class name + message + traceback) still goes to stderr via logger.
_PATH_LEAK_RE = re.compile(
    r"'[^'\n]*[\\/][^'\n]*'"                 # '...path...'
    r'|"[^"\n]*[\\/][^"\n]*"'                # "...path..."
    r"|[A-Za-z]:[\\/][^\s'\"\)]*"            # C:\... / C:/...
    r"|\\\\[^\s'\"\)]*"                      # \\server\share...
    r"|/(?:[A-Za-z0-9._-]+/)+[A-Za-z0-9._-]*"  # /a/b/c
    r"|\.\.[\\/]"                            # ../  ..\
)


def _redact_paths(text: str) -> str:
    return _PATH_LEAK_RE.sub("[ruta]", text)


def _dispatch(handler, params, msg_id, method_name) -> None:
    """Run a handler in a worker thread and send its response back."""
    try:
        result = handler(params)
        send_response(result, msg_id)
    except Exception as exc:
        # SEC-007: full exception (class name + message + traceback) is logged
        # to stderr only. The renderer gets the user-facing message text with
        # path-like substrings redacted — no class name, no internal paths.
        logger.exception("Error en %s: %s\n%s", method_name, exc, traceback.format_exc())
        msg_text = str(exc).strip()
        if not msg_text:
            msg_text = "Error interno del backend."
        send_response(None, msg_id, error=_redact_paths(msg_text))


def _log_future_exception(future: Future) -> None:
    """Log unexpected executor failures that escape _dispatch."""
    try:
        future.result()
    except Exception as handler_exc:
        logger.exception("Handler raised: %s", handler_exc)


def _submit_handler(handler, params, msg_id, method_name) -> Future | None:
    """Submit one handler onto the appropriate scheduler lane."""
    scheduler = get_scheduler()
    try:
        if method_name in HEAVY_METHODS:
            future = scheduler.submit_heavy(_dispatch, handler, params, msg_id, method_name)
        else:
            future = scheduler.submit_light(_dispatch, handler, params, msg_id, method_name)
    except SchedulerBusy:
        logger.warning("Heavy scheduler saturated while accepting %s: %s", method_name, scheduler.metrics())
        send_response(None, msg_id, error="Backend ocupado: cola de trabajo pesada llena")
        return None
    if future is not None:
        future.add_done_callback(_log_future_exception)
    return future


def main() -> None:
    """Bucle principal IPC — diseñado para nunca morir.

    Requests are dispatched to a ThreadPoolExecutor so that slow handlers
    (PDF generation, Excel import, etc.) do NOT block the main loop from
    reading subsequent messages on stdin.
    """
    # Handshake: report ready IMMEDIATELY so the spawner doesn't timeout
    # on heavy initialization work.
    send_notification("ready", {"status": "ok"})

    logger.info(t("info.backend_ready"))

    # Initialize heavy resources AFTER handshake to prevent spawner kill loops.
    try:
        init_db()
    except Exception as exc:
        logger.exception("init_db failed during startup: %s", exc)
    try:
        load_plugins_from_dir()
    except Exception as exc:
        logger.exception("load_plugins_from_dir failed during startup: %s", exc)

    # Note: ubicaciones map previews now use a lightweight static-map HTTP fetch
    # (OSM tiles / Google Static Maps) instead of a persistent Playwright browser,
    # so there is no browser to pre-warm at startup.

    scheduler = get_scheduler()

    # Track consecutive errors to avoid spamming logs on persistent issues
    budget = ErrorBudget()

    try:
        while True:
            if _shutdown_requested:
                logger.info("Shutdown signal received, exiting...")
                from contextlib import suppress
                with suppress(Exception):
                    send_notification("backend.shutdown", {"reason": "signal"})
                break

            try:
                msg = read_message()
                if msg is None:
                    # EOF — pipe closed. Exit immediately to prevent zombie processes.
                    logger.error("EOF on stdin — pipe closed. Exiting immediately.")
                    break
                if msg is _SKIP:
                    budget.record_skip()
                    continue  # Parse error, already responded

                if msg.method in HANDLERS:
                    _submit_handler(HANDLERS[msg.method], msg.params, msg.id, msg.method)
                else:
                    send_response(None, msg.id, error=f"Método desconocido: {msg.method}")
                budget.record_success()
            except Exception as exc:
                # Global handler: any unexpected exception in the loop should NOT kill the process
                logger.exception("Unexpected error in main loop (consecutive=%d): %s", budget.consecutive, exc)
                if budget.record_error():
                    logger.error("Too many consecutive errors, exiting.")
                    break
                budget.sleep_recovery()
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received")
    finally:
        scheduler.shutdown(wait=True)
        close_connection()
        logger.info(t("info.backend_shutdown"))


if __name__ == "__main__":
    main()
