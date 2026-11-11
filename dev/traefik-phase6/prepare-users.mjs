// SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import {readFileSync,openSync,writeFileSync,closeSync,constants} from 'node:fs';
// Never writes host credentials: creates only a private per-container tmpfs copy.
export function grantFixtureScope(source) {
 if(source.version!==1 || !Array.isArray(source.users)) throw new Error('Invalid fixture account schema');
 const copy=structuredClone(source);
 const viewers=copy.users.filter(u=>u.username==='traefik-viewer');
 if(viewers.length!==1 || viewers[0].disabled || !Array.isArray(viewers[0].scopes) || !viewers[0].scopes.includes('networking.proxy.read')) throw new Error('Expected enabled proxy viewer');
 const viewer=viewers[0];
 // Phase 7 Variant B: read-only platform registry listing for the isolated test viewer only.
 for(const scope of ['docker.compose.read','platforms.read','networking.proxy.apply'])if(!viewer.scopes.includes(scope))viewer.scopes.push(scope);
 return copy;
}
if (process.argv[1]?.endsWith('/prepare-users.mjs')) {
 try {
  const source=JSON.parse(readFileSync('/run/secrets/users_source','utf8'));
  const out=grantFixtureScope(source);
  const fd=openSync('/state/users.json',constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
  try{writeFileSync(fd,JSON.stringify(out)+'\n')}finally{closeSync(fd)}
 }catch{console.error('Fixture account preparation failed; no secret values logged');process.exitCode=1}
}
