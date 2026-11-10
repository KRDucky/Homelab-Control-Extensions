# SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
# SPDX-License-Identifier: GPL-3.0-or-later
FROM docker.io/library/node:24-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8
COPY --from=core-binaries --chmod=0555 hc-api hlctl /usr/local/bin/
COPY --chmod=0444 dev/traefik-live-test/core-health.mjs dev/traefik-live-test/private-file.mjs dev/traefik-live-test/modules.json dev/traefik-live-test/files.json /opt/live-test/
COPY --chmod=0444 dev/traefik-phase6/core-entrypoint.sh dev/traefik-phase6/prepare-users.mjs /opt/live-test/
RUN chmod 0555 /opt/live-test
USER 1000:1000
WORKDIR /opt/live-test
RUN test -x /opt/live-test && test -r prepare-users.mjs && test -r modules.json && node --check prepare-users.mjs && /usr/local/bin/hc-api -version
ENTRYPOINT ["/bin/sh", "/opt/live-test/core-entrypoint.sh"]
