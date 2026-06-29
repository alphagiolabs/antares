# SEC-008 — DoS: sin límites de tamaño/complejidad en stdin, base64/imagen, regex, history

- **Severidad:** P2 (Media)
- **Categoría:** Denial of Service (CWE-400 / CWE-1333)
- **Archivos afectados:**
  - `backend/ipc_protocol.py:163-166` (`readline()` sin límite)
  - `backend/handlers/optimizer.py:129-161` + `backend/core/converter.py:231` (base64 sin tope, sin `Image.MAX_IMAGE_PIXELS`)
  - `backend/core/panel_aviso_corte/matcher.py:191` (regex de usuario, ReDoS)
  - `backend/handlers/history.py:33-35` → `backend/core/history.py:188-215` (`limit` sin techo)

## Vulnerabilidad

Cuatro vectores de DoS en el backend (prerrequisito: renderer comprometido o pipe roto):

1. **stdin sin límite de línea:** `read_message` hace `sys.stdin.readline()` sin tamaño máximo. Un JSON de cientos de MB/GB agota RAM en `readline()` + `json.loads()`. Hay `_MAX_PAYLOAD_SIZE` para las **respuestas** (64MB) pero no para los **requests** entrantes.

2. **Bomba de descompresión base64/imagen:** `optimizer.py` itera `files` con `content_b64` decodificado a bytes sin tope de archivos ni de bytes totales; `converter.py:231` abre imágenes con Pillow sin setear `Image.MAX_IMAGE_PIXELS` (Pillow tiene un default `DecompressionBombWarning` a ~89M px pero no `Error`; un PNG de dimensiones explosivas o un xlsx con miles de filas puede consumir CPU/RAM enormes).

3. **ReDoS:** `panel_aviso_corte/matcher.py:191` compila regex **de usuario** (`rule.regex_pattern`) y la ejecuta sobre stems sin límite de longitud del patrón ni del input. Un patrón `(a+)+$` sobre un stem largo cuelga el worker thread.

4. **History sin techo:** `history_list` acepta `limit` del cliente sin máximo; `history_export` default 10000 pero configurable. Construye JSON con `files_json`/`options_json` que puede superar `_MAX_PAYLOAD_SIZE` (se dropea, pero el backend ya gastó memoria construyéndolo).

## Impacto

Un renderer comprometido puede colgar al backend (OOM o CPU pegado en un worker), degradando o tumbando la app para el usuario. El backend tiene un scheduler con lane heavy y `SchedulerBusy` protege saturación de cola, pero no protege un solo mensaje gigante o una regex catastrófica. P2 (DoS local, requiere renderer comprometido).

## Fix propuesto (aditivo, conserva la funcionalidad)

1. **stdin cap** — `backend/ipc_protocol.py`:
   ```python
   _MAX_STDIN_LINE = int(os.environ.get("ANTARES_IPC_MAX_STDIN_LINE", str(8 * 1024 * 1024)))

   def read_message() -> IPCMessage | None:
       try:
           line = sys.stdin.readline(_MAX_STDIN_LINE + 1)   # ← límite
           if not line:
               return None
           if len(line) > _MAX_STDIN_LINE:
               logger.error("IPC stdin line too large (>%d bytes), descartada", _MAX_STDIN_LINE)
               return _SKIP
           data = json.loads(line)
           ...
   ```
   > 8MB cubre previews/metadata holgados; exports grandes van a disco (no por IPC). Env var para ajustar.

2. **Pillow + contador** — `backend/bootstrap.py` (seteo global, aditivo):
   ```python
   from PIL import Image
   Image.MAX_IMAGE_PIXELS = 50_000_000   # ~50MP → raise DecompressionBombError
   ```
   Y en `optimizer.py`, antes del loop:
   ```python
   _MAX_OPTIMIZER_FILES = 500
   _MAX_OPTIMIZER_TOTAL_BYTES = 512 * 1024 * 1024
   files = files[:_MAX_OPTIMIZER_FILES]
   total = 0
   for file_info in files:
       content_b64 = str(file_info.get("content_b64", "") or "")
       decoded_len = (len(content_b64) * 3) // 4
       total += decoded_len
       if total > _MAX_OPTIMIZER_TOTAL_BYTES:
           raise ValueError("Demasiados datos de imagen en una sola solicitud")
       ...
   ```

3. **ReDoS** — `backend/core/panel_aviso_corte/matcher.py`:
   ```python
   _MAX_REGEX_LEN = 256
   _MAX_STEM_LEN = 512

   def _match_regex(rule, normalized_stem):
       if len(rule.regex_pattern) > _MAX_REGEX_LEN:
           raise InvalidMatchRuleError("Patrón regex demasiado largo (máx 256)")
       if len(normalized_stem) > _MAX_STEM_LEN:
           return False   # ponytail: regex sin timeout nativo en `re`; acotar longitud de input
       compiled = re.compile(rule.regex_pattern, re.IGNORECASE)
       return bool(compiled.search(normalized_stem))
   ```
   > Ceiling conocido: `re` no tiene timeout; el cap de longitud + cap de stem reduce drásticamente ReDoS. Upgrade path: `regex` module con `timeout` o ejecutar en subprocess con kill.

4. **History cap** — `backend/handlers/history.py`:
   ```python
   _MAX_HISTORY_LIMIT = 500
   limit = min(int(params.get("limit", 50) or 50), _MAX_HISTORY_LIMIT)
   ```

> Ningún fix elimina una función: los límites son superiores (los valores legítimos menores siguen funcionando). Los defaults existentes (50, 10000 para export) se respetan dentro del rango.

## Testing (sin romper nada)

1. **`tests/test_ipc_validation.py`:** mensaje de 9MB → `_SKIP` (rechazado); mensaje normal → OK.
2. **`tests/test_optimizer_handler.py`:** 501 archivos → se trunca a 500 + warning/validación; payload base64 que excede el total → ValueError. Caso normal (10 imágenes) → OK.
3. **`tests/test_converter.py`:** imagen >50MP → `DecompressionBombError` (Pillow). Imagen normal → OK.
4. **`tests/panel_aviso_corte/test_models.py` / `test_handlers.py`:** patrón de 300 chars → InvalidMatchRuleError; patrón ReDoS `(a+)+$` sobre stem de 512 chars → no cuelga (retorna rápido o False). Patrón legítimo → matchea igual.
5. **`tests/test_history_export.py` / `tests/test_handlers.py`:** `limit=99999` → se aplica 500; `limit=50` → 50 (igual que antes).
