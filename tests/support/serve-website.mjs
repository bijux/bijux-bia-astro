import prepareWebsite, { env, root } from '../../scripts/verification/application.mjs';
import { pathToFileURL } from 'node:url';
await prepareWebsite();
Object.assign(process.env, env, { HOST: '127.0.0.1', PORT: process.env.WEBSITE_TEST_PORT ?? '4399', DEPLOYMENT_MANIFEST: `${root}/artifacts/deployment/manifest.json` });
await import('../fixtures/website/preload.mjs');
await import(pathToFileURL(`${root}/scripts/server.mjs`).href);
