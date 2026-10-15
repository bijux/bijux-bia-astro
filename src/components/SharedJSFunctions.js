import { loadRelatedEntries } from "../api/related-entries.mjs";
import { renderRelatedEntries } from "./formatting/related-entries.mjs";
export { getRelatedEntryLinks } from "../api/related-entries.mjs";
export { buildDatasetFileSummary } from "../api/empiar.mjs";
export { getFromAPI, getStudyFromApiByAccession, getImageFromAPI, getImagesFromAPI, getDownstreamDisplayImages, studyHasSpecimenTracks, getImagesByAccessionID, getAllStudiesFromAPI, getAnnotationFromDerivedImages, generateSourceAnnotatedImageMap } from "../api/client.mjs";
import { escapeHtml } from "../security/html.mjs";
import { navigationURL, resourceURL } from "../security/urls.mjs";
import imageFallback from "../assets/bioimage-archive/image_fallback.png"
import { parseNumericRange } from "./formatting/numeric-ranges.mjs";

function getPlaceholderHeroImage(accessionID) {
    const match = (String(accessionID ?? "").match(/(\d{1,5})$/)) || ['0','1'];
    const accessionIDNumber = parseInt(match[1]);
    const imageNumber = (accessionIDNumber % 45) + 1;
    return `/bioimage-archive/default-hero/placeholder_logo_${imageNumber}.png`
}

export function getStudyImage(study, cardImageOverride) {
    if (cardImageOverride != null) {
      // Overrides are authored card configuration and may reference a site-owned asset.
      const override = resourceURL(cardImageOverride) ?? (typeof cardImageOverride === "string" && cardImageOverride.startsWith("/bioimage-archive/") ? navigationURL(cardImageOverride) : null);
      if (override) return override;
    }
    const example = Array.isArray(study?.example_image_uri) ? study.example_image_uri[0] : study?.example_image_uri;
    return resourceURL(example) ?? getPlaceholderHeroImage(study?.accession_id);
}

export function formatListItem(outputString, item, i, list) {
    if (i + 1 === list.length) {
        return `${outputString}${item}` ;
    } else {
        return `${outputString}${item}, ` ;
    }
}


export function taxonRender(taxon) {
    if (taxon["common_name"] && taxon["scientific_name"]){
        return `<i>${escapeHtml(taxon.scientific_name)}</i> (${escapeHtml(taxon["common_name"])})`
    } else if (taxon["common_name"]) {
        return escapeHtml(taxon.common_name)
    } else if (taxon["scientific_name"]) {
        return `<i>${escapeHtml(taxon.scientific_name)}</i>`
    }
 }


export { multilineTextRender } from "./formatting/plain-text.js";


export function formatBytesToHumanSize(sizeBytes) {
  var i = sizeBytes == 0 ? 0 : Math.floor(Math.log(sizeBytes) / Math.log(1000));
  return `${Number(sizeBytes / Math.pow(1000, i)).toFixed(2)} ${['B', 'kB', 'MB', 'GB', 'TB', 'PB'][i]}`
}

function formatMetresToHumanSize(metres) {
  var i = metres == 0 ? 0 : Math.floor(Math.log(metres) / Math.log(1000)) * -1;
  var formatted = `${Number(metres / Math.pow(1000, i*-1)).toFixed(0)} ${['mm', 'µm', 'nm', "pm"][i-1]}`
  return formatted;
}

function formatValueHumanReadable(fieldName, value) {
  const nValue = Number(value);
  if(Number.isNaN(nValue)) {
    return value;
  }
  if (fieldName.endsWith("(m/px)") || fieldName.endsWith("(m)")) {
    return formatMetresToHumanSize(nValue);
  }
  else if (fieldName.endsWith("(bytes)")) {
    return formatBytesToHumanSize(nValue);
  }
  else {
    return nValue;
  }
}

export function formatFieldName(fieldName, fieldValue) {
  const bIsCompared = fieldValue.startsWith(">") || fieldValue.startsWith("<") || fieldValue.startsWith("≤") || fieldValue.startsWith("≥");
  const range = parseNumericRange(fieldValue);
  if(Number.isFinite(fieldValue)) {
    return formatValueHumanReadable(fieldName, fieldValue);
  }
  else if (bIsCompared) {
    const fieldValueNumeric = fieldValue.slice(1);
    return `${fieldValue[0]} ${formatValueHumanReadable(fieldName, fieldValueNumeric)}`;
  }
  else if (range) {
    const { start, end } = range;
    return `${formatValueHumanReadable(fieldName, start)} - ${formatValueHumanReadable(fieldName, end)}`;
  }
  else {
    return fieldValue;
  }
    
}

export function getSimpleAttributeValue(obj, attrName) {
    // For attributes of structure: { "name": "AttributeName", "value": { "AttributeName": <value> } }
    return obj?.additional_metadata
      ?.find(attr => attr.name === attrName)
      ?.value[attrName] ?? null;
}

export function getPublicVisualisationURI(uri) {
    if (!uri) {
        return null;
    }

    try {
        const approved = resourceURL(uri, { allowLocal: import.meta.env.PUBLIC_ALLOW_LOCAL_VIEWERS === "true" });
        if (!approved) return null;
        const url = new URL(approved);
        if (url.hostname === "livingobjects-int.ebi.ac.uk") {
            url.hostname = "livingobjects.ebi.ac.uk";
        }
        return url.toString();
    } catch {
        return null;
    }
}

export function buildVizarrViewerURL(uri) {
    const approved = resourceURL(uri, { allowLocal: import.meta.env.PUBLIC_ALLOW_LOCAL_VIEWERS === "true" });
    if (!approved) {
        return null;
    }

    const url = new URL("https://livingobjects.ebi.ac.uk/bioimaging-01-pub/bia-zarr-test/vizarr/index.html");
    url.searchParams.set("source", approved);
    return url.toString();
}

export function buildITKViewerURL(uri) {
    const approved = resourceURL(uri, { allowLocal: import.meta.env.PUBLIC_ALLOW_LOCAL_VIEWERS === "true" });
    if (!approved) {
        return null;
    }

    const url = new URL("https://kitware.github.io/itk-vtk-viewer/app/");
    url.searchParams.set("fileToLoad", approved);
    return url.toString();
}
  
export function getLicenceLogo(licenceURL) {
    try {
      const url = new URL(navigationURL(licenceURL));
      if (!["creativecommons.org", "www.creativecommons.org"].includes(url.hostname)) return "";
      if (url.pathname.startsWith("/publicdomain/zero/")) return "https://mirrors.creativecommons.org/presskit/buttons/88x31/svg/cc-zero.svg";
      const code = url.pathname.match(/^\/licenses\/(by(?:-nc)?(?:-sa|-nd)?)\//)?.[1];
      return code ? `https://mirrors.creativecommons.org/presskit/buttons/88x31/svg/${code}.svg` : "";
    } catch { return ""; }
}

export function getDatasetStatsByUUID(study) {
    return aggregateDatasetStats(study?.dataset || []);
}

function aggregateDatasetStats(datasets) {
    const dataset_uuids = []
    for (var dataset of datasets) {
      dataset_uuids.push([dataset.uuid,dataset.file_reference_count,dataset.title])
    }
    return dataset_uuids
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

export function highlightOrganism(study, query){
    const text = renderTaxonList(study)
    return query && text? applyHighlight(text, query): text;
}


export function getAnnotationType(datasets) {
  const annotationTypes = new Set();

  datasets.forEach(dataset => {
    // 1. Process annotation_type from additional_metadata
    const annotationMetaData = dataset.additional_metadata?.find(md => md.name === "annotation_type");

    if (annotationMetaData) {
      if (Array.isArray(annotationMetaData.value?.annotation_type)) {
        // Case 1: It's an array of arrays!
        // We need to iterate through the outer array, and then through the inner array.
        annotationMetaData.value.annotation_type.forEach(innerArray => {
          if (Array.isArray(innerArray)) {
            innerArray.forEach(type => {
              if (typeof type === 'string') {
                annotationTypes.add(type.replace(/_/g, ' ').trim().toLowerCase());
              }
            });
          } else if (typeof innerArray === 'string') {
            annotationTypes.add(innerArray.replace(/_/g, ' ').trim().toLowerCase());
          }
        });
      } else if (typeof annotationMetaData.value === 'string') {
        // Case 2: It's a direct string (e.g., "type1,type2" or just "type1")
        annotationMetaData.value.split(',').forEach(typePart => {
          const cleanedType = typePart.replace(/_/g, ' ').trim().toLowerCase();
          if (cleanedType) {
            annotationTypes.add(cleanedType);
          }
        });
      }
    }

    // 2. Fallback to method_type from annotation_process
    // This comes from the logic in [accessionID].astro page
    if (dataset.annotation_process && dataset.annotation_process.length > 0) {
      dataset.annotation_process.forEach(process => {
        if (process.method_type && Array.isArray(process.method_type) && process.method_type.length > 0) {
          process.method_type.forEach(type => {
            if (typeof type === 'string') {
              const cleanedType = type.replace(/_/g, ' ').trim().toLowerCase();
              if (cleanedType) {
                annotationTypes.add(cleanedType);
              }
            }
          });
        }
      });
    }
  });

  // Convert Set to Array and sort for consistent display
  return Array.from(annotationTypes).sort();
}

export function getMetadataValue(mdArray, key, field = null) {
  const md = mdArray?.find(md => md.name === key)?.value;
  return field && md ? md[field]?.[0] : md;
}

export function getThumbnail(img) {
    const thumbnail_uri = getMetadataValue(img.additional_metadata, "image_thumbnail_uri")?.["256"]?.["uri"] || imageFallback.src;
    return resourceURL(thumbnail_uri) ?? navigationURL(imageFallback.src);
}

export function formatBytes(value, field){
  return field === "total_size_in_bytes"? formatBytesToHumanSize(value) : value
}

export { formatPhysicalDimensions, formatPhysicalVoxelDimensions } from "./formatting/physical-dimensions.js";


function formatPixelDimension(value, text) {
    if (text === "") {
        if (value != null && value !== 1) {
            return value
        } else {
            return text
        }
    } else {
        if (value != null && value !== 1) {
            return text + " x " + value
        } else {
            return text
        }
    }
}

export function formatPixelDimensions(img_rep) {
    const fields = [ "size_x", "size_y", "size_z"]
    return fields.reduce((text, field) => formatPixelDimension(img_rep[field], text), "") + " px" 
}

export function generateParamString(baseURL, query, page, selectedFacets, pageSize, sortBy = "", sortOrder = "", sortSource = ""){
  const url = new URL(baseURL, "http://local");
  const isPageURL = url.origin === "http://local";
  const hasQuery = query !== undefined && query !== null && query !== "";
  const hasFacetValues = Object.values(selectedFacets ?? {}).some((values) => values?.length > 0);
  const shouldKeepSort = sortBy && (sortBy !== "relevance" || sortSource === "user" || hasQuery || hasFacetValues);

  if (hasQuery) {
    url.searchParams.set("query", query ?? "");
  }

  if (!isPageURL || pageSize > 12) {
    url.searchParams.set("pagination.page_size", String(pageSize));
  }

  if (!isPageURL) {
    url.searchParams.set("pagination.page", String(page));
  }

  url.searchParams.delete("sortBy");
  url.searchParams.delete("sortOrder");
  url.searchParams.delete("sort_by");
  url.searchParams.delete("sort_order");
  url.searchParams.delete("sort_source");

  if (shouldKeepSort) {
    url.searchParams.set("sort_by", sortBy);
    url.searchParams.set("sort_order", sortOrder || "desc");
    if (isPageURL && sortSource) {
      url.searchParams.set("sort_source", sortSource);
    }
  }

  for (const [facetKey, values] of Object.entries(selectedFacets ?? {})) {
    url.searchParams.delete(facetKey);
    url.searchParams.delete(`${facetKey}.eq`);
    url.searchParams.delete(`${facetKey}.gt`);
    url.searchParams.delete(`${facetKey}.gte`);
    url.searchParams.delete(`${facetKey}.lt`);
    url.searchParams.delete(`${facetKey}.lte`);

    if (!values?.length) continue;

    for (const value of values) {
      if (value === null || value === undefined) continue;
      const stringValue = String(value).trim();
      if (stringValue === "") continue;

      if (isPageURL) {
        url.searchParams.append(facetKey, stringValue);
      }
      else if (stringValue[0] === ">") {
        url.searchParams.append(`${facetKey}.gt`, stringValue.slice(1));
      }
      else if (stringValue[0] === "<") {
        url.searchParams.append(`${facetKey}.lt`, stringValue.slice(1));
      }
      else if (stringValue[0] === "≤") {
        url.searchParams.append(`${facetKey}.lte`, stringValue.slice(1));
      }
      else if (stringValue[0] === "≥") {
        url.searchParams.append(`${facetKey}.gte`, stringValue.slice(1));
      }
      else if (facetKey === "has_converted_image" && !isPageURL) {
        url.searchParams.append(url.pathname.endsWith("image") ? "has.converted_image" : "has.thumbnail", "true");
      }
      else {
        const range = parseNumericRange(stringValue);
        if (range) {
          url.searchParams.append(`${facetKey}.gte`, range.start);
          url.searchParams.append(`${facetKey}.lte`, range.end);
        } else {
          url.searchParams.append(`${facetKey}.eq`, stringValue);
        }
      }
    }
  }

  return isPageURL ? `${url.pathname}${url.search}` : url.toString()
}

export function getTutorialURLs(urlType){
    const quickTourURL = "https://www.ebi.ac.uk/training/online/courses/bioimage-archive-quick-tour"
    return urlType === "submission"? `${quickTourURL}/submitting-data-to-bioimage-archive-2/submission/` : quickTourURL
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

function textFragmentLink(baseUrl, highlightStr, query) {
  const clean = highlightStr.replace(/__HIT__|__\/HIT__/g, "").trim();
  if (!clean || !clean.toLowerCase().includes(query.toLowerCase()) ) return baseUrl;
  return `${baseUrl}#:~:text=${encodeURIComponent(clean)}`;
}

export function highlightLinks(baseUrl, highlightObj, query, limit = 8) {
  if (!query ){ return baseUrl}
  const vals = Object.values(highlightObj || {}).flat();
  const uniq = [...new Set(vals)].slice(0, limit);
  return uniq.flatMap(h => ({ text: h[0]?.replace(/__HIT__|__\/HIT__/g, "").trim(), url: textFragmentLink(baseUrl, h, query) }))?.[0]?.["url"];
}

export async function buildPDBandEMDBLinks(study) {
  const { pdb, emdb } = await loadRelatedEntries(study);
  return renderRelatedEntries(pdb, emdb);
}

export function getHighlightTextString(highlights) {
  if (!highlights) return "";
  const skiphighlightFields = ["title", "organism_classification.common_name", "organism_classification.scientific_name", "imaging_method","imaging_method.keyword","annotation_type.keyword", "accession_id"];
  const highlightValues = Object.entries(highlights).map(([key, value]) => 
    !skiphighlightFields.includes(key) && `<span class="highlight"><b>${`${key.replace(/.*\./g, "").replace(/_/g, " ")}: `}</b><i>${value}</i></span>`).filter(Boolean).flat();
  return highlightValues.join("<br>");
}
