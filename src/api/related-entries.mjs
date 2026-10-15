import { fetchJSON, boundedMap } from "../security/requests.mjs";

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalisePDBAccession(accession) {
  return String(accession ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normaliseEMDBAccession(accession) {
  const digits = String(accession ?? "").match(/\d+/)?.[0];
  return digits || "";
}

function getHrefFromLinkValue(link) {
  const value = String(link ?? "").trim();
  const markdownLink = value.match(/^\[[^\]]+\]\(([^)]+)\)$/);
  return markdownLink?.[1] ?? value;
}

function getPDBAccessionFromLink(link) {
  const href = getHrefFromLinkValue(link);
  const pdbPathMatch = href.match(/\/pdb\/([a-z0-9]{4})(?:[/?#]|$)/i);
  if (pdbPathMatch) return normalisePDBAccession(pdbPathMatch[1]);

  try {
    const lastPathPart = new URL(href).pathname.split("/").filter(Boolean).pop();
    const accession = normalisePDBAccession(lastPathPart);
    return accession.length === 4 ? accession : "";
  } catch {
    const accession = normalisePDBAccession(href);
    return accession.length === 4 ? accession : "";
  }
}

function getEMDBAccessionFromLink(link) {
  const href = getHrefFromLinkValue(link);
  const emdbMatch = href.match(/EMD[-_]?(\d+)/i);
  return emdbMatch?.[1] ?? normaliseEMDBAccession(href);
}

function uniqueRelatedEntries(entries) {
  const uniqueEntries = new Map();
  for (const entry of entries) {
    if (entry?.accession && !uniqueEntries.has(entry.accession)) {
      uniqueEntries.set(entry.accession, entry);
    }
  }
  return Array.from(uniqueEntries.values());
}

function getRelatedEntries(study, linkType) {
  const lowerLinkType = String(linkType ?? "").toLowerCase();
  const normaliseAccession = lowerLinkType === "pdb"
    ? normalisePDBAccession
    : normaliseEMDBAccession;
  const getAccessionFromLink = lowerLinkType === "pdb"
    ? getPDBAccessionFromLink
    : getEMDBAccessionFromLink;
  const legacyField = lowerLinkType === "pdb" ? "pdb_accession" : "emdb_accession";

  const apiEntries = asArray(study?.see_also)
    .filter((entry) => String(entry?.link_type ?? "").toLowerCase() === lowerLinkType)
    .map((entry) => {
      const link = entry?.link;
      const href = getHrefFromLinkValue(link);
      return {
        accession: getAccessionFromLink(link),
        href,
      };
    });

  const legacyEntries = asArray(study?.[legacyField])
    .map(normaliseAccession)
    .filter(Boolean)
    .map((accession) => ({
      accession,
      href: lowerLinkType === "pdb"
        ? `https://www.ebi.ac.uk/pdbe/entry/pdb/${accession}`
        : `https://www.ebi.ac.uk/emdb/EMD-${accession}`,
    }));

  return uniqueRelatedEntries([...apiEntries, ...legacyEntries]);
}

/** Fetch optional resolution metadata separately from HTML generation. */
export async function loadRelatedEntries(study) {
  const pdb = getRelatedEntries(study, "pdb");
  const emdb = await boundedMap(getRelatedEntries(study, "emdb"), async ({ accession, href }) => {
    let metadata = null;
    try {
      metadata = await fetchJSON(`https://www.ebi.ac.uk/emdb/api/entry/EMD-${encodeURIComponent(accession)}`);
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new TypeError("Invalid EMDB response.");
    } catch {
      metadata = null;
      console.warn(`Optional EMDB resolution unavailable for EMD-${encodeURIComponent(accession)}.`);
    }
    return { accession, href, metadata };
  });
  return { pdb, emdb };
}
