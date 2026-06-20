import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '../i18n';
import LoginScreen from './LoginScreen';

vi.mock('./AuthContext', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    error: null,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    refreshUser: vi.fn(),
  }),
}));

function mockWideViewport() {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1280 });
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('max-width') ? false : true,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe('LoginScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWideViewport();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the Antares title', () => {
    render(<LoginScreen />);
    expect(screen.getAllByText(/Antares/i).length).toBeGreaterThanOrEqual(1);
  });

  it('shows email and password inputs', () => {
    render(<LoginScreen />);
    expect(screen.getByLabelText(/correo/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/••••••••/)).toBeInTheDocument();
  });

  it('has a sign-in button', () => {
    render(<LoginScreen />);
    expect(screen.getByRole('button', { name: /entrar|iniciar/i })).toBeInTheDocument();
  });

  it('renders the login screen container', () => {
    render(<LoginScreen />);
    expect(screen.getByTestId('login-screen')).toBeInTheDocument();
  });
});
