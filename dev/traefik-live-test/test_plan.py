#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Homelab Control Extensions contributors
# SPDX-License-Identifier: GPL-3.0-or-later

"""Offline safety checks; no containers, ACLs or secrets are created."""
from pathlib import Path
import unittest
import yaml

ROOT = Path(__file__).resolve().parent


class PlanSafety(unittest.TestCase):
    def test_no_public_ports_privilege_or_docker_provider(self):
        compose = yaml.safe_load((ROOT / 'compose.yaml').read_text())
        self.assertEqual(set(compose['services']), {'traefik', 'plugin', 'core', 'browser'})
        for service in compose['services'].values():
            self.assertEqual(service['user'], '1000:1000')
            self.assertTrue(service['read_only'])
            self.assertFalse(service.get('ports'))
            self.assertFalse(service.get('privileged'))
            self.assertEqual(service['cap_drop'], ['ALL'])
            self.assertNotEqual(service.get('network_mode'), 'host')
            self.assertNotEqual(service.get('ipc'), 'host')
            self.assertGreater(service['pids_limit'], 0)
            self.assertGreater(service['cpus'], 0)
            self.assertTrue(service['mem_limit'])
            self.assertIn('no-new-privileges:true', service['security_opt'])
            for volume in service.get('volumes', []):
                self.assertTrue(volume['read_only'])
                self.assertFalse(volume['bind']['create_host_path'])
                self.assertNotIn('docker.sock', str(volume))
        self.assertEqual(compose['services']['browser']['network_mode'], 'service:core')
        self.assertEqual(compose['services']['browser']['secrets'], ['viewer_password'])
        self.assertTrue(compose['networks']['test']['external'])
        self.assertEqual(compose['networks']['test']['name'], 'hc-traefik-test')

    def test_private_api_and_deterministic_fixture(self):
        static = yaml.safe_load((ROOT / 'traefik.yaml').read_text())
        dynamic = yaml.safe_load((ROOT / 'dynamic.yaml').read_text())['http']
        self.assertEqual(set(static['providers']), {'file'})
        self.assertFalse(static['api']['insecure'])
        self.assertFalse(static['api']['dashboard'])
        self.assertEqual(static['entryPoints']['hc-admin']['address'], ':9081')
        self.assertFalse(static['providers']['file']['watch'])
        self.assertEqual(dynamic['routers']['hc-api']['entryPoints'], ['hc-admin'])
        self.assertEqual(dynamic['routers']['hc-api']['service'], 'api@internal')
        self.assertEqual(dynamic['routers']['fixture-router']['service'], 'fixture-service')
        self.assertEqual(dynamic['routers']['fixture-router']['middlewares'], ['fixture-headers'])
        self.assertEqual(dynamic['services']['fixture-service']['loadBalancer']['servers'][0]['url'], 'http://127.0.0.1:9081')

    def test_pins_scope_and_no_host_secret_bootstrap(self):
        compose = yaml.safe_load((ROOT / 'compose.yaml').read_text())
        self.assertRegex(compose['services']['traefik']['image'], r'@sha256:[a-f0-9]{64}$')
        for name in ('core.Dockerfile', 'browser.Dockerfile'):
            self.assertRegex((ROOT / name).read_text(), r'FROM .*@sha256:[a-f0-9]{64}')
        self.assertNotIn('provision-secrets.py', (ROOT / 'core.Dockerfile').read_text())
        self.assertNotIn('provision-secrets.py', (ROOT / 'browser.Dockerfile').read_text())
        bootstrap = (ROOT / 'provision-secrets.py').read_text()
        self.assertIn('os.O_EXCL', bootstrap)
        self.assertIn('u:{MAPPED_UID}:r--,m::r--', bootstrap)
        self.assertIn('networking.proxy.read', bootstrap)
        self.assertIn('chmod 600 /state/users.json', (ROOT / 'core-entrypoint.sh').read_text())
        self.assertIn('COPY --chmod=0444', (ROOT / 'core.Dockerfile').read_text())
        self.assertNotIn('helper_token', str(compose['services']['browser']['secrets']))

    def test_host_header_and_accessible_protocol_regressions(self):
        validation = (ROOT / 'validate.mjs').read_text()
        self.assertIn("http.get('http://traefik-test:8080/ping'", validation)
        self.assertIn("Host: 'fixture.localhost'", validation)
        self.assertNotIn("request('http://traefik-test:8080/ping'", validation)
        browser = (ROOT / 'browser.mjs').read_text()
        self.assertIn('select[name="protocol"]', browser)
        self.assertNotIn("getByLabel('Incoming protocol'", browser)
        phase5 = (ROOT / 'phase5-browser.mjs').read_text()
        self.assertNotIn('e.message', phase5)
        self.assertNotIn('console.error(e)', phase5)

    def test_loopback_core_and_no_default_extra_features(self):
        import json
        compose = yaml.safe_load((ROOT / 'compose.yaml').read_text())
        command = compose['services']['core']['command']
        self.assertEqual(command[command.index('-listen') + 1], '127.0.0.1:9180')
        self.assertIn('-broker-socket=', command)
        self.assertEqual(json.loads((ROOT / 'modules.json').read_text())['disabled'], ['services', 'packages'])
        self.assertEqual(json.loads((ROOT / 'files.json').read_text())['roots'], [])


if __name__ == '__main__':
    unittest.main(verbosity=2)
