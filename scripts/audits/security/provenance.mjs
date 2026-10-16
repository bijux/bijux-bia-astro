import { realpath } from 'node:fs/promises';
import { run } from '../execution.mjs';

export async function gitProvenance(root) {
  const args = ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null'];
  const outputs = await Promise.all([
    run('git', [...args, 'rev-parse', '--show-toplevel'], { cwd: root, timeout: 10000 }),
    run('git', [...args, 'rev-parse', 'HEAD'], { cwd: root, timeout: 10000 }),
    run('git', [...args, 'status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, timeout: 10000 }),
  ]);
  if (outputs.some(result => result.code !== 0 || result.failure || result.signal) || !/^[a-f\d]{40,64}$/.test(outputs[1].stdout.trim()) || await realpath(outputs[0].stdout.trim()) !== await realpath(root)) throw new Error('Git provenance is unavailable or belongs to a different repository root.');
  return { head: outputs[1].stdout.trim(), status: outputs[2].stdout, commands: outputs.map(({ stdout, stderr, ...command }) => command) };
}
