#!/usr/bin/env node
// Configured source and locked-dependency checks retain their independent evidence.
import { ownedDirectory, saveEvidence } from './evidence.mjs';
import { gitProvenance } from './provenance.mjs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {run} from '../audit/execution.mjs';
import {sha256,inputBytes,inventory,fileHashes} from './inventory.mjs';
import {exitFor,renderReport,normalizeLint} from './reporting.mjs';

const args = process.argv.slice(2), profile = args[0] ?? 'all';
if (args.length > 1 || !['all', 'code', 'deps'].includes(profile)) {
  console.error('Usage: node scripts/security/audit.mjs [all|code|deps]. No skip/fix/suppression flags.');
  process.exitCode = 2;
} else {
  try {
  const root = process.cwd(), start = new Date();
  const runId = `${start.toISOString().replaceAll(':', '-')}-${process.pid}`;
  const base = resolve(root, 'artifacts/security'), dir = resolve(base, 'runs', runId);
  const report = { schemaVersion: 1, runId, profile, node: process.version, startedAt: start.toISOString(), stages: [] };
  try { await ownedDirectory(root, `artifacts/security/runs/${runId}`); } catch { console.error('INCOMPLETE: evidence storage is unsafe or unavailable.'); process.exit(2); }
  async function save(name, value) { await saveEvidence(resolve(dir, name), value); }
  report.status = 'IN_PROGRESS'; report.exitCode = 2;
  const latestName = profile === 'all' ? 'security.log' : `${profile}.log`;
  await save('report.json', JSON.stringify(report, null, 2) + '\n');
  await saveEvidence(resolve(base, latestName), renderReport(report));
  async function capture(name, result) {
    await save(`${name}.stdout.log`, result.stdout);
    await save(`${name}.stderr.log`, result.stderr);
    const { stdout, stderr, ...command } = result;
    await save(`${name}.command.json`, JSON.stringify(command, null, 2) + '\n');
  }
  try {
    const before = await gitProvenance(root);
    report.head = before.head;
    report.gitStatus = before.status;
    await save('provenance-before.json', JSON.stringify(before, null, 2) + '\n');
    report.hashes = {};
    for (const name of ['package.json', 'package-lock.json', 'configs/audits/security/eslint.config.mjs']) {
      try { report.hashes[name] = sha256(await inputBytes(root, name)); }
      catch { report.hashes[name] = null; }
    }
    if (Object.values(report.hashes).some(value => value === null)) throw new Error('Required package/config inputs are unavailable. No unlocked audit fallback.');
    const manifest = JSON.parse((await inputBytes(root, 'package.json')).toString('utf8'));
    const lock = JSON.parse((await inputBytes(root, 'package-lock.json')).toString('utf8'));
    if (lock.lockfileVersion !== 3 || !lock.packages?.[''] || ['dependencies','devDependencies','optionalDependencies'].some(field => JSON.stringify(Object.entries(manifest[field] ?? {}).sort()) !== JSON.stringify(Object.entries(lock.packages[''][field] ?? {}).sort()))) throw new Error('Manifest and locked dependency declarations disagree.');
    const files = ['audit.mjs','scan-code.mjs','inventory.mjs','dependencies.mjs','reporting.mjs','evidence.mjs','provenance.mjs'];
    for (const name of files) report.hashes[`scripts/security/${name}`] = sha256(await inputBytes(root, `scripts/security/${name}`));
    report.hashes['scripts/audit/execution.mjs'] = sha256(await inputBytes(root, 'scripts/audit/execution.mjs'));
    if (profile !== 'deps') {
      const worker = fileURLToPath(new URL('./scan-code.mjs', import.meta.url));
      const result = await run(process.execPath, [worker, resolve(dir, 'code.json')], { cwd: root });
      await capture('eslint', result);
      let stage;
      try {
        stage = JSON.parse((await inputBytes(root, relative(root, resolve(dir, 'code.json')), 32 * 1024 * 1024)).toString('utf8'));
        if (stage.stage !== 'code' || !Array.isArray(stage.findings) || !Array.isArray(stage.errors) || !stage.errors.every(value => typeof value === 'string') || typeof stage.incomplete !== 'boolean' || !stage.incomplete && (stage.errors.length || !Array.isArray(stage.probes) || stage.probes.length !== 15 || stage.probes.some(value => value.passed !== true) || !Array.isArray(stage.inventory?.code) || !stage.inventory.code.length || !stage.inventory.code.every(value => /^[a-f\d]{64}$/.test(stage.hashes?.[value])) || !Array.isArray(stage.raw) || stage.raw.length !== stage.inventory.code.length)) throw new Error('Invalid or incomplete code report schema');
        if (!stage.incomplete) {
          const normalized = normalizeLint(stage.raw, root, stage.hashes);
          const returnedFiles = stage.raw.map(value => relative(root, value.filePath)).sort();
          if (normalized.incomplete || JSON.stringify(normalized.findings) !== JSON.stringify(stage.findings) || JSON.stringify(returnedFiles) !== JSON.stringify([...stage.inventory.code].sort())) throw new Error('Code summary disagrees with raw diagnostics or selected-file coverage.');
        }
      } catch (error) { stage = { stage: 'code', incomplete: true, findings: [], errors: [error.message] }; }
      if (result.failure || result.signal || ![0, 1, 2].includes(result.code)) {
        stage.incomplete = true; stage.errors.push(result.failure || `Worker exit=${result.code}`);
      }
      const expectedCode = exitFor(stage);
      if (result.code !== expectedCode) {
        stage.incomplete = true;
        stage.errors.push(`Worker exit/report mismatch: exit=${result.code}, report expected=${expectedCode}`);
      }
      // Preserve detailed probes/inventory in code.json; avoid embedding all raw messages twice.
      const { raw, ...summary } = stage;
      report.stages.push(summary);
    }
    if (profile !== 'code') {
      let stage;
      if (!report.hashes['package-lock.json'] || !report.hashes['package.json']) {
        stage = { stage: 'dependencies', incomplete: true, findings: [], errors: ['package.json and package-lock.json are required. No unlocked audit fallback.'] };
      } else {
        const { interpretAudit } = await import('./dependencies.mjs');
        const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        // Explicit includes override production-only omission. Exactly one registry audit.
        const result = await run(npm, ['audit', '--json', '--package-lock-only', '--ignore-scripts',
          '--include=prod', '--include=dev', '--include=optional', '--include=peer', '--audit-level=info',
          '--fetch-retries=0', '--fetch-timeout=60000', '--registry=https://registry.npmjs.org/'], { cwd: root, timeout: 90000 });
        await capture('npm-audit', result);
        stage = interpretAudit(result);
        // Retain raw JSON when present, including npm's error envelope.
        try { await save('npm-audit.json', JSON.stringify(JSON.parse(result.stdout), null, 2) + '\n'); } catch { /* stdout retained */ }
        const version = await run(npm, ['--version'], { cwd: root, timeout: 10000 });
        if (version.code !== 0 || version.failure || version.signal) { stage.incomplete = true; stage.errors.push('npm version could not be verified.'); }
        report.npm = version.code === 0 ? version.stdout.trim() : 'unavailable';
        report.registry = 'https://registry.npmjs.org/';
      }
      report.stages.push(stage);
    }
    // Source must still match the completed code analysis after the registry stage too.
    const codeStage = report.stages.find(stage => stage.stage === 'code' && !stage.incomplete);
    if (codeStage) {
      const current = await inventory(root);
      const hashes = await fileHashes(root, codeStage.inventory.code);
      if (current.errors.length || JSON.stringify(current.code) !== JSON.stringify(codeStage.inventory.code) ||
          codeStage.inventory.code.some(name => hashes[name] !== codeStage.hashes[name])) {
        report.stages.push({ stage: 'input-integrity', incomplete: true, findings: [], errors: ['Source inputs changed before the audit completed.', ...current.errors] });
      }
    }
    // Fail if input lock/config changed during the audit. The scanner never edits them.
    for (const [name, before] of Object.entries(report.hashes)) {
      let after = null;
      try { after = sha256(await inputBytes(root, name)); } catch { /* absence compared below */ }
      if (before !== after) report.stages.push({ stage: 'input-integrity', incomplete: true, findings: [], errors: [`Input changed during scan: ${name}`] });
    }
    const after = await gitProvenance(root);
    await save('provenance-after.json', JSON.stringify(after, null, 2) + '\n');
    if (before.head !== after.head || before.status !== after.status) report.stages.push({ stage: 'provenance', incomplete: true, findings: [], errors: ['Git provenance changed during scan.'] });
  } catch (error) {
    report.stages.push({ stage: 'runner', incomplete: true, findings: [], errors: [error.message] });
    for (const stage of profile === 'all' ? ['code', 'dependencies'] : [profile === 'deps' ? 'dependencies' : 'code']) {
      if (!report.stages.some(value => value.stage === stage)) {
        const skipped = { stage, incomplete: true, findings: [], errors: ['Stage not launched because its required inputs or provenance could not be verified.'] };
        report.stages.push(skipped);
        if (stage === 'code') await save('code.json', JSON.stringify(skipped, null, 2) + '\n');
      }
    }
  }
  report.finishedAt = new Date().toISOString();
  report.exitCode = exitFor({ incomplete: report.stages.some(s => s.incomplete), findings: report.stages.flatMap(s => s.findings ?? []) });
  report.status = ['PASS_FOR_REQUESTED_SCOPE', 'FINDINGS_REQUIRE_REVIEW', 'INCOMPLETE'][report.exitCode];
  await save('report.json', JSON.stringify(report, null, 2) + '\n');
  const text = renderReport(report);
  await save('security.log', text);
  // Distinct profile summaries: a code-only pass never replaces the combined summary.
  await saveEvidence(resolve(base, latestName), text);
  console.log(`${report.status}: ${resolve(base, latestName)}`);
  console.log(`Evidence: ${dir}`);
  process.exitCode = report.exitCode;
  } catch {
    console.error('INCOMPLETE: security evidence could not be safely recorded. Do not treat an older summary as this run.');
    process.exitCode = 2;
  }
}
