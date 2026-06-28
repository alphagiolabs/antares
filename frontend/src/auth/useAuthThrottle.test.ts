import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuthThrottle } from './useAuthThrottle';

describe('useAuthThrottle (SEC-015)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('no bloquea con 1-2 intentos fallidos', () => {
    const { result } = renderHook(() => useAuthThrottle());
    act(() => {
      result.current.lock();
      result.current.lock();
    });
    expect(result.current.isLocked()).toBe(0);
  });

  it('bloquea tras 5 intentos fallidos', () => {
    const { result } = renderHook(() => useAuthThrottle());
    act(() => {
      for (let i = 0; i < 5; i++) result.current.lock();
    });
    expect(result.current.isLocked()).toBeGreaterThan(0);
  });

  it('reset desbloquea tras un lock', () => {
    const { result } = renderHook(() => useAuthThrottle());
    act(() => {
      for (let i = 0; i < 5; i++) result.current.lock();
    });
    expect(result.current.isLocked()).toBeGreaterThan(0);
    act(() => result.current.reset());
    expect(result.current.isLocked()).toBe(0);
  });

  it('el lock expira pasado el tiempo', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useAuthThrottle());
      act(() => {
        for (let i = 0; i < 5; i++) result.current.lock();
      });
      expect(result.current.isLocked()).toBeGreaterThan(0);
      act(() => {
        vi.advanceTimersByTime(16 * 60 * 1000);
      });
      expect(result.current.isLocked()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
