"""Parse y extracción de filas del Excel de ubicaciones.

Solo depende de pandas. Sin estado global.
"""
from __future__ import annotations

import pandas as pd


def _parse_excel_columns(df):
    """Detecta las columnas del Excel normalizando nombres."""
    df.columns = [str(c).strip().lower() for c in df.columns]

    col_cod = next((c for c in df.columns if 'cod' in c or 'componente' in c), None)
    col_dir = next((c for c in df.columns if 'direcci' in c), None)
    col_loc = next((c for c in df.columns if 'localidad' in c or 'urb' in c), None)
    col_dist = next((c for c in df.columns if 'distrito' in c), None)
    col_lat = next((c for c in df.columns if 'lat' in c), None)
    col_lon = next((c for c in df.columns if 'lon' in c), None)

    if not col_lat or not col_lon:
        col_coord = next((c for c in df.columns if 'coord' in c or 'link' in c), None)
        if col_coord:
            def parse_lat(val):
                try:
                    return float(str(val).split(',')[0].strip())
                except Exception:
                    return 0.0
            def parse_lon(val):
                try:
                    return float(str(val).split(',')[1].strip())
                except Exception:
                    return 0.0
            df['lat_tmp'] = df[col_coord].apply(parse_lat)
            df['lon_tmp'] = df[col_coord].apply(parse_lon)
            col_lat = 'lat_tmp'
            col_lon = 'lon_tmp'
        else:
            return None, None, None, None, None, None

    return col_cod, col_dir, col_loc, col_dist, col_lat, col_lon


def _extract_row_data(row, index, col_cod, col_dir, col_loc, col_dist, col_lat, col_lon):
    """Extrae los datos de una fila del DataFrame."""
    return {
        'cod_componente': row[col_cod] if col_cod and pd.notna(row[col_cod]) else f"ID-{index+1}",
        'direccion': row[col_dir] if col_dir and pd.notna(row[col_dir]) else "",
        'localidad': row[col_loc] if col_loc and pd.notna(row[col_loc]) else "",
        'distrito': row[col_dist] if col_dist and pd.notna(row[col_dist]) else "",
        'lat': row[col_lat],
        'lon': row[col_lon]
    }
