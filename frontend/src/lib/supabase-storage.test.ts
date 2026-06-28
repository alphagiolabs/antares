import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ipcStorage } from './supabase-storage';

describe('ipcStorage (SEC-009 adapter)', () => {
  const original = (window as unknown as { electronAPI?: unknown }).electronAPI;

  beforeEach(() => {
    (window as unknown as { electronAPI?: unknown }).electronAPI = undefined;
  });

  afterEach(() => {
    (window as unknown as { electronAPI?: unknown }).electronAPI = original;
  });

  it('degrada a null/no-op cuando electronAPI no está presente (tests)', () => {
    expect(ipcStorage.getItem('sb-x-auth-token')).toBeNull();
    expect(ipcStorage.setItem('sb-x-auth-token', 'v')).toBeUndefined();
    expect(ipcStorage.removeItem('sb-x-auth-token')).toBeUndefined();
  });

  it('delega getItem al main process vía authStorageGet', async () => {
    const get = vi.fn().mockResolvedValue('token-from-main');
    (window as unknown as { electronAPI: unknown }).electronAPI = { authStorageGet: get };
    const result = await ipcStorage.getItem('sb-x-auth-token');
    expect(get).toHaveBeenCalledWith('sb-x-auth-token');
    expect(result).toBe('token-from-main');
  });

  it('delega setItem y removeItem', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);
    (window as unknown as { electronAPI: unknown }).electronAPI = { authStorageSet: set, authStorageRemove: remove };
    await ipcStorage.setItem('sb-x-auth-token', 'value');
    expect(set).toHaveBeenCalledWith('sb-x-auth-token', 'value');
    await ipcStorage.removeItem('sb-x-auth-token');
    expect(remove).toHaveBeenCalledWith('sb-x-auth-token');
  });

  it('getItem devuelve null cuando authStorageGet falta (api parcial)', () => {
    (window as unknown as { electronAPI: unknown }).electronAPI = {};
    expect(ipcStorage.getItem('sb-x-auth-token')).toBeNull();
  });
});
