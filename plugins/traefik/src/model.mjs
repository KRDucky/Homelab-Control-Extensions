// SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
// SPDX-License-Identifier: GPL-3.0-or-later

const identifier = /^[a-z][a-z0-9-]{0,62}$/;
const pathPrefix = /^\/[A-Za-z0-9._~/-]{0,200}$/;
const backendHost = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/;
const object = value => value && Object.getPrototypeOf(value) === Object.prototype;
const isIdentifier = value => typeof value === 'string' && identifier.test(value);
const modelKeys = ['name', 'host', 'port', 'entrypoint', 'protocol', 'upstreamScheme', 'tls', 'path'];

function normalized(model) {
  if (!object(model) || Object.keys(model).some(key => !modelKeys.includes(key))) {
    throw new Error('Unexpected configuration fields');
  }
  const out = { ...model };
  if (out.path === '' || out.path === undefined) delete out.path;
  return out;
}

export function ruleOf(model) {
  const host = `Host(\`${model.host}\`)`;
  return model.path ? `${host} && PathPrefix(\`${model.path}\`)` : host;
}

// Pure configuration preview: incoming TLS and upstream scheme are independent.
export function labels(model) {
  model = normalized(model);
  const { name, host, port, entrypoint, protocol, upstreamScheme, tls, path } = model;
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
  if (path !== undefined && (typeof path !== 'string' || path.includes('..') || !pathPrefix.test(path))) {
    throw new Error('Invalid path prefix');
  }
  const router = `traefik.http.routers.${name}`;
  const service = `traefik.http.services.${name}`;
  const result = {
    'traefik.enable': 'true',
    [`${router}.rule`]: ruleOf(model),
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

// File-provider fragment for Traefik that has Docker labels disabled.
export function filePreview(model, backend) {
  const mapping = labels(model);
  model = normalized(model);
  if (typeof backend !== 'string' || !backendHost.test(backend)) throw new Error('Invalid backend hostname');
  const router = { rule: ruleOf(model), entryPoints: [model.entrypoint], service: model.name };
  if (model.protocol === 'https') {
    router.tls = model.tls?.certificateResolver ? { certResolver: model.tls.certificateResolver } : {};
  }
  const file = {
    http: {
      routers: { [model.name]: router },
      services: {
        [model.name]: {
          loadBalancer: {
            servers: [{ url: `${model.upstreamScheme}://${backend}:${model.port}` }],
          },
        },
      },
    },
  };
  const tlsLines = router.tls === undefined ? [] : router.tls.certResolver
    ? ['      tls:', `        certResolver: ${router.tls.certResolver}`]
    : ['      tls: {}'];
  const yaml = [
    'http:',
    '  routers:',
    `    ${model.name}:`,
    `      rule: '${router.rule}'`,
    '      entryPoints:',
    `        - ${model.entrypoint}`,
    `      service: ${model.name}`,
    ...tlsLines,
    '  services:',
    `    ${model.name}:`,
    '      loadBalancer:',
    '        servers:',
    `          - url: ${model.upstreamScheme}://${backend}:${model.port}`,
  ].join('\n');
  return { labels: mapping, file, yaml };
}
