#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
# SPDX-License-Identifier: GPL-3.0-or-later

"""Read-only collision and artifact checks. Does not create/reconfigure anything."""
import hashlib
import json
from pathlib import Path
import subprocess

NAMES = {'hc-traefik-fixture', 'hc-traefik-plugin-test', 'hc-traefik-core-test', 'hc-traefik-browser-test'}
EXPECTED_PLUGIN = 'sha256:57fb5e12dd3c035ef7b06ee82eb318bdd292f25d90a609d0771de302df9f7f1c'
HASHES = {
    'hc-api': 'ad804b4dd76356e9090bb16faca8f310e2b2de308578b0f8f9fae2402c560843',
    'hlctl': '1e7e0b89767926a3a46b0958f6fd4e0e194fc388924d1030edb4e8d3389c17eb',
}


def docker(*args):
    return subprocess.check_output(['docker', '--context', 'rootless', *args], text=True)


def main():
    endpoint = json.loads(docker('context', 'inspect', 'rootless'))[0]['Endpoints']['docker']['Host']
    assert endpoint == 'unix:///run/user/1000/docker.sock', 'Rootless endpoint changed'
    options = json.loads(docker('info', '--format', '{{json .SecurityOptions}}'))
    assert 'name=rootless' in options, 'Rootless daemon required'
    existing = {name for line in docker('ps', '-a', '--format', '{{.Names}}').splitlines()
                for name in line.split(',')}
    assert not existing & NAMES, 'Proposed container name already exists; no changes permitted'
    assert 'hc-traefik-test' not in docker('network', 'ls', '--format', '{{.Name}}').splitlines(), 'Network already exists; inspect/review before reuse'
    assert docker('image', 'inspect', 'homecontrol/traefik-plugin:dev', '--format', '{{.Id}}').strip() == EXPECTED_PLUGIN, 'Plugin tag changed'
    tags = set(docker('image', 'ls', '--format', '{{.Repository}}:{{.Tag}}').splitlines())
    for tag in ('homecontrol/traefik-core:phase4', 'homecontrol/traefik-browser:phase4'):
        assert tag not in tags, 'Proposed output image tag exists; review before overwriting'
    secrets = Path('/home/ian/Projects/.homecontrol-traefik-test-secrets')
    assert not secrets.exists() and not secrets.is_symlink(), 'Secret directory already exists; no overwrite'
    assert not Path('/home/ian/Projects/codex-reports/traefik-phase4-webui.png').exists(), 'Proof destination already exists; choose a new path'
    for name, expected in HASHES.items():
        path = Path('/tmp/hc-traefik-core-artifacts/build') / name
        assert hashlib.sha256(path.read_bytes()).hexdigest() == expected, 'Phase 3 artifact changed or missing'
    print('PASS read-only preflight: names, network, image tags, source image and CORE artifacts')


if __name__ == '__main__':
    main()
