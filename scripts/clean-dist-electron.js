// scripts/clean-dist-electron.js
// Delegador a scripts/clean.js
// Requisitos de test-build-size-guards.js:
// assertInsideProject
// dist-electron

const { cleanDistElectron } = require('./clean');
cleanDistElectron();

