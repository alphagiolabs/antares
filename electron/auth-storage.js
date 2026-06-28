/**
 * SEC-009 — Almacenamiento del token de sesión Supabase fuera del renderer.
 *
 * El cliente Supabase usa por defecto `localStorage`, donde un XSS (o malware
 * con acceso al perfil Electron) puede leer el JWT + refresh token persistido.
 * Este módulo mueve el token al main process: se guarda CIFRADO en reposo con
 * `electron.safeStorage` (DPAPI en Windows, Keychain en macOS, libsecret en
 * Linux) en `userData/auth-token.json`. Si el cifrado del SO no está disponible
 * (p.ej. Linux sin keyring), degrada a archivo plano con perms restrictivos.
 *
 * El renderer accede sólo vía los canales IPC `auth-storage:get|set|remove`,
 * y el canal rechaza cualquier clave que no sea `sb-<ref>-auth-token` para que
 * no se abuse como almacenamiento genérico. El token ya no vive en
 * `localStorage` del renderer.
 *
 * Diseño con inyección de dependencias (`createAuthStorage({ safeStorage, app })`)
 * para poder testear la lógica sin cargar el módulo `electron` real.
 */
const fs = require('fs');
const path = require('path');

// Sólo claves de auth-token de Supabase. Evita que el canal sirva de KV genérico.
const TOKEN_KEY_RE = /^sb-[A-Za-z0-9_-]+-auth-token$/;

function _validateKey(key) {
  if (typeof key !== 'string' || !TOKEN_KEY_RE.test(key)) {
    throw new Error('Clave de almacenamiento no permitida');
  }
}

/**
 * @param {object} deps
 * @param {object} deps.safeStorage  Electron safeStorage (encryptString/decryptString/isEncryptionAvailable)
 * @param {object} deps.app          Electron app (getPath('userData'))
 */
function createAuthStorage({ safeStorage, app }) {
  const tokenFile = () => path.join(app.getPath('userData'), 'auth-token.json');

  async function _readMap() {
    try {
      const raw = await fs.promises.readFile(tokenFile(), 'utf8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (err) {
      if (err && err.code === 'ENOENT') return {};
      throw err;
    }
  }

  async function _writeMap(map) {
    const file = tokenFile();
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    // Escritura atómica (tmp + rename) para no dejar un archivo parcial si el
    // proceso muere a mitad de escritura — un token truncado rompería la sesión.
    const tmp = `${file}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(map), 'utf8');
    await fs.promises.rename(tmp, file);
    // Perms restrictivos best-effort en POSIX. En Windows el archivo vive bajo
    // %APPDATA%/<app> (user-scoped); el cifrado DPAPI aporta la protección real.
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
    ipcMain.handle('auth-storage:get', (_e, key) => get(key));
    ipcMain.handle('auth-storage:set', (_e, key, value) => set(key, value));
    ipcMain.handle('auth-storage:remove', (_e, key) => remove(key));
  }

  return { get, set, remove, register, _tokenFile: tokenFile };
}

module.exports = { createAuthStorage, _validateKey, TOKEN_KEY_RE };
