// Internal worker: lint only. Never evaluates the snippets or application imports.
import { realpath } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import {inventory,fileHashes,inputBytes} from './inventory.mjs';
import {normalizeLint} from './reporting.mjs';
import {ownedDirectory,saveEvidence} from './evidence.mjs';

const root = process.cwd();
const output = process.argv[2];
if (!output) throw new Error('Internal worker needs an output JSON path.');
const evidencePath = relative(root, resolve(output));
if (!evidencePath.startsWith('artifacts/security/') || !evidencePath.endsWith('/code.json')) throw new Error('Worker evidence must stay under artifacts/security/.');
await ownedDirectory(root, evidencePath.slice(0, evidencePath.lastIndexOf('/')));
const report = { stage: 'code', incomplete: true, findings: [], errors: [], probes: [], versions: {} };

// Each unsafe canary needs its specified rule: a generic parser error is NOT success.
const probes = [
  ['astro-html', '.astro', '---\nconst {value} = Astro.props;\n---\n<div set:html={value}></div>', 'astro/no-set-html-directive'],
  ['astro-frontmatter', '.astro', '---\nconst {value} = Astro.props;\neval(value);\n---\n<div>test</div>', 'no-eval'],
  ['astro-client', '.astro', '<div></div><script>const el = document.body; el.innerHTML = location.hash;</script>', 'no-unsanitized/property'],
  ['astro-inline-client', '.astro', '<div></div><script is:inline>document.body.innerHTML = location.hash;</script>', 'no-unsanitized/property'],
  ['js-innerhtml', '.js', 'document.body.innerHTML = location.hash;', 'no-unsanitized/property'],
  ['js-outerhtml', '.js', 'document.body.outerHTML = location.hash;', 'no-unsanitized/property'],
  ['ts-innerhtml', '.ts', 'const el: HTMLElement = document.body; el.innerHTML = location.hash;', 'no-unsanitized/property'],
  ['js-adjacenthtml', '.js', 'document.body.insertAdjacentHTML("beforeend", location.hash);', 'no-unsanitized/method'],
  ['js-write', '.js', 'document.write(location.hash);', 'no-unsanitized/method'],
  ['js-eval', '.js', 'eval(location.hash);', 'no-eval'],
  ['js-function', '.js', 'new Function(location.hash);', 'no-new-func'],
  ['jsx-innerhtml', '.jsx', 'const view = <div />; document.body.innerHTML = location.hash;', 'no-unsanitized/property'],
  ['safe-astro', '.astro', '---\nconst {value} = Astro.props;\n---\n<div>{value}</div>', null],
  ['safe-dom', '.js', 'document.body.textContent = location.hash;', null],
  ['malformed-js', '.js', 'const = ;', 'PARSE_ERROR'],
];
try {
  report.inventory = await inventory(root);
  report.errors.push(...report.inventory.errors);
  if (!report.inventory.code.some(name => name.startsWith('src/'))) report.errors.push('No application code selected: scanning only the audit tools cannot pass.');
  if (report.errors.length) throw new Error('Unsafe or unavailable source inventory; analyzers were not launched.');
  report.hashes = await fileHashes(root, report.inventory.code);
  const dependencies = await realpath(resolve(root, 'node_modules'));
  const require = createRequire(resolve(root, 'package.json'));
  const eslintEntry = await realpath(require.resolve('eslint'));
  if (!eslintEntry.startsWith(dependencies + '/')) throw new Error('Analyzer must be installed in this repository; parent/global fallback is not allowed.');
  const lock = JSON.parse((await inputBytes(root, 'package-lock.json')).toString('utf8'));
  for (const name of ['eslint', 'eslint-plugin-astro', 'astro-eslint-parser', 'typescript-eslint', '@typescript-eslint/parser', 'eslint-plugin-security', 'eslint-plugin-no-unsanitized']) {
    const entry = await realpath(require.resolve(name));
    if (!entry.startsWith(dependencies + '/')) throw new Error(`Analyzer not owned by this checkout: ${name}`);
    const metadata = JSON.parse((await inputBytes(root, relative(root, resolve(dependencies, name, 'package.json')).split(sep).join('/'))).toString('utf8'));
    if (!metadata.version || lock.packages?.[`node_modules/${name}`]?.version !== metadata.version) throw new Error(`Installed analyzer differs from the lockfile: ${name}`);
    report.versions[name] = metadata.version;
  }
  const { ESLint } = await import(pathToFileURL(eslintEntry).href);
  const eslint = new ESLint({ cwd: root, overrideConfigFile: resolve(root, 'configs/audits/security/eslint.config.mjs'),
    allowInlineConfig: false, cache: false, fix: false });
  for (const [name, extension, source, rule] of probes) {
    const results = await eslint.lintText(source, { filePath: resolve(root, `src/__security_probe_${name}${extension}`) });
    const messages = results.flatMap(item => item.messages);
    const fatal = messages.some(item => item.fatal || !item.ruleId);
    const passed = rule === 'PARSE_ERROR' ? messages.some(item => item.fatal)
      : rule === null ? messages.length === 0
      : !fatal && messages.some(item => item.ruleId === rule);
    report.probes.push({ name, expectedRule: rule, passed, messages });
    if (!passed) report.errors.push(`Analyzer coverage probe failed: ${name}`);
  }
  report.raw = [];
  for (const file of report.inventory.code) {
    const path = resolve(root, file);
    try {
      if (await eslint.isPathIgnored(path)) { report.errors.push(`Source silently ignored by analyzer configuration: ${file}`); continue; }
      const results = await eslint.lintFiles([path]);
      if (results.length !== 1 || results[0].filePath !== path) { report.errors.push(`Missing or mismatched analyzer result for ${file}`); continue; }
      const compact = results.map(({ source, output: fixedOutput, ...rest }) => rest);
      report.raw.push(...compact);
      const normalized = normalizeLint(compact, root, report.hashes);
      report.findings.push(...normalized.findings);
      report.errors.push(...normalized.errors);
    } catch (error) { report.errors.push(`${file}: ${error.message}`); }
  }
  const afterHashes = await fileHashes(root, report.inventory.code);
  for (const file of report.inventory.code) {
    if (afterHashes[file] !== report.hashes[file]) report.errors.push(`Source changed during analysis: ${file}`);
  }
  const afterInventory = await inventory(root);
  if (JSON.stringify(afterInventory.code) !== JSON.stringify(report.inventory.code)) report.errors.push('Source file set changed during analysis.');
  report.errors.push(...afterInventory.errors);
  report.incomplete = report.errors.length > 0;
} catch (error) {
  report.errors.push(error.message);
}
await saveEvidence(resolve(output), JSON.stringify(report, null, 2) + '\n');
process.exitCode = report.incomplete ? 2 : report.findings.length ? 1 : 0;
