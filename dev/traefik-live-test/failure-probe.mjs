// SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Intended for stdin execution inside the existing helper container, after approval.
import assert from 'node:assert/strict';
import {createAdapter} from '/app/src/adapter.mjs';

try {
  for (const [origin, codes] of [
    ['http://127.0.0.1:65534', ['connection_refused', 'network_error']],
    ['http://missing-traefik.invalid:9081', ['dns_failed', 'timeout', 'network_error']],
  ]) {
    const diagnostics = await createAdapter(origin).diagnostics();
    assert.equal(diagnostics.status, 'unavailable');
    assert.equal(diagnostics.checks.length, 3);
    assert.ok(diagnostics.checks.every(check => codes.includes(check.code)));
    const text = JSON.stringify(diagnostics);
    assert.ok(!text.includes(origin) && !text.includes('127.0.0.1') && !text.includes('missing-traefik.invalid'));
  }
  console.log('PASS real refused-connection/DNS failure diagnostics without configuration or network changes');
} catch {
  console.error('FAIL safe failure diagnostics');
  process.exitCode = 1;
}
