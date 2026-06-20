# Secuencia consecutiva por fila de base de datos

## Objetivo

Cuando varias imágenes corresponden a una misma fila del catálogo, `{seq}` debe comenzar en `001` y avanzar consecutivamente solo dentro de esa fila. Al cambiar de fila, la secuencia vuelve a `001`.

Ejemplo esperado:

```text
Fila A, 3 imágenes → A_001, A_002, A_003
Fila B, 4 imágenes → B_001, B_002, B_003, B_004
```

Los sufijos de los archivos originales no determinan el número final. Si llegan `A (3).jpg`, `A (1).jpg` y `A (7).jpg`, se generan `A_001.jpg`, `A_002.jpg` y `A_003.jpg` respetando el orden del lote.

## Comportamiento actual

El renombrador admite dos comportamientos implícitos:

- `use_filename_seq=false`: usa el contador interno de `RenamerEngine`, que es global para todo el lote.
- `use_filename_seq=true`: copia literalmente la secuencia extraída del nombre de archivo.

Ninguno representa un contador generado por fila. El primer modo produce `001…025` entre filas y el segundo depende de números externos que pueden faltar, repetirse o llegar desordenados.

## Diseño elegido

### Modos de secuencia

El contrato IPC incorporará `sequence_mode` con estos valores:

- `record`: contador consecutivo por fila del catálogo. Será el modo que use la interfaz al activar «Por fila de BD».
- `global`: conserva el contador global y el campo «Inicial» existente.
- `filename`: compatibilidad interna con ejecuciones antiguas que usaban la secuencia literal del archivo.

Si `sequence_mode` no llega desde clientes antiguos, el backend conservará la semántica anterior: `use_filename_seq=true` equivale a `filename` y `false` equivale a `global`.

La interfaz seguirá almacenando el booleano existente en presets e historial para no romper configuraciones guardadas, pero enviará explícitamente `sequence_mode=record` cuando esté activo y `sequence_mode=global` cuando esté desactivado. El texto visible «Desde archivo» cambiará a «Por fila de BD» y mostrará que cada fila comienza en `001`.

### Identidad del grupo

Después de encontrar el registro de base de datos para una imagen, el backend obtendrá una clave estable así:

1. El valor normalizado de la columna identificadora seleccionada (`key_column`) dentro del registro.
2. Si ese valor no existe, el código base parseado del nombre del archivo.

La normalización eliminará espacios exteriores y comparará sin distinguir mayúsculas. Dos imágenes que resuelvan a la misma clave compartirán contador aunque estén intercaladas en la lista.

### Asignación

Un asignador mantendrá `dict[group_key, next_number]` y devolverá números con un mínimo de tres dígitos. `001` es el inicio fijo del modo por fila; el valor global «Inicial» solo aplica al modo global.

El contador se incrementará únicamente después de encontrar una fila válida. Un archivo sin coincidencia conservará su nombre original y no consumirá números.

### Previsualización

Cada solicitud de previsualización creará un asignador vacío y recorrerá los archivos en su orden actual. El nombre mostrado será el mismo que posteriormente prepara la conversión.

Cambiar archivos, orden, columna identificadora, patrón o modo dispara una nueva previsualización y, por tanto, un recálculo completo desde `001` por grupo.

### Procesamiento y bloques

Cada trabajo de conversión creará un único asignador por fila antes del bucle de bloques. Ese mismo estado se pasará a `_prepare_chunk_tasks`, de modo que una fila distribuida entre dos bloques continúe `001, 002, 003…` sin reiniciarse accidentalmente.

Los nombres se asignan de forma síncrona al preparar las tareas; la ejecución paralela de conversiones no altera el orden ni los contadores.

Los modos de mapeo directo, archivos sin renombrado y conversiones sin `{seq}` mantienen su comportamiento actual.

## Manejo de errores y compatibilidad

- Valores de `sequence_mode` desconocidos usarán el modo heredado derivado de `use_filename_seq`.
- Los archivos sin fila coincidente mantienen el nombre original.
- La numeración no se trunca después de `999`; continúa como `1000`.
- Presets e historiales existentes siguen siendo legibles por el campo booleano heredado.
- El modo global continúa disponible y respeta el número inicial configurado.

## Pruebas de aceptación

1. Tres imágenes de una fila y cuatro de otra producen `001…003` y `001…004`.
2. Grupos intercalados mantienen contadores independientes.
3. Sufijos originales desordenados o incompletos se ignoran en modo `record`.
4. Una fila que cruza el límite entre bloques no reinicia su contador.
5. Un archivo sin coincidencia no consume un número.
6. La previsualización y la salida final generan los mismos nombres.
7. El modo global conserva la secuencia continua y el valor inicial.
8. El modo heredado `filename` conserva la compatibilidad cuando no se envía `sequence_mode`.
9. La interfaz envía `record` al activar «Por fila de BD» y `global` al desactivarlo.

## Fuera de alcance

- Reordenar físicamente los archivos del lote.
- Modificar la base de datos o exigir una nueva columna.
- Cambiar el comportamiento del mapeo directo ID → nombre.
