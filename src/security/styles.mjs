/** Metadata can supply a colour value, never an additional CSS declaration or resource URL. */
export function metadataColour(value) {
    if (typeof value !== "string" || value.length > 128) return "transparent";
    const colour = value.trim();
    const literal = /^(?:[a-z]+|#[\da-f]{3}|#[\da-f]{4}|#[\da-f]{6}|#[\da-f]{8})$/i;
    const functional = /^(?:rgba?|hsla?)\([\d\s.,%/+\-]+\)$/i;
    return literal.test(colour) || functional.test(colour) ? colour : "transparent";
}
