#!/bin/sh
# SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
# SPDX-License-Identifier: GPL-3.0-or-later
set -eu
umask 077
node /opt/live-test/prepare-users.mjs
exec /usr/local/bin/hc-api "$@"
