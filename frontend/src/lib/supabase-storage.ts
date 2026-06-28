/**
 * SEC-009 — Storage adapter para Supabase que delega la persistencia del token
 * al main process (Electron) vía IPC, en lugar de `localStorage`.
 *
 * El main process guarda el token cifrado en reposo (safeStorage / DPAPI).
 * Así el JWT + refresh token ya no viven en `localStorage` del renderer, donde
 * un XSS podría leerlos. Supabase-js (v2) soporta storage asíncrono, así que
 * los métodos pueden devolver Promises.
 *
 * El doble optional chaining (`electronAPI?.authStorageGet?.(key)`) cubre tanto
 * la ausencia del puente (tests, browser puro) como una API parcial (preload de
 * versión distinta sin el método). En esos casos no hay persistencia y
 * supabase-js sigue funcionando, sólo sin restaurar sesión de disco.
 */
export const ipcStorage = {
  getItem: (key: string): Promise<string | null> | string | null =>
    window.electronAPI?.authStorageGet?.(key) ?? null,
  setItem: (key: string, value: string): Promise<void> | void =>
    window.electronAPI?.authStorageSet?.(key, value) ?? undefined,
  removeItem: (key: string): Promise<void> | void =>
    window.electronAPI?.authStorageRemove?.(key) ?? undefined,
};
