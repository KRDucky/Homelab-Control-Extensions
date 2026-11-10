# SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
# SPDX-License-Identifier: GPL-3.0-or-later

# Matches the existing CORE CI Playwright pin; no browser server or host port.
FROM mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27
WORKDIR /opt/checks
COPY browser-package.json ./package.json
RUN npm install --ignore-scripts --no-audit --no-fund --omit=optional
COPY --chmod=0444 browser.mjs private-file.mjs ./
RUN chmod 0555 /opt/checks
USER 1000:1000
ENV HOME=/tmp
RUN test -x /opt/checks && test -r browser.mjs && test -r private-file.mjs && node --check browser.mjs
# Keep the private /tmp screenshot available for an explicit exec/test/copy/cleanup sequence.
CMD ["sleep", "infinity"]
