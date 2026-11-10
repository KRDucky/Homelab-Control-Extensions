<!--
SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
SPDX-License-Identifier: GPL-3.0-or-later
-->
# HomeControl development handoff: Traefik integration, container platforms (Phases 4–9)

Audience: DreggBot (lead orchestrator), the analysis agents and the local implementation agent.
Status date: 2026-11-10.

## Where the code is

| Repository | Branch | Commit | Content |
|---|---|---|---|
| `KRDucky/Homelab-Control` (CORE) | `dev/traefik-phase6-preview` | `4501b35d` | Go API, React UI, platform registry, Docker metadata broker, Traefik client, docs. Based on a local `main` (`29fb27a9`) that is two commits ahead of the `origin/main` it was built from, and `origin/main` has since advanced. A merge into the current `main` has not been prepared. |
| `KRDucky/Homelab-Control-Extensions` | `dev/traefik-phase7` | this commit's parent: `c93cb7e` | Traefik helper plugin, isolated test harness, Compose overlays, this handoff |

**Not in either branch:** the Phase 9 work (container identity model, preview API, manifest `runtime.container`, UI component, management contract, broker identity audit tool). It is implemented and tested in the CORE worktree, but **uncommitted**. See §10.

### Status labels used below

| Label | Meaning |
|---|---|
| **implemented** | the code exists in the branch |
| **fixture-tested** | unit or integration tests run against labelled fixtures |
| **integration-tested** | exercised against real services in the isolated test environment |
| **deployed (test)** | running in the isolated test environment; never production |
| **planned** | design only |

## 1. Architecture and plugin philosophy

HomeControl is a modernized, API-first fork of Webmin for homelab Linux administration.
- **Stack:** a Go API (`hc-api`), a React/TypeScript UI, and a separate privileged broker for allowlisted host operations (ADR 0001/0008/0011).
- **Modules are independently useful.** Cross-module workflows are optional conveniences, never hard dependencies.
- **Every write** follows plan → confirm → execute, with RBAC, CSRF, audit and step-up where required.
- **Plugins are declarative and capability-based.** A plugin never receives unrestricted host, Docker, Podman or Kubernetes authority; CORE mediates through narrowly scoped adapters.
- **Discovery never implies management authority.**
- **No mandatory container runtime.** An installation may register zero, one or several container platforms (Docker, Podman, Kubernetes, K3s), each detected or explicitly configured.

Authoritative CORE documents (on the CORE branch):
- `CLAUDE.md`;
- `docs/project/00…09-*.md` (start with `02-ARCHITECTURE.md` and `03-SECURITY-AND-OPERATIONS.md`);
- `docs/adr/`;
- `CONTRIBUTING.md`: DCO sign-off is required and is the human owner's statement; tools never add it.

## 2. Repository layout and integration points

**CORE** (paths on `dev/traefik-phase6-preview`):

| Path | Role |
|---|---|
| `backend/cmd/hc-api` | API server; registry and adapters are wired from startup flags only |
| `backend/cmd/hc-docker-metadata` | host-side Docker metadata broker binary |
| `backend/internal/traefikclient` | client for the private Traefik helper (fixed origin, token file) |
| `backend/internal/composediscovery` | Compose service normalization and label previews |
| `backend/internal/dockerbroker` | broker server and client (Unix socket, SO_PEERCRED + token), snapshot contract |
| `backend/internal/platform` (+ `composeadapter`, `podman`, `kubernetes`) | universal platform registry and adapters |
| `backend/internal/routingwarnings` | CORE-only preview warning consolidation (kept out of broker-linked packages) |
| `backend/internal/api/{traefik,compose_preview,platforms}.go` | read-only endpoints |
| `backend/internal/guard` | static guards: OpenAPI ↔ routes, no process exec, link boundaries, broker link set |
| `frontend/app/src/pages/{Traefik,PlatformProxy}.tsx` | UI |
| `schemas/openapi/homelab-control.v1.yaml` | API contract, with a scope for every route |
| `dev/traefik-core.Dockerfile` | pinned validation pipeline |
| `docs/dev/{TRAEFIK-INTEGRATION,TRAEFIK-PHASE5,TRAEFIK-PHASE6-SECURITY,DOCKER-METADATA-BROKER,CONTAINER-PLATFORMS}.md` | component documentation |

**Extensions** (relative links):

| Path | Role |
|---|---|
| [`plugins/traefik/`](../../plugins/traefik/README.md) | read-only Traefik helper (Node, no dependencies) |
| [`dev/traefik-live-test/`](../../dev/traefik-live-test/README.md) | isolated test stack: Traefik fixture, helper, CORE, browser |
| [`dev/traefik-phase6/`](../../dev/traefik-phase6/DEPLOYMENT.md) | Phase 6 CORE overlay and test-account preparation |
| [`dev/traefik-phase7/`](../../dev/traefik-phase7/compose.broker.proposal.yaml) | broker overlay (Variant A) and platform-registry overlay (Variant B) |
| [`dev/traefik-phase8/`](../../dev/traefik-phase8/README.md) | current deployed overlays: r2 image + private routing configuration |

## 3. Feature-first CORE navigation

The UI shows one entry per capability the session may use. Forbidden modules are hidden; unavailable or limited modules show a reason.

Capabilities on the branch: Overview `/`, Services `/services` (with Service logs and Unit files), Hardware, Storage, Files, Host settings, Software, Audit, Legacy Webmin, and **Networking → Reverse Proxy → Traefik** (`/networking/reverse-proxy/traefik`).

New features are placed by user task (for example Networking → Reverse Proxy), not by implementation technology.

## 4. Traefik plugin architecture

```
browser ─session/CSRF─▶ CORE hc-api ──bearer token (file)──▶ Traefik helper (plugins/traefik) ──GET-only──▶ Traefik API
                          │                                   no Docker access, no write API
                          └─ platform registry ──▶ adapters ──▶ metadata broker (Docker) / fixtures (Podman, K3s)
```

- **The helper** reads Traefik routers, services, middlewares and diagnostics, sanitizes them (no credentials, middleware secrets or raw configuration), and builds pure label previews. **Implemented, fixture-tested and integration-tested.**
- **CORE** exposes `/api/v1/networking/reverse-proxy/traefik/{inventory,diagnostics,labels,applications,compose-preview,platform-preview}` with scopes `networking.proxy.read` / `docker.compose.read`. **Deployed (test).**
- **The UI** has inventory tabs and an Add Proxy Host wizard: 1. Select platform (auto-selected when only one exists), 2. Select application, 3. Configure hostname. Previews show blockers (for example `provider_disabled`). **There is no Apply/Deploy.** **Deployed (test).**

## 5. Completed phases

| Phase | Result | Status |
|---|---|---|
| 4 | Read-only helper plugin; isolated stack (internal network, file-provider Traefik fixture) | integration-tested |
| 5 | Traefik dashboard and proxy-host previews with an opt-in Compose fixture | integration-tested |
| 6 | Compose discovery contract; source-verification design; Phase 6 CORE overlay | deployed (test), superseded |
| 7 | Docker Metadata Broker (live rootless discovery); universal platform registry; Variant A (broker) and Variant B (`platforms.read`, platform step); r2 stabilization (step numbering, consolidated router warnings, cross-tab preference race fix) | **deployed (test)**: 67/67 API, 8/8 browser checks |
| 8 | Routing configuration moved into a private 0700 directory (0644 file); CORE mount source changed only | **deployed (test)**: 67/67 API, 8/8 browser, 14/14 preservation checks |
| 9 | Container identity and permissions, management contract, broker audit tool | **implemented locally, uncommitted** (see §10) |

## 6. Isolated test environment (verified 2026-11-10)

- **Runtime:** rootless Docker on the owner's development host.
- **Containers:** Traefik fixture (file provider), helper plugin, CORE image `homecontrol/traefik-core:phase7-r2` (`sha256:2fc56a40…`, hc-api `ef4d7c52…`) and a Playwright browser sharing CORE's network namespace.
- **Network:** one internal network.
- **Docker provider:** disabled.
- **Not used:** production workloads and the rootful daemon.
- **Reproduce** with the overlay order in [`dev/traefik-phase8/README.md`](../../dev/traefik-phase8/README.md).
  - Host paths in the overlays are **test-host-specific**, not portable defaults.
  - Secrets are provisioned outside Git ([`provision-secrets.py`](../../dev/traefik-live-test/provision-secrets.py)) and are never committed.
- **Verified results:**
  - real `docker-local` inventory (`fixture:false`) through the broker;
  - RBAC/CSRF/redaction checks;
  - cross-platform and endpoint-injection rejection;
  - one consolidated router warning; steps 1/2/3; internal port auto-selection;
  - no Apply/Deploy.

## 7. Docker Metadata Broker

**What it is:**
- A host-side process (`hc-docker-metadata`) that issues **one fixed** Docker list request to a configured rootless socket, validates and sanitizes the result, and serves a snapshot on a **private Unix socket**.
- **Clients** must have the expected peer UID (SO_PEERCRED) **and** a bearer token.
- **Not present:** TCP, request forwarding, rootful/default sockets.
- **Reviewed binary:** `sha256 14fcd504…850a`, pinned by `guard/broker_link_test.go`. Any edit to `composediscovery`, `dockerbroker` or `traefikclient` changes this digest and needs re-review.
- **Deployed (test)** as a transient user service.

**Limitations and known risks:**
- **Runs under the owner's user account** and inherits privileged supplementary groups (including `docker` and `lxd`). A compromised broker is therefore **root-equivalent**. This was accepted for isolated testing only. Production requires a dedicated identity (§13).
- Read-only APIs do not reduce a socket's authority. The rootless socket controls that user's whole daemon.
- **No filesystem namespace sandbox:** user-manager `PrivateUsers=` would break SO_PEERCRED.
- **Not yet reported:** effective container identity (`Config.User`) and host-path ownership.

## 8. Universal platform design (Docker, Podman, Kubernetes, K3s)

**Registry:**
- Built from startup configuration only; there is no registration API.
- Platforms appear as fingerprints, never paths or credentials.
- Per-family scopes: `docker.compose.read`, `podman.read`, `kubernetes.read`, plus `platforms.read`.
- Rootful daemons need explicit root-equivalence acknowledgement.
- CORE validates all adapter output.

**Adapters:**
- **Docker:** live through the broker; label previews are the verified Compose build. **Deployed (test).**
- **Podman:** libpod parser + labelled fixture. **Fixture-tested.**
- **Kubernetes/K3s:** one namespace-scoped adapter with a fixed GET path allowlist (no Secrets, ConfigMaps or Pods); K3s detected from `gitVersion`; Ingress, IngressRoute and HTTPRoute previews only when detected; never Compose labels. **Fixture-tested.**

**Live Podman and Kubernetes connections are planned**, each with a reviewed connection plan, and only in disposable VMs.

## 9. Discovery versus management

- **Discovery:** read-only, validated and audited. **Implemented and deployed (test).**
- **Management** (deploy, restart, Compose/manifest changes, network and storage, rollback): **planned**.
  - Phase 9 adds a contract: plan → fingerprint-bound approval → execute.
  - Management uses separate `platforms.manage.<family>.<kind>` scopes that discovery scopes never satisfy.
  - Only a `Disabled` executor exists.
  - Any executor needs an ADR 0011 review per operation kind.

## 10. Phase 9 (uncommitted in the CORE worktree; not on the branch)

Requirements: production broker security, plus universal PUID/PGID/UMASK/supplemental-group configuration shared by all plugins, independent of the runtime.

Implemented and fixture-tested locally:

| Package or file | Content |
|---|---|
| `backend/internal/containeridentity` | layered resolution, validation, generators, volume checks, profiles, manifest parser, administrator config |
| `backend/internal/platform/management` | management contract (Disabled executor) |
| API | `GET /api/v1/containers/identity/profiles`, `POST /api/v1/containers/identity/preview` (read-only) |
| Plugin manifest v1 | optional `runtime.container` (Go, browser/SDK and schema agree) |
| `frontend/app/src/ContainerIdentity.tsx` | reusable "Container Identity & Permissions" component (not yet mounted) |
| `dev/docker-metadata-test/broker_identity_audit.py` | read-only broker identity audit |

**Results:** the full pinned pipeline passes (Go 30/30 packages, vitest 132/132), and the broker digest is unchanged.

**To make this visible to DreggBot,** it must first be committed (owner approval and DCO sign-off).

## 11. PUID, PGID, UMASK and supplemental groups (Phase 9 model)

**Modes and precedence:**
- Modes: *image defaults* (HomeControl sets nothing), *platform/host defaults*, *custom*.
- Precedence: platform → application → profile → per-container override.
- Each value reports its source layer. Supplemental groups are **replaced** by the highest layer, never merged.

**How images accept identity** (declared by the plugin manifest, never inferred):

| Method | Effect |
|---|---|
| `env` | PUID/PGID-style variables, labelled *declared-only* |
| `runtime-user` | Compose `user: uid:gid`, or Kubernetes container `runAsUser`/`runAsGroup` + `runAsNonRoot`, with privilege escalation disallowed |
| `fixed` | no override possible |

**UMASK:**
- Applied only through a declared `env` or `entrypoint` method; never injected otherwise.
- Previews show file and directory upper bounds (002 → 0664/0775, 022 → 0644/0755, 027 → 0640/0750, 077 → 0600/0700).

**Supplemental groups:**
- Compose: `group_add`. Kubernetes: **pod-level** `securityContext.supplementalGroups`.
- Duplicates are removed; at most 32; GID 0 is refused.
- Groups whose configured host name is privileged (`docker`, `lxd`, `sudo`, `adm`, `libvirt`, `kvm`, `disk`, …) are blocked unless explicitly acknowledged.
- Host groups are never inherited automatically.

**Other rules:**
- UID/GID 0 is never configured.
- Rootless user-namespace maps come from administrator configuration; unmapped IDs block.
- Host volume ownership is never changed; only proposals are made.

**Planned:** observed Docker/Podman identity and host-path ownership (needs broker v2); installer integration.

**HomeControl's own images** currently use a fixed `USER 1000:1000`. Making them configurable is a planned, approval-gated change.

## 12. Tests and builds

- **Full pipeline (pinned Go 1.26.10 and Node 22.23.3, rootless, export-only):**
  ```sh
  docker build -f dev/traefik-core.Dockerfile --target artifacts --output type=local,dest=<dir> .
  ```
  It runs gofmt (scoped list), `go test ./...` including guards, `go vet`, vitest, eslint, `tsc`, `vite build`, prettier, SDK tests and `make build`, and writes `SHA256SUMS`.
- **`make check`** = lint + test + security.
  - `make lint` currently fails on **two pre-existing unformatted files** that are not part of this work (`backend/internal/api/software_browser_test.go`, `backend/internal/broker/runner/runner_test.go`).
  - `make security` needs network (`npm audit`) and `govulncheck`.
- **Extensions:**
  - `node plugins/traefik/test/traefik.test.mjs` (21 tests);
  - `node --test dev/traefik-phase6/prepare-users.test.mjs`;
  - `python3 -m unittest` in `dev/traefik-live-test`.
- **Branch results:** Go 28/28 packages, vitest 126/126, helper 21/21. Production `npm audit`: 0. Dev tooling: 11 advisories, recorded for review and not changed.

## 13. Outstanding security concerns

1. **Broker identity:** privileged supplementary groups make a broker compromise root-equivalent. Fix: a dedicated account (ideally owning its own rootless daemon) with no privileged groups, run as a hardened system unit. The audit tool must exit 0.
2. Kubernetes `list` exposes pod-template `env` values to the credential holder. Use a namespace-scoped ServiceAccount first, then an in-cluster metadata projection service.
3. Rootful Docker or Podman connections are root-equivalent. Each needs a separate broker instance and explicit acknowledgement.
4. Static broker token: there is no rotation procedure yet.
5. Unkeyed endpoint fingerprints can confirm a guessed path (low impact).
6. **Test overlays contain test-host-specific absolute paths.** They contain no secrets.
7. HomeControl images hard-code `USER 1000:1000`.
8. The Extensions repository has no root `LICENSE` file. Several files lack SPDX headers; the helper plugin carries GPL-3.0.

## 14. Approvals required (owner)

- **Every deployment** or replacement of test containers.
- **Every host change:** accounts, groups, ACLs, sockets, systemd units, daemons, packages and runtimes.
- **Every broker binary change**, with a digest review.
- **Every Git push, PR, merge or commit**, with the owner's DCO sign-off.
- **Any Apply/Deploy operation:** ADR 0011, per operation kind.
- **Live Podman or Kubernetes connections:** disposable VMs only.

## 15. Recommended next milestones

1. Commit Phase 9 (owner sign-off) and publish it on the CORE development branch.
2. Dedicated broker identity, plus a hardened system unit.
3. Reconcile the CORE development branch with the current `origin/main`, then open reviewed PRs.
4. Broker v2 (container identity, read-only path `stat`, token rotation); wire observed identity and verified volume checks.
5. Identity-configurable HomeControl images; mount the identity component in a plugin installer flow.
6. Live Podman, then Kubernetes/K3s, in disposable VMs; then the Kubernetes projection service.
7. The first management executor (for example restart), after an ADR 0011 review.
