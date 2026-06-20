import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useAuth, AuthProvider } from './AuthContext';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => {
  const mockAuth = {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    admin: {
      listUsers: vi.fn(),
      createUser: vi.fn(),
      updateUserById: vi.fn(),
      deleteUser: vi.fn(),
    },
  };
  const mockFrom = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() => ({ data: null, error: null })),
      })),
    })),
  }));
  return {
    supabase: {
      auth: mockAuth,
      from: mockFrom,
      rpc: vi.fn(),
    },
  };
});

function TestConsumer() {
  const { user, loading } = useAuth();
  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="user">{user?.email ?? 'none'}</div>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    // Only clear call history, not implementations (vitest 4 clearAllMocks resets impls)
    (supabase.auth.getSession as any).mockClear();
    (supabase.auth.onAuthStateChange as any).mockClear();
    (supabase.from as any).mockClear();
    // Ensure onAuthStateChange always returns a valid subscription object
    (supabase.auth.onAuthStateChange as any).mockImplementation(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    }));
  });

  it('starts in loading state and resolves to no user when no session', async () => {
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: null }, error: null });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
      expect(screen.getByTestId('user').textContent).toBe('none');
    });
  });

  it('exposes user when a session exists', async () => {
    (supabase.auth.getSession as any).mockResolvedValue({
      data: {
        session: {
          access_token: 'tok',
          user: { id: 'u1', email: 'a@b.com', created_at: '2026-01-01' },
        },
      },
      error: null,
    });
    (supabase.from as any).mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({
            data: { display_name: 'A', is_admin: false, is_disabled: false },
            error: null,
          })),
        })),
      })),
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('a@b.com');
    });
  });
});
