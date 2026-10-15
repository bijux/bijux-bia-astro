const severities = ['info', 'low', 'moderate', 'high', 'critical'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const strings = value => Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0);
function advisory(value) {
  if (!record(value) || !Number.isSafeInteger(value.source) || value.source < 0 || typeof value.title !== 'string' || !value.title || typeof value.name !== 'string' || !severities.includes(value.severity) || typeof value.range !== 'string') return false;
  try { return new URL(value.url).protocol === 'https:'; } catch { return false; }
}

/** Validate npm's complete v2 package inventory, nested advisories and severity totals. */
export function interpretAudit(result) {
  const output = { stage: 'dependencies', incomplete: false, findings: [], errors: [] };
  let document;
  try { document = JSON.parse(result.stdout); }
  catch { output.errors.push('npm did not return valid JSON.'); }
  if (result.failure || result.signal || ![0, 1].includes(result.code)) output.errors.push(result.failure || `npm exit=${result.code}, signal=${result.signal}`);
  if (document?.error) output.errors.push('npm reported an invocation/registry error; inspect the retained raw evidence.');
  if (document?.auditReportVersion !== 2 || !record(document.vulnerabilities)) {
    output.errors.push('Unsupported or incomplete npm audit report schema.');
  } else {
    const reachesAdvisory = name => {
      const pending = [name], visited = new Set();
      while (pending.length) {
        const next = pending.pop();
        if (visited.has(next)) continue;
        visited.add(next);
        const via = document.vulnerabilities[next]?.via;
        if (!Array.isArray(via)) continue;
        for (const value of via) {
          if (typeof value === 'string') pending.push(value);
          else if (advisory(value)) return true;
        }
      }
      return false;
    };
    const counts = Object.fromEntries(severities.map(value => [value, 0]));
    for (const [name, item] of Object.entries(document.vulnerabilities)) {
      const validFix = typeof item?.fixAvailable === 'boolean' || record(item?.fixAvailable) && typeof item.fixAvailable.name === 'string' && typeof item.fixAvailable.version === 'string' && typeof item.fixAvailable.isSemVerMajor === 'boolean';
      if (!record(item) || item.name !== name || typeof item.isDirect !== 'boolean' || typeof item.range !== 'string' || !severities.includes(item.severity) || !strings(item.nodes) || !strings(item.effects) || !validFix || !Array.isArray(item.via) || !item.via.length || !item.via.every(value => typeof value === 'string' ? Boolean(document.vulnerabilities[value]) : advisory(value))) {
        output.errors.push(`Incomplete advisory record for ${name}`); continue;
      }
      counts[item.severity]++;
      if (!reachesAdvisory(name)) output.errors.push(`No concrete advisory reachable for ${name}`);
      output.findings.push({ tool: 'npm-audit', kind: 'KNOWN_ADVISORY_MATCH', package: name, severity: item.severity,
        range: item.range, nodes: item.nodes, via: item.via, fixAvailable: item.fixAvailable,
        message: `${name}: ${item.severity}; affected range ${item.range}` });
    }
    const totals = document.metadata?.vulnerabilities;
    if (!record(totals) || !severities.every(value => Number.isSafeInteger(totals[value]) && totals[value] >= 0 && totals[value] === counts[value]) || !Number.isSafeInteger(totals.total) || totals.total !== Object.keys(document.vulnerabilities).length || totals.total !== severities.reduce((sum, value) => sum + totals[value], 0)) output.errors.push('Missing or inconsistent npm advisory totals.');
    if (result.code === 1 && output.findings.length === 0) output.errors.push('Nonzero npm exit without advisory evidence.');
  }
  output.incomplete = output.errors.length > 0;
  return output;
}
