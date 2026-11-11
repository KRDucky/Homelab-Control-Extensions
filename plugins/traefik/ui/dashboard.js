// SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
// SPDX-License-Identifier: GPL-3.0-or-later

const element = id => document.getElementById(id);
async function request(path, options = {}) {
  const response = await fetch(path, { ...options, headers: {
    Authorization: `Bearer ${element('token').value}`, 'Content-Type': 'application/json',
  } });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
}
element('refresh').onclick = async () => {
  element('inventory').textContent = '';
  try {
    const data = await request('/v1/inventory');
    element('inventory').textContent = JSON.stringify(data, null, 2);
    element('status').textContent = `${data.routers.length} HTTP routers, ${data.services.length} HTTP services, ${data.middlewares.length} middleware`;
  } catch (error) { element('status').textContent = error.message; }
};
element('diagnose').onclick = async () => {
  element('diagnostics').textContent = '';
  try { element('diagnostics').textContent = JSON.stringify(await request('/v1/diagnostics'), null, 2); }
  catch (error) { element('diagnostics').textContent = error.message; }
};
element('generator').onsubmit = async event => {
  event.preventDefault();
  element('labels').textContent = '';
  element('file').textContent = '';
  const model = Object.fromEntries(new FormData(event.target));
  model.port = Number(model.port);
  const resolver = model.certificateResolver;
  const backend = model.backend;
  delete model.certificateResolver;
  delete model.backend;
  if (!model.path) delete model.path;
  if (model.protocol === 'https') model.tls = resolver ? { certificateResolver: resolver } : {};
  else if (resolver) {
    element('labels').textContent = 'Select HTTPS to reference a certificate resolver.';
    return;
  }
  try {
    element('labels').textContent = JSON.stringify(await request('/v1/labels', {
      method: 'POST', body: JSON.stringify(model),
    }), null, 2);
    element('file').textContent = (await request('/v1/file-preview', {
      method: 'POST', body: JSON.stringify({ ...model, backend }),
    })).yaml;
  } catch (error) { element('labels').textContent = error.message; }
};
