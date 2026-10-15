import { escapeHtml } from "../../security/html.mjs";

/** Render supplied scientific/common names without treating them as markup. */
export function renderTaxonName(taxon) {
    if (!taxon || typeof taxon !== 'object' || Array.isArray(taxon)) return '';
    const scientific = typeof taxon.scientific_name === 'string' ? taxon.scientific_name : '';
    const common = typeof taxon.common_name === 'string' ? taxon.common_name : '';
    const label = scientific ? `<i>${escapeHtml(scientific)}</i>` : '';
    return label && common ? `${label} (${escapeHtml(common)})` : label || escapeHtml(common);
}

/** Missing names do not identify duplicates; retain each distinct supplied classification. */
export function distinctTaxa(study) {
    const taxa = Array.isArray(study?.organism_classification) ? study.organism_classification : [];
    const seen = new Set();
    return taxa.flatMap(taxon => {
        if (!taxon || typeof taxon !== 'object' || Array.isArray(taxon)) return [];
        if (![taxon.scientific_name, taxon.common_name].some(name => typeof name === 'string' && name.length > 0)) return [];
        const identity = JSON.stringify([taxon.ncbi_id ?? null, taxon.scientific_name ?? null, taxon.common_name ?? null]);
        if (seen.has(identity)) return [];
        seen.add(identity);
        return [taxon];
    });
}

export function renderTaxonNames(study) {
    return distinctTaxa(study).map(renderTaxonName);
}

export function renderTaxonList(study) {
    return renderTaxonNames(study).join(', ');
}
