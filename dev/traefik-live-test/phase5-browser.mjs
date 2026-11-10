// SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// phase5Assets is supplied in memory by phase5-browser.py; no API mocks.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {privateValue} from './private-file.mjs';
const origin='http://127.0.0.1:9180';
let browser;
let stage='launch';
try {
 browser=await chromium.launch({headless:true,chromiumSandbox:false});
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 let bearer=false,external=false;
 page.on('request',r=>{if(r.headers()['authorization'])bearer=true});
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!==origin){external=true;return route.abort()}
  if(url.pathname.startsWith('/api/'))return route.continue();
  const key=url.pathname==='/'||!url.pathname.includes('.')?'index.html':url.pathname.slice(1);
  const asset=phase5Assets[key];
  if(!asset)return route.abort();
  const type=key.endsWith('.html')?'text/html':key.endsWith('.js')?'text/javascript':key.endsWith('.css')?'text/css':key.endsWith('.woff2')?'font/woff2':'application/octet-stream';
  return route.fulfill({status:200,contentType:type,body:Buffer.from(asset,'base64')});
 });
 stage='real CORE login';await page.goto(origin,{waitUntil:'networkidle'});
 await page.getByLabel('Username',{exact:true}).fill('traefik-viewer');
 await page.getByLabel('Password',{exact:true}).fill(privateValue('/run/secrets/viewer_password'));
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('link',{name:'Networking → Reverse Proxy → Traefik',exact:true}).click();
 stage='new dashboard with real inventory';await page.getByRole('heading',{name:'Traefik',exact:true}).waitFor();
 await page.getByText('available',{exact:true}).waitFor();
 const cards=page.getByLabel('Traefik overview');
 console.log('Overview:',await cards.textContent());
 assert.match(await cards.textContent(),/Active routers3Registered services4Middleware1/);
 stage='proxy host identity';
 await page.getByRole('button',{name:'Proxy Hosts',exact:true}).click();
 await page.getByText('fixture-router@file',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Add Proxy Host',exact:true}).isDisabled(),true);
 await page.getByText('Compose discovery is unavailable or not permitted. No Docker access is enabled.',{exact:true}).waitFor();
 stage='service inventory';await page.getByRole('button',{name:'Services',exact:true}).click();await page.getByText('fixture-service@file',{exact:true}).waitFor();
 stage='middleware inventory';await page.getByRole('button',{name:'Middleware',exact:true}).click();await page.getByText('fixture-headers@file',{exact:true}).waitFor();
 stage='diagnostics and sidebar';await page.getByRole('button',{name:'Diagnostics',exact:true}).click();await page.getByRole('heading',{name:'API connectivity: available'}).waitFor();
 assert.equal(await page.getByRole('navigation',{name:'Main'}).getByText(/No permission/).count(),0);
 for(const name of ['Apply','Deploy','Save','Restart'])assert.equal(await page.getByRole('button',{name,exact:true}).count(),0);
 assert.equal(bearer,false);assert.equal(external,false);assert.equal(await page.getByLabel('Password',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Overview',exact:true}).click();
 await page.evaluate(()=>{const note=document.createElement('p');note.textContent='Phase 5 browser-only UI preview · live Phase 4 inventory · no deployment';note.className='banner';document.querySelector('.traefik-page')?.prepend(note)});
 await page.screenshot({path:'/tmp/traefik-phase5-webui.png',fullPage:true});
 stage='responsive layout';await page.setViewportSize({width:390,height:844});
 await page.waitForFunction(()=>document.documentElement.scrollWidth<=window.innerWidth,{},{timeout:3000}).catch(async()=>{console.log('Width diagnostics:',await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+2).map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right})).slice(0,12)})));throw new Error('Mobile overflow')});
 console.log('PASS Phase 5 compiled dashboard, real login/live inventory 3/4/1, tabs, missing-discovery gating, hidden forbidden navigation, no bearer credentials, no apply controls, mobile width; browser-only assets; screenshot /tmp/traefik-phase5-webui.png');
} catch(e) {console.error('FAIL '+stage+' ('+e.name+')');process.exitCode=1}finally{await browser?.close()}
