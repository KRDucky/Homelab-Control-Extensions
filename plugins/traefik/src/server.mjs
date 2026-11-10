// SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { createAdapter } from './adapter.mjs';
import { composePreview } from './model.mjs';
import { readToken, validateToken } from './secrets.mjs';

const ui = readFileSync(new URL('../ui/index.html', import.meta.url));
export function handler(adapter, token) {
  validateToken(token);
  return async (req, res) => {
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(data));
    };
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'" });
      return res.end(ui);
    }
    if (req.method === 'GET' && req.url === '/dashboard.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'X-Content-Type-Options': 'nosniff' });
      return res.end(readFileSync(new URL('../ui/dashboard.js', import.meta.url)));
    }
    const supplied = Buffer.from(req.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return send(401, { error: 'unauthorized' });
    if (req.method === 'GET' && req.url === '/v1/inventory') {
      try { return send(200, await adapter.inventory()); }
      catch { return send(502, { error: 'traefik_unavailable' }); }
    }
    if (req.method === 'GET' && req.url === '/v1/diagnostics') {
      try { return send(200, await adapter.diagnostics()); }
      catch { return send(502, { error: 'diagnostics_unavailable' }); }
    }
    if (req.method === 'POST' && req.url === '/v1/labels') {
      if (req.headers['content-type'] !== 'application/json') return send(415, { error: 'expected_json' });
      let body = '';
      try {
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 4096) return send(413, { error: 'request_too_large' });
        }
        return send(200, composePreview(JSON.parse(body)));
      } catch { return send(400, { error: 'invalid_model' }); }
    }
    return send(404, { error: 'not_found' });
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const token = readToken(process.env.HC_HELPER_TOKEN_FILE);
  const adapter = createAdapter(process.env.TRAEFIK_API_ORIGIN);
  const server = http.createServer(handler(adapter, token));
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.maxConnections = 16;
  server.listen(9080, process.env.HC_LISTEN_HOST ?? '127.0.0.1');
}
