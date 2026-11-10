#!/bin/sh
# SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
# SPDX-License-Identifier: GPL-3.0-or-later

set -eu
umask 077
# A bind-mounted ACL source has group mask bits; CORE requires a true mode-0600 users file.
# Copy only into this container's private tmpfs, without changing host source permissions.
test ! -e /state/users.json
cp /run/secrets/users_source /state/users.json
chmod 600 /state/users.json
exec /usr/local/bin/hc-api "$@"
