(function () {
  // ponytail: espejo mínimo de frontend/src/utils/themeValidate.ts (no puede
  // importar TS por ser un script clásico pre-bundle). Validar antes de
  // inyectar para frenar CSS injection desde un localStorage manipulado.
  var COLOR_RE = /^(#[0-9a-f]{3,8}|(?:rgba?|hsla?)\([0-9.,%\s/]+\)|[a-z]+)$/i;
  var LENGTH_RE = /^-?\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|pt)?$/i;
  var FONT_RE = /^[A-Za-z0-9 _.,\-"'']+$/;
  var COLOR_VARS = '--bg-base --mc-canvas --bg-surface --bg-elevated --mc-lifted --mc-bone --text-primary --mc-ink --text-secondary --text-muted --mc-charcoal --mc-slate --mc-graphite --text-secondary-strong --text-tertiary --accent-primary --accent-orange --border-active --mc-signal --accent-primary-hover --accent-orange-hover --mc-signalLight --mc-clay --border-subtle --border-medium --mc-granite --mc-dust --accent-red --mc-red --accent-yellow --mc-yellow --accent-green --accent-secondary --mc-linkBlue --bg-input --mc-ghost --text-on-accent --accent-primary-glow --accent-orange-glow --scrollbar-thumb --scrollbar-thumb-hover --selection-bg --selection-fg';
  var FONT_VARS = '--app-interface-font --app-code-font';
  var LENGTH_VARS = '--app-font-size --app-code-font-size';
  function safeThemeValue(key, value) {
    if (typeof key !== 'string' || key.slice(0, 2) !== '--') return null;
    if (typeof value !== 'string') return null;
    var v = value.trim();
    if (!v || v.length > 200) return null;
    var re;
    if (COLOR_VARS.indexOf(key) !== -1) re = COLOR_RE;
    else if (FONT_VARS.indexOf(key) !== -1) re = FONT_RE;
    else if (LENGTH_VARS.indexOf(key) !== -1) re = LENGTH_RE;
    else return null;
    return re.test(v) ? v : null;
  }
  try {
    var cache = localStorage.getItem('hc_theme_css_cache');
    if (cache) {
      var vars = JSON.parse(cache);
      var root = document.documentElement;
      for (var key in vars) {
        if (Object.prototype.hasOwnProperty.call(vars, key)) {
          var safe = safeThemeValue(key, vars[key]);
          if (safe !== null) root.style.setProperty(key, safe);
        }
      }
    }
    var mode = localStorage.getItem('hc_theme_mode');
    if (mode) {
      root.dataset.themeMode = mode;
      if (mode === 'dark') {
        root.classList.add('theme-dark');
        root.classList.remove('theme-light');
      } else if (mode === 'light') {
        root.classList.add('theme-light');
        root.classList.remove('theme-dark');
      } else {
        var systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (systemDark) {
          root.classList.add('theme-dark');
          root.classList.remove('theme-light');
        } else {
          root.classList.add('theme-light');
          root.classList.remove('theme-dark');
        }
      }
    }
    var density = localStorage.getItem('hc_theme_density');
    if (density) {
      root.dataset.themeDensity = density;
    }
  } catch (e) {}
})();
