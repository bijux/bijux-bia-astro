import { escapeHtml } from "../../security/html.mjs"; import { formatListItem } from "../../formatting/lists.mjs";
export function taxonRender(taxon) {
    if (taxon["common_name"] && taxon["scientific_name"]){
        return `<i>${escapeHtml(taxon.scientific_name)}</i> (${escapeHtml(taxon["common_name"])})`
    } else if (taxon["common_name"]) {
        return escapeHtml(taxon.common_name)
    } else if (taxon["scientific_name"]) {
        return `<i>${escapeHtml(taxon.scientific_name)}</i>`
    }
 }

export function getTaxons(study) {
    const taxonHtmlList = []
    const taxonList = []
    if (study?.organism_classification){
      for (var taxon of study?.organism_classification) {
          if (!taxonList.some(txnFinal => txnFinal.common_name === taxon.common_name || txnFinal.scientific_name === taxon.scientific_name )) {
              taxonList.push(taxon)
              taxonHtmlList.push(taxonRender(taxon))
          }
      }
    }
    return taxonHtmlList
}

export function renderTaxonList(study) {
    const taxonList = getTaxons(study)
    return taxonList.reduce(formatListItem, "")
}
