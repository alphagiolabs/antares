# SEC-009 — Tokens de sesión Supabase en `localStorage` (robo ante XSS)

- **Severidad:** P2 (Media)
- **Categoría:** Data Exposure (CWE-922: datos sensibles sin proteger en almacenamiento cliente)
- **Archivos afectados:** `frontend/src/lib/supabase.ts:18-23`, y por propagación cualquier componente que dependa de la sesión persistida

## Vulnerabilidad

```ts
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,        // ← guarda el JWT en localStorage
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;
```

`persistSession: true` (default de Supabase) serializa el `access_token` + `refresh_token` en `localStorage` bajo `sb-<ref>-auth-token`. Cualquier JavaScript que corra en el origen del renderer — un XSS (hoy no hay sinks, pero basta uno futuro), una extensión maliciosa, o malware con acceso al perfil Electron — puede leer `localStorage` y robar la sesión persistente (incluido el refresh token, que es de larga vida).

## Impacto

Robo de sesión persistente. Aunque hoy el renderer no tiene sinks XSS (verificado: cero `dangerouslySetInnerHTML`/`eval`/`innerHTML`), este hallazgo es un **amplificador**: cualquier futuro sink XSS se convierte en "robo de sesión que sobrevive al cierre de la app". El refresh token permite mantener acceso aunque el access token expire. P2 (no hay prerrequisito remoto hoy, pero eleva severidad de cualquier futuro XSS).

## Fix propuesto (aditivo, conserva la funcionalidad de "sesión recordada")

Opciones, en orden de menor a mayor fricción (todas aditivas, ninguna elimina la auth):

**Opción A — almacenamiento custom vía IPC/main process (recomendada, conserva "recordar sesión"):**
```ts
// frontend/src/lib/supabase-storage.ts (nuevo)
// Delega el almacenamiento del token al main process (Electron), fuera del
// alcance de scripts del renderer. El main process puede guardarlo en un
// keychain/DPAPI (Windows) o en un archivo restringido.
const storageChannel = 'auth-storage';   // expuesto en preload con get/set/delete

export const ipcStorage = {
  getItem: (key: string) => window.electronAPI?.authStorageGet?.(key) ?? null,
  setItem: (key: string, value: string) => window.electronAPI?.authStorageSet?.(key, value),
  removeItem: (key: string) => window.electronAPI?.authStorageRemove?.(key),
};
```
```ts
// supabase.ts
createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: ipcStorage,          // ← aditivo: storage fuera del renderer
  },
})
```
Preload expone `authStorageGet/Set/Remove` (allowlist). Main process guarda el JSON del token en `user_data_path('auth-token.json')` con permisos restrictivos (chmod 600 / Windows ACL al usuario), o idealmente en DPAPI/Keychain. Conserva "recordar sesión entre reinicios" sin exponer el token a `localStorage` del renderer.

**Opción B — no persistir, sesión en memoria (UX de re-login al reiniciar):**
```ts
auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false }
```
Cambia la UX (hay que re-login al reiniciar la app). Conserva toda la funcionalidad durante una sesión. Menor fricción de implementación, mayor fricción de UX.

**Opción C (complementaria, server-side):** acortar el TTL del refresh token en la config de Supabase (Auth → Settings) para limitar la ventana de un token robado.

> Opción A es la que mejor conserva la funcionalidad existente ("sesión recordada") mientras elimina la exposición a `localStorage`.

## Testing (sin romper nada)

1. **`frontend/src/auth/AuthContext.test.tsx`** (existe o se añade): login → sesión activa; logout → `authStorageRemove` llamado y ya no hay token. Tras reiniciar (mock), `authStorageGet` devuelve el token → sesión restaurada (Opción A: "recordar sesión" intacto).
2. Verificar que `localStorage.getItem('sb-*-auth-token')` es **null** tras login (Opción A) — el token ya no vive en el renderer.
3. `frontend/src/hooks/useBackendStatus*` y flows que lean sesión siguen funcionando (el storage custom es transparente para `supabase.auth`).
4. Opción B: tras reload, sesión no persistida → UI muestra login (UX documentada).
