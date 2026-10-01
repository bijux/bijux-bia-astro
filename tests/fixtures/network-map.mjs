export function fixtureTarget(address, fixtureOrigin, appOrigin) {
  const fixture = new URL(fixtureOrigin);
  if (fixture.protocol !== 'http:' || fixture.hostname !== '127.0.0.1' || fixture.pathname !== '/') throw new Error('Fixture origin must be loopback HTTP.');
  const url = new URL(address);
  if (url.origin === fixture.origin || (appOrigin && url.origin === appOrigin)) return url.toString();
  if (url.origin === 'https://alpha.bioimagearchive.org' && /^\/search\/v1\/website\/(browse\/)?(study|image)$/.test(url.pathname)) {
    return `${fixture.origin}${url.pathname}${url.search}`;
  }
  if (url.origin === 'https://wwwdev.ebi.ac.uk' && /^\/bioimage-archive\/api\/v2\/dataset\/[^/]+\/file_reference$/.test(url.pathname)) {
    return `${fixture.origin}${url.pathname.replace('/bioimage-archive', '')}${url.search}`;
  }
  if (url.origin === 'https://www.ebi.ac.uk' && (/^\/biostudies\/api\/v1\/studies\/[^/]+\/info$/.test(url.pathname) || /^\/ebisearch\/ws\/rest\/ebiweb_training_(online|events)$/.test(url.pathname))) {
    return `${fixture.origin}${url.pathname}${url.search}`;
  }
  throw new Error(`Undeclared network origin or route: ${url.origin}`);
}
