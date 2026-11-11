# Isolated extra Compose stack (notes)

Separate Docker Compose application used to prove HomeControl Traefik reverse-proxy
configuration against a user-managed stack, not the Traefik fixture itself.

- Project `hc-notes`, service `notes`, listen 8080
- Joins existing internal network `hc-traefik-test`
- No published host ports
- CORE Add Proxy Host / compose-preview emits file YAML; file-apply writes it
  into the Traefik dynamic directory when `-traefik-dynamic-dir` is set

Start (host path for dockerd):

```
docker compose --project-directory /home/ian/Projects/Homelab-Control-Extensions/dev/traefik-extra-stack \
  -f compose.yaml up -d
```
