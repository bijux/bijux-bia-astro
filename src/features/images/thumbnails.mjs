import { getMetadataValue } from "../metadata/records.mjs"; import { navigationURL, resourceURL } from "../../security/urls.mjs"; import imageFallback from "../../assets/bioimage-archive/image_fallback.png";
export function getThumbnail(img) {
    const thumbnail_uri = getMetadataValue(img.additional_metadata, "image_thumbnail_uri")?.["256"]?.["uri"] || imageFallback.src;
    return resourceURL(thumbnail_uri) ?? navigationURL(imageFallback.src);
}
