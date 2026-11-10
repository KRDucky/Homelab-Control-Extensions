<!--
SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
SPDX-License-Identifier: GPL-3.0-or-later
-->
# Phase 7-r2 / Phase 8 isolated test overlays (MediaMouse)

These overlays reproduce the **isolated Traefik test environment** that was live-validated on
MediaMouse on 2026-11-10: 67/67 API checks, 8/8 browser checks and 14/14 preservation checks.
They are development and test material only.

- **No Apply/Deploy.** Previews only.
- **Docker provider disabled.**
- **No production use.**

The absolute host paths are **MediaMouse-specific test locations**, not portable or production
defaults. Adapt them, and re-review, before using them anywhere else.

## Files

| File | Effect |
|---|---|
| `compose.core-phase7-r2.yaml` | Sets CORE's image to the locally built `homecontrol/traefik-core:phase7-r2` (`sha256:2fc56a40…0d72`, hc-api `ef4d7c52…de9c2`). |
| `compose.routing-private.yaml` | Changes **only** the source of CORE's read-only routing bind (target `/opt/live-test/docker-metadata-routing.json`) to the private `/home/ian/.homecontrol-metadata-test/config/routing.json`. |

## Overlay order

Run from the repository root. Every file is required, in this order:

```sh
export HC_LIVE_SECRET_DIR=/home/ian/Projects/.homecontrol-traefik-test-secrets   # outside Git
F="--project-directory dev/traefik-live-test \
  -f dev/traefik-live-test/compose.yaml \
  -f dev/traefik-phase6/compose.override.yaml \
  -f dev/traefik-phase7/compose.broker.proposal.yaml \
  -f dev/traefik-phase8/compose.core-phase7-r2.yaml \
  -f dev/traefik-phase8/compose.routing-private.yaml \
  --profile validation"
docker --context rootless compose $F config --quiet
```

Without `compose.routing-private.yaml`, CORE mounts the repository example
`Homelab-Control-Traefik/dev/docker-metadata-test/routing.example.json` instead. That file is the
reviewed example and the rollback source; it is not the runtime file.

## Required private resources (created separately, never by Compose)

- **Metadata broker:** `hc-docker-metadata-test.service`, a transient user unit. Its private root
  is `/home/ian/.homecontrol-metadata-test` (0700), with:
  - the `transport/` socket and its ACL for UID 100999;
  - the `credentials/broker_token` file and its ACL;
  - the reviewed broker binary, `14fcd504…850a`.

  See `dev/traefik-phase7/compose.broker.proposal.yaml` and the Traefik repository's
  `docs/dev/DOCKER-METADATA-BROKER.md`. The token is never committed.
- **Routing configuration:** `/home/ian/.homecontrol-metadata-test/config/routing.json`.
  - It is a regular file, 1000:1000, **0644**, with no ACL, in `config/` (1000:1000, **0700**).
  - Its content is byte-identical to the reviewed example (SHA-256
    `eb772ff252d81a8b306754609f186fa5ad969d6f75ba4917f70db6f4d7876d55`): network
    `hc-traefik-test`, entrypoint `web`, no resolvers, `dockerProvider: false`. There are no secrets.
  - Create it once, as the rootless Docker user. Use an exclusive `mkdir`, then
    `O_CREAT|O_EXCL|O_NOFOLLOW` relative to the directory descriptor, after verifying the source
    checksum. Never overwrite it, and never follow symlinks.
  - 0644 is required: CORE's mapped UID reads the bind-mounted file through "other" read. 0600
    fails with `EACCES` unless an ACL is added. `LoadRouting` refuses group- or other-writable
    files.
  - CORE never traverses the host path, so no directory ACL is needed.
  - The bind pins the inode, and CORE reads the file only at startup. To change it, write a new
    reviewed file, then recreate CORE.
- **Test secrets:** in `HC_LIVE_SECRET_DIR`, outside Git.

## Preflight (stop on any mismatch)

1. `docker --context rootless info` reports `name=rootless`. Never use the rootful context.
2. The image `homecontrol/traefik-core:phase7-r2` ID is `sha256:2fc56a40…0d72`.
3. The broker unit is active with the expected PID, no restarts and binary `14fcd504…`. The
   transport, socket and token ACLs are as reviewed.
4. `config/` is a real directory, 0700. `routing.json` is a regular file (not a symlink),
   1000:1000, 0644, one link, no ACL, and has the SHA-256 above.
5. The secrets, network `hc-traefik-test` (internal), and the Traefik fixture and plugin
   containers are unchanged.
6. The rendered configuration differs from the currently deployed one only in the intended keys:
   `core.image` for r2, and the routing bind `source` for Phase 8.

## Deployment (approval required each time)

```sh
docker --context rootless compose $F stop browser
docker --context rootless compose $F up -d --no-deps --pull never --wait --wait-timeout 90 core
docker --context rootless compose $F up -d --no-deps --pull never --force-recreate browser
```

**Verify:**
- CORE is healthy, with its restrictions and mounts unchanged.
- The routing bind source is the private file, read-only.
- The API and browser suites pass.
- The broker, ACLs, sockets and secrets are unchanged.

## Rollback (approval required)

| Target | Run the same commands with |
|---|---|
| Repository-path routing mount (Phase 7-r2 state) | `F` **without** `compose.routing-private.yaml` |
| `:phase7-r1` image (Variant B) | `F` without both Phase 8 files, plus `-f dev/traefik-phase7/compose.variant-b.proposal.yaml` |

Rollback never touches the broker, ACLs, sockets or private files. Removing `config/` is a
separate cleanup approval, and only after CORE no longer mounts it.
