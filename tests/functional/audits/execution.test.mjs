import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../../scripts/audits/execution.mjs';

test('subprocess captures unsuccessful stdout/stderr and exit', async () => {
  const x = await run(process.execPath, ['-e', 'console.log("evidence");console.error("diagnostic");process.exit(7)']);
  assert.equal(x.code, 7); assert.match(x.stdout, /evidence/); assert.match(x.stderr, /diagnostic/);
});
test('subprocess command-not-found is explicit', async () => assert.ok((await run('/definitely/not/a/tool', [])).failure));
test('subprocess time limit fails visibly', async () => {
  const x = await run(process.execPath, ['-e', 'setTimeout(()=>{},10000)'], { timeout: 100 }); assert.match(x.failure, /Timed out/);
});
test('subprocess output bound fails visibly', async () => {
  const x = await run(process.execPath, ['-e', 'process.stdout.write("a".repeat(10000))'], { maxBytes: 20 }); assert.match(x.failure, /Output limit/);
});
test('subprocess preserves split UTF-8 sequences', async () => {
  const x = await run(process.execPath, ['-e', 'const b=Buffer.from("µ染");for(const v of b)process.stdout.write(Buffer.from([v]));']); assert.equal(x.stdout, 'µ染');
});
test('a successful parent cannot leave a grandchild holding its output pipes open', { timeout: 15000 }, async t => {
  const result = await run(process.execPath, ['-e', `
    const { spawn } = require('node:child_process');
    // Exercise delayed startup before the descendant acknowledges readiness.
    setTimeout(() => {
      const child = spawn(process.execPath, ['-e', "process.send('ready'); setInterval(() => {}, 1000);"],
        { stdio: ['ignore', 1, 2, 'ipc'] });
      child.once('message', () => {
        process.stdout.write(JSON.stringify({ pid: child.pid, group: process.pid }) + '\\n', () => process.exit(0));
      });
    }, 400);
  `], { timeout: 10000 });
  const { pid, group } = JSON.parse(result.stdout.trim());
  assert(Number.isSafeInteger(pid) && pid > 0);
  assert(Number.isSafeInteger(group) && group > 0);
  t.after(() => {
    try { process.kill(-group, 'SIGKILL'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  });
  assert.equal(result.code, 0);
  assert.match(result.failure, /Child exited without closing its output streams/);
  // Reaping is asynchronous; do not assume the orphan disappears in a fixed 100 ms.
  const deadline = Date.now() + 2000;
  while (true) {
    try { process.kill(pid, 0); }
    catch (error) { if (error.code === 'ESRCH') break; throw error; }
    assert(Date.now() < deadline, 'The grandchild must terminate with its process group.');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
});

test('an analyser cannot extend its deadline by handling SIGTERM', { timeout: 10000 }, async () => {
    const result = await run(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); console.log("ready"); setTimeout(() => process.exit(0), 7000);'], { timeout: 3000 });
    assert.match(result.stdout, /ready/); assert.equal(result.code, null);
    assert.equal(result.signal, 'SIGKILL'); assert.equal(result.failure, 'Timed out');
});
