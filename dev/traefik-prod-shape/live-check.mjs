// SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Run inside hc-traefik-plugin-test (shares the isolated test network).
const origin = 'http://traefik-test:9081';
const req = (u, o = {}) => fetch(u, {...o, redirect: 'error', signal: AbortSignal.timeout(8000)});
const res = [];
const ok = (n, c, d = '') => {
  res.push((c ? 'PASS ' : 'FAIL ') + n + (d !== '' ? ' [' + d + ']' : ''));
  if (!c) process.exitCode = 1;
};

const routers = await (await req(origin + '/api/http/routers')).json();
const names = routers.map(r => r.name).sort();
ok('legacy routers present', ['fixture-router@file', 'hc-api@file'].every(n => names.includes(n)), names.join(','));
ok('prod-shape routers present', ['app-http@file', 'app-https@file', 'dashboard@file'].every(n => names.includes(n)));
const dash = routers.find(r => r.name === 'dashboard@file');
ok('dashboard uses basicAuth', (dash?.middlewares || []).some(m => /dashboard-auth/.test(m)));

const metrics = await req('http://traefik-test:9100/metrics');
const body = await metrics.text();
ok('prometheus metrics 200', metrics.status === 200);
ok('prometheus has traefik metrics', /traefik_/.test(body));

const unauth = await req('http://traefik-test:8080/app/', {headers: {Host: 'app.isolated.test'}});
ok('path /app without auth is 401', unauth.status === 401, String(unauth.status));

const ping = await req('http://traefik-test:8080/ping', {headers: {Host: 'fixture.localhost'}});
ok('legacy fixture /ping still 200', ping.status === 200, String(ping.status));

console.log(res.join('\n'));
console.log(res.filter(x => x.startsWith('PASS')).length + '/' + res.length + ' passed');
