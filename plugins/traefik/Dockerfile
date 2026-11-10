# Official Docker Library Node index, verified 2026-11-08. See build-environment.md.
FROM docker.io/library/node:24-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8 AS base
WORKDIR /app
# Root-owned application code is readable but not writable by the runtime account.
COPY src ./src
COPY ui ./ui
USER 1000:1000
ENV HC_LISTEN_HOST=0.0.0.0

FROM base AS test
COPY test ./test
COPY compose.yaml Dockerfile ./
RUN node -e 'const fs=require("node:fs"); if(process.getuid()!==1000||process.getgid()!==1000)process.exit(1); for(const p of ["src/model.mjs","ui/index.html"]){fs.accessSync(p,fs.constants.R_OK); try{fs.accessSync(p,fs.constants.W_OK);process.exit(1)}catch(e){if(e.code!=="EACCES")throw e}}' && node test/traefik.test.mjs

FROM base AS runtime
EXPOSE 9080
CMD ["node", "src/server.mjs"]
