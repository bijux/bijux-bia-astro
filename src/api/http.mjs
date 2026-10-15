/** Fixed/configured API origins stay fixed across redirects, with bounded bodies and time. */
async function fetchText(value, { timeout = 15000, maxBytes = 8 * 1024 * 1024, signal: callerSignal } = {}) {
    if (![timeout, maxBytes].every(number => Number.isSafeInteger(number) && number > 0)) throw new RangeError("Invalid API request limits.");
    const first = new URL(value);
    if (!["http:", "https:"].includes(first.protocol) || first.username || first.password) throw new TypeError("Unsupported API destination.");
    const signal = callerSignal ? AbortSignal.any([callerSignal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
    let url = first;
    for (let redirects = 0; redirects <= 3; redirects++) {
        const response = await fetch(url, { redirect: "manual", signal });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            await response.body?.cancel();
            const location = response.headers.get("location");
            if (!location) throw new TypeError("API redirect did not supply a destination.");
            const target = new URL(location, url);
            if (target.origin !== first.origin || target.username || target.password) throw new TypeError("API redirect left its configured origin.");
            url = target; continue;
        }
        if (!response.ok) { await response.body?.cancel(); throw new Error(`API returned HTTP ${response.status}.`); }
        const size = response.headers.get("content-length");
        if (size && Number(size) > maxBytes) { await response.body?.cancel(); throw new RangeError("API response exceeded its size limit."); }
        const reader = response.body?.getReader();
        if (!reader) throw new Error("API returned an empty body.");
        const chunks = []; let bytes = 0;
        try {
            while (true) {
                const { done, value: chunk } = await reader.read();
                if (done) break;
                bytes += chunk.byteLength;
                if (bytes > maxBytes) throw new RangeError("API response exceeded its size limit.");
                chunks.push(chunk);
            }
        } catch (error) { await reader.cancel().catch(() => {}); throw error; }
        const combined = new Uint8Array(bytes); let offset = 0;
        for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
        return new TextDecoder("utf-8", { fatal: true }).decode(combined);
    }
    throw new Error("API exceeded its redirect limit.");
}

export async function fetchJSON(value, options) {
    return JSON.parse(await fetchText(value, options));
}

export async function boundedMap(values, mapper, concurrency = 4) {
    if (!Array.isArray(values) || !Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new RangeError("Invalid bounded operation.");
    const results = new Array(values.length); let next = 0, failed = false;
    await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
        while (!failed && next < values.length) {
            const index = next++;
            try { results[index] = await mapper(values[index], index); }
            catch (error) { failed = true; throw error; }
        }
    }));
    return results;
}
