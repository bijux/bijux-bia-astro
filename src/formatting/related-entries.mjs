import { escapeHtml } from "../security/html.mjs";
import { navigationURL, resourceURL } from "../security/urls.mjs";

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function buildEMDBThumbnailURL(emdbNumber) {
  const subDirectory = emdbNumber.length > 4
    ? `${emdbNumber.slice(0, 2)}/${emdbNumber.slice(2, 3)}`
    : emdbNumber.slice(0, 2);
  return `https://www.ebi.ac.uk/emdb/static/em/${subDirectory}/${emdbNumber}/images/400_${emdbNumber}.gif`;
}

function formatEMDBUnits(units) {
  if (!units || units === "Å" || units === "Å") {
    return "&#x212B;";
  }
  return escapeHtml(units);
}

function getEMDBResolution(emdbEntry) {
  const structureDeterminations = asArray(emdbEntry?.structure_determination_list?.structure_determination);

  for (const structureDetermination of structureDeterminations) {
    const imageProcessing = asArray(structureDetermination?.image_processing);
    for (const processing of imageProcessing) {
      const resolution = processing?.final_reconstruction?.resolution;
      if (resolution?.valueOf_) {
        return {
          value: resolution.valueOf_,
          units: formatEMDBUnits(resolution.units),
        };
      }
    }
  }

  return null;
}

function buildRelatedEntryPreviewLink({ accession, href, thumbnailURL, type, measurement }) {
  const safeAccession = escapeHtml(accession);
  const safeType = escapeHtml(type);
  const measurementHtml = measurement
    ? `<span class="bia-related-entry-preview__measurement">${escapeHtml(measurement.label)}: ${escapeHtml(measurement.value)} ${escapeHtml(measurement.units)}</span>`
    : "";

  return `
    <span class="bia-related-entry">
      <a class="vf-link bia-related-entry__link" href="${escapeHtml(navigationURL(href) ?? "#")}" target="_blank" rel="noopener noreferrer">${safeAccession}</a>${measurement?.value ? ` (${escapeHtml(measurement.value)} ${escapeHtml(measurement.units)})`: ""}
      <span class="bia-related-entry-preview" role="tooltip">
        <img src="${escapeHtml(resourceURL(thumbnailURL) ?? "")}" alt="Preview image for ${safeAccession}" loading="lazy" />
        <span class="bia-related-entry-preview__body">
          <span class="bia-related-entry-preview__title">${safeType} ${safeAccession}</span>
          ${measurementHtml}
        </span>
      </span>
    </span>
  `;
}

export function renderRelatedEntries(studyPDBLinks, emdbEntries) {
  const pdbLinks = studyPDBLinks.length > 0
    ? studyPDBLinks.map(({ accession, href }) => buildRelatedEntryPreviewLink({
      accession,
      href,
      thumbnailURL: `https://www.ebi.ac.uk/pdbe/static/entry/${accession}_deposited_chain_front_image-200x200.png`,
      type: "PDB",
    })).join(", ")
    : null;

  const emdbLinks = emdbEntries.length > 0
    ? emdbEntries.map(({ accession, href, metadata }) => {
      const displayAccession = `EMD-${accession}`;
      const resolution = getEMDBResolution(metadata);
      return buildRelatedEntryPreviewLink({
        accession: displayAccession,
        href,
        thumbnailURL: buildEMDBThumbnailURL(accession),
        type: "EMDB",
        measurement: resolution ? {
          label: "Resolution",
          value: resolution.value,
          units: resolution.units,
        } : null,
      });
    }).join(", ")
    : null;

  return [pdbLinks, emdbLinks]
}
