# SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
# SPDX-License-Identifier: GPL-3.0-or-later
from pathlib import Path
import json,base64,subprocess,sys
root=Path('/tmp/hc-traefik-phase5-artifacts/frontend/app/dist')
assets={str(p.relative_to(root)):base64.b64encode(p.read_bytes()).decode() for p in root.rglob('*') if p.is_file()}
script='const phase5Assets='+json.dumps(assets)+';\n'+Path(__file__).with_name('phase5-browser.mjs').read_text()
r=subprocess.run(['docker','--context','rootless','exec','-i','hc-traefik-browser-test','node','--input-type=module'],input=script.encode(),stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
log=Path('/home/ian/Projects/codex-reports/traefik-phase5-browser.md');log.write_text('# Phase 5 browser-only UI validation\n\nCompiled assets fulfilled in browser memory. Real CORE login and inventory APIs pass through unchanged. No API mocks, account changes, deployment or container/configuration updates. Discovery is correctly unavailable on the existing CORE.\n\n```text\n'+r.stdout.decode()+'\n```\n\nExit: '+str(r.returncode)+'\n');print(r.stdout.decode());print('Exit:',r.returncode)
if r.returncode==0:
 out=Path('/home/ian/Projects/codex-reports/traefik-phase5-webui.png')
 if out.exists():
  print('Existing screenshot preserved:',out)
  sys.exit(0)
 shot=subprocess.run(['docker','--context','rootless','exec','hc-traefik-browser-test','node','-e',"process.stdout.write(require('node:fs').readFileSync('/tmp/traefik-phase5-webui.png'))"],stdout=subprocess.PIPE,check=True)
 with out.open('xb') as f:f.write(shot.stdout)
 print('Screenshot:',out)
sys.exit(r.returncode)
