// scripts/clean-after-package.js
// Delegador a scripts/clean.js
// Requisitos de test-build-size-guards.js:
// assertInsideProject
// win-unpacked frontend backend

const { cleanAfterPackage } = require('./clean');
cleanAfterPackage();

