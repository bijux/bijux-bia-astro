/** Encode text/attribute content; URL and script-data policies are separate. */
export function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
}

/** Script raw-text elements can terminate before their JSON parser sees the value. */
export function scriptData(value) {
    const json = JSON.stringify(value);
    if (json === undefined) throw new TypeError("Script data must have a JSON representation.");
    return json.replace(/[<>&\u2028\u2029]/g, character => ({
        "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "\u2028": "\\u2028", "\u2029": "\\u2029",
    })[character]);
}
