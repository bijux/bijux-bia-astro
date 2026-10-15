import { resourceURL } from "../../security/urls.mjs";
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
