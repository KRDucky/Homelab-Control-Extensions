// SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
// SPDX-License-Identifier: GPL-3.0-or-later

const identifier = /^[a-z][a-z0-9-]{0,62}$/;
const object = value => value && Object.getPrototypeOf(value) === Object.prototype;
const isIdentifier = value => typeof value === 'string' && identifier.test(value);

// Pure configuration preview: incoming TLS and upstream scheme are independent.
export function labels(model) {
  if (!object(model) || Object.keys(model).some(key =>
    !['name', 'host', 'port', 'entrypoint', 'protocol', 'upstreamScheme', 'tls'].includes(key))) {
    throw new Error('Unexpected configuration fields');
  }
  const { name, host, port, entrypoint, protocol, upstreamScheme, tls } = model;
  if (!isIdentifier(name) || !isIdentifier(entrypoint)) throw new Error('Invalid identifier');
  if (typeof host !== 'string' || host.length > 253 || !host.includes('.') ||
      !host.split('.').every(part => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))) {
    throw new Error('Expected lowercase DNS hostname');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
  if (!['http', 'https'].includes(protocol) || !['http', 'https'].includes(upstreamScheme)) {
    throw new Error('Explicit HTTP/HTTPS protocol and upstream scheme required');
  }
  if (protocol === 'http' && tls !== undefined) throw new Error('HTTP cannot configure TLS');
  if (protocol === 'https' && (!object(tls) ||
      Object.keys(tls).some(key => key !== 'certificateResolver') ||
      (tls.certificateResolver !== undefined && !isIdentifier(tls.certificateResolver)))) {
    throw new Error('HTTPS requires TLS object with optional certificateResolver');
  }
  const router = `traefik.http.routers.${name}`;
  const service = `traefik.http.services.${name}`;
  const result = {
    'traefik.enable': 'true',
    [`${router}.rule`]: `Host(\`${host}\`)`,
    [`${router}.entrypoints`]: entrypoint,
    [`${router}.service`]: name,
    [`${router}.tls`]: String(protocol === 'https'),
    [`${service}.loadbalancer.server.port`]: String(port),
    [`${service}.loadbalancer.server.scheme`]: upstreamScheme,
  };
  if (tls?.certificateResolver) result[`${router}.tls.certresolver`] = tls.certificateResolver;
  return result;
}

// JSON is a YAML-compatible mapping usable under a user-managed Compose service.
export function composePreview(model) {
  return { labels: labels(model) };
}
