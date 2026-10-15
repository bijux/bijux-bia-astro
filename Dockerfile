FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS dependencies
WORKDIR /app
RUN chown node:node /app
USER node
COPY --chown=node:node package.json package-lock.json .npmrc ./
COPY --chown=node:node scripts/build/artifacts.mjs ./scripts/build/artifacts.mjs
RUN npm ci

FROM dependencies AS build
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chown=node:node astro.config.mjs tsconfig.json ./
COPY --chown=node:node scripts/deployment ./scripts/deployment
ARG PUBLIC_SEARCH_API
ARG PUBLIC_MONGO_API
ARG PUBLIC_GTAG
ARG PUBLIC_WEBSITE_STATE
ARG PUBLIC_ALLOW_LOCAL_VIEWERS
ARG SITE_URL
ENV PUBLIC_SEARCH_API=$PUBLIC_SEARCH_API PUBLIC_MONGO_API=$PUBLIC_MONGO_API \
    PUBLIC_GTAG=$PUBLIC_GTAG PUBLIC_WEBSITE_STATE=$PUBLIC_WEBSITE_STATE \
    PUBLIC_ALLOW_LOCAL_VIEWERS=$PUBLIC_ALLOW_LOCAL_VIEWERS SITE_URL=$SITE_URL
RUN npm run build:deployment

FROM dependencies AS production-dependencies
RUN npm ci --omit=dev --ignore-scripts && node scripts/build/artifacts.mjs

FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS runtime
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/artifacts/node_modules ./artifacts/node_modules
COPY --from=build --chown=node:node /app/artifacts/dist ./artifacts/dist
COPY --from=build --chown=node:node /app/artifacts/deployment ./artifacts/deployment
COPY --chown=node:node package.json ./
COPY --chown=node:node scripts/server.mjs ./scripts/server.mjs
COPY --chown=node:node scripts/deployment/manifest.mjs scripts/deployment/configuration.mjs ./scripts/deployment/
COPY --chown=node:node src/security/headers.mjs ./src/security/headers.mjs
RUN ln -s artifacts/node_modules node_modules
USER node
RUN node scripts/deployment/manifest.mjs verify
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 \
    DEPLOYMENT_MANIFEST=/app/artifacts/deployment/manifest.json
EXPOSE 8080
CMD ["node", "scripts/server.mjs"]
