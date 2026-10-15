const controlCharacters = /[\u0000-\u0020\u007f]/;
// Legacy metadata may wrap one URI in a list. Multiple values have no single destination.
const singleURI = value => Array.isArray(value) && value.length === 1 ? value[0] : value;

/** Navigation may use site-relative paths or credential-free HTTP(S) destinations. */
export function navigationURL(value, base = "https://bia.invalid/") {
    value = singleURI(value);
    if (typeof value !== "string") return null;
    const text = value.trim();
    if (!text || controlCharacters.test(text) || text.includes("\\") || text.startsWith("//")) return null;
    if (/^[a-z][a-z\d+.-]*:/i.test(text) && !/^https?:\/\//i.test(text)) return null;
    try {
        const url = new URL(text, base);
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
        if (text.startsWith("#")) return url.hash || "#";
        if (text.startsWith("?")) return `${url.search || "?"}${url.hash}`;
        return /^[a-z][a-z\d+.-]*:/i.test(text) ? url.href : `${url.pathname}${url.search}${url.hash}`;
    } catch { return null; }
}

/** Resource/viewer inputs require absolute HTTP(S); local data is a separate deployment mode. */
export function resourceURL(value, { allowLocal = false } = {}) {
    value = singleURI(value);
    if (typeof value !== "string" || !/^https?:\/\//i.test(value.trim())) return null;
    const approved = navigationURL(value);
    if (!approved || !allowLocal && isLocalHostname(new URL(approved).hostname)) return null;
    return approved;
}

export function isLocalHostname(hostname) {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
    if (host.includes(":")) {
        // WHATWG URL parsing canonicalizes IPv4-mapped literals to hexadecimal IPv6.
        const mapped = host.match(/^::ffff:([\da-f]{1,4}):([\da-f]{1,4})$/);
        if (mapped) {
            const words = mapped.slice(1).map(value => parseInt(value, 16));
            return isLocalHostname(`${words[0] >> 8}.${words[0] & 255}.${words[1] >> 8}.${words[1] & 255}`);
        }
        return !/^[23][\da-f]{3}:/.test(host);
    }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
        const [a, b, c, d] = host.split(".").map(Number);
        return a === 0 || a === 10 || a === 127 || a >= 224 ||
            a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 ||
            a === 192 && (b === 168 || b === 0 && c === 0 && d !== 9 && d !== 10) || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19);
    }
    return !host.includes(".") || ["localhost", "local", "internal", "lan", "home.arpa"].some(suffix => host === suffix || host.endsWith(`.${suffix}`));
}
