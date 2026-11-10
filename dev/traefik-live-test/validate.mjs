import http from 'node:http';
// SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict';
import {privateValue} from './private-file.mjs';

const core = 'http://127.0.0.1:9180';
const helper = 'http://traefik-plugin:9080';
const proxy = '/api/v1/networking/reverse-proxy/traefik';
const expected = {routers: 'fixture-router@file', services: 'fixture-service@file', middlewares: 'fixture-headers@file'};
const results = [];
let stage = 'private fixture files';

async function request(url, options = {}) {
  return fetch(url, {...options, redirect: 'error', signal: AbortSignal.timeout(5000)});
}
async function login(username, password) {
  const response = await request(core + '/api/v1/auth/login', {
    method: 'POST', headers: {Origin: core, 'Content-Type': 'application/json'},
    body: JSON.stringify({username, password}),
  });
  assert.equal(response.status, 200);
  const session = await response.json();
  const cookie = response.headers.getSetCookie().find(value => value.startsWith('hc_session='))?.split(';')[0];
  assert.ok(cookie && session.csrf_token);
  return {Cookie: cookie, 'X-CSRF-Token': session.csrf_token, Origin: core, 'Content-Type': 'application/json'};
}

try {
  const token = privateValue('/run/secrets/helper_token');
  const viewer = privateValue('/run/secrets/viewer_password');
  const denied = privateValue('/run/secrets/denied_password');
  stage = 'Traefik HTTP API and file-provider inventory';
  for (const [resource, name] of Object.entries(expected)) {
    const response = await request(`http://traefik-test:9081/api/http/${resource}`);
    assert.equal(response.status, 200);
    assert.ok((await response.json()).some(row => row.name === name));
  }
  const fixture = await new Promise((resolve, reject) => {
    const req = http.get('http://traefik-test:8080/ping', {headers: {Host: 'fixture.localhost'}}, res => {
      res.resume();
      res.on('end', () => resolve({status: res.statusCode, headers: {get: key => res.headers[key.toLowerCase()]}}));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('fixture timeout')));
  });
  assert.equal(fixture.status, 200);
  assert.equal(fixture.headers.get('x-homecontrol-fixture'), 'phase4');
  results.push(stage);

  stage = 'helper authentication rejection';
  for (const headers of [{}, {Authorization: 'Bearer deliberately-invalid-fixture-token-0000'}]) {
    assert.equal((await request(helper + '/v1/inventory', {headers})).status, 401);
  }
  results.push(stage);

  stage = 'authenticated helper inventory and diagnostics';
  const helperHeaders = {Authorization: 'Bearer ' + token};
  let response = await request(helper + '/v1/inventory', {headers: helperHeaders});
  assert.equal(response.status, 200);
  const inventory = await response.json();
  assert.equal(inventory.schemaVersion, 1);
  for (const [resource, name] of Object.entries(expected)) assert.ok(inventory[resource].some(row => row.name === name));
  response = await request(helper + '/v1/diagnostics', {headers: helperHeaders});
  const diagnostics = await response.json();
  assert.equal(response.status, 200);
  assert.equal(diagnostics.status, 'available');
  assert.equal(diagnostics.checks.length, 3);
  assert.ok(!JSON.stringify(diagnostics).includes(token));
  results.push(stage);

  stage = 'CORE session, permission and CSRF boundaries';
  assert.equal((await request(core + proxy + '/inventory')).status, 401);
  const deniedHeaders = await login('traefik-denied', denied);
  assert.equal((await request(core + proxy + '/inventory', {headers: deniedHeaders})).status, 403);
  const headers = await login('traefik-viewer', viewer);
  assert.equal((await request(core + proxy + '/inventory', {headers: {Cookie: headers.Cookie}})).status, 403);
  assert.equal((await request(core + proxy + '/diagnostics', {headers: {...headers, Origin: 'http://invalid.example'}})).status, 403);
  assert.equal((await request(core + proxy + '/labels', {method: 'POST', headers: {'Content-Type': 'application/json', Cookie: headers.Cookie}, body: '{}'})).status, 403);
  results.push(stage);

  stage = 'CORE live inventory, diagnostics, capability and credential redaction';
  for (const path of [proxy + '/inventory', proxy + '/diagnostics', '/api/v1/capabilities']) {
    const r = await request(core + path, {headers});
    assert.equal(r.status, 200);
    const text = await r.text();
    for (const secret of [token, viewer, denied]) assert.ok(!text.includes(secret));
    const body = JSON.parse(text);
    if (path.endsWith('/inventory')) for (const [resource, name] of Object.entries(expected)) assert.ok(body[resource].some(row => row.name === name));
    if (path.endsWith('/diagnostics')) assert.equal(body.status, 'available');
    if (path.endsWith('/capabilities')) assert.ok(body.capabilities.some(c => c.id === 'traefik' && c.status === 'available'));
  }
  results.push(stage);

  stage = 'preview-only HTTP/TLS labels and invalid model rejection';
  const model = {name: 'phase4', host: 'phase4.localhost', port: 8080, entrypoint: 'web', protocol: 'http', upstreamScheme: 'http'};
  for (const tls of [false, true]) {
    const input = tls ? {...model, protocol: 'https', tls: {}} : model;
    const r = await request(core + proxy + '/labels', {method: 'POST', headers, body: JSON.stringify(input)});
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.labels['traefik.http.routers.phase4.tls'], String(tls));
    assert.equal(body.labels['traefik.http.services.phase4.loadbalancer.server.scheme'], 'http');
  }
  assert.equal((await request(core + proxy + '/labels', {method: 'POST', headers, body: JSON.stringify({...model, host: 'x`) || Host(`invalid.example'})})).status, 400);
  assert.equal((await request(core + proxy + '/apply', {method: 'POST', headers, body: '{}'})).status, 404);
  results.push(stage);
  for (const name of results) console.log('PASS ' + name);
} catch {
  // Never log responses, request headers, credentials, cookie values or exception text.
  console.error('FAIL ' + stage);
  process.exitCode = 1;
}
