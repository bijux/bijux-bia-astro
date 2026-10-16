import {relative} from 'node:path';
import {sha256,slash} from './inventory.mjs';
export const exitFor = ({ incomplete = false, findings = [] }) => incomplete ? 2 : findings.length ? 1 : 0;
export const safeText = value => String(value ?? '').replace(/[\x00-\x1F\x7F]/g, '?');


export function normalizeLint(results, root, hashes = {}) {
  const findings = [], errors = [];
  if (!Array.isArray(results) || !results.length) return { findings, errors: ['Missing analyzer results.'], incomplete: true };
  for (const result of results) {
    if (!result || typeof result.filePath !== 'string' || !Array.isArray(result.messages)) { errors.push('Malformed analyzer result.'); continue; }
    const file = slash(relative(root, result.filePath));
    if (!file || file.startsWith('../') || file.startsWith('/') || Object.keys(hashes).length && !Object.hasOwn(hashes, file)) { errors.push('Analyzer reported an unselected input.'); continue; }
    for (const m of result.messages) {
      if (!m || typeof m.message !== 'string' || ![1, 2].includes(m.severity)) { errors.push(`${file}: malformed diagnostic`); continue; }
      if (!m.ruleId || m.fatal) { errors.push(`${file}:${m.line ?? '?'}:${m.column ?? '?'} ${m.message}`); continue; }
      if (typeof m.ruleId !== 'string' || !Number.isSafeInteger(m.line) || m.line < 1 || !Number.isSafeInteger(m.column) || m.column < 1) { errors.push(`${file}: invalid source location`); continue; }
      findings.push({ tool: 'eslint', kind: 'REVIEW_CANDIDATE', file, line: m.line, column: m.column,
        rule: m.ruleId, lintSeverity: m.severity, message: m.message,
        fingerprint: sha256(JSON.stringify([file, hashes[file], m.ruleId, m.line, m.column, m.message])) });
    }
    for (const [field, severity] of [['errorCount', 2], ['warningCount', 1]]) {
      if (result[field] !== undefined && result[field] !== result.messages.filter(message => message?.severity === severity).length) errors.push(`${file}: inconsistent diagnostic count`);
    }
    if (result.suppressedMessages !== undefined && (!Array.isArray(result.suppressedMessages) || result.suppressedMessages.length)) errors.push(`${file}: unexpected suppressed diagnostics in strict scan`);
  }
  return { findings, errors, incomplete: errors.length > 0 };
}

export function renderReport(report) {
  const out = [
    'BIA SECURITY — STATIC CODE + DEPENDENCY BASELINE',
    `Run: ${report.runId}; profile: ${report.profile}; status: ${report.status}; exit: ${report.exitCode}`,
    `Finished: ${report.finishedAt}; HEAD: ${report.head ?? 'unavailable'}; Node: ${report.node}`,
    'REVIEW_CANDIDATE is not proof of exploitability. A clean configured scan is not proof of no vulnerabilities.',
    'Runtime/browser tests, deep SAST, secret history, CDN resources and deployment headers: NOT RUN by this command.',
    '',
  ];
  for (const stage of report.stages) {
    out.push(`STAGE ${stage.stage}: ${stage.incomplete ? 'INCOMPLETE' : 'COMPLETED'}; findings=${stage.findings?.length ?? 0}`);
    if (stage.inventory) {
      out.push(`  Code inputs=${stage.inventory.code.length}; other inputs=${stage.inventory.other.length}. Other formats are inventoried, not analyzed by ESLint.`);
      out.push(`  Generated root exclusions: ${stage.inventory.excluded.map(safeText).join(', ')}`);
    }
    for (const error of stage.errors ?? []) out.push(`  ANALYSIS_ERROR ${safeText(error)}`);
    const rows = [...(stage.findings ?? [])].sort((a, b) => (a.file ?? a.package).localeCompare(b.file ?? b.package) || (a.line ?? 0) - (b.line ?? 0));
    for (const f of rows) {
      out.push(`  ${safeText(f.file ?? f.package)}:${f.line ?? '-'}:${f.column ?? '-'} [${f.kind}] ${f.rule ?? f.severity}`);
      out.push(`    ${safeText(f.message)}`);
      if (f.fingerprint) out.push(`    fingerprint=${f.fingerprint}`);
    }
    out.push('');
  }
  return out.join('\n') + '\n';
}
