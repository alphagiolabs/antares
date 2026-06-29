# SEC-015 — Sin rate limiting client-side en auth (signIn / signUp)

- **Severidad:** P3 (Baja)
- **Categoría:** Auth / Brute Force (CWE-307: uso imprudente de recurso sin throttling)
- **Archivos afectados:** `frontend/src/auth/AuthContext.tsx`, `frontend/src/auth/LoginScreen.tsx`

## Vulnerabilidad

`signInWithPassword` y `signUp` se llaman directamente contra Supabase sin throttle/lockout/backoff client-side. No hay `resetPasswordForEmail` expuesto en el frontend. La app depende por completo del rate-limit server de Supabase (que existe pero sus límites son configurables por proyecto y a veces generosos).

## Impacto

Fuerza bruta ilimitada desde el cliente (acotada solo por Supabase server-side). P3 porque Supabase sí tiene protección server, y porque no hay un prerrequisito de renderer comprometido (cualquiera con la app puede intentar). Aun así, un throttle client-side mejora UX (feedback al usuario) y reduce ruido/abuso, y es práctica estándar.

## Fix propuesto (aditivo, conserva la funcionalidad de login)

Un throttle local simple (no elimina el login, solo acota intentos rápidos):

```ts
// frontend/src/auth/useAuthThrottle.ts (nuevo hook)
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const KEY = 'antares_auth_lock';

export function useAuthThrottle() {
  const lock = () => {
    const data = JSON.parse(localStorage.getItem(KEY) || '{"count":0,"until":0}');
    data.count += 1;
    if (data.count >= MAX_ATTEMPTS) data.until = Date.now() + LOCK_MS;
    localStorage.setItem(KEY, JSON.stringify(data));
    return data;
  };
  const isLocked = () => {
    const data = JSON.parse(localStorage.getItem(KEY) || '{"count":0,"until":0}');
    if (data.until && Date.now() < data.until) return data.until - Date.now();
    if (data.until && Date.now() >= data.until) {
      localStorage.setItem(KEY, '{"count":0,"until":0}');
    }
    return 0;
  };
  const reset = () => localStorage.setItem(KEY, '{"count":0,"until":0}');
  return { lock, isLocked, reset };
}
```

Uso en `AuthContext`/`LoginScreen`: antes de `signInWithPassword`, `const ms = isLocked(); if (ms) return setError(\`Demasiados intentos. Intenta en ${Math.ceil(ms/60000)} min\`)`. Tras un login **fallido**, `lock()`; tras login **exitoso**, `reset()`. Conserva el flujo de login; solo añade feedback de bloqueo.

> El throttle es client-side (un atacante determinado lo byborra via DevTools — ver SEC-014 que limita DevTools en prod). Es **defense-in-depth + UX**, no la línea principal (que es Supabase server). No elimina ni cambia la auth.

Opcional: exponer `resetPasswordForEmail` con el mismo throttle y un captcha (hCaptcha/Turnstile) si el proyecto Supabase lo soporta.

## Testing (sin romper nada)

1. **`frontend/src/auth/LoginScreen.test.tsx` / `AuthContext.test.tsx`** (existentes o nuevos): login exitoso → `reset()` llamado, sesión activa (happy path intacto).
2. 5 logins fallidos seguidos → el 6º muestra "Demasiados intentos" y **no** llama a `signInWithPassword`.
3. Tras esperar el lock (mockear `Date.now`), el login vuelve a funcionar.
4. El throttle NO interfiere con el login normal (1-2 intentos): `isLocked() === 0`.
