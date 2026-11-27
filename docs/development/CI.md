<!--
SPDX-FileCopyrightText: 2026 The Homelab Control Authors
SPDX-License-Identifier: GPL-3.0-or-later
-->

# Jenkins CI

This repository had no CI. `Jenkinsfile` runs the checks that `CONTRIBUTING.md` asks for on the
self-hosted Jenkins on MediaMouse. Jenkins does not deploy, publish or start anything, and it does
not sign off commits: the Developer Certificate of Origin stays with the human contributor.

## Stages

All stages run on the `docker` agent. Each command runs in a throwaway container on the agent's
**rootless** Docker daemon, on a streamed copy of the checkout:
- as an unprivileged user, with every capability dropped;
- with no network, except the PyYAML install;
- with CPU, memory and PID limits.

A failing stage fails the build, and the later stages still run, so one build reports every
finding.

| Stage | Runs | Image |
|---|---|---|
| reuse lint | `reuse lint` | `fsfe/reuse:6.2.0`, pinned by digest (the REUSE version core CI uses) |
| traefik helper | the `test` and `runtime` builds from `plugins/traefik/build-environment.md`; the `test` stage runs `test/traefik.test.mjs` | the Node image that `plugins/traefik/Dockerfile` pins |
| dev fixture tests | `node --test` on every `dev/**/*.test.mjs` and `test.mjs`; `python3 -m unittest` on `dev/traefik-live-test/test_*.py` | the same Node image; `python:3.13-slim-trixie` (by digest) with PyYAML 6.0.3 |
| manifests (core PDK) | `node sdk/plugin/tdk.mjs validate` on every `plugins/**/manifest.hlplugin` | the same Node image. The PDK is `sdk/plugin` of Homelab-Control `main`, sparse-cloned for each build. |

Pull requests from forks are refused by the pipeline (`CHANGE_FORK`). The Jenkins job must not
discover them either.

Each build archives `ci-result.json`: repository, branch, pull request, commit, result, failed
stages and build URL, for n8n or a coding agent. The Jenkins REST API gives the log and the
stage results. Homelab-Control's `ci/README.md` lists the endpoints.

## Jenkins job (to create)

There is no job for this repository yet. Create a multibranch pipeline `Homelab-Control-Extensions`,
the same way as the `Homelab-Control` job:
- **Source:** GitHub, credential `github-jenkins-app`, owner `KRDucky`, repository
  `Homelab-Control-Extensions`.
- **Behaviours:**
  - discover branches: "Exclude branches that are also filed as PRs";
  - discover pull requests from origin: "Merging the pull request with the current target branch
    revision";
  - no fork pull request discovery.
- **Optional check name:** the "Status Checks Properties" trait with the name
  `jenkins/extensions`.
- **Build configuration:** by Jenkinsfile, script path `Jenkinsfile`.
- **Scan:** periodically, every 5 minutes; orphaned items kept 14 days, at most 20.

The GitHub App must be installed on this repository with the same permissions as on
Homelab-Control:
- contents, metadata and pull requests: read;
- checks and commit statuses: read and write.

## Known finding

`reuse lint` fails on `main` today: `LICENSES/Apache-2.0.txt` is present, but no file is licensed
Apache-2.0, so the repository is not REUSE 3.3 compliant. `CONTRIBUTING.md` permits Apache-2.0,
so whether to delete the unused text or keep it for a planned file is the owner's decision. The
gate is not relaxed for it.
