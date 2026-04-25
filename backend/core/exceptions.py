"""Excepciones personalizadas del dominio de HidroConvert."""


class HidroConvertError(Exception):
    """Base para todas las excepciones de la aplicación."""


class ConfigError(HidroConvertError):
    """Error al leer o escribir configuración persistente."""


class DatabaseError(HidroConvertError):
    """Error relacionado con operaciones de base de datos."""


class ConversionError(HidroConvertError):
    """Error durante la conversión de una imagen."""


class ValidationError(HidroConvertError):
    """Error de validación de entrada del usuario o datos."""
