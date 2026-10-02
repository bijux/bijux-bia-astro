import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const command = process.argv[2];

if (process.argv.length !== 3 || !['doctor', 'install', '--help'].includes(command)) {
  console.error('Usage: node scripts/development/bootstrap.mjs doctor|install|--help');
  process.exit(2);
}
if (command === '--help') {
  console.log('doctor: inspect developer Node/npm versions without installing');
  console.log('install: require the declared versions, then run npm ci');
  process.exit(0);
}

try {
  const expected = JSON.parse(readFileSync(resolve(root, 'configs/development/toolchain.json'), 'utf8'));
  if (Object.keys(expected).sort().join(',') !== 'node,npm'
      || ![expected.node, expected.npm].every(value => /^\d+\.\d+\.\d+$/.test(value))) {
    throw new Error('Invalid developer toolchain declaration.');
  }
  const npmVersion = spawnSync('npm', ['--version'], {
    cwd: root, encoding: 'utf8', timeout: 10000,
  });
  if (npmVersion.error || npmVersion.status !== 0) {
    throw new Error('Cannot inspect npm. Install the declared Node distribution and put its bin directory on PATH.');
  }
  const observed = { node: process.versions.node, npm: npmVersion.stdout.trim() };
  let matches = true;
  for (const name of ['node', 'npm']) {
    console.log(`${name}: observed ${observed[name]}, required ${expected[name]}`);
    matches &&= observed[name] === expected[name];
  }
  if (!matches) {
    throw new Error('Developer toolchain mismatch. Select the versions in configs/development/toolchain.json before installing.');
  }
  if (command === 'install') {
    const result = spawnSync('npm', ['ci'], {
      cwd: root, stdio: 'inherit',
      env: { ...process.env, npm_config_cache: resolve(root, 'artifacts/npm-cache') },
    });
    if (result.error) throw new Error('Cannot start npm ci.');
    if (result.signal) throw new Error(`npm ci terminated by ${result.signal}.`);
    process.exitCode = result.status;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
