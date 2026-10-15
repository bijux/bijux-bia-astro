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

export function getHighlightTextString(highlights) {
  if (!highlights) return "";
  const skiphighlightFields = ["title", "organism_classification.common_name", "organism_classification.scientific_name", "imaging_method","imaging_method.keyword","annotation_type.keyword", "accession_id"];
  const highlightValues = Object.entries(highlights).map(([key, value]) =>
    !skiphighlightFields.includes(key) && `<span class="highlight"><b>${`${key.replace(/.*\./g, "").replace(/_/g, " ")}: `}</b><i>${value}</i></span>`).filter(Boolean).flat();
  return highlightValues.join("<br>");
}
