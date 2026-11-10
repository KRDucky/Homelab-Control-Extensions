// SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {privateValue} from './private-file.mjs';

const origin = 'http://127.0.0.1:9180';
let browser;
let stage = 'browser launch';
try {
  // Trusted local fixture only. Docker isolation remains; no host IPC, extra capabilities or root.
  browser = await chromium.launch({headless: true, chromiumSandbox: false});
  const page = await browser.newPage({viewport: {width: 1440, height: 1100}});
  let bearerLeak = false;
  let unexpectedOrigin = false;
  await page.route('**/*', route => {
    if (!route.request().url().startsWith(origin + '/')) {unexpectedOrigin = true; return route.abort();}
    return route.continue();
  });
  page.on('request', req => {if (req.headers()['authorization']) bearerLeak = true;});
  stage = 'fixture account login';
  await page.goto(origin, {waitUntil: 'networkidle'});
  await page.getByLabel('Username', {exact: true}).fill('traefik-viewer');
  await page.getByLabel('Password', {exact: true}).fill(privateValue('/run/secrets/viewer_password'));
  await page.getByRole('button', {name: 'Sign in', exact: true}).click();
  stage = 'Networking navigation and real inventory rendering';
  await page.getByRole('link', {name: 'Networking → Reverse Proxy → Traefik', exact: true}).click();
  await page.getByRole('heading', {name: 'Traefik', exact: true}).waitFor();
  for (const name of ['fixture-router@file', 'fixture-service@file', 'fixture-headers@file']) {
    await page.getByText(name, {exact: true}).waitFor();
  }
  await page.getByRole('heading', {name: 'API connectivity: available'}).waitFor();
  stage = 'live HTTP and TLS label previews';
  await page.getByLabel('Hostname', {exact: true}).fill('phase4.localhost');
  await page.getByRole('button', {name: 'Generate labels', exact: true}).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Compose labels"]')?.textContent.includes('phase4.localhost'));
  let preview = JSON.parse(await page.getByLabel('Compose labels').textContent());
  assert.equal(preview.labels['traefik.http.routers.demo.tls'], 'false');
  await page.locator('select[name="protocol"]').selectOption('https');
  await page.getByRole('button', {name: 'Generate labels', exact: true}).click();
  await page.waitForFunction(() => {
    try {return JSON.parse(document.querySelector('[aria-label="Compose labels"]')?.textContent ?? '{}').labels?.['traefik.http.routers.demo.tls'] === 'true';}
    catch {return false;}
  });
  preview = JSON.parse(await page.getByLabel('Compose labels').textContent());
  assert.equal(preview.labels['traefik.http.routers.demo.tls'], 'true');
  assert.equal(preview.labels['traefik.http.services.demo.loadbalancer.server.scheme'], 'http');
  assert.equal(bearerLeak, false);
  assert.equal(unexpectedOrigin, false);
  assert.equal(await page.getByLabel('Password', {exact: true}).count(), 0);
  for (const name of ['Apply', 'Deploy', 'Save', 'Restart']) assert.equal(await page.getByRole('button', {name, exact: true}).count(), 0);
  stage = 'screenshot without login fields or credentials';
  await page.screenshot({path: '/tmp/traefik-live-ui.png', fullPage: true});
  console.log('PASS compiled WebUI renders real inventory and preview-only labels; screenshot is /tmp/traefik-live-ui.png');
} catch {
  console.error('FAIL ' + stage);
  process.exitCode = 1;
} finally {await browser?.close();}
