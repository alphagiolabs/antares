import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
} from 'lucide-react';
import { useAuth } from './AuthContext';
import AntaresScene from './AntaresScene';
import './login.css';

type AppearanceMode = 'dark' | 'light';
type AccentColor = 'orange' | 'red' | 'blue' | 'neutral';
const HC_THEME_MODE_KEY = 'hc_theme_mode';
const HC_ACCENT_KEY = 'hc_accent_color';

interface AccentPalette {
  base: string;
  hover: string;
  glow: string;
  textOnAccent: string;
  focusRing: string;
}

const ACCENT_PALETTES: Record<AccentColor, AccentPalette> = {
  orange: {
    base: '#f97316',
    hover: '#ea580c',
    glow: 'rgba(249, 115, 22, 0.25)',
    textOnAccent: '#ffffff',
    focusRing: 'rgba(249, 115, 22, 0.4)',
  },
  red: {
    base: '#dc2626',
    hover: '#b91c1c',
    glow: 'rgba(220, 38, 38, 0.25)',
    textOnAccent: '#ffffff',
    focusRing: 'rgba(220, 38, 38, 0.4)',
  },
  blue: {
    base: '#2563eb',
    hover: '#1d4ed8',
    glow: 'rgba(37, 99, 235, 0.25)',
    textOnAccent: '#ffffff',
    focusRing: 'rgba(37, 99, 235, 0.4)',
  },
  neutral: {
    base: '#18181b',
    hover: '#27272a',
    glow: 'rgba(24, 24, 27, 0.2)',
    textOnAccent: '#ffffff',
    focusRing: 'rgba(24, 24, 27, 0.25)',
  },
};

const ACCENT_OPTIONS: Array<{ id: AccentColor; label: string; preview: string }> = [
  { id: 'orange', label: 'Naranja', preview: ACCENT_PALETTES.orange.base },
  { id: 'red', label: 'Rojo', preview: ACCENT_PALETTES.red.base },
  { id: 'blue', label: 'Azul', preview: ACCENT_PALETTES.blue.base },
  { id: 'neutral', label: 'Negro', preview: ACCENT_PALETTES.neutral.base },
];

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = (event: MediaQueryListEvent | MediaQueryList) => setReducedMotion(event.matches);
    updatePreference(query);
    query.addEventListener('change', updatePreference);
    return () => query.removeEventListener('change', updatePreference);
  }, []);

  return reducedMotion;
}

function readInitialAppearanceMode(): AppearanceMode {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = window.localStorage.getItem(HC_THEME_MODE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* ignore */
  }
  const explicit = document.documentElement.dataset.themeMode;
  if (explicit === 'light' || explicit === 'dark') return explicit;
  if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}

function applyAppearanceMode(mode: AppearanceMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.themeMode = mode;
  root.classList.toggle('theme-light', mode === 'light');
  root.classList.toggle('theme-dark', mode === 'dark');
  try {
    window.localStorage.setItem(HC_THEME_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

function readInitialAccent(): AccentColor {
  if (typeof window === 'undefined') return 'orange';
  try {
    const stored = window.localStorage.getItem(HC_ACCENT_KEY);
    if (stored && stored in ACCENT_PALETTES) return stored as AccentColor;
  } catch {
    /* ignore */
  }
  return 'orange';
}

function applyAccentColor(accent: AccentColor) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HC_ACCENT_KEY, accent);
  } catch {
    /* ignore */
  }
}

function getAccentStyle(accent: AccentColor): React.CSSProperties {
  const palette = ACCENT_PALETTES[accent];
  return {
    '--at-accent': palette.base,
    '--at-accent-hover': palette.hover,
    '--at-accent-glow': palette.glow,
    '--at-on-accent': palette.textOnAccent,
    '--at-input-focus-shadow': `0 0 0 2px ${palette.focusRing}`,
  } as React.CSSProperties;
}

export default function LoginScreen() {
  const { t } = useTranslation();
  const { signIn, error, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>(
    () => readInitialAppearanceMode(),
  );
  const [accentColor, setAccentColor] = useState<AccentColor>(() => readInitialAccent());
  const reducedMotion = useReducedMotion();
  const displayError = localError ?? error;

  useEffect(() => {
    applyAppearanceMode(appearanceMode);
  }, [appearanceMode]);

  useEffect(() => {
    applyAccentColor(accentColor);
  }, [accentColor]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLocalError(null);

    if (!email || !password) {
      setLocalError(t('auth.errorEmpty'));
      return;
    }

    if (password.length < 6) {
      setLocalError(t('auth.errorShortPassword'));
      return;
    }

    const result = await signIn(email, password);
    if (result.error) setLocalError(result.error);
  };

  return (
    <div
      data-testid="login-screen"
      className="at-login"
      style={getAccentStyle(accentColor)}
    >
      <div className="at-access__mode at-access__mode--floating">
        <div className="at-appearance">
          <div className="at-mode-toggle" role="group" aria-label={t('auth.appearanceLabel')}>
            <button
              type="button"
              aria-pressed={appearanceMode === 'dark'}
              onClick={() => setAppearanceMode('dark')}
            >
              {t('auth.modeDark')}
            </button>
            <button
              type="button"
              aria-pressed={appearanceMode === 'light'}
              onClick={() => setAppearanceMode('light')}
            >
              {t('auth.modeLight')}
            </button>
          </div>

          <div className="at-accent-picker" role="group" aria-label="Color de acento">
            {ACCENT_OPTIONS.map((option) => {
              const isActive = option.id === accentColor;
              return (
                <button
                  key={option.id}
                  type="button"
                  className="at-accent-chip"
                  aria-pressed={isActive}
                  onClick={() => setAccentColor(option.id)}
                  style={{
                    '--chip-color': option.preview,
                  } as React.CSSProperties}
                >
                  <span
                    className="at-accent-chip__dot"
                    style={{ background: option.preview }}
                    aria-hidden="true"
                  />
                  <span className="at-accent-chip__label">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <main className="at-access">
        <div className="at-access__card">
          <div className="at-access__header">
            <h1 className="at-access__title">{t('auth.signInTitle')}</h1>
            <p className="at-access__subtitle">{t('auth.continueMessage')}</p>
          </div>

          <form onSubmit={handleSubmit} className="at-form" noValidate>
            {displayError && (
              <div role="alert" className="at-form__error">
                <AlertCircle size={16} aria-hidden="true" />
                <span>{displayError}</span>
              </div>
            )}

            <div className="at-field">
              <label htmlFor="login-email">{t('auth.email')}</label>
              <div className="at-field__control">
                <Mail size={16} aria-hidden="true" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                  required
                />
              </div>
            </div>

            <div className="at-field">
              <label htmlFor="login-password">{t('auth.password')}</label>
              <div className="at-field__control">
                <LockKeyhole size={16} aria-hidden="true" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t('auth.passwordPlaceholder')}
                  required
                />
                <button
                  type="button"
                  className="at-field__reveal"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" className="at-submit" disabled={loading}>
              <span>{loading ? t('auth.working') : t('auth.signIn')}</span>
              <span className="at-submit__icon" aria-hidden="true">
                {loading ? <Loader2 size={16} className="at-spinner" /> : <ArrowRight size={16} />}
              </span>
            </button>
          </form>

        </div>
      </main>

      <section className="at-visual" aria-label={t('auth.visualLabel')}>
        <AntaresScene reducedMotion={reducedMotion} />
      </section>
    </div>
  );
}
