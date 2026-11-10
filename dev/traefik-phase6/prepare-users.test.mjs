// SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {grantFixtureScope} from './prepare-users.mjs';
test('only private fixture viewer scopes change; source and password hashes preserved',()=>{
 const source={version:1,users:[{username:'traefik-viewer',password_hash:'TEST-HASH',scopes:['networking.proxy.read']},{username:'traefik-denied',password_hash:'OTHER-HASH',scopes:['system.read']}]};
 const before=JSON.stringify(source);const out=grantFixtureScope(source);
 assert.equal(JSON.stringify(source),before);assert.deepEqual(out.users[0].scopes,['networking.proxy.read','docker.compose.read']);assert.equal(out.users[0].password_hash,source.users[0].password_hash);assert.deepEqual(out.users[1],source.users[1]);assert.deepEqual(grantFixtureScope(out),out);
});
test('missing/disabled/unprivileged viewer fails closed',()=>{for(const source of [{version:0,users:[]},{version:1,users:[]},{version:1,users:[{username:'traefik-viewer',scopes:[]}]},{version:1,users:[{username:'traefik-viewer',disabled:true,scopes:['networking.proxy.read']}]}])assert.throws(()=>grantFixtureScope(source))});
