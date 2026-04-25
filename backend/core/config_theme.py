"""Configuración personalizable de colores/temas de la aplicación."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from backend.utils.paths import user_data_path

logger = logging.getLogger(__name__)

DEFAULT_THEME: dict[str, str] = {
    "name": "Mastercard Cream",
    "bg": "#F3F0EE",
    "bg_secondary": "#FCFBFA",
    "fg": "#141413",
    "fg_muted": "#696969",
    "fg_secondary": "#555555",
    "fg_tertiary": "#565656",
    "accent": "#CF4500",
    "accent_light": "#F37338",
    "accent_hover": "#9A3A0A",
    "accent_dark": "#9A3A0A",
    "border": "#D1CDC7",
    "blue_hover": "#3860BE",
    "error": "#EB001B",
    "warning": "#F79E1B",
    "success": "#76b900",
    "orange": "#F37338",
}

PRESETS: dict[str, dict[str, str]] = {
    "Mastercard Cream": dict(DEFAULT_THEME),
    "NVIDIA Dark": {
        "name": "NVIDIA Dark",
        "bg": "#000000",
        "bg_secondary": "#1a1a1a",
        "fg": "#ffffff",
        "fg_muted": "#a7a7a7",
        "fg_secondary": "#898989",
        "fg_tertiary": "#757575",
        "accent": "#76b900",
        "accent_light": "#bff230",
        "accent_hover": "#1eaedb",
        "accent_dark": "#5a8f00",
        "border": "#5e5e5e",
        "blue_hover": "#3860be",
        "error": "#e52020",
        "warning": "#ef9100",
        "success": "#76b900",
        "orange": "#df6500",
    },
    "Professional Light": {
        "name": "Professional Light",
        "bg": "#f5f5f5",
        "bg_secondary": "#ffffff",
        "fg": "#1a1a1a",
        "fg_muted": "#555555",
        "fg_secondary": "#777777",
        "fg_tertiary": "#999999",
        "accent": "#76b900",
        "accent_light": "#9bdb00",
        "accent_hover": "#1eaedb",
        "accent_dark": "#5a8f00",
        "border": "#cccccc",
        "blue_hover": "#3860be",
        "error": "#d32f2f",
        "warning": "#f57c00",
        "success": "#388e3c",
        "orange": "#e65100",
    },
    "Midnight Blue": {
        "name": "Midnight Blue",
        "bg": "#0a0e1a",
        "bg_secondary": "#121a2b",
        "fg": "#e0e6f1",
        "fg_muted": "#8a9bb8",
        "fg_secondary": "#6b7fa3",
        "fg_tertiary": "#4a5e80",
        "accent": "#00d4ff",
        "accent_light": "#80e8ff",
        "accent_hover": "#ff6b35",
        "accent_dark": "#0099cc",
        "border": "#1e2d47",
        "blue_hover": "#ff8c5a",
        "error": "#ff4d4d",
        "warning": "#ffa726",
        "success": "#66bb6a",
        "orange": "#ff7043",
    },
    "Carbon Gray": {
        "name": "Carbon Gray",
        "bg": "#181818",
        "bg_secondary": "#242424",
        "fg": "#eeeeee",
        "fg_muted": "#aaaaaa",
        "fg_secondary": "#888888",
        "fg_tertiary": "#666666",
        "accent": "#ff9500",
        "accent_light": "#ffb74d",
        "accent_hover": "#00bcd4",
        "accent_dark": "#e65100",
        "border": "#3a3a3a",
        "blue_hover": "#29b6f6",
        "error": "#ef5350",
        "warning": "#ffa726",
        "success": "#66bb6a",
        "orange": "#ff7043",
    },
    "High Contrast": {
        "name": "High Contrast",
        "bg": "#000000",
        "bg_secondary": "#111111",
        "fg": "#ffffff",
        "fg_muted": "#ffffff",
        "fg_secondary": "#cccccc",
        "fg_tertiary": "#999999",
        "accent": "#ffff00",
        "accent_light": "#ffff66",
        "accent_hover": "#00ffff",
        "accent_dark": "#cccc00",
        "border": "#ffffff",
        "blue_hover": "#00ffff",
        "error": "#ff0000",
        "warning": "#ffaa00",
        "success": "#00ff00",
        "orange": "#ff8800",
    },
}

_CONFIG_PATH: Path | None = None


def _config_file() -> Path:
    global _CONFIG_PATH
    if _CONFIG_PATH is None:
        _CONFIG_PATH = user_data_path("theme_config.json")
    return _CONFIG_PATH


def load_theme() -> dict[str, str]:
    """Carga el tema desde disco o retorna el default."""
    path = _config_file()
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict) and "bg" in data:
                theme = dict(DEFAULT_THEME)
                theme.update(data)
                return theme
        except (json.JSONDecodeError, OSError, TypeError) as exc:
            logger.warning("Error leyendo configuración de tema, usando default: %s", exc)
    return dict(DEFAULT_THEME)


def save_theme(theme: dict[str, Any]) -> dict[str, str]:
    """Guarda el tema en disco."""
    path = _config_file()
    validated: dict[str, str] = {}
    for k, v in theme.items():
        if isinstance(v, str) and v.startswith("#"):
            validated[k] = v
        else:
            validated[k] = str(v)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(validated, f, indent=2, ensure_ascii=False)
    return validated


def reset_theme() -> dict[str, str]:
    """Restaura el tema por defecto."""
    save_theme(DEFAULT_THEME)
    return dict(DEFAULT_THEME)


def get_preset_names() -> list[str]:
    """Retorna la lista de nombres de presets disponibles."""
    return list(PRESETS.keys())


def load_preset(name: str) -> dict[str, str]:
    """Retorna una copia del preset solicitado o el default si no existe."""
    preset = PRESETS.get(name)
    if preset:
        return dict(preset)
    return dict(DEFAULT_THEME)
