import { loadRelatedEntries } from "../../api/related-entries.mjs";
import { renderRelatedEntries } from "./related-entry-preview.mjs";
import { getMetadataValue } from "../metadata/records.mjs";
import { formatBytesToHumanSize } from "../../formatting/units.mjs";
import { getStudyImage } from "../images/study-image.mjs";

/** Resolve file-service links once per page, retaining the existing EMPIAR destinations. */
export async function loadStudyFiles(accessionID, request) {
  const dirNumber = accessionID.replace("S-BIAD", "").replace("EMPIAR-", "");
  if (accessionID.includes("EMPIAR")) return {
    ftpHttpsLink: `https://ftp.ebi.ac.uk/empiar/world_availability/${dirNumber}`,
    globusLink: `https://app.globus.org/file-manager?origin_id=47772002-3e5b-4fd3-b97c-18cee38d6df2&origin_path=/empiar/world_availability/${dirNumber}/`,
  };
  const info = await request(`https://www.ebi.ac.uk/biostudies/api/v1/studies/${encodeURIComponent(accessionID)}/info`);
  if (!info || typeof info !== "object" || Array.isArray(info) ||
      [info.httpLink, info.globusLink].some(value => value != null && typeof value !== "string")) throw new TypeError(`Invalid file links for study ${accessionID}.`);
  return { ftpHttpsLink: info.httpLink, globusLink: info.globusLink || "" };
}

/** Prepare required study data before rendering; missing catalogue entries must fail the build. */
export async function loadStudyPage(accessionID, client, relatedEntries = loadRelatedEntries) {
  const tableOfContents = {
    "Viewable Images": "viewable_images",
    "Study Information": "study",
    "Linked Information": "linked_information",
    "Datasets": "study_components"
  };

  const study = await client.getStudyFromApiByAccession(accessionID);
  if (!study) throw new Error(`Study ${accessionID} is unavailable.`);
  if (!study.licence_details) throw new TypeError(`Study ${accessionID} has no licence metadata.`);
  if (study.dataset.length === 0) delete tableOfContents['Datasets'];
  const images = study?.image ?? []
  const hasSpecimenTracks = images.length > 0 ? await client.studyHasSpecimenTracks(accessionID) : false;
  const isEMPIAR = accessionID.includes("EMPIAR");
  const { ftpHttpsLink, globusLink } = await loadStudyFiles(accessionID, client.getFromAPI);
  const fileListUrls = getMetadataValue(study?.additional_metadata, "file_list_visualisation");
  const hasFileList = Boolean(fileListUrls?.table_view && fileListUrls?.tree_view);
  const browseFilesLink = hasFileList ? "#file_list" : ftpHttpsLink;

  if (hasFileList) {
    tableOfContents["Browse All Files"] = "file_list";
  }

  const { pdb, emdb } = await relatedEntries(study, client.getFromAPI);
  const [pdbLinks, emdbLinks] = renderRelatedEntries(pdb, emdb);
  if ((!Array.isArray(study.see_also) || study.see_also.length === 0) && !pdbLinks && !emdbLinks) {
    delete tableOfContents["Linked Information"];
  }

  const groupedGrants = Object.create(null);
  if (study?.grant && Array.isArray(study.grant)) {
    for (const grant of study.grant) {
      const funderName =
        (grant.funder && Array.isArray(grant.funder) && grant.funder.length > 0)
          ? grant.funder[0].display_name
          : 'Other Grant';

      if (grant.id) {
          if (!groupedGrants[funderName]) {
              groupedGrants[funderName] = [];
          }

          groupedGrants[funderName].push({
              id: grant.id,
              funderName: funderName
          });
      }
    }
  }

  const exampleStudyImage = getStudyImage(study);

  function getImageUUIDFromStudyImage(exampleURI, images){
    const selectedURI = Array.isArray(exampleURI) ? exampleURI[0] : exampleURI;
    const thumbnailImage = images.find(img => {
      const meta = getMetadataValue(img.additional_metadata, "image_static_display_uri");
      return meta?.slice?.uri === selectedURI;
    });
    return thumbnailImage?.uuid || ""
  }

  const studyImagePageLink = getImageUUIDFromStudyImage(exampleStudyImage, images);

  const headlineStats = {
    "Total Viewable Images":  study?.dataset.reduce((accumulator, dataset) => accumulator + dataset.image_count, 0) || 0,
    "Total files": study?.dataset.reduce((accumulator, dataset) => accumulator + dataset.file_reference_count, 0) || 0,
    "Total size of files": formatBytesToHumanSize(study?.dataset.reduce((accumulator, dataset) => accumulator + dataset.file_reference_size_bytes, 0) || 0),
  };

  return { accessionID, study, images, hasSpecimenTracks, isEMPIAR, ftpHttpsLink, globusLink, fileListUrls, hasFileList,
    browseFilesLink, tableOfContents, pdbLinks, emdbLinks, groupedGrants, exampleStudyImage, studyImagePageLink, headlineStats };
}
