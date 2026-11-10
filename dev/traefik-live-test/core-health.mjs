// SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
// SPDX-License-Identifier: GPL-3.0-or-later

try {
  const response = await fetch('http://127.0.0.1:9180/api/v1/health', {signal: AbortSignal.timeout(4000)});
  process.exit(response.ok ? 0 : 1);
} catch { process.exit(1); }
