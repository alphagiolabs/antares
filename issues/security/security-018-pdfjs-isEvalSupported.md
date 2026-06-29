# SEC-018 — `pdfjs-dist` sin `isEvalSupported:false` (hardening)

- **Severidad:** P3 (Baja)
- **Categoría:** Hardening (CWE-693 configuración de seguridad)
- **Archivos afectados:** `frontend/src/components/sellador/pdfjs.ts:26-28`, `frontend/src/components/formatos/FormatosView.tsx:35-37` (y cualquier otro call site de `getDocument`)

## Vulnerabilidad

Las llamadas a `pdfjs-dist` `getDocument()` no pasan `isEvalSupported: false`:

```ts
// sellador/pdfjs.ts (aprox)
const loadingTask = getDocument({ data, /* ...sin isEvalSupported... */ });
```

`pdfjs-dist@4.10.38` **está parcheado** para los CVEs conocidos (CVE-2024-43639 / CVE-2024-43640 afectaban a versiones < 4.7), así que no hay CVE abierto aquí. Pero el worker de PDF.js puede usar `eval`/`Function` para ciertas features (p.ej. some font rendering paths, auto-linters de scripts de PDF). Dejar `isEvalSupported` al default significa que el hardening depende del default de la librería, no de una decisión explícita.

## Impacto

Bajo (versión parcheada + renderer sandboxed + sin sinks XSS). Es hardening: deshabilitar `eval` en el worker reduce superficie si una futura CVE de PDF.js introduce un path que use `eval` sobre contenido de un PDF crafted. P3.

## Fix propuesto (aditivo, conserva la funcionalidad)

Centralizar `getDocument` en `sellador/pdfjs.ts` con hardening y reutilizar desde todos los call sites:

```ts
// frontend/src/components/sellador/pdfjs.ts
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

// Hardening del worker: deshabilita eval/Function en el contexto de PDF.js.
// No afecta rendering/stamp/extracción de páginas (las features que Antares usa).
export function loadPdf(data: Uint8Array, opts: Record<string, unknown> = {}) {
  return getDocument({
    data,
    isEvalSupported: false,        // ← aditivo
    disableFontFace: false,
    ...opts,
  });
}
```

Reemplazar los call sites directos a `getDocument` en `FormatosView.tsx` (y `MappingPreviewPanel` si lo usa) por `loadPdf(...)`. `GlobalWorkerOptions.workerSrc` se configura como antes (sin cambios).

> Conserva toda la funcionalidad: `isEvalSupported:false` no deshabilita rendering, stamp, extracción de imágenes ni preview de páginas — solo bloquea el path `eval` del worker, que Antares no usa. PDFs legítimos se renderizan idéntico.

## Testing (sin romper nada)

1. **`frontend/src/components/sellador/utils.test.ts` / `pdfjs.ts` tests:** un PDF válido se carga con `loadPdf` → `numPages` correcto, páginas renderizan (happy path intacto).
2. **Smoke sellador:** abrir un PDF, renderizar preview de página, aplicar sello → funciona igual.
3. **Smoke formatos:** `FormatosView` renderiza el mapping/preview del PDF → idéntico.
4. **(Opcional) test de opción:** verificar que `loadPdf` pasa `isEvalSupported:false` (inspeccionar el args). Un PDF con JS embebido (raro) no ejecuta su JS — pero Antares no depende de JS de PDFs.
