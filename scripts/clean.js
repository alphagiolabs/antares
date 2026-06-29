const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function assertInsideProject(targetPath) {
  const relative = path.relative(projectRoot, targetPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to clean path outside project: ${targetPath}`);
  }
}

function cleanDistElectron() {
  const outputDir = path.join(projectRoot, 'dist-electron');
  assertInsideProject(outputDir);
  fs.rmSync(outputDir, { recursive: true, force: true });
  console.log(`[clean-dist-electron] Removed ${outputDir}`);
}

function cleanAfterPackage() {
  const targets = [
    path.join(projectRoot, 'dist-electron', 'win-unpacked'),
    path.join(projectRoot, 'dist-electron', 'linux-unpacked'),
    path.join(projectRoot, 'dist-electron', 'mac'),
    path.join(projectRoot, 'dist'),
    path.join(projectRoot, 'frontend', 'dist'),
    path.join(projectRoot, 'backend', 'build'),
    path.join(projectRoot, 'backend', 'dist'),
  ];
  for (const target of targets) {
    assertInsideProject(target);
    fs.rmSync(target, { recursive: true, force: true });
    console.log(`[clean-after-package] Removed ${target}`);
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--dist-electron')) {
    cleanDistElectron();
  } else if (args.includes('--after-package')) {
    cleanAfterPackage();
  } else {
    console.error('Please specify --dist-electron or --after-package');
    process.exit(1);
  }
}

module.exports = {
  cleanDistElectron,
  cleanAfterPackage,
  assertInsideProject,
};
