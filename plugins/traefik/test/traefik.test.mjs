// SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readFileSync } from 'node:fs';
import { labels, composePreview } from '../src/model.mjs';
import { createAdapter } from '../src/adapter.mjs';
import { handler } from '../src/server.mjs';
import { mkdtempSync, writeFileSync, symlinkSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readToken, validateToken } from '../src/secrets.mjs';
import { ApiError, diagnostic } from '../src/adapter.mjs';

const model = { name: 'demo', host: 'demo.localhost', port: 8080, entrypoint: 'web', protocol: 'http', upstreamScheme: 'http' };
const token = 'development-test-token-0123456789abcdef';
const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });

test('Compose preview has explicit router/service binding and string labels', () => {
  assert.deepEqual(composePreview(model), { labels: {
    'traefik.enable': 'true',
    'traefik.http.routers.demo.rule': 'Host(`demo.localhost`)',
    'traefik.http.routers.demo.entrypoints': 'web',
    'traefik.http.routers.demo.service': 'demo',
    'traefik.http.routers.demo.tls': 'false',
    'traefik.http.services.demo.loadbalancer.server.port': '8080',
    'traefik.http.services.demo.loadbalancer.server.scheme': 'http',
  } });
});
test('reject injected rules, label keys, invalid ports and unexpected model properties', () => {
  for (const changes of [
    { name: 'x.rule' }, { name: ['demo'] }, { entrypoint: ['web'] },
    { host: 'x`) || Host(`evil.test' }, { entrypoint: 'web,admin' },
    { port: 0 }, { port: 65536 }, { port: 1.5 }, { port: '80' },
    { host: '-bad.test' }, { host: 'a..test' }, { command: 'apply' },
  ]) assert.throws(() => labels({ ...model, ...changes }));
  for (const value of [null, [], 'invalid']) assert.throws(() => labels(value));
});
test('adapter makes only fixed GETs and removes raw sensitive configuration', async () => {
  const calls = [];
  const adapter = createAdapter('http://traefik-test:8080', async (url, options) => {
    calls.push([url.href, options]);
    return json([{ name: 'demo@file', status: 'enabled', provider: 'file', password: 'secret', server: 'private' }]);
  });
  assert.deepEqual(await adapter.inventory(), { schemaVersion: 1,
    routers: [{ name: 'demo@file', provider: 'file', status: 'enabled' }],
    services: [{ name: 'demo@file', provider: 'file', status: 'enabled' }],
    middlewares: [{ name: 'demo@file', provider: 'file', status: 'enabled' }],
  });
  assert.deepEqual(calls.map(([url]) => url), ['http://traefik-test:8080/api/http/routers', 'http://traefik-test:8080/api/http/services', 'http://traefik-test:8080/api/http/middlewares']);
  for (const [, options] of calls) {
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
  }
});
test('reject credentials, path, query and non-HTTP origins', () => {
  for (const origin of ['file:///tmp/x', 'http://u:p@host', 'http://host/api', 'http://host/?x=1', 'http://host/#x']) {
    assert.throws(() => createAdapter(origin));
  }
});
test('adapter rejects HTTP errors, invalid shape, non-JSON and oversized bodies', async () => {
  for (const response of [
    new Response('no', { status: 401 }), json({ routers: [] }), json([null]),
    new Response('html'), json(['x'.repeat(1024 * 1024)]),
    new Response('{invalid', { headers: { 'Content-Type': 'application/json' } }),
  ]) await assert.rejects(createAdapter('http://traefik-test:8080', async () => response).inventory());
  await assert.rejects(createAdapter('http://traefik-test:8080', async () => { throw new Error('timeout'); }).inventory());
});

async function call(route, { method = 'GET', authorization = `Bearer ${token}`, contentType = 'application/json', body = '' } = {}, adapter = { inventory: async () => ({ routers: [], services: [] }) }) {
  const req = Readable.from([body]);
  Object.assign(req, { method, url: route, headers: { authorization, 'content-type': contentType } });
  const result = {};
  const res = {
    writeHead(status, headers) { Object.assign(result, { status, headers }); },
    end(body) { result.body = body; },
  };
  await handler(adapter, token)(req, res);
  return result;
}
test('helper denies anonymous API and offers no arbitrary proxy or apply routes', async () => {
  assert.equal((await call('/v1/inventory', { authorization: '' })).status, 401);
  for (const [route, method] of [['/v1/apply', 'POST'], ['/api/rawdata', 'GET'], ['/v1/inventory?url=http://evil', 'GET'], ['/v1/inventory', 'DELETE']]) {
    assert.equal((await call(route, { method })).status, 404);
  }
  assert.throws(() => handler({}, 'short'));
});
test('helper reports upstream failure without leaking errors', async () => {
  const result = await call('/v1/inventory', {}, { inventory: async () => { throw new Error('private-url-secret'); } });
  assert.equal(result.status, 502);
  assert.equal(result.body, '{"error":"traefik_unavailable"}');
});
test('helper returns inventory and bounded validated label previews', async () => {
  assert.equal((await call('/v1/inventory')).status, 200);
  const result = await call('/v1/labels', { method: 'POST', body: JSON.stringify(model) });
  assert.equal(result.status, 200);
  assert.deepEqual(JSON.parse(result.body), composePreview(model));
  assert.equal((await call('/v1/labels', { method: 'POST', body: '{' })).status, 400);
  assert.equal((await call('/v1/labels', { method: 'POST', body: 'x'.repeat(4097) })).status, 413);
  assert.equal((await call('/v1/labels', { method: 'POST', contentType: 'text/plain' })).status, 415);
});
test('dashboard is available as a local preview with safe text rendering', async () => {
  const page = await call('/');
  assert.equal(page.status, 200);
  assert.match(page.headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  const script = (await call('/dashboard.js')).body.toString();
  assert.ok(script.includes('textContent'));
  assert.ok(!script.includes('innerHTML'));
});
test('deployment scaffold has no socket mount, host publication or Traefik lifecycle', () => {
  const compose = readFileSync(new URL('../compose.yaml', import.meta.url), 'utf8');
  assert.ok(!/docker\.sock|^\s+ports:|privileged:|network_mode:|^\s+volumes:/m.test(compose));
  assert.match(compose, /external: true/);
  assert.match(compose, /read_only: true/);
});

test('HTTPS is explicit and independent of upstream encryption with opt-in resolver only', () => {
  const https = { ...model, protocol: 'https', tls: {}, upstreamScheme: 'http' };
  const result = labels(https);
  assert.equal(result['traefik.http.routers.demo.tls'], 'true');
  assert.equal(result['traefik.http.services.demo.loadbalancer.server.scheme'], 'http');
  assert.ok(!Object.keys(result).some(key => key.includes('certresolver')));
  const resolver = labels({ ...https, upstreamScheme: 'https', tls: { certificateResolver: 'staging' } });
  assert.equal(resolver['traefik.http.routers.demo.tls.certresolver'], 'staging');
  assert.equal(resolver['traefik.http.services.demo.loadbalancer.server.scheme'], 'https');
});

test('reject ambiguous or unsafe TLS and upstream configuration', () => {
  for (const changes of [
    { protocol: undefined }, { protocol: 'tcp' }, { upstreamScheme: undefined }, { upstreamScheme: 'ftp' },
    { tls: {} }, { protocol: 'https' }, { protocol: 'https', tls: null },
    { protocol: 'https', tls: { certificateResolver: 'a,evil' } },
    { protocol: 'https', tls: { insecureSkipVerify: true } },
    { protocol: 'https', tls: { certificateResolver: ['resolver'] } },
  ]) assert.throws(() => labels({ ...model, ...changes }));
});

test('diagnostics classify transport failures without leaking original messages', async () => {
  for (const [code, expected] of [
    ['ENOTFOUND', 'dns_failed'], ['EAI_AGAIN', 'dns_failed'], ['ECONNREFUSED', 'connection_refused'],
    ['UND_ERR_CONNECT_TIMEOUT', 'timeout'], ['CERT_HAS_EXPIRED', 'tls_failed'], ['OTHER', 'network_error'],
  ]) {
    const result = await createAdapter('http://traefik-test:8080', async () => {
      throw new Error('secret-origin', { cause: { code } });
    }).diagnostics();
    assert.equal(result.status, 'unavailable');
    assert.equal(result.checks.length, 3);
    assert.ok(result.checks.every(check => check.code === expected));
    assert.ok(!JSON.stringify(result).includes('secret-origin'));
  }
  const timeout = await createAdapter('http://traefik-test:8080', async () => {
    throw new DOMException('secret', 'TimeoutError');
  }).diagnostics();
  assert.equal(timeout.checks[0].code, 'timeout');
});

test('diagnostics distinguish HTTP/API failures and report partial connectivity', async () => {
  for (const [status, code] of [[401, 'unauthorized'], [403, 'forbidden'], [404, 'api_not_found'], [302, 'redirect_blocked'], [503, 'upstream_http']]) {
    const result = await createAdapter('http://traefik-test:8080', async () => new Response('', { status })).diagnostics();
    assert.equal(result.checks[0].code, code);
  }
  const result = await createAdapter('http://traefik-test:8080', async url =>
    url.pathname.endsWith('/middlewares') ? new Response('', { status: 403 }) : json([])).diagnostics();
  assert.equal(result.status, 'degraded');
  assert.deepEqual(result.checks[0], { resource: 'routers', status: 'available', count: 0 });
  assert.equal(result.checks[2].code, 'forbidden');
  assert.equal((await createAdapter('http://traefik-test:8080', async () => json([])).diagnostics()).status, 'available');
});

test('diagnostics distinguish malformed and oversized API responses', async () => {
  for (const [factory, code] of [
    [() => json({}), 'invalid_response'], [() => json(['x'.repeat(1024 * 1024)]), 'response_too_large'],
    [() => new Response('html'), 'invalid_response'],
  ]) {
    const result = await createAdapter('http://traefik-test:8080', async () => factory()).diagnostics();
    assert.equal(result.checks[0].code, code);
  }
  assert.equal(diagnostic(new Error('secret')).code, 'network_error');
  assert.equal(diagnostic(new ApiError('invalid_response')).code, 'invalid_response');
});

test('middleware inventory strips BasicAuth hashes and raw configuration', async () => {
  const data = await createAdapter('http://traefik-test:8080', async () => json([
    { name: 'auth@file', provider: 'file', status: 'enabled', basicAuth: { users: ['secret-hash'] }, headers: { Authorization: 'secret' } },
  ])).inventory();
  assert.deepEqual(data.middlewares, [{ name: 'auth@file', provider: 'file', status: 'enabled' }]);
  assert.ok(!JSON.stringify(data).includes('secret'));
});

test('diagnostics API requires authentication and returns safe results', async () => {
  assert.equal((await call('/v1/diagnostics', { authorization: '' })).status, 401);
  const result = await call('/v1/diagnostics', {}, { diagnostics: async () => ({ status: 'available', checks: [] }) });
  assert.equal(result.status, 200);
  assert.equal(JSON.parse(result.body).status, 'available');
  assert.equal((await call('/v1/diagnostics', {}, { diagnostics: async () => { throw new Error('secret'); } })).body, '{"error":"diagnostics_unavailable"}');
});

test('token syntax rejects whitespace, control characters and oversized secrets', () => {
  assert.equal(validateToken(token), token);
  for (const value of ['short', 'x'.repeat(257), 'a'.repeat(32) + '\n', 'a'.repeat(32) + ' ', null]) {
    assert.throws(() => validateToken(value));
  }
});

test('secret file loader accepts private regular file and rejects unsafe inputs without leaking paths', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hc-traefik-secret-test-'));
  try {
    const good = join(directory, 'token');
    writeFileSync(good, token + '\n', { mode: 0o600 });
    assert.equal(readToken(good), token);
    const bad = join(directory, 'world-readable');
    writeFileSync(bad, token, { mode: 0o644 });
    chmodSync(bad, 0o644);
    const link = join(directory, 'symlink');
    symlinkSync(good, link);
    const oversized = join(directory, 'large');
    writeFileSync(oversized, 'x'.repeat(4097), { mode: 0o600 });
    for (const path of [bad, link, directory, oversized, join(directory, 'missing')]) {
      assert.throws(() => readToken(path), error => error.message.startsWith('helper_token_unavailable:') && !error.message.includes(directory));
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('container uses an immutable official base and numeric non-root runtime', () => {
  const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  assert.match(dockerfile, /FROM docker\.io\/library\/node:24-alpine@sha256:[a-f0-9]{64} AS base/);
  assert.match(dockerfile, /USER 1000:1000/);
  assert.ok(!dockerfile.includes('COPY --chown=node'));
});

test('router view exposes only bounded single-host routing metadata', async () => {
  const adapter = createAdapter('http://traefik.test', async url => json(url.pathname.endsWith('/routers') ? [{name:'notes@file',provider:'file',status:'enabled',rule:'Host(`notes.example.com`)',service:'notes@file',entryPoints:['web'],tls:{},password:'PRIVATE',middlewares:['auth@file']}] : []));
  const inventory = await adapter.inventory();
  assert.deepEqual(inventory.routers[0], {name:'notes@file',provider:'file',status:'enabled',rule:'Host(`notes.example.com`)',service:'notes@file',entrypoints:['web'],tls:true});
  assert.equal(JSON.stringify(inventory).includes('PRIVATE'),false);
  const hostile=createAdapter('http://traefik.test',async()=>json([{rule:'Headers(`Authorization`,`PRIVATE`)',service:'http://user:pass@host',entryPoints:['bad\nvalue']}]))
  const safe=await hostile.inventory();
  assert.equal(JSON.stringify(safe).includes('PRIVATE'),false);
  assert.equal(safe.routers[0].tls,undefined);
});

test('router view keeps Host Path and PathPrefix file-provider rules', async () => {
  const {sanitizeRule} = await import('../src/adapter.mjs');
  for (const rule of [
    'Host(`app.isolated.test`) && PathPrefix(`/app`)',
    'Host(`fixture.localhost`) && Path(`/ping`)',
    'PathPrefix(`/api`)',
    'PathPrefix(`/dashboard`) || PathPrefix(`/debug`)',
    'Host(`app.isolated.test`) && Path(`/`)',
  ]) assert.equal(sanitizeRule(rule), rule, rule);
  assert.equal(sanitizeRule('Host(`a.example.com`) || Host(`b.example.com`)'), 'Host(`a.example.com`) || Host(`b.example.com`)');
  for (const rule of [
    'Headers(`Authorization`,`PRIVATE`)',
    'HostRegexp(`.*\\.evil`)',
    'PathPrefix(`/../etc`)',
    'Query(`q`,`x`)',
    'Host(`a.example.com`) && Headers(`X`,`y`)',
  ]) assert.equal(sanitizeRule(rule), undefined, rule);
  const adapter = createAdapter('http://traefik.test', async url => json(url.pathname.endsWith('/routers') ? [
    {name:'app-http@file',provider:'file',status:'enabled',rule:'Host(`app.isolated.test`) && PathPrefix(`/app`)',service:'webapp-lb@file',entryPoints:['web']},
    {name:'hc-api@file',provider:'file',status:'enabled',rule:'PathPrefix(`/api`)',service:'api@internal',entryPoints:['hc-admin']},
    {name:'evil@file',provider:'file',status:'enabled',rule:'Headers(`Authorization`,`PRIVATE`)',password:'PRIVATE'},
  ] : []));
  const inventory = await adapter.inventory();
  assert.equal(inventory.routers[0].rule, 'Host(`app.isolated.test`) && PathPrefix(`/app`)');
  assert.equal(inventory.routers[1].rule, 'PathPrefix(`/api`)');
  assert.equal(inventory.routers[2].rule, undefined);
  assert.equal(JSON.stringify(inventory).includes('PRIVATE'), false);
});

