const { execSync } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const args = process.argv.slice(2).join(' ') || '--win nsis';

console.log('Building Electron bundle (base: "./")...');
execSync('node ./node_modules/vite/bin/vite.js build', {
  cwd: rootDir,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_BUILD: 'true' }
});

console.log(`Running electron-builder ${args}...`);
execSync(`node ./node_modules/electron-builder/out/cli/cli.js ${args}`, {
  cwd: rootDir,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_BUILD: 'true' }
});

console.log('Electron build finished successfully!');
