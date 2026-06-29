# perf-05 — Login carga eager 5.5 MB de media (P1)

**Severidad:** P1
**Área:** Frontend / assets / cold start

## Bottleneck

La pantalla de login carga **inmediatamente** un video de 3.53 MB y un poster PNG de 2.00 MB al montar el componente, antes de cualquier interacción. Esto incrementa el cold start, el footprint del renderer y el tamaño del installer.

## Evidence (métrica)

- `frontend/src/auth/AntaresScene.tsx`:
  ```tsx
  <video preload="auto" autoPlay loop muted playsInline poster="./sign-up-image.png" />
  ```
- `frontend/public/sign-up-video.mp4` = **3.53 MB**; `preload="auto"` fuerza la descarga completa al montar.
- `frontend/public/sign-up-image.png` = **2.00 MB** (poster + fallback `reducedMotion`).
- Total eager en login: **~5.5 MB** de media.
- `frontend/src/auth/LoginScreen.tsx` renderiza `AntaresScene` de fondo apenas se carga la app (no hay interacción del usuario que justifique precargar el video).

## Fix concreto que conserva funcionalidad

Conserva la experiencia visual idéntica (video de fondo + fallback reduced-motion), cambia solo **cuánto/cuándo** se descarga y el formato del poster:

1. **Poster**: convertir `sign-up-image.png` (2.00 MB) a **WebP** (o JPEG quality 80). Reducción esperada ~10× (~200 KB). Mismo pixel art, mismo uso como poster y como fallback.
2. **Video**: cambiar `preload="auto"` → `preload="metadata"` (carga solo cabecera/duración) o `preload="none"`. Iniciar la reproducción real con `video.play()` tras un pequeño delay (p.ej. 300–800 ms) o en `requestIdleCallback`, para que el login pinte primero y el video fluya después sin bloquear el primer paint.
3. (Opcional) Re-encodear el MP4 a H.264 con bitrate moderado / `moov` atom al inicio (`-movflags +faststart`) para que el primer frame sea inmediato y se pueda hacer streaming progresivo.

No se elimina el video ni el fallback reduced-motion; se conserva toda la funcionalidad actual.

## Verificación

- Medir `Performance` marks: tiempo al primer paint del login y bytes descargados antes/después.
- Confirmar `prefers-reduced-motion` sigue cayendo al poster (mismo path, nuevo formato) y que el video arranca igual al autenticar.
