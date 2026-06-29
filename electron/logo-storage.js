/**
 * SEC-016 — Almacenamiento de logos del preview fuera del renderer.
 *
 * PreviewPanelView persiste los logos (dataURL base64) del encabezado en
 * `localStorage`. Ahí un XSS (o malware con acceso al perfil Electron) los
 * lee, y además satura la cuota de localStorage (las dataURL son grandes).
 * Este módulo los mueve al main process, CIFRADOS en reposo con
 * `electron.safeStorage` (DPAPI en Windows, Keychain en macOS, libsecret en
 * Linux) en `userData/logos.json`. Si el cifrado del SO no está disponible,
 * degrada a archivo plano con perms restrictivos (igual que auth-storage).
 *
 * El renderer accede sólo vía los canales IPC `logo-storage:get|set|remove`,
 * y el canal rechaza cualquier clave fuera de la allowlist de logos para que
 * no se abuse como almacenamiento genérico.
 *
 * Diseño con inyección de dependencias (`createLogoStorage({ safeStorage, app })`)
 * para poder testear la lógica sin cargar el módulo `electron` real.
 */
const fs = require('fs');
const path = require('path');

// Allowlist estricta de claves de logo. Evita que el canal sirva de KV genérico.
const LOGO_KEYS = new Set(['antares_preview_logo_left', 'antares_preview_logo_right']);

function _validateKey(key) {
  if (!LOGO_KEYS.has(key)) {
    throw new Error('Clave de logo no permitida');
  }
}

/**
 * @param {object} deps
 * @param {object} deps.safeStorage  Electron safeStorage (encryptString/decryptString/isEncryptionAvailable)
 * @param {object} deps.app          Electron app (getPath('userData'))
 */
function createLogoStorage({ safeStorage, app }) {
  const logoFile = () => path.join(app.getPath('userData'), 'logos.json');

  async function _readMap() {
    try {
      const raw = await fs.promises.readFile(logoFile(), 'utf8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (err) {
      if (err && err.code === 'ENOENT') return {};
      throw err;
    }
  }

  async function _writeMap(map) {
    const file = logoFile();
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    // Escritura atómica (tmp + rename) para no dejar un archivo parcial.
    const tmp = `${file}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(map), 'utf8');
    await fs.promises.rename(tmp, file);
    if (process.platform !== 'win32') {
      try { await fs.promises.chmod(file, 0o600); } catch { /* best-effort */ }
    }
  }

  function _encrypt(value) {
    if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
      const enc = safeStorage.encryptString(value);
      return { enc: true, data: Buffer.from(enc).toString('base64') };
    }
    return { enc: false, data: Buffer.from(value, 'utf8').toString('base64') };
  }

  function _decrypt(entry) {
    if (!entry || typeof entry.data !== 'string') return null;
    const buf = Buffer.from(entry.data, 'base64');
    if (entry.enc && safeStorage && typeof safeStorage.decryptString === 'function') {
      try { return safeStorage.decryptString(buf); } catch { return null; }
    }
    return buf.toString('utf8');
  }

  async function get(key) {
    _validateKey(key);
    const map = await _readMap();
    const val = _decrypt(map[key]);
    return val == null ? null : val;
  }

  async function set(key, value) {
    _validateKey(key);
    if (typeof value !== 'string') throw new Error('Valor inválido');
    const map = await _readMap();
    map[key] = _encrypt(value);
    await _writeMap(map);
  }

  async function remove(key) {
    _validateKey(key);
    const map = await _readMap();
    if (!(key in map)) return;
    delete map[key];
    await _writeMap(map);
  }

  function register(ipcMain) {
    ipcMain.handle('logo-storage:get', (_e, key) => get(key));
    ipcMain.handle('logo-storage:set', (_e, key, value) => set(key, value));
    ipcMain.handle('logo-storage:remove', (_e, key) => remove(key));
  }

  return { get, set, remove, register, _logoFile: logoFile };
}

module.exports = { createLogoStorage, _validateKey, LOGO_KEYS };
