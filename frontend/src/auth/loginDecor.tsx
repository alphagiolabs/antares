import { useState, useRef, useEffect, useCallback, type MouseEvent as ReactMouseEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { LogIn, UserPlus, Loader2 } from 'lucide-react';

type Star = { x: number; y: number; z: number; r: number; phase: number; speed: number };

export function CosmicLayers({ parallax }: { parallax: boolean }) {
  return (
    <>
      <Aurora />
      <Starfield parallax={parallax} />
      <div
        className="lg-orb"
        aria-hidden="true"
        style={{
          background: `conic-gradient(from 0deg at 50% 50%,
            transparent,
            color-mix(in srgb, var(--accent-primary) 20%, transparent),
            transparent,
            color-mix(in srgb, var(--accent-secondary, var(--accent-primary)) 16%, transparent),
            transparent)`,
        }}
      />
    </>
  );
}

function Aurora() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="lg-aurora-blob lg-aurora-blob--indigo" />
      <div className="lg-aurora-blob lg-aurora-blob--teal" />
      <div className="lg-aurora-blob lg-aurora-blob--magenta" />
    </div>
  );
}

function Starfield({ parallax }: { parallax: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const rafRef = useRef(0);
  const reducedMotion = useReducedMotion();
  const focusedRef = useRef(true);

  const initStars = useCallback((w: number, h: number) => {
    starsRef.current = Array.from({ length: 120 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      z: Math.random() * 0.8 + 0.2,
      r: Math.random() * 1.4 + 0.6,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.8 + 0.4,
    }));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let last = 0;
    const fpsCap = 30;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (starsRef.current.length === 0) initStars(width, height);
    };

    const onVis = () => { focusedRef.current = !document.hidden; };
    const onMove = (e: globalThis.MouseEvent) => {
      if (!parallax || reducedMotion) return;
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      };
    };

    const draw = (ts: number) => {
      rafRef.current = requestAnimationFrame(draw);
      if (!focusedRef.current) return;
      if (ts - last < 1000 / fpsCap) return;
      last = ts;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      const t = ts * 0.001;
      const mx = mouseRef.current.x - 0.5;
      const my = mouseRef.current.y - 0.5;
      const parallaxAmt = parallax && !reducedMotion ? 24 : 0;

      for (const s of starsRef.current) {
        const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
        const px = s.x + mx * parallaxAmt * s.z;
        const py = s.y + my * parallaxAmt * s.z;
        ctx.beginPath();
        ctx.arc(px, py, s.r * twinkle, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${0.15 + twinkle * 0.55})`;
        ctx.fill();
      }
    };

    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('mousemove', onMove);
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('mousemove', onMove);
    };
  }, [initStars, parallax, reducedMotion]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}

export function MagneticSubmitButton({
  loading,
  mode,
  label,
}: {
  loading: boolean;
  mode: 'signin' | 'signup';
  label: string;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const reducedMotion = useReducedMotion();

  const onMove = (e: ReactMouseEvent<HTMLButtonElement>) => {
    if (loading || reducedMotion) return;
    const el = btnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const dist = Math.hypot(dx, dy) || 1;
    const pull = Math.min(dist / 80, 1) * 8;
    setOffset({ x: (dx / dist) * pull, y: (dy / dist) * pull });
  };

  const onLeave = () => setOffset({ x: 0, y: 0 });

  const onClick = (e: ReactMouseEvent<HTMLButtonElement>) => {
    if (reducedMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const id = Date.now();
    setRipples((r) => [...r, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    window.setTimeout(() => setRipples((r) => r.filter((x) => x.id !== id)), 650);
  };

  return (
    <motion.button
      ref={btnRef}
      type="submit"
      disabled={loading}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={onClick}
      animate={{
        width: loading ? 48 : '100%',
        height: loading ? 48 : undefined,
        borderRadius: loading ? '50%' : 12,
        x: offset.x,
        y: offset.y,
      }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className="lg-btn relative mx-auto flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-[var(--accent-primary)] py-3 text-sm font-semibold text-[var(--text-on-accent)] disabled:cursor-not-allowed disabled:opacity-50"
      style={{ transformStyle: 'preserve-3d' }}
    >
      {ripples.map((r) => (
        <span
          key={r.id}
          className="lg-btn-ripple"
          style={{ left: r.x, top: r.y, width: 12, height: 12, marginLeft: -6, marginTop: -6 }}
        />
      ))}
      {loading ? (
        <Loader2 size={20} className="animate-spin" />
      ) : (
        <>
          {mode === 'signin' ? <LogIn size={18} /> : <UserPlus size={18} />}
          {label}
        </>
      )}
    </motion.button>
  );
}

export function FloatingCat({ size = 420 }: { size?: number }) {
  return (
    <div
      data-testid="cat-illustration"
      className="lg-float-cat pointer-events-none absolute top-1/2 left-1/2"
      aria-hidden="true"
      style={{ transform: 'translate(-50%, -50%)' }}
    >
      <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
        <circle cx="100" cy="100" r="85" fill="var(--accent-primary)" opacity="0.05" />
        <ellipse cx="100" cy="125" rx="42" ry="35" fill="var(--text-primary)" opacity="0.07" />
        <circle cx="100" cy="82" r="32" fill="var(--text-primary)" opacity="0.09" />
        <polygon points="76,62 70,38 88,56" fill="var(--text-primary)" opacity="0.09" />
        <polygon points="124,62 130,38 112,56" fill="var(--text-primary)" opacity="0.09" />
        <polygon points="79,60 75,46 86,56" fill="var(--accent-primary)" opacity="0.1" />
        <polygon points="121,60 125,46 114,56" fill="var(--accent-primary)" opacity="0.1" />
        <g className="animate-blink">
          <ellipse cx="88" cy="78" rx="5" ry="7" fill="var(--accent-primary)" opacity="0.6" />
          <ellipse cx="112" cy="78" rx="5" ry="7" fill="var(--accent-primary)" opacity="0.6" />
          <circle cx="90" cy="75" r="2" fill="#fff" opacity="0.8" />
          <circle cx="114" cy="75" r="2" fill="#fff" opacity="0.8" />
          <ellipse cx="88" cy="79" rx="2" ry="4" fill="#0a0a0a" opacity="0.5" />
          <ellipse cx="112" cy="79" rx="2" ry="4" fill="#0a0a0a" opacity="0.5" />
        </g>
        <polygon points="96,88 104,88 100,93" fill="var(--accent-primary)" opacity="0.45" />
        <path d="M100 93 Q94 98 90 95" stroke="var(--text-primary)" strokeWidth="1.2" fill="none" opacity="0.18" strokeLinecap="round" />
        <path d="M100 93 Q106 98 110 95" stroke="var(--text-primary)" strokeWidth="1.2" fill="none" opacity="0.18" strokeLinecap="round" />
        <line x1="70" y1="84" x2="48" y2="80" stroke="var(--text-primary)" strokeWidth="0.8" opacity="0.12" strokeLinecap="round" />
        <line x1="70" y1="88" x2="48" y2="90" stroke="var(--text-primary)" strokeWidth="0.8" opacity="0.12" strokeLinecap="round" />
        <line x1="130" y1="84" x2="152" y2="80" stroke="var(--text-primary)" strokeWidth="0.8" opacity="0.12" strokeLinecap="round" />
        <line x1="130" y1="88" x2="152" y2="90" stroke="var(--text-primary)" strokeWidth="0.8" opacity="0.12" strokeLinecap="round" />
        <g className="lg-tail">
          <path d="M140 130 Q165 110 158 78" stroke="var(--text-primary)" strokeWidth="4" fill="none" opacity="0.09" strokeLinecap="round" />
          <circle cx="158" cy="78" r="3" fill="var(--text-primary)" opacity="0.09" />
        </g>
        <ellipse cx="82" cy="156" rx="6" ry="4" fill="var(--text-primary)" opacity="0.07" />
        <ellipse cx="118" cy="156" rx="6" ry="4" fill="var(--text-primary)" opacity="0.07" />
      </svg>
    </div>
  );
}

export function CatLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 36 36" fill="none">
      <circle cx="18" cy="20" r="11" fill="#fff" opacity="0.95" />
      <polygon points="9,13 7,4 15,11" fill="#fff" opacity="0.95" />
      <polygon points="27,13 29,4 21,11" fill="#fff" opacity="0.95" />
      <polygon points="11,12 9,7 14,11" fill="var(--accent-primary)" opacity="0.4" />
      <polygon points="25,12 27,7 22,11" fill="var(--accent-primary)" opacity="0.4" />
      <ellipse cx="14" cy="19" rx="2" ry="2.5" fill="var(--accent-primary)" />
      <ellipse cx="22" cy="19" rx="2" ry="2.5" fill="var(--accent-primary)" />
      <circle cx="15" cy="18" r="0.8" fill="#fff" />
      <circle cx="23" cy="18" r="0.8" fill="#fff" />
      <polygon points="17,22 19,22 18,24" fill="var(--accent-primary)" opacity="0.6" />
      <line x1="8" y1="21" x2="3" y2="20" stroke="#fff" strokeWidth="0.8" opacity="0.5" strokeLinecap="round" />
      <line x1="8" y1="23" x2="3" y2="24" stroke="#fff" strokeWidth="0.8" opacity="0.5" strokeLinecap="round" />
      <line x1="28" y1="21" x2="33" y2="20" stroke="#fff" strokeWidth="0.8" opacity="0.5" strokeLinecap="round" />
      <line x1="28" y1="23" x2="33" y2="24" stroke="#fff" strokeWidth="0.8" opacity="0.5" strokeLinecap="round" />
    </svg>
  );
}

export function WalkingCat() {
  return (
    <div
      data-testid="walking-cat"
      className="absolute bottom-0 left-0 z-20 w-full overflow-hidden opacity-25"
      aria-hidden="true"
      style={{ height: '48px' }}
    >
      <div className="walking-cat-anim">
        <svg width="48" height="40" viewBox="0 0 48 40" fill="none">
          <ellipse cx="22" cy="28" rx="13" ry="9" fill="var(--text-primary)" />
          <circle cx="34" cy="18" r="9" fill="var(--text-primary)" />
          <polygon points="29,12 27,5 33,10" fill="var(--text-primary)" />
          <polygon points="39,12 41,5 35,10" fill="var(--text-primary)" />
          <polygon points="30,11 29,7 32,10" fill="var(--accent-primary)" opacity="0.4" />
          <polygon points="38,11 39,7 36,10" fill="var(--accent-primary)" opacity="0.4" />
          <ellipse cx="31" cy="17" rx="1.2" ry="1.8" fill="var(--accent-primary)" />
          <ellipse cx="37" cy="17" rx="1.2" ry="1.8" fill="var(--accent-primary)" />
          <circle cx="34" cy="20" r="0.8" fill="var(--accent-primary)" opacity="0.6" />
          <line x1="28" y1="19" x2="23" y2="18" stroke="var(--text-primary)" strokeWidth="0.5" opacity="0.4" strokeLinecap="round" />
          <line x1="40" y1="19" x2="45" y2="18" stroke="var(--text-primary)" strokeWidth="0.5" opacity="0.4" strokeLinecap="round" />
          <g className="lg-walk-legs">
            <rect x="14" y="35" width="2" height="6" rx="1" fill="var(--text-primary)" />
            <rect x="19" y="35" width="2" height="6" rx="1" fill="var(--text-primary)" />
            <rect x="24" y="35" width="2" height="6" rx="1" fill="var(--text-primary)" />
            <rect x="29" y="35" width="2" height="6" rx="1" fill="var(--text-primary)" />
          </g>
          <path d="M9 28 Q3 22 6 16" stroke="var(--text-primary)" strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
