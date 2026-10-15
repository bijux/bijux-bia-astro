import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, cp, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {inventory,fileHashes,inputBytes} from "../../../../scripts/security/inventory.mjs";
import {run} from "../../../../scripts/security/execution.mjs";
import {interpretAudit} from "../../../../scripts/security/dependencies.mjs";
import {normalizeLint,exitFor,renderReport,safeText} from "../../../../scripts/security/reporting.mjs";

const kit = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
async function temporary(callback) {
  const output = resolve(kit,'artifacts/security/tooling-fixtures');
  await mkdir(output,{recursive:true});
  const root = await mkdtemp(resolve(output,'application-'));
  try { return await callback(root); } finally { await rm(root, { recursive: true, force: true }); }
}
async function put(root, name, value = '') {
  const path = resolve(root, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
}
function auditDocument(vulnerabilities = {}) {
  const counts = {info:0,low:0,moderate:0,high:0,critical:0,total:Object.keys(vulnerabilities).length};
  for (const value of Object.values(vulnerabilities)) if (Object.hasOwn(counts,value.severity)) counts[value.severity]++;
  return { auditReportVersion: 2, vulnerabilities, metadata: { vulnerabilities: counts } };
}
function auditResult(document = auditDocument(), code = 0) { return { code, stdout: JSON.stringify(document), stderr: '', failure: null, signal: null }; }
const advisory = { name:'example', isDirect:true, effects:[], severity: 'high', range: '<2', via: [{ source:1, name: 'example', title: 'Synthetic test only', severity:'high',range:'<2',url: 'https://example.invalid/advisory' }], nodes: ['node_modules/example'], fixAvailable: true };
const diagnostic = { filePath: '/repo/src/example.js', messages: [{ ruleId: 'no-eval', severity: 2, line: 3, column: 1, message: 'eval can be harmful.' }] };

test('status: clean', () => assert.equal(exitFor({}), 0));
test('status: candidates', () => assert.equal(exitFor({ findings: [{}] }), 1));
test('status: incomplete takes precedence over findings', () => assert.equal(exitFor({ incomplete: true, findings: [{}] }), 2));
test('inventory includes Astro, JS, TS, root config and untracked public code', () => temporary(async root => {
  for (const name of ['src/Page.astro', 'src/a.ts', 'public/browser.js', 'scripts/helper.mjs', 'astro.config.mjs']) await put(root, name);
  const result = await inventory(root);
  assert.equal(result.code.length, 5); assert.deepEqual(result.errors, []);
}));
test('inventory does not mislabel HTML, MDX or YAML as JS-scanned', () => temporary(async root => {
  for (const name of ['src/a.html', 'src/b.mdx', '.github/workflows/a.yml']) await put(root, name);
  const result = await inventory(root); assert.equal(result.code.length, 0); assert.equal(result.other.length, 3);
}));
test('inventory scans source directories even when their names resemble generated output', () => temporary(async root => {
  await put(root, 'src/a.js'); await put(root, 'src/dist/generated.js'); await put(root, 'tools/artifacts/generated.ts');
  const result = await inventory(root); assert.deepEqual(result.code, ['src/a.js','src/dist/generated.js','tools/artifacts/generated.ts']);
}));
test('inventory records missing mandatory src', () => temporary(async root => {
  const result = await inventory(root); assert.ok(result.errors.some(e => e.includes('src: ENOENT')));
}));
test('inventory refuses silently following source symlinks', () => temporary(async root => {
  await put(root, 'src/a.js'); await symlink(resolve(root, 'src/a.js'), resolve(root, 'src/link.js'));
  const result = await inventory(root); assert.ok(result.errors.some(e => e.includes('Symlink')));
}));
test('file hashes change when actual source changes', () => temporary(async root => {
  await put(root, 'src/a.js', 'one'); const before = await fileHashes(root, ['src/a.js']);
  await put(root, 'src/a.js', 'two'); assert.notDeepEqual(await fileHashes(root, ['src/a.js']), before);
}));
test('audit accepts a complete clean v2 report', () => { const x = interpretAudit(auditResult()); assert.equal(x.incomplete, false); assert.equal(x.findings.length, 0); });
test('audit reports a vulnerable package', () => { const x = interpretAudit(auditResult(auditDocument({ example: advisory }), 1)); assert.equal(x.incomplete, false); assert.equal(x.findings[0].kind, 'KNOWN_ADVISORY_MATCH'); });
test('audit includes low severity rather than silently discarding it', () => { const x = interpretAudit(auditResult(auditDocument({ example: { ...advisory, severity: 'low' } }), 1)); assert.equal(x.findings[0].severity, 'low'); });
test('audit still recognizes advisories even with a zero tool exit', () => { const x = interpretAudit(auditResult(auditDocument({ example: advisory }), 0)); assert.equal(exitFor(x), 1); });
test('audit rejects invalid JSON', () => assert.equal(interpretAudit({ code: 1, stdout: '<html>error</html>' }).incomplete, true));
test('audit registry error with exit 1 is not treated as a vulnerability finding', () => {
  const x = interpretAudit(auditResult({ error: { code: 'ENOTFOUND' } }, 1)); assert.equal(x.incomplete, true); assert.equal(x.findings.length, 0);
});
test('audit requires metadata totals', () => { const x = auditDocument(); delete x.metadata; assert.equal(interpretAudit(auditResult(x)).incomplete, true); });
test('audit rejects inconsistent totals', () => { const x = auditDocument(); x.metadata.vulnerabilities.total = 4; assert.equal(interpretAudit(auditResult(x)).incomplete, true); });
test('audit rejects unsupported schema version', () => { const x = auditDocument(); x.auditReportVersion = 1; assert.equal(interpretAudit(auditResult(x)).incomplete, true); });
test('audit rejects partial advisory records', () => assert.equal(interpretAudit(auditResult(auditDocument({ example: {} }), 1)).incomplete, true));
test('audit rejects nonzero result without evidence', () => assert.equal(interpretAudit(auditResult(auditDocument(), 1)).incomplete, true));
test('audit treats an invocation timeout as incomplete despite parseable output', () => assert.equal(interpretAudit({ ...auditResult(), failure: 'Timed out' }).incomplete, true));
test('audit treats a killed process as incomplete', () => assert.equal(interpretAudit({ ...auditResult(), signal: 'SIGKILL' }).incomplete, true));
test('audit does not discard findings when another record is malformed', () => {
  const x = interpretAudit(auditResult(auditDocument({ example: advisory, broken: {} }), 1)); assert.equal(x.incomplete, true); assert.equal(x.findings.length, 1);
});
test('lint normalizes original file and line and does not call it an exploit', () => {
  const x = normalizeLint([diagnostic], '/repo', { 'src/example.js': 'abc' }); assert.equal(x.findings[0].file, 'src/example.js'); assert.equal(x.findings[0].line, 3); assert.equal(x.findings[0].kind, 'REVIEW_CANDIDATE'); assert.equal(x.incomplete, false);
});
test('lint warnings remain candidates', () => { const x = structuredClone(diagnostic); x.messages[0].severity = 1; assert.equal(normalizeLint([x], '/repo').findings.length, 1); });
test('lint parser failure marks incomplete rather than clean', () => {
  const x = { filePath: '/repo/src/a.astro', messages: [{ fatal: true, ruleId: null, line: 1, message: 'Parse failed' }] };
  assert.equal(normalizeLint([x], '/repo').incomplete, true);
});
test('lint ignored-file warning with no rule ID is incomplete', () => {
  assert.equal(normalizeLint([{ filePath: '/repo/src/a.js', messages: [{ ruleId: null, message: 'File ignored' }] }], '/repo').incomplete, true);
});
test('lint rejects suppressed diagnostics', () => { const x = structuredClone(diagnostic); x.suppressedMessages = [{}]; assert.equal(normalizeLint([x], '/repo').incomplete, true); });
test('lint fingerprints change when source changes', () => {
  const a = normalizeLint([diagnostic], '/repo', { 'src/example.js': 'a' }); const b = normalizeLint([diagnostic], '/repo', { 'src/example.js': 'b' }); assert.notEqual(a.findings[0].fingerprint, b.findings[0].fingerprint);
});
test('lint normalization does not mutate raw input', () => { const before = JSON.stringify(diagnostic); normalizeLint([diagnostic], '/repo'); assert.equal(JSON.stringify(diagnostic), before); });
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
test('terminal control characters are neutralized in text evidence', () => assert.equal(safeText('x\u001b[31my'), 'x?[31my'));
test('report distinguishes unexecuted coverage and incomplete stages', () => {
  const text = renderReport({ runId: 'x', profile: 'all', status: 'INCOMPLETE', exitCode: 2, stages: [{ stage: 'code', incomplete: true, errors: ['missing tool'], findings: [] }] });
  assert.match(text, /NOT RUN/); assert.match(text, /ANALYSIS_ERROR missing tool/); assert.match(text, /not proof/);
});
async function runnerCopy(root) {
  for (const file of ['scripts/security/audit.mjs', 'scripts/security/inventory.mjs', 'scripts/security/execution.mjs', 'scripts/security/dependencies.mjs', 'scripts/security/reporting.mjs', 'scripts/security/scan-code.mjs','scripts/security/evidence.mjs','scripts/security/provenance.mjs']) {
    await mkdir(dirname(resolve(root, file)), { recursive: true }); await cp(resolve(kit, file), resolve(root, file));
  }
  await put(root, 'src/a.js', 'const safe = 1;');
  await run('git', ['init','--quiet',root]);
  const objects = await run('git', ['rev-parse','--git-path','objects'], {cwd:kit});
  const head = await run('git', ['rev-parse','HEAD'], {cwd:kit});
  await put(root,'.git/objects/info/alternates',resolve(kit,objects.stdout.trim())+'\n');
  await put(root,'.git/HEAD',head.stdout.trim()+'\n');
  await put(root,'.gitignore','/artifacts/\n');
  await put(root,'package.json',JSON.stringify({name:'security-fixture',version:'1.0.0',type:'module'}));
  await put(root,'package-lock.json',JSON.stringify({name:'security-fixture',version:'1.0.0',lockfileVersion:3,packages:{'':{name:'security-fixture',version:'1.0.0'}}}));
  await cp(resolve(kit,'configs/security/eslint.config.mjs'),resolve(root,'eslint-fixture.mjs'));
  await put(root,'configs/security/eslint.config.mjs',await readFile(resolve(root,'eslint-fixture.mjs'),'utf8'));
}
test('real runner with missing analyzers preserves a code report and returns 2', () => temporary(async root => {
  await runnerCopy(root);
  const x = await run(process.execPath, ['scripts/security/audit.mjs', 'code'], { cwd: root });
  assert.equal(x.code, 2); assert.match(await readFile(resolve(root, 'artifacts/security/code.log'), 'utf8'), /INCOMPLETE/);
  const directories = await readdir(resolve(root, 'artifacts/security/runs'));
  const report = JSON.parse(await readFile(resolve(root, 'artifacts/security/runs', directories[0], 'code.json'), 'utf8'));
  assert.equal(report.incomplete, true); assert.ok(report.errors.length);
}));
test('real runner refuses unlocked dependency audit without invoking the registry', () => temporary(async root => {
  await runnerCopy(root); await rm(resolve(root,'package-lock.json')); const x = await run(process.execPath, ['scripts/security/audit.mjs', 'deps'], { cwd: root });
  assert.equal(x.code, 2); assert.match(await readFile(resolve(root, 'artifacts/security/deps.log'), 'utf8'), /No unlocked audit fallback/);
}));
test('combined run records both unavailable stages rather than stopping at the first', () => temporary(async root => {
  await runnerCopy(root); await rm(resolve(root,'package-lock.json')); const x = await run(process.execPath, ['scripts/security/audit.mjs', 'all'], { cwd: root });
  assert.equal(x.code, 2); const text = await readFile(resolve(root, 'artifacts/security/security.log'), 'utf8');
  assert.match(text, /STAGE code: INCOMPLETE/); assert.match(text, /STAGE dependencies: INCOMPLETE/);
}));
test('code-only run never overwrites a combined report', () => temporary(async root => {
  await runnerCopy(root); await put(root, 'artifacts/security/security.log', 'old combined evidence');
  await run(process.execPath, ['scripts/security/audit.mjs', 'code'], { cwd: root });
  assert.equal(await readFile(resolve(root, 'artifacts/security/security.log'), 'utf8'), 'old combined evidence');
}));
test('runner refuses a skip argument', () => temporary(async root => {
  await runnerCopy(root); const x = await run(process.execPath, ['scripts/security/audit.mjs', 'all', '--skip'], { cwd: root }); assert.equal(x.code, 2); assert.match(x.stderr, /No skip/);
}));
test('test fixture leaves no source code inside artifact reports', () => temporary(async root => {
  await runnerCopy(root); await run(process.execPath, ['scripts/security/audit.mjs', 'all'], { cwd: root });
  const files = await readdir(resolve(root, 'artifacts/security'), { recursive: true });
  assert.equal(files.some(name => /\.(astro|js|mjs|ts)$/.test(name)), false);
}));

test('runner cannot pass a worker failure disguised by an empty findings report', () => temporary(async root => {
  await runnerCopy(root);
  await put(root, 'scripts/security/scan-code.mjs', `import {writeFile} from 'node:fs/promises';
    await writeFile(process.argv[2], JSON.stringify({stage:'code',incomplete:false,findings:[],errors:[]}));
    process.exitCode=1;`);
  const x = await run(process.execPath, ['scripts/security/audit.mjs','code'], {cwd:root});
  assert.equal(x.code,2);
  assert.match(await readFile(resolve(root,'artifacts/security/code.log'),'utf8'),/exit\/report mismatch/);
}));

test('audit rejects nested corruption and downgraded or missing severity totals', () => {
  for (const change of [
    value => { delete value.metadata.vulnerabilities.high; },
    value => { value.metadata.vulnerabilities.high = 0; value.metadata.vulnerabilities.low = 1; },
    value => { value.vulnerabilities.example.via[0].url = 'javascript:inert'; },
    value => { value.vulnerabilities.example.via = ['absent']; },
    value => { value.vulnerabilities.example.nodes = [null]; },
    value => { value.vulnerabilities.example.fixAvailable = { version:'2' }; },
  ]) {
    const value = structuredClone(auditDocument({example:advisory})); change(value);
    assert.equal(interpretAudit(auditResult(value,1)).incomplete,true);
  }
});
test('dependency aliases require a reachable advisory, including through cycles', () => {
  const a = { ...advisory, name: 'a', via: ['b'] };
  const b = { ...advisory, name: 'b', via: ['a'] };
  assert.equal(interpretAudit(auditResult(auditDocument({ a, b }), 1)).incomplete, true);
  assert.equal(interpretAudit(auditResult(auditDocument({ a: { ...a, via: ['a'] } }), 1)).incomplete, true);
  b.via = ['a', advisory.via[0]];
  assert.equal(interpretAudit(auditResult(auditDocument({ a, b }), 1)).incomplete, false);
});

test('source changes after lint cannot pass merely because Git status remains dirty', () => temporary(async root => {
  await runnerCopy(root);
  await put(root, 'scripts/security/scan-code.mjs', `
    import {writeFile} from 'node:fs/promises';
    import {resolve} from 'node:path';
    import {inventory,fileHashes} from './inventory.mjs';
    const selected = await inventory(process.cwd());
    const report = {stage:'code',incomplete:false,findings:[],errors:[],
      probes:Array.from({length:15},()=>({passed:true})),inventory:selected,
      hashes:await fileHashes(process.cwd(),selected.code),
      raw:selected.code.map(file=>({filePath:resolve(file),messages:[]}))};
    await writeFile(process.argv[2],JSON.stringify(report));
    await writeFile('src/a.js','const changedAfterLint = true;');
  `);
  const result = await run(process.execPath, ['scripts/security/audit.mjs', 'code'], {cwd:root});
  assert.equal(result.code, 2);
  assert.match(await readFile(resolve(root, 'artifacts/security/code.log'), 'utf8'), /Source inputs changed before the audit completed/);
}));
test('lint refuses empty/missing results, foreign paths and malformed locations/counts', () => {
  for (const value of [[],[{}],[{...diagnostic,filePath:'/outside/file.js'}],[{...diagnostic,messages:null}],[{...diagnostic,errorCount:0}],[{...diagnostic,messages:[{...diagnostic.messages[0],column:-1}]}]]) assert.equal(normalizeLint(value,'/repo').incomplete,true);
});
test('root configs and source paths named dist are inventoried; pipes are rejected before reads', () => temporary(async root => {
  await put(root,'src/dist/entry.js','safe'); await put(root,'configs/security/check.mjs','safe');
  await put(root,'deployment/worker.mjs','safe'); await put(root,'Dockerfile','FROM node');
  await run('mkfifo',[resolve(root,'src/input.js')]);
  const result = await inventory(root);
  assert(result.code.includes('configs/security/check.mjs')); assert(result.code.includes('src/dist/entry.js'));
  assert(result.code.includes('deployment/worker.mjs')); assert(result.other.includes('Dockerfile'));
  assert(result.errors.some(value=>value.includes('Non-regular')));
  await assert.rejects(inputBytes(root,'src/input.js'),/Non-regular/);
  await assert.rejects(inputBytes(root,'../outside.js'),/Invalid/);
}));
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
test('a Git-free fixture cannot inherit its parent checkout provenance', () => temporary(async root => {
  await runnerCopy(root); await rm(resolve(root,'.git'),{recursive:true});
  const result=await run(process.execPath,['scripts/security/audit.mjs','code'],{cwd:root});
  assert.equal(result.code,2);
  assert.match(await readFile(resolve(root,'artifacts/security/code.log'),'utf8'),/different repository root/);
}));
test('an evidence-directory symlink cannot redirect scanner writes outside its owned folder', () => temporary(async root => {
  await runnerCopy(root); await mkdir(resolve(root,'protected'));
  await mkdir(resolve(root,'artifacts')); await symlink(resolve(root,'protected'),resolve(root,'artifacts/security'));
  const result=await run(process.execPath,['scripts/security/audit.mjs','code'],{cwd:root});
  assert.equal(result.code,2); assert.match(result.stderr,/unsafe or unavailable/);
  assert.deepEqual(await readdir(resolve(root,'protected')),[]);
}));

test('a blocked evidence filename exits incomplete before launching an analyzer', () => temporary(async root => {
  await runnerCopy(root);
  await mkdir(resolve(root,'artifacts/security/code.log'),{recursive:true});
  await put(root,'scripts/security/scan-code.mjs',`import {writeFile} from 'node:fs/promises'; await writeFile('analyzer-launched','unexpected');`);
  const result=await run(process.execPath,['scripts/security/audit.mjs','code'],{cwd:root});
  assert.equal(result.code,2); assert.match(result.stderr,/INCOMPLETE/);
  assert.equal((await readdir(root)).includes('analyzer-launched'),false);
}));

test('a file cannot stand in for the required application source directory', () => temporary(async root => {
  await put(root,'src','not a source directory'); await put(root,'scripts/audit.mjs','safe');
  assert((await inventory(root)).errors.some(value=>value.includes('not a directory')));
}));
