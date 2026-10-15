import { navigationURL, resourceURL } from "../../security/urls.mjs";
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
