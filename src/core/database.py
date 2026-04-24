"""Módulo de base de datos: SQLite embebido con importación/exportación de Excel."""

import sqlite3
import os
from pathlib import Path


def get_db_path():
    """Retorna la ruta de la base de datos SQLite local."""
    return Path(__file__).resolve().parent.parent.parent / "data" / "catalogo.db"


def init_db():
    """Inicializa la base de datos SQLite con la tabla principal."""
    db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS imagenes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo TEXT UNIQUE NOT NULL,
            nombre TEXT,
            categoria TEXT,
            marca TEXT,
            modelo TEXT,
            descripcion TEXT
        )
    """)
    conn.commit()
    conn.close()


def importar_excel(excel_path):
    """Importa datos desde Excel (.xlsx) a SQLite."""
    try:
        import pandas as pd
    except ImportError as exc:
        raise ImportError("pandas no está instalado. Ejecuta: pip install pandas openpyxl") from exc

    df = pd.read_excel(excel_path, dtype=str)
    df.columns = [c.strip().lower() for c in df.columns]

    # Normalizar nombres de columnas comunes
    columnas_requeridas = {"codigo"}
    if not columnas_requeridas.issubset(set(df.columns)):
        raise ValueError(f"El Excel debe contener al menos la columna 'codigo'. Columnas encontradas: {list(df.columns)}")

    conn = sqlite3.connect(str(get_db_path()))
    cursor = conn.cursor()

    # Limpiar tabla anterior para reemplazar
    cursor.execute("DELETE FROM imagenes")
    conn.commit()

    for _, row in df.iterrows():
        cursor.execute("""
            INSERT INTO imagenes (codigo, nombre, categoria, marca, modelo, descripcion)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            str(row.get("codigo", "")).strip(),
            str(row.get("nombre", "")).strip() if pd.notna(row.get("nombre")) else None,
            str(row.get("categoria", "")).strip() if pd.notna(row.get("categoria")) else None,
            str(row.get("marca", "")).strip() if pd.notna(row.get("marca")) else None,
            str(row.get("modelo", "")).strip() if pd.notna(row.get("modelo")) else None,
            str(row.get("descripcion", "")).strip() if pd.notna(row.get("descripcion")) else None,
        ))

    conn.commit()
    conn.close()
    return len(df)


def exportar_excel(excel_path):
    """Exporta los datos actuales de SQLite a un archivo Excel."""
    try:
        import pandas as pd
    except ImportError as exc:
        raise ImportError("pandas no está instalado.") from exc

    conn = sqlite3.connect(str(get_db_path()))
    df = pd.read_sql_query("SELECT * FROM imagenes", conn)
    conn.close()

    df.to_excel(excel_path, index=False)
    return len(df)


def buscar_por_codigo(codigo):
    """Busca un registro por su código. Retorna un diccionario o None."""
    conn = sqlite3.connect(str(get_db_path()))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM imagenes WHERE codigo = ?", (codigo.strip(),))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def obtener_todos():
    """Retorna todos los registros como lista de diccionarios."""
    conn = sqlite3.connect(str(get_db_path()))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM imagenes")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def generar_plantilla_excel(ruta_salida):
    """Genera un archivo Excel de plantilla con las columnas esperadas."""
    try:
        import pandas as pd
    except ImportError as exc:
        raise ImportError("pandas no está instalado.") from exc

    df = pd.DataFrame(columns=["codigo", "nombre", "categoria", "marca", "modelo", "descripcion"])
    df.loc[0] = ["IMG-001", "Producto Ejemplo", "Categoria A", "Marca X", "Modelo 2024", "Descripción de prueba"]
    df.to_excel(ruta_salida, index=False)
