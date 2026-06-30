"""Centralized configuration constants for ANTARES backend.

This file contains shared constants used across the Python backend.
When modifying these values, ensure consistency with the frontend config
at shared/config.ts and shared/config.js.

IMPORTANT: These values should match the centralized config to prevent
inconsistencies between frontend and backend.
"""

# Image Processing
MAX_IMAGE_PIXELS = 50_000_000  # 50MP limit to prevent decompression bombs
PREVIEW_MAX_SIZE = 400  # Max preview dimension (longest side)

# Database
SQLITE_PARAM_LIMIT = 900  # Safe margin for SQLite parameter limit
