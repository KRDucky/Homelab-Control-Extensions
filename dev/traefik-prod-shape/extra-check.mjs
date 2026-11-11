// SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Supplementary isolated-test checks. Uses node:http/https so the Host header
// is actually sent (undici fetch drops a caller-set Host header).
// Run inside hc-traefik-plugin-test. Set HC_ISO_PW to the isolated-test password.
import http from 'node:http';
import https from 'node:https';

const PW = process.env.HC_ISO_PW;
if (!PW) {
  console.error('set HC_ISO_PW to the isolated-test password (see README)');
  process.exit(2);
}

const AUTH = 'Basic ' + Buffer.from('isolated-viewer:' + PW).toString('base64');
const FP = '75:E4:75:5A:2F:3A:08:09:B1:16:C8:08:55:BF:09:BD:77:96:DB:4E:2D:14:00:34:8E:99:2F:77:DD:DB:FF:42';
const res = [];
const ok = (n, c, d = '') => {
  res.push((c ? 'PASS ' : 'FAIL ') + n + (d !== '' ? ' [' + d + ']' : ''));
  if (!c) process.exitCode = 1;
};

function get(url, {headers = {}, servername} = {}) {
  const u = new URL(url);
  const mod = u.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const r = mod.request({
      host: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'GET',
      headers,
      ...(servername ? {servername, rejectUnauthorized: false} : {}),
      timeout: 8000
    }, s => {
      const cert = s.socket?.getPeerCertificate ? s.socket.getPeerCertificate() : null;
      let b = '';
      s.setEncoding('utf8');
      s.on('data', d => { b += d; });
      s.on('end', () => resolve({status: s.statusCode, headers: s.headers, body: b, cert}));
    });
    r.on('timeout', () => r.destroy(new Error('timeout')));
    r.on('error', reject);
    r.end();
  });
}

const app = {Host: 'app.isolated.test'};
let r = await get('http://traefik-test:8080/app/', {headers: app});
ok('/app without auth is 401', r.status === 401, String(r.status));
r = await get('http://traefik-test:8080/ping', {headers: {Host: 'fixture.localhost'}});
ok('fixture /ping 200', r.status === 200 && r.headers['x-homecontrol-fixture'] === 'phase4', r.status + ' ' + r.headers['x-homecontrol-fixture']);

r = await get('http://traefik-test:8080/app/', {headers: {...app, Authorization: AUTH}});
ok('/app + basicAuth 200', r.status === 200, String(r.status));
ok('body starts webapp-a|webapp-b', /^webapp-[ab] /.test(r.body), r.body.trim());
ok('X-HomeControl-Proxy isolated-prod-shape', r.headers['x-homecontrol-proxy'] === 'isolated-prod-shape', r.headers['x-homecontrol-proxy']);
ok('HTTP security headers (nosniff/frame/referrer; HSTS is TLS-only)', r.headers['referrer-policy'] === 'no-referrer' && r.headers['x-content-type-options'] === 'nosniff' && r.headers['x-frame-options'] === 'DENY');

const seen = {};
for (let i = 0; i < 8; i++) {
  const x = await get('http://traefik-test:8080/app/', {headers: {...app, Authorization: AUTH}});
  const k = x.body.split(' ')[0];
  seen[k] = (seen[k] || 0) + 1;
}
ok('load balancer hits both backends', seen['webapp-a'] > 0 && seen['webapp-b'] > 0, JSON.stringify(seen));

r = await get('http://traefik-test:9081/dashboard/');
ok('dashboard without auth 401', r.status === 401, String(r.status));
r = await get('http://traefik-test:9081/dashboard/', {headers: {Authorization: AUTH}});
ok('dashboard + basicAuth 200', r.status === 200, String(r.status));

r = await get('https://traefik-test:8443/app/', {headers: {...app, Authorization: AUTH}, servername: 'app.isolated.test'});
ok('HTTPS SNI app.isolated.test /app + basicAuth 200', r.status === 200 && /^webapp-[ab] /.test(r.body), r.status + ' ' + r.body.trim());
ok('HTTPS HSTS max-age=31536000; includeSubDomains', /max-age=31536000; includeSubDomains/.test(r.headers['strict-transport-security'] || ''));
ok('served cert is the isolated file cert', r.cert?.fingerprint256 === FP, r.cert?.subject?.CN);
r = await get('https://traefik-test:8443/app/', {headers: app, servername: 'app.isolated.test'});
ok('HTTPS /app without auth 401', r.status === 401, String(r.status));
try {
  r = await get('https://traefik-test:8443/app/', {headers: app, servername: 'unknown.example'});
  ok('sniStrict rejects unknown SNI', false, String(r.status));
} catch (e) {
  ok('sniStrict rejects unknown SNI', true, e.code || e.message);
}

console.log(res.join('\n'));
console.log(res.filter(x => x.startsWith('PASS')).length + '/' + res.length + ' passed');
