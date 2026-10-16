import { renderTaxonList } from "../../metadata/taxonomy.mjs";
export function highlightOrganism(study, query){
    const text = renderTaxonList(study)
    return query && text? applyHighlight(text, query): text;
}

function highlightText(text, query) {
  return query && text ? applyHighlight(text, query) : text;
}

function formatUniqueList(values = [], { sort = true, transform = value => value } = {}) {
  if(values == null){
    return ""
  }
  const items = values
    .filter(Boolean)
    .map(transform);

  const unique = [...new Set(items)];
  if (sort) unique.sort();

  return unique.join(", ");
}

export function formatHighlightedList(values = [], query, options = {}) {
  return highlightText(formatUniqueList(values, options), query);
}

export function applyHighlight(text, query) {
  const out = text ?? "";
  if (!query) return out;

  // If it's already highlighted, keep it (prevents double-highlighting / nesting)
  if (out.includes("__HIT__")) return out;

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escapedQuery, "gi");

  // Split into ["text", "<tag>", "text", ...] and only replace in text parts
  return out
    .split(/(<[^>]*>)/g)
    .map(part => {
      if (part.startsWith("<") && part.endsWith(">")) return part; // keep tags untouched
      return part.replace(re, m => `__HIT__${m}__/HIT__`);
    })
    .join("");
}

/** Highlighting may refine a destination, but absent snippets must never remove it. */
export function highlightLinks(baseUrl, highlights, query, limit = 8) {
    if (typeof query !== 'string' || !query || !Number.isSafeInteger(limit) || limit <= 0) return baseUrl;
    const fields = highlights && typeof highlights === 'object' ? highlights : {};
    const snippets = Object.values(fields).flat().filter(value => typeof value === 'string');
    for (const snippet of [...new Set(snippets)].slice(0, limit)) {
        const text = snippet.replace(/__HIT__|__\/HIT__/g, '').trim();
        if (text && text.toLowerCase().includes(query.toLowerCase())) {
            return `${baseUrl}#:~:text=${encodeURIComponent(text)}`;
        }
    }
    return baseUrl;
}

const primaryHighlightFields = new Set(['title', 'organism_classification.common_name', 'organism_classification.scientific_name',
    'imaging_method', 'imaging_method.keyword', 'annotation_type.keyword', 'accession_id']);

function snippetText(value) {
    if (typeof value === 'string') return value;
    if (typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
}

/** Select the same meaningful additional fields for the trigger and its rendered details.
 * @returns {Array<[string, string]>}
 */
export function additionalHighlightFields(highlights) {
    if (!highlights || typeof highlights !== 'object' || Array.isArray(highlights)) return [];
    return Object.entries(highlights).flatMap(([key, value]) => {
        if (primaryHighlightFields.has(key)) return [];
        const text = Array.isArray(value) ? value.map(snippetText).filter(part => part.trim()).join(',') : snippetText(value);
        return text.trim() ? [[key, text]] : [];
    });
}
