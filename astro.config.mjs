import { defineConfig, envField } from 'astro/config';
import { prepareArtifacts } from './scripts/build/artifacts.mjs';

import mdx from "@astrojs/mdx";
import yaml from '@rollup/plugin-yaml';

import netlify from '@astrojs/netlify';
import node from '@astrojs/node';

await prepareArtifacts();

function isNetlify() {
  return process.env.NETLIFY === 'true' || 
         process.env.NETLIFY_DEV === 'true' ||
         !!process.env.AWS_LAMBDA_FUNCTION_NAME
}

const publicURL = new URL(process.env.SITE_URL ||
  (isNetlify() && process.env.DEPLOY_PRIME_URL) || 'https://www.ebi.ac.uk');
if (!['http:', 'https:'].includes(publicURL.protocol) || publicURL.username || publicURL.password) {
  throw new Error('SITE_URL must be an HTTP(S) URL without credentials.');
}

const adapter = isNetlify() 
  ? netlify({ imageCDN: false })
  : node({ mode: 'standalone', experimentalDisableStreaming: true });

export default defineConfig({
  security: {
    allowedDomains: [
      { hostname: 'localhost', protocol: 'http' },
      { hostname: '127.0.0.1', protocol: 'http' },
      { hostname: publicURL.hostname, protocol: publicURL.protocol.slice(0, -1), port: publicURL.port },
    ],
  },
  // Viewer images retain their supplied URLs; this site does not expose an image optimizer.
  image: { service: { entrypoint: 'astro/assets/services/noop' } },
  integrations: [mdx()],

  outDir: './artifacts/dist/bioimage-archive',
  cacheDir: './artifacts/astro-cache',
  compressHTML: true,

  vite: {
    cacheDir: './artifacts/vite',
    plugins: [yaml()]
  },

  base: "/bioimage-archive",

  redirects: {
    '/ai': '/bioimage-archive/galleries/ai',
    '/cryoet': '/bioimage-archive/galleries/cryoet',
    '/vem': '/bioimage-archive/galleries/vem',
    '/vis': '/bioimage-archive/galleries/vis',
    '/ai-glossary': '/bioimage-archive/help/ai-glossary',
    '/help-download': '/bioimage-archive/help/downloading-data',
    '/faq': '/bioimage-archive/help/faq',
    '/help-file-list': '/bioimage-archive/help/file-list',
    '/galleries-contribute': '/bioimage-archive/help/galleries-contribute',
    '/linking-archives': '/bioimage-archive/help/linking-archives',
    '/mifa-model-reference': '/bioimage-archive/help/mifa-model-reference',
    '/mifa-help-overview': '/bioimage-archive/help/mifa-overview',
    '/rembi-help-examples': '/bioimage-archive/help/rembi-examples',
    '/rembi-help-lab': '/bioimage-archive/help/rembi-lab-guide',
    '/rembi-model-reference': '/bioimage-archive/help/rembi-model-reference',
    '/rembi-help-overview': '/bioimage-archive/help/rembi-overview',
    '/help-search': '/bioimage-archive/help/search',
    '/submit-annotations': '/bioimage-archive/help/submit-annotations',
    '/help-tools': '/bioimage-archive/help/supporting-tools',
    '/helpimagesatebi': '/bioimage-archive/policies/imagesatebi',
    '/spora': '/bioimage-archive/projects/spora',

  },
  env: {
    schema: {
      PUBLIC_SEARCH_API: envField.string({
        type: "string",
        required: true,
        access: "public",
        context: "client",
        default: "https://alpha.bioimagearchive.org/search/v1"
      }),
      PUBLIC_MONGO_API: envField.string({
        type: "string",
        required: true,
        access: "public",
        context: "client",
        default: "https://wwwdev.ebi.ac.uk/bioimage-archive/api/v2"
      }),
      PUBLIC_GTAG: envField.string({
        type: "string",
        required: true,
        access: "public",
        context: "client",
        default: ""
      }),
      PUBLIC_WEBSITE_STATE: envField.string({
        type: "string",
        required: true,
        access: "public",
        context: "client",
        default: "DEV"
      })
    }
  },

  adapter
});
