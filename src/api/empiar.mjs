import { fetchText } from "../security/requests.mjs";

const EMPIAR_HEADERS_BASE_URL = "https://ftp.ebi.ac.uk/pub/databases/emtest/empiar/headers";

function decodeXmlText(value) {
  return String(value ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function getXmlTagText(xml, tagName) {
  const match = String(xml ?? "").match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? decodeXmlText(match[1]).trim() : "";
}

function getImageSetXmlBlocks(xml) {
  return [...String(xml ?? "").matchAll(/<imageSet(?:\s[^>]*)?>[\s\S]*?<\/imageSet>/gi)].map((match) => match[0]);
}

function buildXmlImageSetSummary(imageSetXml, fallbackDatasetName = "Unknown dataset") {
  const dataset = getXmlTagText(imageSetXml, "name") || fallbackDatasetName;
  const dataFormat = getXmlTagText(imageSetXml, "dataFormat");
  const numImagesOrTiltSeries = Number(getXmlTagText(imageSetXml, "numImagesOrTiltSeries")) || null;
  return {
    dataset,
    data_format: dataFormat,
    file_count: numImagesOrTiltSeries,
  };
}

function getDatasetTitle(dataset, fallbackDatasetName) {
  return typeof dataset === "string" ? dataset : dataset?.title || fallbackDatasetName;
}

function formatDatasetFileSummary(accessionID, xmlUrl, imageSetSummaries, studyDatasets = []) {
  const sourceSummaries = imageSetSummaries.length > 0
    ? imageSetSummaries
    : [buildXmlImageSetSummary("", "Unknown dataset")];
  const summariesByDataset = new Map(sourceSummaries.map((summary) => [summary.dataset, summary]));
  const datasets = studyDatasets.length > 0
    ? studyDatasets.map((dataset, index) => {
        const datasetName = getDatasetTitle(dataset, `Dataset ${index + 1}`);
        const sourceSummary = summariesByDataset.get(datasetName) || sourceSummaries[index] || sourceSummaries[0];
        return {
          ...sourceSummary,
          dataset: datasetName,
        };
      })
    : sourceSummaries;

  const firstSummary = datasets[0] || {};
  return {
    accession_id: accessionID,
    source: xmlUrl,
    data_format: firstSummary.data_format || "",
    file_count: firstSummary.file_count ?? null,
    datasets,
  };
}

export async function buildDatasetFileSummary(accessionID, studyDatasets = []) {
  const empiarEntryId = encodeURIComponent(accessionID.replace("EMPIAR-", ""));
  const xmlUrl = `${EMPIAR_HEADERS_BASE_URL}/${empiarEntryId}.xml`;
  try {
    const xml = await fetchText(xmlUrl);
    const imageSetSummaries = getImageSetXmlBlocks(xml).map((imageSetXml) => buildXmlImageSetSummary(imageSetXml));
    return formatDatasetFileSummary(accessionID, xmlUrl, imageSetSummaries, studyDatasets);
  } catch (error) {
    console.warn(`Optional EMPIAR XML summary unavailable for ${encodeURIComponent(accessionID)}.`);
    return "";
  }
}
