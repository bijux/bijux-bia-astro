import { resourceURL } from "../../../security/urls.mjs";

/** Quote one POSIX shell argument; generated commands are displayed/copied, never run. */
function shellArgument(value) {
    return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

/** Interpret path-style S3 addresses and EBI's bucket-host form without changing the object key. */
export function downloadCommand(value) {
    const approved = resourceURL(value);
    if (!approved) return null;
    const uri = new URL(approved);
    if (uri.search || uri.hash) return null;
    let path;
    try { path = decodeURIComponent(uri.pathname); } catch { return null; }
    if (/[\u0000-\u001f\u007f]/.test(path)) return null;
    const segments = path.slice(1).split("/");
    if (segments.some(segment => segment === "." || segment === ".." || segment.includes("\\"))) return null;
    // EBI bucket-host URLs share the same service endpoint as path-style URLs.
    const suffix = '.livingobjects.ebi.ac.uk';
    const hostname = uri.hostname.replace(/\.$/, '');
    const hostedBucket = hostname.endsWith(suffix) ? hostname.slice(0, -suffix.length) : null;
    const bucket = hostedBucket ?? segments.shift();
    const endpoint = new URL(uri);
    if (hostedBucket) endpoint.hostname = 'livingobjects.ebi.ac.uk';
    if (!bucket || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || !segments.join("/")) return null;
    const filename = segments.filter(Boolean).at(-1);
    if (!filename || [".", ".."].includes(filename)) return null;
    return `aws s3 cp --no-sign-request --endpoint-url ${shellArgument(endpoint.origin)} ${shellArgument(`s3://${bucket}/${segments.join("/")}`)} ${shellArgument(`./${filename}`)} --recursive`;
}
