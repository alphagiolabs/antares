"""Entrypoint: backend IPC Python para Electron.

Lee mensajes JSON-RPC desde stdin, enruta a handlers, escribe respuestas a stdout.
Incluye un mecanismo de handshake para reportar "ready" al proceso padre (Electron).
"""

from __future__ import annotations

import json
import logging
import sys
import traceback
from pathlib import Path
from typing import Any

# Ensure backend is on path
_backend = Path(__file__).resolve().parent
if str(_backend) not in sys.path:
    sys.path.insert(0, str(_backend))

# Silence tkinter deprecation warning on macOS
import warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)

# Init DB before handling requests
from backend.core.database import init_db
init_db()

# Load format plugins from user data directory
from backend.core.plugins import load_plugins_from_dir
load_plugins_from_dir()

from ipc_protocol import IPCMessage, read_message, send_response
from handlers import HANDLERS

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

    logger.info("Backend IPC iniciado. Esperando mensajes en stdin...")

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

    logger.info("Backend IPC finalizado.")


if __name__ == "__main__":
    main()
