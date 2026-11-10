<!-- SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
# Phase 6 isolated deployment proposal — approval required

No commands in this document have replaced containers. The new images are built;
all current Phase 4 test containers remain unchanged. Do not execute the following
until the user explicitly approves this deployment.

## Exact resources and effects

- Replace only `hc-traefik-plugin-test` with `homecontrol/traefik-plugin:phase6`.
- Replace only `hc-traefik-core-test` with `homecontrol/traefik-core:phase6`.
- Stop/recreate `hc-traefik-browser-test` using its SAME existing
  `homecontrol/traefik-browser:phase4-r1` image, because it shares CORE's namespace.
- Preserve `hc-traefik-fixture` exactly, including its file provider configuration.
- Reuse internal network `hc-traefik-test`; no new networks or ports.
- CORE enables only `-compose-discovery-fixture`. No raw Docker socket anywhere.
- New CORE entrypoint creates only `/state/users.json` in its fresh private tmpfs,
  mode 0600; grant `docker.compose.read` only to enabled `traefik-viewer`, retaining
  existing scopes/password hash. Other accounts unchanged. Host secret files,
  ACLs and passwords stay unchanged. CORE replacement loses old test sessions and
  tmpfs audit/state DB; no production data involved. Do not clean old resources
  automatically or delete images. Compose handles replacement only after approval.
- Existing non-root 1000:1000, read-only roots, dropped caps, no-new-privileges,
  resource limits, private secret mounts and health checks all inherited from base.

Image IDs are recorded in `codex-reports/traefik-phase6-images.json`. Recheck exact
IDs, current resource identities, rootless context, ACLs/UID mapping and original
Traefik config hashes immediately before execution. Stop on mismatch. Do not
refresh/pull mutable image tags to make the deployment pass.

## Exact proposed commands

Run from `/home/ian/Projects/Homelab-Control-Extensions` after approval. Setting
HC_LIVE_SECRET_DIR specifies a path, not a credential value.

```sh
export HC_LIVE_SECRET_DIR=/home/ian/Projects/.homecontrol-traefik-test-secrets

docker --context rootless compose --project-directory /home/ian/Projects/Homelab-Control-Extensions/dev/traefik-live-test -f dev/traefik-live-test/compose.yaml -f dev/traefik-phase6/compose.override.yaml --profile validation config --quiet

docker --context rootless compose --project-directory /home/ian/Projects/Homelab-Control-Extensions/dev/traefik-live-test -f dev/traefik-live-test/compose.yaml -f dev/traefik-phase6/compose.override.yaml --profile validation stop browser

docker --context rootless compose --project-directory /home/ian/Projects/Homelab-Control-Extensions/dev/traefik-live-test -f dev/traefik-live-test/compose.yaml -f dev/traefik-phase6/compose.override.yaml --profile validation up -d --no-deps --pull never --wait --wait-timeout 90 plugin

docker --context rootless compose --project-directory /home/ian/Projects/Homelab-Control-Extensions/dev/traefik-live-test -f dev/traefik-live-test/compose.yaml -f dev/traefik-phase6/compose.override.yaml --profile validation up -d --no-deps --pull never --wait --wait-timeout 90 core

docker --context rootless compose --project-directory /home/ian/Projects/Homelab-Control-Extensions/dev/traefik-live-test -f dev/traefik-live-test/compose.yaml -f dev/traefik-phase6/compose.override.yaml --profile validation up -d --no-deps --pull never --force-recreate browser
```

Stop after any failure. `--no-deps` prevents changes to Traefik. This does not
approve future Docker socket access or provider changes. Do not use compose down,
prune, restart all, remove-orphans, rootful Docker or automatic rollback/recreation.

## Actual-backend validation after approval

Stream source scripts to existing image working directories; there is no asset
interception or API mock in these Phase 6 checks:

```sh
docker --context rootless exec -i hc-traefik-core-test node --input-type=module < dev/traefik-phase6/validate.mjs

docker --context rootless exec -i hc-traefik-browser-test node --input-type=module < dev/traefik-phase6/browser.mjs
```

Both import the already installed `./private-file.mjs` from image WORKDIR. Tests
read private mounted fixture credentials in process, never from the browser API.
They verify discovery, HTTP/HTTPS previews through the real backend, disabled
Docker provider blocker, network labels, RBAC/CSRF and invalid models. Browser
checks real inventory and the full Add Proxy Host flow; no bearer token is sent
to browser APIs. Error logs contain only stage names, never Playwright call logs
that could include typed passwords.

On success, export `/tmp/traefik-phase6-webui.png` from the browser container with
a read-only exec streaming its bytes to the exact new host report path
`/home/ian/Projects/codex-reports/traefik-phase6-webui.png`. Refuse an existing file
unless overwrite is explicitly intended. Leave successful containers running.
No example command invokes apply, deploy, restart or changes a Compose application.
