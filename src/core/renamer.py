"""Motor de renombrado automático basado en reglas y base de datos."""

import re
from pathlib import Path
from core.database import buscar_por_codigo
from utils.validators import sanitizar_nombre, obtener_codigo_desde_nombre


class RenamerEngine:
    """Permite construir nombres de archivo dinámicos usando patrones y datos de BD."""

    # Campos disponibles para patrones
    CAMPOS_DISPONIBLES = {
        "{codigo}", "{nombre}", "{categoria}", "{marca}", "{modelo}", "{descripcion}",
        "{seq}", "{ext}"
    }

    def __init__(self, patron="{codigo}_{nombre}{ext}", secuencia_inicial=1):
        """
        Args:
            patron: cadena con placeholders, ej: "{categoria}_{codigo}_{nombre}{ext}"
            secuencia_inicial: número inicial para {seq}
        """
        self.patron = patron
        self.secuencia = int(secuencia_inicial)

    def aplicar(self, ruta_origen, datos_bd=None, codigo_manual=None):
        """
        Genera el nuevo nombre para un archivo.

        Args:
            ruta_origen: Path o str de la imagen origen.
            datos_bd: dict opcional con datos ya consultados de la BD.
            codigo_manual: str opcional para forzar el código a buscar.

        Returns:
            str con el nuevo nombre de archivo (solo nombre, no ruta completa).
        """
        ruta = Path(ruta_origen)
        ext = ruta.suffix.lower()

        # Determinar código
        codigo = codigo_manual if codigo_manual else obtener_codigo_desde_nombre(ruta.name)

        # Buscar en BD si no se proporcionaron datos
        if datos_bd is None:
            datos_bd = buscar_por_codigo(codigo) or {}

        # Construir mapping
        mapping = {
            "codigo": datos_bd.get("codigo", codigo),
            "nombre": datos_bd.get("nombre", ruta.stem),
            "categoria": datos_bd.get("categoria", ""),
            "marca": datos_bd.get("marca", ""),
            "modelo": datos_bd.get("modelo", ""),
            "descripcion": datos_bd.get("descripcion", ""),
            "seq": str(self.secuencia).zfill(3),
            "ext": ext,
        }

        # Reemplazar placeholders
        nombre_salida = self.patron
        for key, val in mapping.items():
            nombre_salida = nombre_salida.replace(f"{{{key}}}", str(val) if val is not None else "")

        # Limpiar dobles guiones bajos o espacios y sanitizar
        nombre_salida = re.sub(r"_+", "_", nombre_salida)
        nombre_salida = re.sub(r"\s+", " ", nombre_salida)
        nombre_salida = sanitizar_nombre(nombre_salida)

        # Asegurar extensión
        if not nombre_salida.lower().endswith(ext.lower()):
            nombre_salida += ext

        self.secuencia += 1
        return nombre_salida

    def preview_lote(self, rutas, codigos_manuales=None):
        """
        Genera una vista previa del renombrado para un lote.

        Returns:
            Lista de tuplas (ruta_origen, nombre_sugerido, datos_encontrados).
        """
        codigos_manuales = codigos_manuales or {}
        resultados = []
        seq_backup = self.secuencia

        for ruta in rutas:
            ruta = Path(ruta)
            codigo = codigos_manuales.get(ruta.name, obtener_codigo_desde_nombre(ruta.name))
            datos = buscar_por_codigo(codigo)
            nombre_nuevo = self.aplicar(ruta, datos_bd=datos, codigo_manual=codigo)
            resultados.append((str(ruta), nombre_nuevo, datos is not None))

        self.secuencia = seq_backup
        return resultados
