import { escapeHtml } from "../security/html.mjs";
import { navigationURL } from "../security/urls.mjs";

function formatAuthor(name = "") {
    return String(name).trim().replace(/\s+/g, " ").replace(/\b\, PhD\b.*$/i, "").replace(", ", " ");
}

function doiToTag(doi) {
    const href = navigationURL(doi);
    return href ? `<a class="vf-link" href="${escapeHtml(href)}">doi:${escapeHtml(doi.trim().replace(/^https?:\/\/doi\.org\//i, ""))}</a>` : "";
}

export function generateHowToCiteText(study) {
    const authors = (study.author ?? []).map(author => formatAuthor(author.display_name)).filter(Boolean).join(", ");
    const repository = String(study.accession_id ?? "").includes("EMPIAR") ? "EMPIAR" : "BioImage Archive";
    const root = repository === "EMPIAR" ? "https://www.ebi.ac.uk/empiar/" : "https://www.ebi.ac.uk/biostudies/BioImages/studies/";
    const fallback = root + encodeURIComponent(study.accession_id);
    const link = doiToTag(study.doi) || `<a class="vf-link" href="${escapeHtml(fallback)}">${escapeHtml(root + study.accession_id)}</a>`;
    return [escapeHtml(authors), `(${escapeHtml(String(study.release_date ?? "").split("-")[0])})`,
        escapeHtml(String(study.title ?? "").trim()) + ".", ` ${repository}, ${escapeHtml(study.accession_id)}.`, link]
        .filter(Boolean).join(" ") + ".";
}
