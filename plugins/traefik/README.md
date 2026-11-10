# Traefik development helper

Scaffold for **Networking → Reverse Proxy → Traefik**, maintained in the Extensions
repository. It is not yet an installable HomeControl plugin. The core checkout has no
plugin SDK; the cached upstream SDK accepts only compiled declarative UI contributions
and does not load containers. See the integration plan in `codex-reports/` beside the repositories.

## Layout

```text
plugins/traefik/
  src/adapter.mjs       fixed GET-only Traefik inventory adapter
  src/model.mjs         pure validated Compose labels model
  src/server.mjs        private authenticated helper HTTP interface
  ui/                  development dashboard and generator preview
  test/                dependency-free Node test suite
  Dockerfile           non-root Node runtime, no package installation
  compose.yaml         helper only, external private network, no published ports
```

JavaScript ES modules follow the main repository's SDK `.mjs` convention and use the
same Node >=22 baseline. No npm dependencies are needed. This is a proposed isolated
helper runtime; the main backend remains Go and production UI remains compiled React.

## Interfaces

| Endpoint | Contract |
| --- | --- |
| `GET /v1/inventory` | `{schemaVersion:1, routers:[{name,provider,status}], services:[...], middlewares:[...]}` |
| `GET /v1/diagnostics` | Per-resource safe connectivity codes/hints and available/degraded/unavailable state |
| `POST /v1/labels` | Input `{name,host,port,entrypoint,protocol,upstreamScheme,tls?}`; output `{labels:{key:string}}` |
| `GET /`, `/dashboard.js` | Development preview only; no HomeControl login replacement |

API requests require `Authorization: Bearer <helper token>`. The token is read from
`HC_HELPER_TOKEN_FILE`, must be 32–256 printable ASCII characters without whitespace, and must stay outside Git.
No credentials are stored in browser persistence. The dev preview lets a developer
enter the token manually; the planned core UI will never receive this helper secret.
The helper is not a public authentication service: only trusted core/developer clients
on the dedicated network may reach it. It has no CORS allowance or apply endpoint.

`TRAEFIK_API_ORIGIN` is administrator configuration, never browser input. Only
`/api/http/routers`, `/api/http/services`, and `/api/http/middlewares` are requested; redirects are refused,
timeouts are 3 seconds per request, responses are limited to 1 MiB each and only
non-sensitive identity/status fields are returned. Failed requests give a generic 502.
HTTP inventory includes middleware identities and status, but excludes configuration details, TCP/UDP, rawdata, logs and certificates.
The deployment review must verify the configured origin belongs to the private test
Traefik container. Outbound destinations are not independently IP-filtered by this scaffold.
Authenticated upstream Traefik APIs and custom trust roots are future work.

Labels are a pure preview for a **user-managed service**, not for the helper. JSON
mapping output can be used as YAML under a Compose service's `labels` key. The model
supports one Host rule, explicit entrypoint/service port, incoming `protocol` and
independent `upstreamScheme` (`http` or `https`). HTTPS requires a `tls` object; `{}`
references the existing/default certificate store, while `{certificateResolver:"staging"}`
explicitly references an existing resolver. HTTP forbids TLS settings. No automatic
HTTP redirect, certificate verification bypass, new resolver provisioning or arbitrary
rule interpolation is supported. Applying a resolver label later may trigger issuance.
A router TLS block can replace entrypoint TLS defaults: review resulting options. Applying labels or enabling a Docker provider is outside scope.

## Local checks

```sh
cd /home/ian/Projects/Homelab-Control-Extensions/plugins/traefik
node test/traefik.test.mjs
```

Node is absent from PATH on this host. The existing executable
`/tmp/hc-e1-tools/nodejs_wheel/bin/node` was used for tests (no installation).
Go is absent from PATH; this task does not need Go compilation.

## Build and preview

The isolated test and runtime builds succeeded in this phase. No server container was started.
Rebuild only with approved outside-sandbox Docker execution:

```sh
docker --context rootless build --progress=plain --target test --tag homecontrol/traefik-plugin:test .
docker --context rootless build --progress=plain --target runtime --tag homecontrol/traefik-plugin:dev .
```

Docker build may pull the pinned official base and requires explicit approved outside-sandbox
execution. The Dockerfile uses an immutable verified digest. See [build-environment.md](build-environment.md)
for exact image references and the separate core build toolchain proposal. The test
stage validates UID/GID 1000 and readable but unwritable application source before
running the suite. The runtime stage excludes tests. Build success does not validate
a mounted Compose secret, read-only runtime filesystem or live API connectivity.

The user separately manages Traefik and an **internal** Docker network with a reviewed
alias/API port. `TRAEFIK_TEST_NETWORK`, `TRAEFIK_API_ORIGIN`, and the host path
`HC_HELPER_TOKEN_FILE` must be supplied for the Compose draft. `external: true` prevents
automatic network creation but does not prove the existing network is internal; verify
that property before deployment. No Traefik service is defined and no socket is mounted.
The private API port must not be published on the host. No privileged port is needed.
The core service will also need access to this network when its adapter is implemented.

Do not run `compose up` until the plan is approved. The draft publishes no ports, so
the preview is reachable only from the private network. A loopback-only preview override
or authenticated core proxy needs separate review. Local non-container preview can run
with `HC_LISTEN_HOST=127.0.0.1` (default), a reachable reviewed Traefik origin and a token
file, using `node src/server.mjs`; no server was started during this task.

This helper is a HomeControl extension proposal, **not a Traefik middleware plugin**.
There is deliberately no fabricated `.hlplugin` manifest claiming unsupported capabilities.


## Rootless secrets and readiness

Compose file-backed secrets are bind mounts. Its `uid`, `gid` and `mode` options do
not fix ownership for this source type. A host `ian:ian` file with mode `0600` maps
to root ownership inside the rootless namespace and is normally unreadable by UID 1000.
Do not work around this by running the helper as root or making secrets world-readable.
Before deployment, review a dedicated secret file outside Git with a narrowly scoped
ACL for the mapped runtime host UID, or choose a secret delivery design that supports
explicit ownership. Confirm the actual daemon UID map first; do not guess from host UID.
No ACL or ownership changes have been applied. The loader refuses symlinks, non-regular
files, overlarge files, world-accessible files and malformed tokens with safe errors.
It allows one final LF/CRLF for secret files, not spaces or extra lines.

`connection.example.env` is a template, not a known deployment configuration. No network
or Traefik instance was created. Check the external network is dedicated and internal,
the private alias/port resolves from that network, the API access policy is agreed,
and the secret is readable as UID 1000 without weakening permissions before starting.
Neither `EXPOSE 9080` nor an internal listener publishes a host port.


### Phase 5 inventory metadata

Router inventory may additionally include a sanitized single-host `rule`, service
reference, entrypoints and an explicitly known TLS boolean. Complex rules are
omitted and must be treated as unknown. Raw configuration, upstream URLs,
authentication middleware values and credentials are never forwarded. Existing
running helper images retain their old identity/status-only response until a
separately approved deployment. CORE owns the fixture-only Compose discovery
contract and labels/network patch proposals; the helper has no Docker access or
configuration apply operation.
