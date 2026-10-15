# Deploying a verified image

Build with the intended public API/site configuration, then publish that verified
image once. Public settings are baked into the image; the chart does not override
them. Remove the old `env.publicSearchApi`, `env.publicMongoApi` and
`env.publicGtag` values when upgrading, and avoid `--reuse-values`.

```sh
helm upgrade --install bia ./helm-chart --set image.repository=REGISTRY/IMAGE \
  --set image.digest=sha256:DIGEST --atomic --wait --timeout 5m
kubectl rollout status deployment/bia-website --timeout=180s
helm history bia
helm rollback bia REVISION --wait --timeout 5m
```

Supply exactly one image digest or immutable tag. Startup, liveness and readiness
check the Node server without contacting catalogue APIs. Rolling updates keep the
old replica until its replacement is ready; termination allows endpoint removal
and a ten-second request drain. Startup/error/slow-request events are JSON with
request IDs, paths and status codes; queries, bodies and credentials are omitted.
`X-Request-ID` correlates runtime responses with errors. Inspect pod logs and
Deployment events when a rollout fails; `--atomic` restores the previous release.

`helm lint ./helm-chart --set image.tag=verification` validates local chart input.
`npm run verify:website` checks the production browser journeys with saved data;
it does not establish live API or remote cluster availability.
