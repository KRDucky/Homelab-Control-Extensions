// SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import {openSync, closeSync, fstatSync, readSync, constants} from 'node:fs';
export function privateValue(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || st.size > 4096 || st.mode & 0o007) throw new Error('Unsafe private fixture file');
    const buffer = Buffer.alloc(4097);
    const size = readSync(fd, buffer, 0, buffer.length, 0);
    const value = buffer.subarray(0, size).toString('utf8').replace(/\r?\n$/, '');
    if (size > 4096 || !/^[!-~]{24,256}$/.test(value)) throw new Error('Invalid private fixture value');
    return value;
  } finally {closeSync(fd);}
}
