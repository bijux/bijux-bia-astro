import { fixtureResponse } from './responses.mjs';

// This process is an isolated verification build/server; no live fallback is permitted.
globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method !== 'GET') throw new Error('Fixture transport supports GET only.');
    return Response.json(fixtureResponse(request.url));
};
