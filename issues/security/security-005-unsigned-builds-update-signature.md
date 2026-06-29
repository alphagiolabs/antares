# SEC-005 — Builds sin firmar + `verifyUpdateCodeSignature:false` → auto-update sin verificación de firma

- **Severidad:** P1 (Alta)
- **Categoría:** Supply Chain / Build Configuration (CWE-347 falta de verificación de firma)
- **Archivos afectados:** `electron-builder.yml` (win `verifyUpdateCodeSignature`, `signtoolOptions`; mac `dmg.sign`, sin `notarize`), `electron/auto-updater.js`, CI release workflow

## Vulnerabilidad

`electron-builder.yml`:

```yaml
win:
  requestedExecutionLevel: asInvoker
  # Disabled because installers are not code-signed. Required for
  # electron-updater to accept new versions on unsigned Windows builds.
  verifyUpdateCodeSignature: false
  signtoolOptions:
    signingHashAlgorithms:
      - sha256
mac:
  hardenedRuntime: true
  gatekeeperAssess: false
dmg:
  sign: false
```

No hay `certificateFile`/`certificatePassword` (Windows) ni bloque `notarize`/`notarizeOptions` (macOS). Los instaladores y DMG se distribuyen **sin firma de código**.

`electron/auto-updater.js` usa `electron-updater` con `autoDownload: true` y `autoInstallOnAppQuit: true`. `electron-updater` valida el `latest.yml` (que incluye un SHA512 del binario) — pero ese `latest.yml` viaja **en el mismo release** que el binario. Sin firma de código y con `verifyUpdateCodeSignature: false`, **no hay criptografía que ate el binario a la identidad del autor**: quien comprometa un GitHub Release (token `GITHUB_TOKEN` filtrado, cuenta comprometida, contribuyente malicioso con acceso, o MITM del canal — más difícil por HTTPS) puede reemplazar `latest.yml` + instalador con una versión maliciosa, y todos los clientes que auto-updatean la instalarán sin advertencia.

## Impacto

**RCE masiva** vía supply chain sobre todos los usuarios que tienen auto-update habilitado (el default, ver `auto-updater.js:32-33`). El atacante necesita comprometer un release (no acceso a la máquina del usuario). Por la barrera de entrada (comprometer el repo/token) lo califico P1 y no P0, pero el impacto es RCE en toda la base instalada.

Secundario: en macOS, `dmg.sign: false` + sin notarize → Gatekeeper muestra advertencia y los usuarios están entrenados a "click anyway", lo que erosiona la protección de macOS y abre phishing por suplantación del instalador.

## Fix propuesto (aditivo, conserva los dev builds sin firma)

El fix es **configuración + secrets de CI**, no cambia lógica de la app. Se cablea la firma para que sea **no-op sin secrets** (así los builds locales/dev y los CI sin cert siguen funcionando exactamente igual) y se **flip `verifyUpdateCodeSignature: true`** una vez que los builds estén firmados.

`electron-builder.yml` (cambios aditivos, condicionados a env vars):

```yaml
win:
  requestedExecutionLevel: asInvoker
  # Firma opcional: si no hay cert en CI, se ignora y el build queda sin firma
  # (comportamiento actual). Cuando haya cert, flip verifyUpdateCodeSignature a true.
  verifyUpdateCodeSignature: ${BUILD_SIGNED:false}
  certificateFile: ${WIN_CERT_FILE:}
  certificatePassword: ${WIN_CERT_PASSWORD:}
  signtoolOptions:
    signingHashAlgorithms:
      - sha256
  # signingHashAlgorithms se respeta solo si hay certificateFile
mac:
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  # Notarization opcional: solo si hay APPLE creds en CI.
  notarize:
    teamId: ${APPLE_TEAM_ID:}
#   electron-builder toma APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID del env
dmg:
  sign: ${BUILD_SIGNED:false}
```

> Nota: electron-builder admite sustitución de env vars en algunos campos; donde no, usar un script wrapper en CI que setee los bloques solo si los secrets existen (mantener el yaml sin firma como fallback). El objetivo es: **con secrets → firmado; sin secrets → build actual sin firma**. Cero cambio para devs.

CI (`.github/workflows/release.yml`) — inyectar secrets:
```yaml
# Windows
env:
  WIN_CERT_FILE: ${{ secrets.WIN_CERT_FILE }}   # base64 del .pfx, decodeado en un step
  WIN_CERT_PASSWORD: ${{ secrets.WIN_CERT_PASSWORD }}
  BUILD_SIGNED: "true"
# macOS
env:
  APPLE_ID: ${{ secrets.APPLE_ID }}
  APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
  APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
```

Una vez que un primer release firmado exista, setear `verifyUpdateCodeSignature: true` permanente en `electron-builder.yml` (quito el condicional) — a partir de ahí `electron-updater` rechaza updates no firmados o con firma inválida.

`electron/auto-updater.js` no requiere cambios (`electron-updater` ya verifica cuando el app está firmado y `verifyUpdateCodeSignature` está on). Opcional: setear explícitamente `updater.allowDowngrade = false` (ya es el default) y registrar el `signature` de cada update en logs de auditoría.

## Testing (sin romper nada)

1. **`tests/test-build-size-guards.js`** — sigue pasando (no se tocan los guards de tamaño).
2. **Build local sin secrets:** `npm run build:win` / `build:mac` → produce instalador sin firma, idéntico al actual (dev workflow intacto).
3. **Build CI con secrets:** el artefacto Windows pasa `signtool verify /pa /v Antares-Setup-*.exe` → OK; el DMG pasa `spctl --assess -vv Antares-*.dmg` y `xcrun stapler validate` → OK.
4. **Auto-update regresión:** con un build firmado, simular un update con `latest.yml` whose signature no coincide → `electron-updater` lo rechaza (verificar en el handler `updater.on('error')`). Con un update legítimo firmado → instala normal.
5. **No se elimina nada:** `verifyUpdateCodeSignature: false` se reemplaza por condicional que defaults a false → comportamiento sin secrets idéntico al actual.
