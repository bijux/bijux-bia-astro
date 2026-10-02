import { fixtureTarget } from './network-map.mjs';

export async function isolateBrowser(context, fixtureOrigin, appOrigin) {
  const blocked = [];
  await context.route('**/*', async route => {
    const request = route.request();
    let target;
    try {
      target = fixtureTarget(request.url(), fixtureOrigin, appOrigin);
    } catch {
      blocked.push({ origin: new URL(request.url()).origin, resource: request.resourceType() });
      await route.abort('blockedbyclient');
      return;
    }
    if (target === request.url()) await route.continue();
    else await route.fulfill({ response: await context.request.get(target, { timeout: 2000 }) });
  });
  return blocked;
}
