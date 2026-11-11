// SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const root = dirname(fileURLToPath(import.meta.url));
const read = rel => readFileSync(join(root, rel), 'utf8');

test('static config uses /config paths, file provider, dashboard, metrics, logs', () => {
  const y = read('traefik.yml');
  assert.match(y, /directory: \/config\/dynamic/);
  assert.doesNotMatch(y, /docker:/);
  assert.match(y, /dashboard: true/);
  assert.match(y, /insecure: false/);
  assert.match(y, /prometheus:/);
  assert.match(y, /entryPoint: metrics/);
  assert.match(y, /filePath: \/var\/log\/traefik\/traefik\.log/);
  assert.match(y, /filePath: \/var\/log\/traefik\/access\.log/);
  assert.match(y, /websecure:/);
  assert.doesNotMatch(y, /certificatesResolvers:/);
});

test('dynamic config keeps r2 routers and adds production-shaped routes', () => {
  const y = read('dynamic/dynamic.yml');
  for (const n of ['hc-api', 'fixture-router', 'dashboard', 'app-http', 'app-https', 'app-root', 'webapp-lb']) {
    assert.match(y, new RegExp(`^    ${n}:`, 'm'), n);
  }
  assert.match(y, /PathPrefix\(`\/app`\)/);
  assert.match(y, /basicAuth:/);
  assert.match(y, /usersFile: \/config\/auth\/users\.htpasswd/);
  assert.match(y, /stsSeconds: 31536000/);
  assert.match(y, /rateLimit:/);
  assert.match(y, /healthCheck:/);
  assert.match(y, /url: http:\/\/webapp-a:8080/);
  assert.match(y, /url: http:\/\/webapp-b:8080/);
  assert.match(y, /certFile: \/config\/certs\/isolated\.crt/);
  assert.match(y, /minVersion: VersionTLS12/);
});

test('compose overlay remaps Traefik to /config and adds webapps', () => {
  const y = read('compose.overlay.yaml');
  assert.match(y, /--configFile=\/config\/traefik\.yml/);
  assert.match(y, /target: \/config\/traefik\.yml/);
  assert.match(y, /target: \/config\/dynamic/);
  assert.match(y, /container_name: hc-traefik-webapp-a/);
  assert.match(y, /container_name: hc-traefik-webapp-b/);
  assert.match(y, /HC_PROD_SHAPE_DIR/);
  assert.match(y, /\.\.\/traefik-prod-shape/);
  assert.doesNotMatch(y, /source: \.\//);
  assert.doesNotMatch(y, /ports:/);
  assert.doesNotMatch(y, /docker\.sock/);
});

test('live-check uses node:http for Host-routed probes', () => {
  const y = read('live-check.mjs');
  assert.match(y, /from 'node:http'/);
  assert.match(y, /http\.request/);
  assert.doesNotMatch(y, /fetch\([^)]*Host:/);
});

test('file cert and users hash exist', () => {
  assert.equal(existsSync(join(root, 'certs/isolated.crt')), true);
  assert.equal(existsSync(join(root, 'certs/isolated.key')), true);
  const crt = read('certs/isolated.crt');
  assert.match(crt, /BEGIN CERTIFICATE/);
  const users = read('auth/users.htpasswd');
  assert.match(users, /^isolated-viewer:\$apr1\$/);
});
