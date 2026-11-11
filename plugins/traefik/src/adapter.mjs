// SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
// SPDX-License-Identifier: GPL-3.0-or-later

const paths = Object.freeze({
  routers: '/api/http/routers', services: '/api/http/services', middlewares: '/api/http/middlewares',
});
const MAX_BYTES = 1024 * 1024;
const help = Object.freeze({
  dns_failed: 'Check the Traefik network alias and shared private network.',
  connection_refused: 'Check the private API port and whether Traefik is listening.',
  timeout: 'Check reachability and API response time on the private network.',
  tls_failed: 'Check the API certificate and trusted CA; TLS verification stays enabled.',
  unauthorized: 'The API requires authentication not configured by this helper.',
  forbidden: 'The Traefik API denied this request; check API access policy.',
  api_not_found: 'Check that the configured origin serves the Traefik HTTP API.',
  redirect_blocked: 'Configure the final private API origin; redirects are refused.',
  response_too_large: 'API response exceeds the 1 MiB per-resource limit.',
  invalid_response: 'Expected a JSON array of Traefik resource objects.',
  upstream_http: 'Traefik returned an unexpected HTTP status.',
  network_error: 'Check the private API origin and network connectivity.',
});
export class ApiError extends Error {
  constructor(code) { super(help[code]); this.code = code; }
}

export function diagnostic(error) {
  const code = error instanceof ApiError && Object.hasOwn(help, error.code) ? error.code : 'network_error';
  return { code, hint: help[code] };
}

function networkError(error) {
  const code = error?.cause?.code ?? error?.code;
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError' || ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)) return new ApiError('timeout');
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return new ApiError('dns_failed');
  if (code === 'ECONNREFUSED') return new ApiError('connection_refused');
  if (code === 'ERR_TLS_CERT_ALTNAME_INVALID' || /CERT|TLS|SSL/.test(code ?? '')) return new ApiError('tls_failed');
  if (error?.cause?.message === 'unexpected redirect') return new ApiError('redirect_blocked');
  return new ApiError('network_error');
}

const MATCHER = /^(?:Host\(`[a-z0-9.-]{1,253}`\)|Path(?:Prefix)?\(`\/[A-Za-z0-9._~/-]{0,200}`\))$/;

export function sanitizeRule(rule) {
  if (typeof rule !== 'string' || rule.length < 8 || rule.length > 512 || rule.includes('..')) return;
  const tokens = rule.split(/ (\|\||&&) /);
  if (tokens.length < 1 || tokens.length > 9 || tokens.length % 2 === 0) return;
  for (let i = 0; i < tokens.length; i++) {
    if (i % 2 === 0) {
      if (!MATCHER.test(tokens[i])) return;
    } else if (tokens[i] !== '&&' && tokens[i] !== '||') return;
  }
  return rule;
}

export function createAdapter(endpoint, fetcher = fetch) {
  const base = new URL(endpoint);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password ||
      base.pathname !== '/' || base.search || base.hash) throw new Error('Expected API origin without credentials or path');
  async function read(path) {
    let response;
    try {
      response = await fetcher(new URL(path, base), {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(3000),
        headers: { Accept: 'application/json' },
      });
    } catch (error) { throw networkError(error); }
    if (!response.ok) {
      await response.body?.cancel();
      const code = { 401: 'unauthorized', 403: 'forbidden', 404: 'api_not_found' }[response.status];
      throw new ApiError(code ?? (response.status >= 300 && response.status < 400 ? 'redirect_blocked' : 'upstream_http'));
    }
    if (!/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) {
      await response.body?.cancel();
      throw new ApiError('invalid_response');
    }
    const reader = response.body.getReader();
    let bytes = 0;
    const chunks = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BYTES) throw new ApiError('response_too_large');
        chunks.push(Buffer.from(value));
      }
    } catch (error) {
      throw error instanceof ApiError ? error : networkError(error);
    } finally { await reader.cancel().catch(() => {}); }
    let data;
    try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new ApiError('invalid_response'); }
    if (!Array.isArray(data) || data.length > 5000) throw new ApiError('invalid_response');
    return data.map(row => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new ApiError('invalid_response');
      // Never expose BasicAuth hashes, headers, upstream URLs or raw configuration.
      const out = Object.fromEntries(['name', 'provider', 'status'].map(key =>
        [key, typeof row[key] === 'string' ? row[key].slice(0, 280) : 'unknown']));
      // Host / Path / PathPrefix only, joined by && and ||. Never forward raw rules.
      if (path === paths.routers) {
        const rule = sanitizeRule(row.rule);
        if (rule) out.rule = rule;
        if (typeof row.service === 'string' && /^[a-zA-Z0-9_.@-]{1,280}$/.test(row.service)) out.service = row.service;
        if (Array.isArray(row.entryPoints) && row.entryPoints.length <= 32 && row.entryPoints.every(v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,63}$/.test(v))) out.entrypoints = row.entryPoints;
        if (Object.hasOwn(row, 'tls')) out.tls = row.tls !== null && row.tls !== false;
      }
      return out;
    });
  }
  return Object.freeze({
    async inventory() {
      const entries = await Promise.all(Object.entries(paths).map(async ([resource, path]) => [resource, await read(path)]));
      return { schemaVersion: 1, ...Object.fromEntries(entries) };
    },
    async diagnostics() {
      const checks = await Promise.all(Object.entries(paths).map(async ([resource, path]) => {
        try {
          const rows = await read(path);
          return { resource, status: 'available', count: rows.length };
        } catch (error) { return { resource, status: 'unavailable', ...diagnostic(error) }; }
      }));
      const successes = checks.filter(check => check.status === 'available').length;
      return { schemaVersion: 1, status: successes === checks.length ? 'available' : successes ? 'degraded' : 'unavailable', checks };
    },
  });
}
