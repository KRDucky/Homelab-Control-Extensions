#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
# SPDX-License-Identifier: GPL-3.0-or-later

"""PROPOSAL: run only after explicit approval for new fixture files and four file ACLs."""
import os
import hashlib
from pathlib import Path
import secrets
import subprocess

ROOT = Path('/home/ian/Projects/.homecontrol-traefik-test-secrets')
HLCTL = Path('/tmp/hc-traefik-core-artifacts/build/hlctl')
EXPECTED = [(0, 1000, 1), (1, 100000, 65536)]
MAPPED_UID = 100999


def verify_mapping():
    if os.getuid() != 1000:
        raise RuntimeError('Expected host user ian (UID 1000)')
    matches = []
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit():
            continue
        try:
            if (entry / 'comm').read_text().strip() != 'dockerd' or entry.stat().st_uid != 1000:
                continue
            maps = [[tuple(map(int, line.split())) for line in (entry / name).read_text().splitlines()]
                    for name in ('uid_map', 'gid_map')]
            if maps == [EXPECTED, EXPECTED]:
                matches.append(entry.name)
        except (OSError, ValueError):
            continue
    if len(matches) != 1:
        raise RuntimeError('Actual rootless UID/GID map changed or unavailable; review before any writes')


def create(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write(value + '\n')


def main():
    verify_mapping()
    if ROOT.exists() or ROOT.is_symlink():
        raise RuntimeError('Fixture secret directory already exists; refusing to overwrite or reuse')
    if not HLCTL.is_file() or not os.access(HLCTL, os.X_OK):
        raise RuntimeError('Verified Phase 3 hlctl artifact is missing')
    if hashlib.sha256(HLCTL.read_bytes()).hexdigest() != '1e7e0b89767926a3a46b0958f6fd4e0e194fc388924d1030edb4e8d3389c17eb':
        raise RuntimeError('Phase 3 hlctl artifact hash changed')
    # All paths below are NEW; no existing secret, account or directory is modified.
    os.mkdir(ROOT, 0o700)
    viewer = secrets.token_urlsafe(32)
    denied = secrets.token_urlsafe(32)
    create(ROOT / 'helper_token', secrets.token_hex(32))
    create(ROOT / 'viewer_password', viewer)
    create(ROOT / 'denied_password', denied)
    for username, password, scopes in [
        ('traefik-viewer', viewer, 'networking.proxy.read'),
        ('traefik-denied', denied, 'system.read'),
    ]:
        subprocess.run([str(HLCTL), 'user', 'add', '--file', str(ROOT / 'users.json'),
                        '--username', username, '--scopes', scopes],
                       input=password + '\n', text=True, check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
    # Apply after both hlctl calls: source ACL mask bits would otherwise fail its 0600 loader.
    for name in ('helper_token', 'viewer_password', 'denied_password', 'users.json'):
        subprocess.run(['setfacl', '-m', f'u:{MAPPED_UID}:r--,m::r--', str(ROOT / name)], check=True)
    print('Created private fixture directory and four narrowly scoped read ACLs; no values printed.')


if __name__ == '__main__':
    main()
