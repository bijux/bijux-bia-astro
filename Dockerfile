FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402

WORKDIR /app
RUN chown node:node /app
USER node
COPY --chown=node:node package.json package-lock.json .npmrc ./
COPY --chown=node:node scripts/build/artifacts.mjs ./scripts/build/artifacts.mjs
RUN npm ci
COPY --chown=node:node . .

ENV HOST=0.0.0.0 PORT=8080
EXPOSE 8080
# Public API configuration is supplied when this deployment starts, before Astro builds.
CMD ["sh", "-c", "npm run build && npm run prod"]
