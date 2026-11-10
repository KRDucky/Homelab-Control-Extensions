// SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import {privateValue} from './private-file.mjs';
const origin='http://127.0.0.1:9180',base=origin+'/api/v1/networking/reverse-proxy/traefik';
async function request(url,options={}){return fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(5000)})}
async function login(username,path){const r=await request(origin+'/api/v1/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username,password:privateValue(path)})});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie')?.split(';')[0],data=await r.json();assert.ok(cookie&&data.csrf_token);return {Cookie:cookie,Origin:origin,'X-CSRF-Token':data.csrf_token,'Content-Type':'application/json'}}
let stage='authentication';
try{
 const denied=await login('traefik-denied','/run/secrets/denied_password');
 assert.equal((await request(base+'/applications',{headers:denied})).status,403);
 const headers=await login('traefik-viewer','/run/secrets/viewer_password');
 stage='fixture discovery';const r=await request(base+'/applications',{headers});assert.equal(r.status,200);const catalog=await r.json();assert.equal(catalog.fixture,true);assert.equal(catalog.source,'fixture');assert.equal(catalog.traefik.dockerProvider,false);assert.ok(catalog.services.some(s=>s.compose&&s.project==='example-notes'));assert.ok(catalog.services.some(s=>!s.compose));
 const body={serviceId:'fixture-notes-web',network:'hc-traefik-test',model:{name:'phase6',host:'phase6.example.com',port:8080,entrypoint:'web',protocol:'http',upstreamScheme:'http'}};
 stage='authenticated backend proposal';for(const protocol of ['http','https']){const model={...body.model,protocol,...(protocol==='https'?{tls:{}}:{})};const preview=await request(base+'/compose-preview',{method:'POST',headers,body:JSON.stringify({...body,model})});assert.equal(preview.status,200);const p=await preview.json();assert.equal(p.applyAvailable,false);assert.equal(p.sourceFileVerified,false);assert.ok(p.blockers.some(v=>v.code==='provider_disabled'));assert.equal(p.proposed.labels['traefik.http.routers.phase6.tls'],String(protocol==='https'));assert.equal(p.proposed.labels['traefik.http.services.phase6.loadbalancer.server.scheme'],'http');assert.equal(p.proposed.labels['traefik.docker.network'],'hc-traefik-test')}
 stage='CSRF/RBAC/invalid models';const noCsrf={...headers};delete noCsrf['X-CSRF-Token'];assert.equal((await request(base+'/compose-preview',{method:'POST',headers:noCsrf,body:JSON.stringify(body)})).status,403);assert.equal((await request(base+'/compose-preview',{method:'POST',headers:denied,body:JSON.stringify(body)})).status,403);for(const invalid of [{...body,network:'unconfirmed'},{...body,model:{...body.model,port:0}},{...body,apply:true}])assert.equal((await request(base+'/compose-preview',{method:'POST',headers,body:JSON.stringify(invalid)})).status,400);
 console.log('PASS actual backend fixture discovery, HTTP/HTTPS network proposals, provider-disabled blocker, no apply, CSRF/RBAC and invalid models');
}catch{console.error('FAIL '+stage);process.exitCode=1}
