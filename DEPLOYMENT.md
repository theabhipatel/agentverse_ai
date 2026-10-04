# Deployment

Two CI pipelines build one image each and push to GHCR. One CD pipeline pulls those
images onto the server and restarts the containers. CI and CD are separate files.

## Pipelines

| File | Runs when | Does |
|---|---|---|
| `.github/workflows/ci-backend.yml` | push or PR touching `backend/**` | typecheck, build, then image on master |
| `.github/workflows/ci-frontend.yml` | push or PR touching `frontend/**` | typecheck and build, then image on master |
| `.github/workflows/cd.yml` | either CI finishes green on master, or manual | pull images, restart, wait for health |

Path filters mean a frontend-only push builds only the frontend image, and the same
for the backend. A push touching both builds both.

Pull requests are verified but never publish an image.

Images are tagged twice: `latest`, which CD deploys, and `sha-<short>` for rollback.

```
ghcr.io/<owner>/agentverse-backend:latest
ghcr.io/<owner>/agentverse-frontend:latest
```

## GitHub secrets

Settings, Secrets and variables, Actions:

Only the key is a secret. The rest are variables so they stay readable later.

**Secrets** tab:

| Secret | Value |
|---|---|
| `SSH_KEY` | the deploy user's **private** key, whole file including the header lines |
| `PROD_ENV` | the entire production env file, pasted as is |

**Variables** tab:

| Variable | Value |
|---|---|
| `SSH_HOST` | server IP or hostname |
| `SSH_USER` | the user CD logs in as, must be in the `docker` group |
| `DEPLOY_PATH` | directory holding `.env`, for example `/opt/agentverse` |
| `SSH_PORT` | only if SSH is not on 22 |
| `VITE_API_URL` | optional, overrides the API URL baked into the frontend |

No registry secret is needed at either end. Images are pushed with the run's built in
`GITHUB_TOKEN`, and the server pulls with that same token, handed over the SSH session
and expired the moment the job finishes. Nothing long lived is stored on the server.

## Configuration

There is nothing to place on the server by hand. Fill in `.env.production.example`
locally, paste the whole thing into the `PROD_ENV` secret, and CD writes it next to the
compose file on every deploy.

Generate the two token secrets and `ENCRYPTION_KEY` with `openssl rand -hex 32` each,
and make sure the two token secrets differ. Set `BACKEND_IMAGE` and `FRONTEND_IMAGE` to your lowercase GHCR owner.

To change any value later, edit the `PROD_ENV` secret and re-run CD. Never edit
`/opt/agentverse/.env` directly, the next deploy overwrites it.

The published ports default to 8090 for the frontend and 8091 for the backend, because
other applications already use this server. Change them in `.env` if those are taken.
Postgres is deliberately not published at all, it is only reachable from the backend
over the compose network.

With `.env` in place and the secrets added, run CD from the Actions tab with **Run
workflow**. It creates everything else and brings the stack up.

Then create the two starting accounts, once:

```bash
cd /opt/agentverse
docker compose -f docker-compose.prod.yml exec backend node dist/db/seed.js
```

Seeding stays manual on purpose. It is idempotent, but running it on every deploy would
resurrect accounts you deleted from the admin screen.

`docker compose up --wait` needs Compose v2.17 or newer. Check with
`docker compose version`.

## What a deploy does

Migrations run from the container entrypoint before the server starts listening, so the
application is never live against an older schema. `docker compose up -d` only recreates
containers whose image digest actually changed, so a frontend deploy does not bounce the
backend or the database. `--wait` blocks on the healthchecks, so a container that starts
and immediately falls over fails the pipeline instead of passing quietly.

## Day to day

```bash
cd /opt/agentverse

# logs
docker compose -f docker-compose.prod.yml logs -f backend

# state
docker compose -f docker-compose.prod.yml ps

# redeploy by hand
docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d --wait

# database backup, take one before any deploy carrying a migration
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U agentverse agentverse > backup-$(date +%F).sql
```

Rollback: point `BACKEND_IMAGE` or `FRONTEND_IMAGE` in `.env` at a `sha-<short>` tag
instead of `latest`, then `up -d`. Note that a rollback does not undo a migration.

## API keys and models

The provider keys and model ids in the env file are only the first run seed. On the
first boot they are copied into the database, encrypted with `ENCRYPTION_KEY`, and from
then on **Admin > AI models** owns them: editing them in `PROD_ENV` changes nothing.
Leave a key empty and that provider simply starts unconfigured, which every user is told
about on the chat page until an admin adds it.

`ENCRYPTION_KEY` must never change once keys are stored. If it does, every stored key
becomes unreadable and an admin has to paste each one in again.

Adding or replacing a key is done in the admin page, not on the server. Each save is
tested against the provider first, so a key that does not work is never stored.

## Intelligence Hub

- **Uploads need a bigger body limit in nginx.** Add `client_max_body_size 25m;` to the
  API server block and reload nginx, otherwise any file over 1 MB
  fails with 413 before it reaches the backend.
- **Postgres moved to the pgvector image.** The first deploy carrying it recreates the
  postgres container on the same volume, and migration 0007 rebuilds the text indexes,
  because the new image is Debian where the old one was Alpine. Take the database backup
  above before that deploy.
- **MinIO holds the uploaded files** in the `agentverse_minio` volume. It is not published;
  only the backend reaches it. Back it up next to the database:

```bash
docker run --rm -v agentverse_minio:/data -v "$PWD":/backup alpine \
  tar czf /backup/minio-$(date +%F).tgz -C /data .
```

## Domains

Nothing here binds port 80 or 443, so this stack sits behind whatever proxy the server
already runs. Point both names at it:

| Domain | Proxy to | Serves |
|---|---|---|
| `agentverse.example.com` | frontend port, 8090 by default | the app |
| `api.agentverse.example.com` | backend port, 8091 by default | the API |

Both share the same registrable domain, so the browser treats them as
same site. The `SameSite=Lax` refresh cookie is sent between them and axios already
sends credentials, so no cookie or CORS surprise waits here.

### The API URL is compiled into the frontend

Vite inlines `VITE_API_URL` at build time, so the frontend image is tied to one API
host. CI passes `https://api.agentverse.example.com/api` unless you override it with a
repository variable named `VITE_API_URL`, under Settings, Secrets and variables,
Actions. Changing it means re-running the frontend CI, not just restarting a container.

**Before the domains resolve**, that baked in URL points nowhere, so the deployed app
cannot reach its API yet. To test on the raw IP first, set the `VITE_API_URL` repository
variable to `http://<server-ip>:8091/api`, re-run CI, and set `CLIENT_URL` in the server
`.env` to `http://<server-ip>:8090` so CORS matches. Put both back to the real domains
once DNS is live.

### On the day HTTPS goes live

Two values in the server `.env`:

- `COOKIE_SECURE=true`, otherwise the browser drops the refresh cookie over HTTPS.
- `CLIENT_URL=https://agentverse.example.com`, which is the CORS origin the backend
  allows. It must match the address in the browser bar exactly.

The backend already sets `trust proxy`, so it reads the real client IP from the
forwarded headers.
