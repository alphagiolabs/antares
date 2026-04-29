"""Entrypoint: backend IPC Python para Electron.

Lee mensajes JSON-RPC desde stdin, enruta a handlers, escribe respuestas a stdout.
Incluye un mecanismo de handshake para reportar "ready" al proceso padre (Electron).
"""

from __future__ import annotations

import json
import logging
import signal
import sys
import traceback
import warnings
from pathlib import Path

from backend.core.database import init_db
from backend.core.plugins import load_plugins_from_dir
from backend.handlers import HANDLERS
from backend.ipc_protocol import read_message, send_response, send_notification
from backend.utils.i18n import t

# Ensure backend is on path
_backend = Path(__file__).resolve().parent
if str(_backend) not in sys.path:
    sys.path.insert(0, str(_backend))

# Silence tkinter deprecation warning on macOS
warnings.filterwarnings("ignore", category=DeprecationWarning)

# Init DB before handling requests
init_db()
load_plugins_from_dir()


def _signal_handler(signum, frame):
    """Handle termination signals gracefully."""
    logger.info(f"Received signal {signum}, shutting down...")
    # Send a final message to Electron
    send_notification("backend.shutdown", {"reason": "signal", "signal": signum})
    sys.exit(0)


# Register signal handlers
if hasattr(signal, 'SIGTERM'):
    signal.signal(signal.SIGTERM, _signal_handler)
if hasattr(signal, 'SIGINT'):
    signal.signal(signal.SIGINT, _signal_handler)

# Windows doesn't have SIGHUP
if hasattr(signal, 'SIGHUP'):
    signal.signal(signal.SIGHUP, _signal_handler)


# Logging to stderr so stdout stays clean for IPC
logging.basicConfig(
    level=logging.INFO,
    format="[%(levelname)s] %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(__name__)


def main() -> None:
    """Bucle principal IPC."""
    # Handshake: report ready so Electron knows the pipe is open
    print(json.dumps({"jsonrpc": "2.0", "method": "ready", "params": {}}))
    sys.stdout.flush()

    logger.info(t("info.backend_ready"))

    try:
        while True:
            msg = read_message()
            if msg is None:
                break

            if msg.method in HANDLERS:
                try:
                    result = HANDLERS[msg.method](msg.params)
                    send_response(result, msg.id)
                except Exception as exc:
                    error_msg = f"{type(exc).__name__}: {exc}"
                    logger.error("Error en %s: %s\n%s", msg.method, error_msg, traceback.format_exc())
                    send_response(None, msg.id, error=error_msg)
            else:
                send_response(None, msg.id, error=f"Método desconocido: {msg.method}")
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received")
    finally:
        logger.info(t("info.backend_shutdown"))


if __name__ == "__main__":
    main()
