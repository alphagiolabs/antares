import { useState, useRef, useEffect, useMemo, useCallback, type FormEvent } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, Lock, LogIn, UserPlus, AlertCircle, Loader2, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useAuth } from './AuthContext';

/* ─── Starfield canvas (parallax + twinkle, S-Tier) ─── */
function Starfield({ reduceMotion }: { reduceMotion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0, y: 0 });

  const stars = useMemo(() => {
    const count = reduceMotion ? 60 : 140;
    return [...Array(count)].map((_, i) => ({
      id: i,
      x: Math.random(),
      y: Math.random(),
      z: Math.random() * 0.8 + 0.2, // depth 0.2–1.0
      r: Math.random() * 1.4 + 0.4,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.5 + 0.3,
    }));
  }, [reduceMotion]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    }
    ctx.clearRect(0, 0, w, h);
    const t = performance.now() * 0.001;
    const mx = mouseRef.current.x;
    const my = mouseRef.current.y;
    for (const s of stars) {
      const parallaxX = (mx - 0.5) * 30 * s.z;
      const parallaxY = (my - 0.5) * 30 * s.z;
      const x = s.x * w + parallaxX;
      const y = s.y * h + parallaxY;
      const twinkle = reduceMotion ? 0.6 : (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase)));
      ctx.beginPath();
      ctx.arc(x, y, s.r * s.z, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(247, 248, 248, ${twinkle * s.z})`;
      ctx.fill();
    }
    rafRef.current = requestAnimationFrame(draw);
  }, [stars, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) {
      // Single static frame
      draw();
      return;
    }
    rafRef.current = requestAnimationFrame(draw);
    const onMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = (e.clientX - rect.left) / rect.width;
      mouseRef.current.y = (e.clientY - rect.top) / rect.height;
    };
    const panel = canvasRef.current?.parentElement;
    panel?.addEventListener('mousemove', onMove);
    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(rafRef.current);
      else rafRef.current = requestAnimationFrame(draw);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(rafRef.current);
      panel?.removeEventListener('mousemove', onMove);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [draw, reduceMotion]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}

/* ─── Antares star logo (geometric, no cat) ─── */
function StarLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="starGrad" x1="0" y1="0" x2="36" y2="36">
          <stop offset="0%" stopColor="var(--accent-primary)" />
          <stop offset="100%" stopColor="var(--accent-primary-hover)" />
        </linearGradient>
      </defs>
      <rect width="36" height="36" rx="10" fill="url(#starGrad)" />
      <path
        d="M18 7 L20.5 14.5 L28 14.5 L21.8 19 L24.3 26.5 L18 22 L11.7 26.5 L14.2 19 L8 14.5 L15.5 14.5 Z"
        fill="#fff"
        opacity="0.95"
      />
    </svg>
  );
}

/* ─── Ripple type ─── */
interface Ripple { id: number; x: number; y: number; }

export default function LoginScreen() {
  const { t } = useTranslation();
  const { signIn, signUp, error, loading } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [btnPos, setBtnPos] = useState({ x: 0, y: 0 });
  const [reduceMotion, setReduceMotion] = useState(false);

  const displayError = localError ?? error;
  const formPanelRef = useRef<HTMLDivElement>(null);

  // Detect reduced motion preference
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Pre-compute twinkling sparkles for form panel background
  const sparkles = useMemo(
    () =>
      [...Array(10)].map((_, i) => ({
        id: i,
        left: `${(i * 73 + 11) % 100}%`,
        top: `${(i * 41 + 7) % 80}%`,
        size: 2 + (i % 3) * 2,
        duration: 3 + (i % 4),
        delay: (i % 6) * 0.8,
      })),
    [],
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!email || !password) {
      setLocalError(t('auth.errorEmpty'));
      return;
    }
    if (password.length < 6) {
      setLocalError(t('auth.errorShortPassword'));
      return;
    }
    const { error: authError } = mode === 'signin'
      ? await signIn(email, password)
      : await signUp(email, password);
    if (authError) setLocalError(authError);
  };

  // Spotlight follows cursor on form panel
  const handlePanelMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    const panel = e.currentTarget;
    const rect = panel.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;
    panel.style.setProperty('--mx', String(mx));
    panel.style.setProperty('--my', String(my));
  };

  // Magnetic button effect
  const handleBtnMouseMove = (e: ReactMouseEvent<HTMLButtonElement>) => {
    if (reduceMotion) return;
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) * 0.2;
    const dy = (e.clientY - cy) * 0.2;
    setBtnPos({ x: Math.max(-8, Math.min(8, dx)), y: Math.max(-8, Math.min(8, dy)) });
  };

  const handleBtnMouseLeave = () => setBtnPos({ x: 0, y: 0 });

  // Ripple on click
  const handleBtnClick = (e: ReactMouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const id = Date.now();
    setRipples((prev) => [...prev, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 600);
  };

  return (
    <div
      data-testid="login-screen"
      className="flex h-screen w-screen overflow-hidden bg-[var(--bg-base)]"
    >
      {/* ═══ LEFT: Showcase panel (hidden on narrow) ═══ */}
      <div className="relative hidden lg:flex lg:w-[55%] xl:w-[58%] flex-col justify-between overflow-hidden">
        {/* Starfield canvas */}
        <Starfield reduceMotion={reduceMotion} />

        {/* Aurora blobs */}
        <div className="lg-aurora-blob lg-aurora-blob--indigo" aria-hidden="true" />
        <div className="lg-aurora-blob lg-aurora-blob--teal" aria-hidden="true" />
        <div className="lg-aurora-blob lg-aurora-blob--magenta" aria-hidden="true" />

        {/* Conic orb overlay (subtle) */}
        <div className="lg-orb" aria-hidden="true" style={{
          background: `conic-gradient(from 0deg at 50% 50%,
            transparent,
            color-mix(in srgb, var(--accent-primary) 12%, transparent),
            transparent,
            color-mix(in srgb, var(--accent-secondary) 10%, transparent),
            transparent)`,
          opacity: 0.4,
        }} />

        {/* Top-left brand mark */}
        <div className="relative z-10 flex items-center gap-3 p-8 lg:p-10">
          <StarLogo size={32} />
          <span className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">
            {t('app.title')}
          </span>
        </div>

        {/* Center hero text */}
        <div className="relative z-10 flex flex-1 flex-col items-start justify-center px-10 lg:px-16 xl:px-20">
          <h2 className="lg-shimmer-text text-5xl xl:text-6xl font-bold tracking-tight leading-[1.05]">
            {t('app.title')}
          </h2>
          <p className="mt-4 max-w-md text-lg xl:text-xl font-light leading-relaxed text-[var(--text-secondary)]">
            {t('auth.tagline')}
          </p>
          <div className="mt-8 flex items-center gap-2 text-xs font-medium text-[var(--text-muted)]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent-secondary)]" />
            <span>{mode === 'signin' ? t('auth.signInTitle') : t('auth.signUpTitle')}</span>
          </div>
        </div>

        {/* Bottom footer */}
        <div className="relative z-10 flex items-center justify-between px-10 pb-8 lg:px-16 xl:px-20 text-xs text-[var(--text-muted)]">
          <span>&copy; {new Date().getFullYear()} {t('app.title')}</span>
          <div className="flex gap-4">
            <span>Privacy</span>
            <span>Terms</span>
          </div>
        </div>
      </div>

      {/* ═══ RIGHT: Form panel ═══ */}
      <div
        ref={formPanelRef}
        onMouseMove={handlePanelMouseMove}
        className="lg-spotlight relative flex w-full lg:w-[45%] xl:w-[42%] flex-col items-center justify-center overflow-hidden px-6 py-12"
      >
        {/* Mobile aurora (visible when showcase hidden) */}
        <div className="lg:hidden">
          <div className="lg-aurora-blob lg-aurora-blob--indigo" aria-hidden="true" style={{ width: '80%', height: '60%', top: '5%', left: '10%' }} />
          <div className="lg-aurora-blob lg-aurora-blob--teal" aria-hidden="true" style={{ width: '70%', height: '50%', bottom: '5%', right: '5%' }} />
        </div>

        {/* Sparkles on form panel */}
        <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
          {sparkles.map((s) => (
            <span key={s.id} className="lg-sparkle absolute" style={{
              left: s.left, top: s.top,
              width: `${s.size}px`, height: `${s.size}px`,
              animationDuration: `${s.duration}s`, animationDelay: `${s.delay}s`,
            }} />
          ))}
        </div>

        {/* Glass card */}
        <div
          className="lg-card-enter lg-form-card relative z-10 w-full max-w-sm rounded-2xl border p-8"
          style={{
            borderColor: 'rgba(255,255,255,0.08)',
            backgroundColor: 'color-mix(in srgb, var(--bg-surface) 70%, transparent)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 24px 64px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03)',
          }}
        >
          {/* Logo + title */}
          <div className="mb-7 flex flex-col items-center lg-depth-logo" style={{ animationDelay: '0ms' }}>
            <div className="lg-logo-glow mb-4 flex h-14 w-14 items-center justify-center rounded-2xl">
              <StarLogo size={32} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
              {mode === 'signin' ? t('auth.signInTitle') : t('auth.signUpTitle')}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {mode === 'signin' ? t('auth.noAccount') : t('auth.haveAccount')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {displayError && (
              <div
                role="alert"
                className="lg-shake flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm"
                style={{
                  borderColor: 'var(--accent-red)',
                  backgroundColor: 'color-mix(in srgb, var(--accent-red) 10%, transparent)',
                  color: 'var(--accent-red)',
                }}
              >
                <AlertCircle size={16} className="shrink-0" />
                <span>{displayError}</span>
              </div>
            )}

            {/* Email field */}
            <div className="lg-depth-input" style={{ animationDelay: '80ms' }}>
              <label htmlFor="login-email" className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                {t('auth.email')}
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="lg-input w-full rounded-xl border bg-[color-mix(in_srgb,var(--bg-base)_50%,transparent)] py-3 pl-11 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                  style={{ borderColor: 'rgba(255,255,255,0.08)' }}
                  placeholder="tu@correo.com"
                  required
                />
              </div>
            </div>

            {/* Password field */}
            <div className="lg-depth-input" style={{ animationDelay: '160ms' }}>
              <label htmlFor="login-password" className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                {t('auth.password')}
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="lg-input w-full rounded-xl border bg-[color-mix(in_srgb,var(--bg-base)_50%,transparent)] py-3 pl-11 pr-11 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                  style={{ borderColor: 'rgba(255,255,255,0.08)' }}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
                  aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit button */}
            <div style={{ animationDelay: '240ms' }}>
              <button
                type="submit"
                disabled={loading}
                onClick={handleBtnClick}
                onMouseMove={handleBtnMouseMove}
                onMouseLeave={handleBtnMouseLeave}
                className="lg-btn relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl py-3 text-sm font-semibold text-[var(--text-on-accent)] disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  transform: `translate(${btnPos.x}px, ${btnPos.y}px)`,
                }}
              >
                {ripples.map((r) => (
                  <span
                    key={r.id}
                    className="lg-btn-ripple"
                    style={{ left: r.x, top: r.y, width: 12, height: 12 }}
                  />
                ))}
                {loading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : mode === 'signin' ? (
                  <LogIn size={18} />
                ) : (
                  <UserPlus size={18} />
                )}
                {mode === 'signin' ? t('auth.signIn') : t('auth.signUp')}
                {!loading && <ArrowRight size={16} className="ml-0.5 opacity-70" />}
              </button>
            </div>
          </form>

          {/* Toggle sign-in / sign-up */}
          <div className="mt-6 text-center text-xs text-[var(--text-muted)]" style={{ animationDelay: '320ms' }}>
            {mode === 'signin' ? (
              <>
                {t('auth.noAccount')}{' '}
                <button
                  type="button"
                  onClick={() => { setMode('signup'); setLocalError(null); }}
                  className="font-semibold text-[var(--accent-primary)] transition-colors hover:text-[var(--accent-primary-hover,var(--accent-primary))]"
                >
                  {t('auth.signUpCta')}
                </button>
              </>
            ) : (
              <>
                {t('auth.haveAccount')}{' '}
                <button
                  type="button"
                  onClick={() => { setMode('signin'); setLocalError(null); }}
                  className="font-semibold text-[var(--accent-primary)] transition-colors hover:text-[var(--accent-primary-hover,var(--accent-primary))]"
                >
                  {t('auth.signInCta')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
