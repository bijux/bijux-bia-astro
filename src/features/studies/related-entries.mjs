import { loadRelatedEntries } from "../../api/related-entries.mjs"; import { renderRelatedEntries } from "../../formatting/related-entries.mjs";
export async function buildPDBandEMDBLinks(study) {
  const { pdb, emdb } = await loadRelatedEntries(study);
  return renderRelatedEntries(pdb, emdb);
}
