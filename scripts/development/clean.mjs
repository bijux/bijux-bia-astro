import { lstatSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outputs = ['dist', '.astro', '.netlify'];

try {
  if (process.argv.length !== 2) throw new Error('Usage: npm run clean');
  // Check the entire allowlist before deleting any output.
  for (const output of outputs) {
    const tracked = spawnSync('git', ['ls-files', '-z', '--', output], {
      cwd: root, encoding: 'utf8', timeout: 10000,
    });
    if (tracked.error || tracked.status !== 0 || tracked.stdout.length) {
      throw new Error(`Refusing cleanup of tracked or unverifiable output: ${output}`);
    }
    const path = resolve(root, output);
    const entry = lstatSync(path, { throwIfNoEntry: false });
    if (entry && (!entry.isDirectory() || entry.isSymbolicLink())) {
      throw new Error(`Refusing cleanup of non-directory output: ${output}`);
    }
  }
  for (const output of outputs) rmSync(resolve(root, output), { recursive: true, force: true });
  console.log(`Removed generated outputs: ${outputs.join(', ')}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
