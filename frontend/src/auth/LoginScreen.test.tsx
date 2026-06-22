import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, act } from '@testing-library/react';
import '../i18n';
import LoginScreen from './LoginScreen';

vi.mock('./AntaresScene', () => ({ default: () => null }));

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
  let setItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWideViewport();
    document.documentElement.dataset.themeMode = 'dark';
    document.documentElement.classList.remove('theme-light');
    document.documentElement.classList.add('theme-dark');
    setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.dataset.themeMode = '';
    document.documentElement.classList.remove('theme-light', 'theme-dark');
  });

  it('renders the login screen container', () => {
    render(<LoginScreen />);
    expect(screen.getByTestId('login-screen')).toBeInTheDocument();
  });

  it('shows email and password inputs', () => {
    render(<LoginScreen />);
    expect(screen.getByLabelText(/correo/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ingresa tu contraseña/i)).toBeInTheDocument();
  });

  it('has a sign-in button', () => {
    render(<LoginScreen />);
    expect(screen.getByRole('button', { name: /^entrar$/i })).toBeInTheDocument();
  });

  it('does not render Google sign-in button', () => {
    render(<LoginScreen />);
    expect(screen.queryByText(/google/i)).not.toBeInTheDocument();
  });

  it('does not render sign-up option', () => {
    render(<LoginScreen />);
    expect(screen.queryByText(/registrarse/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/crear cuenta/i)).not.toBeInTheDocument();
  });

  it('does not render privacy or terms links', () => {
    render(<LoginScreen />);
    expect(screen.queryByText(/términos/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/privacidad/i)).not.toBeInTheDocument();
  });

  it('renders the appearance mode toggle with light and dark buttons', () => {
    render(<LoginScreen />);
    const darkButton = screen.getByRole('button', { name: /oscuro/i });
    const lightButton = screen.getByRole('button', { name: /claro/i });
    expect(darkButton).toBeInTheDocument();
    expect(lightButton).toBeInTheDocument();
    expect(darkButton.getAttribute('aria-pressed')).toBe('true');
  });

  it('persists the chosen mode in localStorage and updates the DOM', () => {
    render(<LoginScreen />);
    const lightButton = screen.getByRole('button', { name: /claro/i });
    act(() => {
      fireEvent.click(lightButton);
    });
    expect(setItemSpy).toHaveBeenCalledWith('hc_theme_mode', 'light');
    expect(document.documentElement.dataset.themeMode).toBe('light');
    expect(document.documentElement.classList.contains('theme-light')).toBe(true);
    expect(document.documentElement.classList.contains('theme-dark')).toBe(false);
  });
});
