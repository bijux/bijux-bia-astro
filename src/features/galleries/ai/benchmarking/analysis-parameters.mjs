import { escapeHtml } from '../../../../security/html.mjs';

export function formatRowAnalysisParameters(parameters) {
    return Object.entries(parameters).filter(([, value]) => value != null)
        .map(([key, value]) => `${escapeHtml(key)}: ${escapeHtml(value)}<br/>`).join('');
}
