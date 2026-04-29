"""Módulo de base de datos: SQLite embebido con importación/exportación de Excel."""

from __future__ import annotations

import logging
import re
import sqlite3
import unicodedata
from pathlib import Path
from typing import Any

from backend.utils.paths import user_data_path
from backend.core.config_fields import load_fields, get_field_names, save_fields
from backend.core.exceptions import DatabaseError

logger = logging.getLogger(__name__)


def _normalize_excel_column_name(name: Any, fallback: str) -> str:
    """Convierte encabezados de Excel en nombres de columna SQLite seguros."""
    text = unicodedata.normalize("NFKD", str(name or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-zA-Z0-9_]+", "_", text.strip().lower())
    text = re.sub(r"_+", "_", text).strip("_")
    if not text or not re.match(r"^[a-z_]", text):
        text = fallback
    return text


def _normalize_excel_columns(columns: list[Any]) -> list[str]:
    """Normaliza encabezados preservando unicidad."""
    normalized: list[str] = []
    seen: dict[str, int] = {}
    for idx, column in enumerate(columns, 1):
        base = _normalize_excel_column_name(column, f"columna_{idx}")
        count = seen.get(base, 0)
        seen[base] = count + 1
        normalized.append(base if count == 0 else f"{base}_{count + 1}")
    return normalized


def get_db_path() -> Path:
    """Retorna la ruta de la base de datos SQLite local (writable)."""
    return user_data_path("catalogo.db")


def _build_schema(fields: list[dict[str, Any]]) -> str:
    """Construye la sentencia CREATE TABLE a partir de la configuración de campos."""
    columns = ["id INTEGER PRIMARY KEY AUTOINCREMENT"]
    for f in fields:
        name: str = f["name"]
        ftype: str = f["type"]
        constraints: list[str] = []
        if f.get("required"):
            constraints.append("NOT NULL")
        if f.get("unique"):
            constraints.append("UNIQUE")
        col = f"{name} {ftype}"
        if constraints:
            col += " " + " ".join(constraints)
        columns.append(col)
    return f"CREATE TABLE IF NOT EXISTS imagenes ({', '.join(columns)})"


def _table_matches_config(cursor: sqlite3.Cursor, fields: list[dict[str, Any]]) -> bool:
    """Verifica si la tabla actual coincide con la configuración de campos."""
    cursor.execute("PRAGMA table_info(imagenes)")
    existing = {row[1]: row[2].upper() for row in cursor.fetchall()}
    expected = {f["name"]: f["type"] for f in fields}
    # id siempre existe, lo ignoramos en la comparación
    expected["id"] = "INTEGER"
    return existing == expected


def _create_indexes(cursor: sqlite3.Cursor, fields: list[dict[str, Any]]) -> None:
    """Create indexes on commonly queried fields."""
    if not fields:
        return
    
    # Index on first field (usually code/codigo)
    first_field = fields[0]["name"]
    cursor.execute(f"CREATE INDEX IF NOT EXISTS idx_imagenes_{first_field} ON imagenes({first_field})")
    
    # Index on any unique fields
    for f in fields:
        if f.get("unique") and f["name"] != first_field:
            cursor.execute(f"CREATE UNIQUE INDEX IF NOT EXISTS idx_imagenes_{f['name']} ON imagenes({f['name']})")


def init_db() -> None:
    """Inicializa la base de datos SQLite con la tabla principal según campos configurados."""
    fields = load_fields()
    db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(str(db_path)) as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='imagenes'")
        table_exists = cursor.fetchone() is not None

        if not table_exists:
            cursor.execute(_build_schema(fields))
        elif not _table_matches_config(cursor, fields):
            try:
                cursor.execute("SELECT * FROM imagenes")
                old_rows = cursor.fetchall()
                old_cols = [d[0] for d in cursor.description]
            except sqlite3.Error as exc:
                logger.warning("No se pudieron leer datos antiguos durante migración: %s", exc)
                old_rows = []
                old_cols = []
            cursor.execute("DROP TABLE imagenes")
            cursor.execute(_build_schema(fields))
            if old_rows:
                # Build INSERT with all columns, providing defaults for new ones
                new_cols = [f["name"] for f in fields]
                placeholders = ", ".join(["?"] * len(new_cols))
                col_names = ", ".join(new_cols)
                defaults = {"INTEGER": 0, "REAL": 0.0, "TEXT": "", "BLOB": b""}
                for row in old_rows:
                    row_dict = dict(zip(old_cols, row))
                    values = []
                    for f in fields:
                        col = f["name"]
                        if col in row_dict and row_dict[col] is not None:
                            values.append(row_dict[col])
                        elif f.get("required"):
                            values.append(defaults.get(f["type"], ""))
                        else:
                            values.append(None)
                    cursor.execute(f"INSERT INTO imagenes ({col_names}) VALUES ({placeholders})", values)

        # Always ensure indexes exist (CREATE INDEX IF NOT EXISTS is idempotent)
        _create_indexes(cursor, fields)

        conn.commit()


def importar_excel(excel_path: str) -> int:
    """Importa datos desde Excel (.xlsx) a SQLite.

    Args:
        excel_path: Ruta al archivo Excel.

    Returns:
        Cantidad de registros importados.

    Raises:
        ImportError: Si pandas no está instalado.
        ValueError: Si faltan columnas requeridas.
        DatabaseError: Si ocurre un error de base de datos.
    """
    try:
        import pandas as pd  # type: ignore
    except ImportError as exc:
        raise ImportError("pandas no está instalado. Ejecuta: pip install pandas openpyxl") from exc

    if not Path(excel_path).exists():
        raise FileNotFoundError(f"No se encontró el archivo: {excel_path}")

    df = pd.read_excel(excel_path, dtype=str)
    df.columns = _normalize_excel_columns(list(df.columns))

    fields = load_fields()
    field_names = [f["name"] for f in fields]
    new_columns = [c for c in df.columns if c not in field_names]
    if new_columns:
        fields = [
            *fields,
            *[
                {"name": column, "type": "TEXT", "required": False, "unique": False}
                for column in new_columns
            ],
        ]
        save_fields(fields)
        field_names = [f["name"] for f in fields]

    # Asegurar que el esquema de BD coincida con los campos, incluyendo columnas del Excel.
    init_db()
    required = [f["name"] for f in fields if f.get("required")]

    # Verificar campos requeridos
    missing = [r for r in required if r not in df.columns]
    if missing:
        raise ValueError(
            f"El Excel debe contener al menos las columnas requeridas: {missing}. "
            f"Columnas encontradas: {list(df.columns)}"
        )

    conn = sqlite3.connect(str(get_db_path()))
    cursor = conn.cursor()

    try:
        # Limpiar tabla anterior para reemplazar
        cursor.execute("DELETE FROM imagenes")

        placeholders = ", ".join(["?"] * len(field_names))
        col_names = ", ".join(field_names)
        sql = f"INSERT INTO imagenes ({col_names}) VALUES ({placeholders})"

        inserted = 0
        for _, row in df.iterrows():
            values: list[Any] = []
            valid = True
            for fn in field_names:
                val = row.get(fn)
                if pd.notna(val) and str(val).strip():
                    values.append(str(val).strip())
                elif fn in required:
                    # Campo requerido vacío → saltar fila
                    valid = False
                    break
                else:
                    values.append(None)
            if valid:
                cursor.execute(sql, values)
                inserted += 1

        conn.commit()
        return inserted
    except sqlite3.Error as exc:
        conn.rollback()
        raise DatabaseError(f"Error importando datos: {exc}") from exc
    finally:
        conn.close()


def exportar_excel(excel_path: str) -> int:
    """Exporta los datos actuales de SQLite a un archivo Excel.

    Args:
        excel_path: Ruta de salida del archivo Excel.

    Returns:
        Cantidad de registros exportados.
    """
    try:
        import pandas as pd  # type: ignore
    except ImportError as exc:
        raise ImportError("pandas no está instalado.") from exc

    conn = sqlite3.connect(str(get_db_path()))
    try:
        field_names = get_field_names()
        cols = ", ".join(field_names)
        df = pd.read_sql_query(f"SELECT {cols} FROM imagenes", conn)
    finally:
        conn.close()

    df.to_excel(excel_path, index=False)
    return int(len(df))


def buscar_por_codigo(codigo: str) -> dict[str, Any] | None:
    """Busca un registro por código o por cualquier campo de texto exacto.

    Args:
        codigo: Código a buscar.

    Returns:
        Diccionario con los datos del registro, o None si no existe.
    """
    with sqlite3.connect(str(get_db_path())) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        field_names = get_field_names()
        if not field_names:
            return None
        search_value = str(codigo).strip()
        code_field = field_names[0]
        cursor.execute(f"SELECT * FROM imagenes WHERE {code_field} = ?", (search_value,))
        row = cursor.fetchone()
        if row:
            return dict(row)

        for field_name in field_names[1:]:
            cursor.execute(f"SELECT * FROM imagenes WHERE {field_name} = ?", (search_value,))
            row = cursor.fetchone()
            if row:
                return dict(row)
    return None


def buscar_por_indice(indice: int) -> dict[str, Any] | None:
    """Busca un registro por su posición (1-based) en la tabla.

    Args:
        indice: Posición del registro (1 = primer registro).

    Returns:
        Diccionario con los datos del registro, o None si no existe.
    """
    if indice < 1:
        return None
    with sqlite3.connect(str(get_db_path())) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        field_names = get_field_names()
        cols = ", ".join(field_names)
        cursor.execute(f"SELECT {cols} FROM imagenes LIMIT 1 OFFSET ?", (indice - 1,))
        row = cursor.fetchone()
    return dict(row) if row else None


def obtener_todos() -> list[dict[str, Any]]:
    """Retorna todos los registros como lista de diccionarios."""
    with sqlite3.connect(str(get_db_path())) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        field_names = get_field_names()
        cols = ", ".join(field_names)
        cursor.execute(f"SELECT {cols} FROM imagenes")
        rows = cursor.fetchall()
    return [dict(r) for r in rows]


def limpiar_base_datos() -> int:
    """Elimina todos los registros de la tabla imagenes.

    Returns:
        Cantidad de registros eliminados.
    """
    db_path = get_db_path()
    if not db_path.exists():
        return 0
    with sqlite3.connect(str(db_path)) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM imagenes")
        count = cursor.fetchone()[0]
        cursor.execute("DELETE FROM imagenes")
        conn.commit()
    return count


def generar_plantilla_excel(ruta_salida: str) -> int:
    """Genera un archivo Excel de plantilla con las columnas esperadas.

    Args:
        ruta_salida: Ruta donde guardar la plantilla.
    """
    try:
        import pandas as pd  # type: ignore
    except ImportError as exc:
        raise ImportError("pandas no está instalado.") from exc

    fields = load_fields()
    columns = [f["name"] for f in fields]
    df = pd.DataFrame(columns=columns)
    sample: list[str] = []
    for f in fields:
        fname: str = f["name"]
        if fname == "codigo":
            sample.append("IMG-001")
        elif fname == "nombre":
            sample.append("Producto Ejemplo")
        elif fname == "categoria":
            sample.append("Categoria A")
        elif fname == "marca":
            sample.append("Marca X")
        elif fname == "modelo":
            sample.append("Modelo 2024")
        elif fname == "descripcion":
            sample.append("Descripción de prueba")
        else:
            sample.append(f"Ejemplo {fname}")
    df.loc[0] = sample
    df.to_excel(ruta_salida, index=False)
    return len(df)
