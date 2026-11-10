// SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// phase7Assets/phase7Fixture are supplied in memory by browser.py. This validates
// a controlled broker fixture UI, NOT real Docker discovery or deployed Phase 7.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {privateValue} from './private-file.mjs';
const origin='http://127.0.0.1:9180';let browser,stage='launch',badRequest=false,bearer=false;
try{
 browser=await chromium.launch({headless:true,chromiumSandbox:false});const page=await browser.newPage({viewport:{width:1440,height:1100}});
 page.on('request',r=>{if(r.headers()['authorization'])bearer=true});
 await page.route('**/*',async route=>{
  const r=route.request(),u=new URL(r.url());if(u.origin!==origin){badRequest=true;return route.abort()}
  if(u.pathname.endsWith('/traefik/applications'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(phase7Fixture.catalog)});
  if(u.pathname.endsWith('/traefik/compose-preview')){
   try{const body=r.postDataJSON();const protocol=body.model.protocol;assert.ok(['http','https'].includes(protocol));const expected={serviceId:'a'.repeat(64),network:'hc-traefik-test',model:{name:'proxy-host',host:'phase7.example.com',port:8080,entrypoint:'web',protocol,upstreamScheme:'http',...(protocol==='https'?{tls:{}}:{})}};assert.deepEqual(body,expected);return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(phase7Fixture[protocol])})}catch{badRequest=true;return route.fulfill({status:400,contentType:'application/json',body:'{"error":"invalid_fixture_model"}'})}
  }
  if(u.pathname.startsWith('/api/'))return route.continue();
  const key=u.pathname==='/'||!u.pathname.includes('.')?'index.html':u.pathname.slice(1);const asset=phase7Assets[key];if(!asset)return route.abort();const type=key.endsWith('.html')?'text/html':key.endsWith('.js')?'text/javascript':key.endsWith('.css')?'text/css':'application/octet-stream';return route.fulfill({status:200,contentType:type,body:Buffer.from(asset,'base64')});
 });
 stage='real fixture login';await page.goto(origin,{waitUntil:'networkidle'});await page.getByLabel('Username',{exact:true}).fill('traefik-viewer');await page.getByLabel('Password',{exact:true}).fill(privateValue('/run/secrets/viewer_password'));await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('link',{name:'Networking → Reverse Proxy → Traefik',exact:true}).click();await page.getByText('available',{exact:true}).waitFor();
 stage='controlled broker catalog UI';await page.getByRole('button',{name:'Proxy Hosts',exact:true}).click();await page.getByRole('button',{name:'Add Proxy Host',exact:true}).click();await page.getByLabel('Docker Compose application',{exact:true}).selectOption('notes');await page.getByLabel('Service / container',{exact:true}).selectOption('a'.repeat(64));assert.equal(await page.getByLabel('Internal application port',{exact:true}).inputValue(),'8080');await page.getByLabel('Public hostname',{exact:true}).fill('phase7.example.com');
 for(const protocol of ['http','https']){stage=protocol+' controlled backend-model summary';await page.locator('select[name="protocol"]').selectOption(protocol);await page.getByRole('button',{name:'Preview configuration',exact:true}).click();await page.getByRole('heading',{name:'Proposed Reverse Proxy Configuration',exact:true}).waitFor();await page.getByText('phase7.example.com',{exact:true}).waitFor();assert.equal(await page.locator('details').filter({has:page.locator('summary').filter({hasText:'Advanced Details'})}).evaluate(e=>e.hasAttribute('open')),false)}
 assert.equal(badRequest,false);assert.equal(bearer,false);for(const name of ['Apply','Deploy','Restart','Save'])assert.equal(await page.getByRole('button',{name,exact:true}).count(),0);
 await page.evaluate(()=>{const p=document.createElement('p');p.className='banner';p.textContent='Phase 7 browser-only controlled broker fixtures · no live Docker discovery · not deployed';document.querySelector('.traefik-page')?.prepend(p);window.scrollTo(0,0)});await page.screenshot({path:'/tmp/traefik-phase7-webui.png',fullPage:true});console.log('PASS controlled broker fixture UI: real fixture login, application selection, automatic internal port, HTTP/HTTPS backend-generated summary, advanced details collapsed, no apply controls or bearer headers. Not deployed; not real Docker discovery.');
}catch{console.error('FAIL '+stage);process.exitCode=1}finally{await browser?.close()}
