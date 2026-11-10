# Isolated Traefik live-test proposal

**Not deployed.** No network, private secret, ACL or container has been created.
Approval and exact commands are recorded in
`/home/ian/Projects/codex-reports/traefik-live-test-plan.md`.

| File | Purpose |
| --- | --- |
| `compose.yaml` | Three test services and optional browser service; no published ports |
| `traefik.yaml`, `dynamic.yaml` | Private API/ping and file-provider router/service/middleware fixture |
| `core.Dockerfile` | Node utility runtime plus the previously tested static CORE binaries |
| `core-entrypoint.sh` | Copy hashed fixture users to private mode-0600 tmpfs, then exec non-root CORE |
| `modules.json`, `files.json` | Disable unrelated modules and all filesystem browsing |
| `core-health.mjs` | Loopback minimal CORE health probe |
| `private-file.mjs` | Bounded/no-follow reads of private fixture values |
| `preflight.py` | Read-only collision, rootless endpoint, image identity and binary-hash checks |
| `provision-secrets.py` | Approval-only creation of isolated credentials and four mapped-UID read ACLs |
| `validate.mjs` | Live Traefik/helper/CORE inventory, authentication, diagnostics and preview checks |
| `failure-probe.mjs` | Safe real connection/DNS failures from helper, without altering its configuration |
| `browser.Dockerfile`, `browser-package.json`, `browser.mjs` | CI-version Playwright tool, private WebUI test and screenshot |
| `test_plan.py` | Offline configuration safety/fixture consistency checks |

The helper's existing `homecontrol/traefik-plugin:dev` image must match the approved
Phase 2 SHA before reuse. No Docker provider or socket is used. Traefik admin access
is deliberately unauthenticated only inside this dedicated internal test network;
membership is therefore a trust boundary. Never attach unrelated workloads.

CORE listens on container loopback `127.0.0.1:9180` in its existing development mode.
It is not reachable from the host or a separate ordinary network namespace. The
optional browser shares CORE's network namespace and proves real rendering without
publishing a port. The browser gets only the fixture user's password, never a helper
token; it restricts page requests to CORE. Chromium process sandboxing is disabled for
this trusted test, while the container remains non-root, read-only, capability-free,
under Docker default seccomp and isolated from host PID/IPC/network namespaces. Do not
use it for arbitrary browsing. No host IPC, privileged mode or SYS_ADMIN is requested.

Browser tooling uses Playwright 1.63.0, matching CORE CI; the official browser image is
digest pinned. The pinned npm package is installed only inside a future approved image
build. Its generated npm lock is not prepared on the host, so do not claim a fully
reviewed dependency lock for this auxiliary tool. No host package is required.

The browser container idles until an explicit exec of `browser.mjs`. This keeps its
tmpfs screenshot available for `docker cp`; the screenshot would disappear on stop.
No test records HAR, tracing or credential values. CORE fixture state/audit is also
tmpfs and disappears on stop; export only reviewed, non-secret test summaries first.

Offline validation (no Docker daemon or changes): `python3 test_plan.py` and Node
`--check` on `.mjs` scripts. `preflight.py` additionally needs approved outside-sandbox
read-only Docker access. Do not execute the provisioning script, builds, network
creation, starts or permission commands until their concrete proposal is approved.

These fixtures/scripts are GPL-3.0-or-later, matching the extension; license text is
in [the plugin license](../../plugins/traefik/LICENSE.md).

## Phase 5 harness corrections

The host source validation now uses native `node:http` for the fixture routing
probe so the requested `Host: fixture.localhost` is actually transmitted. The
browser protocol selector is the verified `select[name="protocol"]`. Regression
coverage is in `host-header.test.mjs` and `test_plan.py`. These source corrections
do not rebuild or recreate the existing Phase 4 containers. Stream the reviewed
scripts to an existing test container's Node process when validating unchanged
Phase 4 assets; do not deploy Phase 5 UI assets without approval.
