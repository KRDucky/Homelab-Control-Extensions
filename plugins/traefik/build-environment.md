# Pinned build environments

Verified against official Docker Library registries on 2026-11-08, using rootless
Docker outside the sandbox with approval. Digests pin content, not ongoing security
updates. Refresh only through a reviewed change. No signature verification or CVE scan
was performed; trust here is the official namespace, HTTPS registry and verified digest.

## Traefik helper

Official image index:

```text
docker.io/library/node:24-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8
```

Resolved linux/amd64 child manifest:
`sha256:ec318aabf188af4e5488847eea4b24452650b9917140563e140762526a37f1df`.
Source annotation: `https://github.com/nodejs/docker-node.git`, revision
`e994dfe115899a82684caa7533380aa7d439aae1`, path `24/alpine3.24`.
Image creation annotation: 2026-11-05T19:25:00Z.
This helper uses no external npm packages. Node >=22 is supported by source; the
existing host temporary runtime is 24.19.0. The pinned image is the build/test authority,
not the mutable `24-alpine` tag. Tests run in the `test` stage; `runtime` includes only
application source and UI. Both use numeric UID/GID 1000, no privileged port or socket.

```sh
docker --context rootless build --progress=plain --target test --tag homecontrol/traefik-plugin:test .
docker --context rootless build --progress=plain --target runtime --tag homecontrol/traefik-plugin:dev .
```

Both builds were approved and passed on MediaMouse. No plugin server/container was
started. Build-time commands use temporary BuildKit execution sandboxes only.

## HomeControl core proposal (not built)

Both local main and cached upstream agree in `packaging/release/toolchain.env`:

```text
GO_VERSION=1.26.10
NODE_VERSION=22.23.3
NPM_VERSION=10.9.9
```

Registry-verified official image indexes:

```text
docker.io/library/golang:1.26.10-bookworm@sha256:5de7c99eb78ca5e515a4c340235d0955ec5964a5071c492c15503d7c267da473
docker.io/library/node:22.23.3-bookworm@sha256:69a5713e7f4997e96d579aafd78734810e0dac0dd5ee4621d72c27a2891a4088
```

linux/amd64 child manifests, respectively:

```text
sha256:2dcb1e14f35e4cc1db2186947cba2d19a9fce4d48a27c50658bd203c90fcc183
sha256:d05fa967fa1bbe6ba4fb48f9d4c55b5e6a8c8300aedb6b99a11c248a877d7bee
```

Recommended container-only recipe after Git reconciliation and separate core-build
approval: use the Node Bookworm image as a toolchain stage and copy `/usr/local/go`
from the pinned Go Bookworm stage. Both are Debian Bookworm; avoid copying Alpine
musl tools into a glibc image. Assert `go version`, `node --version`, `npm --version`
against the toolchain file before building (including bundled npm 10.9.9, not assumed
from the Node image tag). Set `GOTOOLCHAIN=local` and `GOFLAGS=-mod=readonly`.

Copy an agreed source snapshot into the build rather than bind-mounting the live
working tree read-write. Preserve `frontend/app/package-lock.json`, `backend/go.mod`
and `go.sum`. Use `npm ci --ignore-scripts --no-fund`, then existing `make build` with
an explicit version and `SOURCE_DATE_EPOCH` from the chosen commit. The Makefile already
sets CGO_ENABLED=0, trimpath, buildvcs=false and deterministic linker flags. Export
artifacts to a dedicated output directory after the build; do not install anything
on MediaMouse. Network dependency downloads occur inside the build and need review.
Use two clean builds and compare checksums before claiming reproducible artifacts.

Only registry manifests were checked for these core images: they were not pulled,
executed, combined or used to build core. Additional `make check` dependencies (Python,
PyYAML and release tooling) and bundled npm must be verified in that environment.
This identifies a pinned environment; it does not claim core tests/reproducibility pass.
