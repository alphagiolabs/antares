"""Punto de entrada para PyInstaller (ejecutable standalone)."""

import sys
from pathlib import Path

# Asegurar que 'src' esté en el path para imports absolutos
_src = Path(__file__).resolve().parent / "src"
if str(_src) not in sys.path:
    sys.path.insert(0, str(_src))

from gui.app import main

if __name__ == "__main__":
    main()
