/**
 * SEC-003 / SEC-004 Capa 2 — registro de rutas "vouched" por el dialogo nativo.
 *
 * Capa 1 (denylist de system dirs) ya esta en backend/utils/paths.py y
 * electron/dialog-handlers.js. Esta Capa 2 registra en el main process las
 * rutas/raices que el usuario eligio via dialog.showOpenDialog/showSaveDialog,
 * de modo que un renderer comprometido (XSS) no pueda inventar paths absolutos
 * y hacer que el backend/main los lea o escriba fuera de lo elegido.
 *
 * Diseno:
 *  - DI (createVouchedPaths({ mode, ttlMs, now })) para tests sin Electron.
 *  - Canonicaliza con path.resolve; en Windows compara case-insensitive.
 *  - TTL por sesion: un renderer comprometido no puede reusar una raiz vieja.
 *  - mode 'warn' (default): isVouched sigue devolviendo el booleano real, pero
 *    el router solo loguea los mismatch sin bloquear — preserva 100% la
 *    funcionalidad existente. mode 'enforce': el router bloquea rutas no
 *    vouched (se activa por flujo tras migrar el frontend + smokes).
 *  - voucherFor devuelve el "ancla" (archivo exacto o raiz) que voucha un path,
 *    usado por deriveAllowedRoots para inyectar allowed_roots en el backend.
 *    assert_path_within_root usa relative_to, asi un path pasa si es igual al
 *    ancla (read-file/write-file) o esta bajo el (read-root/write-root).
 */
const path = require('path');

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 min, renovable al reusar

function _canonical(absPath) {
  if (typeof absPath !== 'string' || !absPath) return null;
  const resolved = path.resolve(absPath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function _isUnder(candidate, root) {
  // candidate y root ya canonicalizados
  if (candidate === root) return true;
  const sep = process.platform === 'win32' ? '\\' : '/';
  return candidate.startsWith(root + sep);
}

function createVouchedPaths({ mode = 'warn', ttlMs = DEFAULT_TTL_MS, now = Date.now } = {}) {
  // anchor -> expiresAt
  const readFiles = new Map();
  const readRoots = new Map();
  const writeFiles = new Map();
  const writeRoots = new Map();

  function _prune(map) {
    const t = now();
    for (const [k, exp] of map) if (exp <= t) map.delete(k);
  }

  function _register(map, absPath) {
    const c = _canonical(absPath);
    if (!c) return;
    map.set(c, now() + ttlMs); // renueva el TTL al reusar
  }

  function registerReadFile(absPath) { _register(readFiles, absPath); }
  function registerReadRoot(absPath) { _register(readRoots, absPath); }
  function registerWriteFile(absPath) { _register(writeFiles, absPath); }
  function registerWriteRoot(absPath) { _register(writeRoots, absPath); }

  function _voucherFor(canonical, files, roots) {
    if (files.has(canonical)) return canonical; // archivo exacto
    for (const root of roots.keys()) {
      if (_isUnder(canonical, root)) return root; // bajo una raiz
    }
    return null;
  }

  /**
   * Devuelve el ancla (string canonical) que voucha absPath, o null.
   * kind: 'read' | 'write'. Purga expirados antes de consultar.
   */
  function voucherFor(absPath, kind = 'read') {
    const c = _canonical(absPath);
    if (!c) return null;
    if (kind === 'write') {
      _prune(writeFiles); _prune(writeRoots);
      return _voucherFor(c, writeFiles, writeRoots);
    }
    _prune(readFiles); _prune(readRoots);
    return _voucherFor(c, readFiles, readRoots);
  }

  function isVouched(absPath, kind = 'read') {
    return voucherFor(absPath, kind) !== null;
  }

  /**
   * Dada una lista de paths de un request IPC, devuelve el conjunto dedup de
   * anclas que los vouchan (para inyectar como allowed_roots en el backend), o
   * null si alguno no esta vouched. El router decide en warn/enforce que hacer
   * con el null.
   */
  function deriveAllowedRoots(pathList, kind = 'read') {
    if (!Array.isArray(pathList) || pathList.length === 0) return [];
    const anchors = new Set();
    for (const p of pathList) {
      const anchor = voucherFor(p, kind);
      if (!anchor) return null;
      anchors.add(anchor);
    }
    return [...anchors];
  }

  /**
   * Variante para un request con paths de lectura Y escritura: devuelve
   * { roots, missing } donde roots es la union de anclas y missing la lista de
   * paths sin voucher. El router inyecta roots solo si missing esta vacio.
   */
  function deriveRequestRoots({ read = [], write = [] } = {}) {
    const anchors = new Set();
    const missing = [];
    for (const p of read) {
      const a = voucherFor(p, 'read');
      if (a) anchors.add(a); else missing.push(p);
    }
    for (const p of write) {
      const a = voucherFor(p, 'write');
      if (a) anchors.add(a); else missing.push(p);
    }
    return { roots: [...anchors], missing };
  }

  function clearAll() {
    readFiles.clear(); readRoots.clear(); writeFiles.clear(); writeRoots.clear();
  }

  function snapshot() {
    return {
      mode,
      readFiles: [...readFiles.keys()],
      readRoots: [...readRoots.keys()],
      writeFiles: [...writeFiles.keys()],
      writeRoots: [...writeRoots.keys()],
    };
  }

  return {
    getMode: () => mode,
    registerReadFile, registerReadRoot, registerWriteFile, registerWriteRoot,
    voucherFor, isVouched, deriveAllowedRoots, deriveRequestRoots,
    clearAll, snapshot,
  };
}

module.exports = { createVouchedPaths, _canonical, _isUnder, DEFAULT_TTL_MS };
