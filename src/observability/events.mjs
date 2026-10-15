/** Emit bounded, structured operator events; callers omit queries, bodies and credentials. */
export function logEvent(event, fields = {}) {
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), event, ...fields }));
}
