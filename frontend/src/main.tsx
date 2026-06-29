import './i18n';
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { safeThemeValue } from './utils/themeValidate'

function restoreCachedTheme() {
  try {
    const cached = localStorage.getItem('hc_theme_css_cache');
    if (!cached) return;

    const themeVars = JSON.parse(cached) as Record<string, string>;
    Object.entries(themeVars).forEach(([name, value]) => {
      // SEC-016: validar antes de inyectar — solo variables conocidas con
      // valores tipados (colores/longitudes/fuentes). Rechaza url()/@import/;.
      const safe = safeThemeValue(name, value);
      if (safe !== null) {
        document.documentElement.style.setProperty(name, safe);
      }
    });

    const mode = localStorage.getItem('hc_theme_mode');
    const density = localStorage.getItem('hc_theme_density');
    if (mode) document.documentElement.dataset.themeMode = mode;
    if (density) document.documentElement.dataset.themeDensity = density;
  } catch {}
}

restoreCachedTheme();

const root = ReactDOM.createRoot(document.getElementById('root')!);

// Use StrictMode only in development to avoid double renders in production
const isDev = import.meta.env.DEV;

root.render(
  isDev ? (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  ) : (
    <App />
  ),
);
