import { spawn } from 'node:child_process';

/** Bound the process group and its output; inherited pipes cannot extend the deadline. */
export function run(command, args, { cwd, env, timeout = 180000, maxBytes = 32 * 1024 * 1024 } = {}) {
  if (![timeout, maxBytes].every(value => Number.isSafeInteger(value) && value > 0)) throw new RangeError('Invalid subprocess limits.');
  return new Promise(resolvePromise => {
    const stdout = [], stderr = [];
    let size = 0, failure = null, settled = false, forcedFinish;
    const started = Date.now();
    const grouped = process.platform !== 'win32';
    const child = spawn(command, args, { cwd, env, shell: false, detached: grouped, stdio: ['ignore', 'pipe', 'pipe'] });
    function kill() {
      try { if (grouped && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); }
      catch (error) { if (error.code !== 'ESRCH') failure ??= `Termination failed: ${error.code}`; }
    }
    function finish(code, signal) {
      if (settled) return;
      settled = true;
      clearTimeout(timer); clearTimeout(forcedFinish);
      child.stdout?.destroy(); child.stderr?.destroy();
      resolvePromise({ command, args, code, signal, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), failure, milliseconds: Date.now() - started });
    }
    function stop(reason) {
      failure ??= reason;
      kill();
      // Also bound completion if a descendant created another session or kept pipes open.
      forcedFinish ??= setTimeout(() => finish(child.exitCode, child.signalCode), 250);
    }
    const timer = setTimeout(() => stop('Timed out'), timeout);
    function collect(target, chunk) {
      const available = Math.max(0, maxBytes - size);
      if (available) target.push(chunk.subarray(0, available));
      size += chunk.length;
      if (size > maxBytes) stop('Output limit exceeded');
    }
    child.stdout?.on('data', chunk => collect(stdout, chunk));
    child.stderr?.on('data', chunk => collect(stderr, chunk));
    child.on('error', error => { failure = error.message; finish(null, null); });
    child.on('exit', () => {
      // A successful parent must not conceal a still-running tool descendant.
      forcedFinish ??= setTimeout(() => { forcedFinish = null; stop('Child exited without closing its output streams'); }, 250);
    });
    child.on('close', finish);
  });
}
