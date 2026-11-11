<!--
SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
SPDX-License-Identifier: GPL-3.0-or-later
-->
# Phase 9 isolated CORE overlay (MediaMouse)

Replaces only CORE's image with the locally built `homecontrol/traefik-core:phase9`
from Homelab-Control `4ff3fd50` (PR #62). Keep the Phase 8 private routing overlay
last. Development and test material only.

- **No Apply/Deploy.** Previews only.
- **Docker provider disabled.**
- **No production use.**
- **No broker rebuild.** `hc-docker-metadata` remains `14fcd504…850a`.

Live-validated 2026-11-11: API 67/67, identity 29/29, browser 8/8.
CORE image `sha256:3e37541c9536a7863dde1ba57b61a88ac1256356ab7a5d2e258c3fc11ec0a887`
(hc-api `b2d63940…`). Report: `codex-reports/phase9-isolated-deploy.md`.

## Overlay order

```sh
export HC_LIVE_SECRET_DIR=/home/ian/Projects/.homecontrol-traefik-test-secrets
F="--project-directory dev/traefik-live-test \
  -f dev/traefik-live-test/compose.yaml \
  -f dev/traefik-phase6/compose.override.yaml \
  -f dev/traefik-phase7/compose.broker.proposal.yaml \
  -f dev/traefik-phase9/compose.core-phase9.yaml \
  -f dev/traefik-phase8/compose.routing-private.yaml \
  --profile validation"
docker --context rootless compose $F config --quiet
```

`compose.core-phase9.yaml` is used **in place of** `dev/traefik-phase8/compose.core-phase7-r2.yaml`.
Broker, secrets, fixture, plugin, network and ports are unchanged.

Rollback: the same `F` with `compose.core-phase7-r2.yaml` instead of the phase9 overlay.
Do not touch the broker.
