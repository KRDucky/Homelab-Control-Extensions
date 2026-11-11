<!--
SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
SPDX-License-Identifier: GPL-3.0-or-later
-->
# Isolated production-shaped Traefik (file provider)

MediaMouse **isolated test** overlay. Not production. No published ports. No
Docker provider. No ACME. CORE and the helper stay as they are.

Adds a file-provider Traefik layout that matches the production paths the
Reverse Proxy module should manage later:

| Host path (this directory) | In-container |
|---|---|
| `traefik.yml` | `/config/traefik.yml` |
| `dynamic/dynamic.yml` | `/config/dynamic/dynamic.yml` |
| `certs/isolated.crt` + `isolated.key` | `/config/certs/` |
| `auth/users.htpasswd` | `/config/auth/users.htpasswd` |

## What is covered

- Simple web apps `webapp-a` / `webapp-b` (pinned Node, plaintext `/`)
- Path-based routing `Host(app.isolated.test) && PathPrefix(/app)`
- File-based static + dynamic config
- BasicAuth (dashboard and `/app`)
- Security headers (HSTS, frame deny, nosniff, XSS filter, referrer)
- Rate limit on `/app`
- Load balancer across two backends
- Backend health checks
- File certificates, including wildcard `*.isolated.test`
- Traefik dashboard on the private `hc-admin` entrypoint (auth required)
- Prometheus metrics on internal `:9100`
- JSON logs + JSON access logs on tmpfs

Phase 4/7-r2 routers (`hc-api`, `fixture-router`, `ping@internal`) stay, so
CORE API 67/67 should still match.

ACME / Let's Encrypt is **not** enabled. Isolated network cannot complete
HTTP-01 or DNS-01. File certs are the certificate manager for this stack.

## Test password (isolated only)

User `isolated-viewer`. Password is `isolated-test`. Hash only is in
`auth/users.htpasswd`. Do not reuse this password anywhere else.

## Overlay order

Same `F` as Phase 9, plus this file **last**:

```sh
export HC_LIVE_SECRET_DIR=/home/ian/Projects/.homecontrol-traefik-test-secrets
EXT=/home/ian/Projects/Homelab-Control-Extensions
F="--project-directory $EXT/dev/traefik-live-test \
  -f $EXT/dev/traefik-live-test/compose.yaml \
  -f $EXT/dev/traefik-phase6/compose.override.yaml \
  -f $EXT/dev/traefik-phase7/compose.broker.proposal.yaml \
  -f $EXT/dev/traefik-phase9/compose.core-phase9.yaml \
  -f $EXT/dev/traefik-phase8/compose.routing-private.yaml \
  -f $EXT/dev/traefik-prod-shape/compose.overlay.yaml \
  --profile validation"
docker --context rootless compose $F config --quiet
```

Recreate Traefik + start webapps. Do **not** recreate CORE:

```sh
docker --context rootless compose $F up -d --no-deps --pull never --wait --wait-timeout 90 traefik webapp-a webapp-b
docker --context rootless compose $F up -d --no-deps --pull never --wait --wait-timeout 90 plugin
```

The Node 22.23.3 image digest must already exist locally (`pull_policy: never`).
It is the same digest CORE artifact builds pull.

## Offline check

```sh
node --test dev/traefik-prod-shape/test.mjs
```

## Rollback

Same `F` without `compose.overlay.yaml`, then recreate `traefik` only (and
remove the webapp containers). Do not touch CORE or the broker.
