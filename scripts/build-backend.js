const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..');

// Find Python from venv312 or system
const venvPython = path.join(projectRoot, 'venv312', 'Scripts', 'python.exe');
const pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python';
const backendDir = path.join(projectRoot, 'backend');
const distDir = path.join(projectRoot, 'dist');
const specFile = path.join(backendDir, 'backend.spec');
const pyInstallerBuild = path.join(backendDir, 'build');
const pyInstallerDist = path.join(backendDir, 'dist');
const staleBackendNames = ['AntaresBackend.exe', 'HidroConvertBackend.exe', 'AntaresBackend'];

function assertInsideProject(targetPath) {
  const relative = path.relative(projectRoot, targetPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to clean path outside project: ${targetPath}`);
  }
}

function removePath(targetPath) {
  assertInsideProject(targetPath);
  fs.rmSync(targetPath, { recursive: true, force: true });
}

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

console.log('[build-backend] Building Python backend with PyInstaller...');

let failed = false;
try {
  removePath(pyInstallerBuild);
  removePath(pyInstallerDist);
  for (const staleName of staleBackendNames) {
    removePath(path.join(distDir, staleName));
  }

  execSync(
    `"${pythonCmd}" -m PyInstaller "${specFile}" --noconfirm`,
    {
      cwd: backendDir,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' }
    }
  );
  // PyInstaller ONE-DIR mode puts output in backend/dist/AntaresBackend; move to project dist/AntaresBackend
  const pyInstallerFolder = path.join(pyInstallerDist, 'AntaresBackend');
  const targetFolder = path.join(distDir, 'AntaresBackend');

  if (fs.existsSync(pyInstallerFolder)) {
    fs.cpSync(pyInstallerFolder, targetFolder, { recursive: true, force: true });
    console.log(`[build-backend] Backend directory copied to ${targetFolder}`);
  } else {
    console.warn('[build-backend] Warning: AntaresBackend directory not found in expected location');
  }
  console.log('[build-backend] Backend build completed.');
} catch (err) {
  console.error('[build-backend] Failed to build backend:', err.message);
  failed = true;
} finally {
  removePath(pyInstallerBuild);
  removePath(pyInstallerDist);
}

if (failed) {
  process.exit(1);
}
