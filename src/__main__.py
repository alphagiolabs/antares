"""Punto de entrada principal para HidroConvert."""

import sys
from pathlib import Path

# Agregar src al path para imports absolutos
sys.path.insert(0, str(Path(__file__).resolve().parent))

from gui.app import main

if __name__ == "__main__":
    main()
