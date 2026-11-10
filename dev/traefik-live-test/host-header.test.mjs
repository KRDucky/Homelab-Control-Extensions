// SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('Phase 4 routing probe sends the intended HTTP Host header', async () => {
  const http = await import('node:http');
  const source = readFileSync(new URL('./validate.mjs', import.meta.url),'utf8');
  const probe = source.slice(source.indexOf('const fixture ='), source.indexOf('  assert.equal(fixture.status'));
  const server = http.createServer((req,res) => {res.writeHead(req.headers.host === 'fixture.localhost' ? 200 : 404, {'x-homecontrol-fixture':'phase4'});res.end('ok')});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const local = `http://127.0.0.1:${server.address().port}/ping`;
    const run = new Function('http', `return (async()=>{${probe.replace('http://traefik-test:8080/ping',local)}return fixture})()`);
    const response = await run(http);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('x-homecontrol-fixture'),'phase4');
  } finally {await new Promise(resolve=>server.close(resolve))}
});
