#!/usr/bin/env node
/**
 * SEC-005 — Activa la verificación de firma de updates cuando hay certificado
 * de firma en CI. No-op sin cert (builds sin firma = comportamiento
 * actual, dev/local intactos).
 *
 * electron-builder firma los instaladores Windows vía los env CSC_LINK
 * (base64 del .pfx) y CSC_KEY_PASSWORD; ese mecanismo es documentado y no
 * requiere tocar electron-builder.yml. Este script sólo flípa
 * `win.verifyUpdateCodeSignature` a true para que el cliente ya firmado
 * verifique las firmas de los updates con electron-updater (rechaza updates
 * no firmados o con firma inválida). Sin cert, se deja false (necesario para
 * que electron-updater acepte updates sobre builds sin firma).
 *
 * Bug corregido: el gate original leía `process.env.WINDOWS_CERT_B64`, pero el
 * workflow de release mapea `CSC_LINK: secrets.WINDOWS_CERT_B64` — el env que
 * llega a este proceso es `CSC_LINK`, no `WINDOWS_CERT_B64`. Sin el fix el
 * script no-op'aba aunque el build estuviera firmado, dejando
 * verifyUpdateCodeSignature=false para siempre. WINDOWS_CERT_B64 se acepta
 * como alias legacy.
 *
 * Uso: node scripts/enable-build-signing.js [path/to/electron-builder.yml]
 */
const fs = require('fs');
const path = require('path');

const configPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'electron-builder.yml');

if (!process.env.CSC_LINK && !process.env.WINDOWS_CERT_B64) {
  console.log('[signing] Sin CSC_LINK — build sin firma (comportamiento actual).');
  process.exit(0);
}

const yml = fs.readFileSync(configPath, 'utf8');
// Preserva la indentación; \b tras false evita matchear "falsey".
const flipped = yml.replace(
  /(^|\n)(\s*)verifyUpdateCodeSignature:\s*false\b/,
  '$1$2verifyUpdateCodeSignature: true',
);
if (flipped !== yml) {
  fs.writeFileSync(configPath, flipped);
  console.log('[signing] Cert presente — verifyUpdateCodeSignature => true (el cliente verificará firmas de update).');
} else {
  console.log('[signing] verifyUpdateCodeSignature ya es true/ausente — sin cambios.');
}
