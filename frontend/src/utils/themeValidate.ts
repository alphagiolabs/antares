/**
 * Validador de valores de tema restaurados desde `localStorage`
 * (`hc_theme_css_cache`).
 *
 * El cache se aplica antes de montar React (ver `public/theme-init.js`), así
 * que un valor malicioso escrito por otra app con acceso al perfil podría
 * inyectarse en `document.documentElement.style` (CSS injection → exfiltración
 * vía `url()`/`@import`). Esta función solo acepta valores tipados para
 * variables conocidas y rechaza todo lo demás (`url()`, `@import`, `;`,
 * `var()`, variables desconocidas).
 *
 * `public/theme-init.js` mantiene un espejo mínimo de esta lógica (no puede
 * importar TS por ser un script clásico pre-bundle); mantener ambas en sync.
 */
const COLOR_RE =
  /^(#[0-9a-f]{3,8}|(?:rgba?|hsla?)\([0-9.,%\s/]+\)|[a-z]+)$/i;
const LENGTH_RE = /^-?\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|pt)?$/i;
// font-family: nombres, comas, espacios, comillas, guiones. Sin `;` ni `(`.
const FONT_RE = /^[A-Za-z0-9 _.,\-"'']+$/;

const COLOR_VARS = new Set([
  '--bg-base', '--mc-canvas',
  '--bg-surface', '--bg-elevated', '--mc-lifted', '--mc-bone',
  '--text-primary', '--mc-ink',
  '--text-secondary', '--text-muted', '--mc-charcoal', '--mc-slate', '--mc-graphite',
  '--text-secondary-strong', '--text-tertiary',
  '--accent-primary', '--accent-orange', '--border-active', '--mc-signal',
  '--accent-primary-hover', '--accent-orange-hover', '--mc-signalLight', '--mc-clay',
  '--border-subtle', '--border-medium', '--mc-granite', '--mc-dust',
  '--accent-red', '--mc-red', '--accent-yellow', '--mc-yellow', '--accent-green',
  '--accent-secondary', '--mc-linkBlue',
  '--bg-input', '--mc-ghost', '--text-on-accent',
  '--accent-primary-glow', '--accent-orange-glow',
  '--scrollbar-thumb', '--scrollbar-thumb-hover',
  '--selection-bg', '--selection-fg',
]);

const FONT_VARS = new Set(['--app-interface-font', '--app-code-font']);
const LENGTH_VARS = new Set(['--app-font-size', '--app-code-font-size']);

const MAX_LEN = 200;

/**
 * Devuelve el valor saneado si es válido para `key`, o `null` si debe
 * rechazarse. Aditivo: los temas legítimos (colores/longitudes/fuentes
 * conocidas) pasan sin cambios.
 */
export function safeThemeValue(key: unknown, value: unknown): string | null {
  if (typeof key !== 'string' || !key.startsWith('--')) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_LEN) return null;

  let re: RegExp;
  if (COLOR_VARS.has(key)) re = COLOR_RE;
  else if (FONT_VARS.has(key)) re = FONT_RE;
  else if (LENGTH_VARS.has(key)) re = LENGTH_RE;
  else return null; // solo variables conocidas

  return re.test(trimmed) ? trimmed : null;
}
