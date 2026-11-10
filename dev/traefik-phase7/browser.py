# SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
# SPDX-License-Identifier: GPL-3.0-or-later
from pathlib import Path
import base64,json,subprocess,sys
root=Path('/home/ian/Projects');artifacts=Path('/tmp/hc-traefik-phase7-artifacts');reports=root/'codex-reports';target=reports/'traefik-phase7-webui.png'
if target.exists():raise SystemExit('Screenshot exists; refusing overwrite')
assets={str(p.relative_to(artifacts/'frontend/app/dist')):base64.b64encode(p.read_bytes()).decode() for p in (artifacts/'frontend/app/dist').rglob('*') if p.is_file()}
fixture=json.loads((artifacts/'build/phase7-ui-fixtures.json').read_text());assert fixture['catalog']['fixture'] is True
script='const phase7Assets='+json.dumps(assets)+';\nconst phase7Fixture='+json.dumps(fixture)+';\n'+Path(__file__).with_name('browser.mjs').read_text()
r=subprocess.run(['docker','--context','rootless','exec','-i','hc-traefik-browser-test','node','--input-type=module'],input=script.encode(),stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
(reports/'traefik-phase7-browser.md').write_text('# Phase 7 browser-only controlled fixture validation\n\nNew assets and controlled catalog/preview responses fulfilled in browser memory. Data exported through fake Docker Unix socket → broker → client → validated Go model inside isolated build. Actual Phase 6 authentication and Traefik inventory pass through; no containers/images/mounts/security settings change. This is NOT live Docker discovery or deployed Phase 7.\n\n```text\n'+r.stdout.decode()+'\n```\n\nExit: '+str(r.returncode)+'\n')
print(r.stdout.decode());print('Exit:',r.returncode)
if r.returncode==0:
 shot=subprocess.check_output(['docker','--context','rootless','exec','hc-traefik-browser-test','node','-e',"process.stdout.write(require('node:fs').readFileSync('/tmp/traefik-phase7-webui.png'))"])
 assert shot.startswith(b'\x89PNG\r\n\x1a\n')
 with target.open('xb') as f:f.write(shot)
 print('Screenshot:',target)
sys.exit(r.returncode)
