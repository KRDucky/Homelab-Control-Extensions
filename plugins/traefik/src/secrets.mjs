// SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';

export function validateToken(token) {
  if (typeof token !== 'string' || !/^[!-~]{32,256}$/.test(token)) {
    throw new Error('helper_token_invalid: use 32–256 printable ASCII characters without spaces');
  }
  return token;
}

export function readToken(path) {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 4096 || (stat.mode & 0o007)) {
      throw new Error('unsafe file');
    }
    const buffer = Buffer.alloc(4097);
    const size = readSync(fd, buffer, 0, buffer.length, 0);
    if (size > 4096) throw new Error('oversized file');
    return validateToken(buffer.subarray(0, size).toString('utf8').replace(/\r?\n$/, ''));
  } catch {
    // No path, contents or system error goes into logs.
    throw new Error('helper_token_unavailable: require a readable regular token file, no symlinks or world access; review rootless UID mapping');
  } finally { if (fd !== undefined) closeSync(fd); }
}
