export const publicDefaults = Object.freeze({
    PUBLIC_SEARCH_API: 'https://alpha.bioimagearchive.org/search/v1',
    PUBLIC_MONGO_API: 'https://wwwdev.ebi.ac.uk/bioimage-archive/api/v2',
    PUBLIC_GTAG: '',
    PUBLIC_WEBSITE_STATE: 'DEV',
    PUBLIC_ALLOW_LOCAL_VIEWERS: 'false',
    SITE_URL: 'https://www.ebi.ac.uk',
});

/** Public settings are compiled into both prerendered pages and browser scripts. */
export function buildConfiguration(environment = process.env) {
    const configuration = Object.fromEntries(Object.entries(publicDefaults)
        .map(([name, fallback]) => [name, environment[name] || fallback]));
    for (const name of ['PUBLIC_SEARCH_API', 'PUBLIC_MONGO_API', 'SITE_URL']) {
        const url = new URL(configuration[name]);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || name === 'SITE_URL' && url.pathname !== '/') {
            throw new Error(`${name} must be an HTTP(S) URL without credentials, query or fragment; SITE_URL must be an origin.`);
        }
    }
    if (!['true', 'false'].includes(configuration.PUBLIC_ALLOW_LOCAL_VIEWERS)) throw new Error('PUBLIC_ALLOW_LOCAL_VIEWERS must be true or false.');
    return configuration;
}
