import { useCallback, useMemo } from 'react';

/**
 * Throttle client-side de intentos de auth (defense-in-depth + UX).
 *
 * No reemplaza el rate-limit server de Supabase (la línea principal): un
 * atacante determinado lo bypasea via DevTools (ver SEC-014, que limita
 * DevTools en prod). Solo acota intentos rápidos y da feedback al usuario.
 *
 * Estado en `localStorage` (`antares_auth_lock`): `{ count, until }`. Tras
 * MAX_ATTEMPTS intentos fallidos se bloquea LOCK_MS. `reset()` en login
 * exitoso.
 */
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const KEY = 'antares_auth_lock';

interface LockData {
  count: number;
  until: number;
}

function read(): LockData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { count: 0, until: 0 };
    const parsed = JSON.parse(raw);
    if (typeof parsed?.count !== 'number' || typeof parsed?.until !== 'number') {
      return { count: 0, until: 0 };
    }
    return parsed;
  } catch {
    return { count: 0, until: 0 };
  }
}

function write(data: LockData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function useAuthThrottle() {
  /** Registra un intento fallido y activa el lock si corresponde. */
  const lock = useCallback((): LockData => {
    const data = read();
    data.count += 1;
    if (data.count >= MAX_ATTEMPTS) data.until = Date.now() + LOCK_MS;
    write(data);
    return data;
  }, []);

  /** ms restantes de bloqueo, o 0 si no hay lock. */
  const isLocked = useCallback((): number => {
    const data = read();
    if (data.until && Date.now() < data.until) return data.until - Date.now();
    if (data.until && Date.now() >= data.until) write({ count: 0, until: 0 });
    return 0;
  }, []);

  /** Reinicia el contador (login exitoso). */
  const reset = useCallback((): void => {
    write({ count: 0, until: 0 });
  }, []);

  // Memoizar para que el objeto sea estable (las callbacks internas ya lo
  // son): así signIn/signUp no pierden su identidad referencial.
  return useMemo(() => ({ lock, isLocked, reset }), [lock, isLocked, reset]);
}
