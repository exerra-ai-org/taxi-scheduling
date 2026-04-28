# Deployment Guide

This project is split into two independently deployed services:

- **Backend** — Bun + Hono API server, deployed as a Docker container on AWS ECS
- **Frontend** — React SPA, deployed as a static site on Cloudflare Pages

---

## Prerequisites

- [Bun](https://bun.sh) v1.2+
- [Docker](https://docs.docker.com/get-docker/) (for backend builds)
- A PostgreSQL 16+ database (PostGIS extension recommended)
- AWS account with ECR + ECS configured
- Cloudflare account with Pages enabled

---

## Backend (AWS ECS)

### Environment Variables

Create a `.env` file (or configure via ECS task definition environment) with all required variables. See `packages/backend/.env.example` for the full list:

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/taxi` |
| `PORT` | Server port (default 3000) | `3000` |
| `CORS_ORIGIN` | Allowed origins, comma-separated | `https://yourdomain.com` |
| `JWT_SECRET` | Secret for signing auth tokens | (generate a random 64-char string) |
| `APP_NAME` | Display name in emails/notifications | `London Luton Taxi` |
| `APP_BASE_URL` | Frontend URL for links in emails | `https://yourdomain.com` |
| `RESEND_API_KEY` | Resend API key for transactional email | `re_...` |
| `VAPID_PUBLIC_KEY` | VAPID public key for push notifications | (generate with `web-push generate-vapid-keys`) |
| `VAPID_PRIVATE_KEY` | VAPID private key for push notifications | (generate with `web-push generate-vapid-keys`) |
| `VAPID_SUBJECT` | VAPID subject (mailto: or URL) | `mailto:ops@yourdomain.com` |
| `BACKGROUND_JOBS_ENABLED` | Enable background job scheduler | `true` |
| `BACKGROUND_JOBS_TICK_SECONDS` | Job loop interval | `60` |
| `DRIVER_HEARTBEAT_STALE_MINUTES` | Minutes before driver heartbeat is stale | `5` |
| `DRIVER_HEARTBEAT_FALLBACK_WINDOWS` | Consecutive stale windows before fallback | `2` |
| `RIDE_REMINDER_MINUTES` | Comma-separated reminder intervals | `120,60,15` |

### Build the Docker Image

```bash
# From the repo root
docker build -t taxi-backend .
```

The Dockerfile uses a multi-stage build:
1. **deps** stage — installs production dependencies from the lockfile
2. **production** stage — `oven/bun:1.2-slim` base, non-root user, only backend + shared source copied

### Push to ECR

```bash
# Authenticate with ECR
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <account-id>.dkr.ecr.<region>.amazonaws.com

# Tag and push
docker tag taxi-backend:latest <account-id>.dkr.ecr.<region>.amazonaws.com/taxi-backend:latest
docker push <account-id>.dkr.ecr.<region>.amazonaws.com/taxi-backend:latest
```

### ECS Task Definition

Key settings for the task definition:

- **Image**: `<account-id>.dkr.ecr.<region>.amazonaws.com/taxi-backend:latest`
- **Port mapping**: Container port `3000`
- **Health check**: The container has a built-in `HEALTHCHECK` on `/api/health`, but you can also configure the ALB target group health check to `GET /api/health`
- **Environment**: Pass all env vars above via the task definition or Secrets Manager
- **Storage**: If using file uploads, mount an EFS volume at `/app/packages/backend/uploads` for persistent storage across task replacements. Alternatively, migrate uploads to S3.
- **CPU/Memory**: 512 CPU / 1024 MB is a good starting point

### Database Migrations

Run migrations before deploying a new version:

```bash
# Locally, pointing at the production database
DATABASE_URL="postgresql://..." bunx drizzle-kit push --config packages/backend/drizzle.config.ts
```

Or run as a one-off ECS task:

```bash
aws ecs run-task \
  --cluster <cluster> \
  --task-definition taxi-backend-migrate \
  --overrides '{"containerOverrides":[{"name":"backend","command":["bunx","drizzle-kit","push","--config","packages/backend/drizzle.config.ts"]}]}'
```

### Seed Data (First Deploy Only)

```bash
DATABASE_URL="postgresql://..." bun run packages/backend/src/db/seed.ts
```

---

## Frontend (Cloudflare Pages)

### Build Command

```bash
bun run build:frontend
```

Output directory: `packages/frontend/dist/`

The build includes:
- `_redirects` — SPA catch-all so all routes serve `index.html`
- `_headers` — Cache-Control (immutable for hashed assets, no-cache for sw.js) and security headers

### Cloudflare Pages Configuration

#### Option A: Connect Git Repository

1. Go to Cloudflare Dashboard > Pages > Create a project
2. Connect your GitHub/GitLab repository
3. Configure build settings:
   - **Build command**: `bun run build:frontend`
   - **Build output directory**: `packages/frontend/dist`
   - **Root directory**: `/` (repo root, since the build script runs from workspace root)
   - **Framework preset**: None
4. Add environment variable:
   - `NODE_VERSION` = `20` (Cloudflare needs this for the build environment)
5. Deploy

#### Option B: Direct Upload (Wrangler CLI)

```bash
# Build locally
bun run build:frontend

# Deploy via wrangler
npx wrangler pages deploy packages/frontend/dist --project-name=taxi-frontend
```

### Environment & API Proxy

The frontend calls `/api/*` which needs to reach the backend. Since Cloudflare Pages serves static files, configure this at the DNS/infrastructure level:

**Recommended: Cloudflare DNS + Origin Rules**

1. Point `yourdomain.com` at Cloudflare Pages (CNAME to `taxi-frontend.pages.dev`)
2. Point `api.yourdomain.com` at your ECS ALB
3. Set `CORS_ORIGIN=https://yourdomain.com` on the backend
4. Update frontend API client base URL to `https://api.yourdomain.com`

**Alternative: Cloudflare Workers proxy**

Create a `_worker.js` in the frontend's `public/` directory to proxy `/api/*` to the backend:

```js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) {
      const backend = new URL(request.url);
      backend.hostname = env.BACKEND_HOST; // Set in Pages environment variables
      backend.port = "";
      return fetch(backend.toString(), request);
    }
    return env.ASSETS.fetch(request);
  },
};
```

Then set `BACKEND_HOST` in Cloudflare Pages environment variables.

### Custom Domain

1. Go to Pages project > Custom domains
2. Add your domain
3. Cloudflare automatically provisions SSL

---

## CI/CD Pipeline (GitHub Actions Example)

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ vars.AWS_REGION }}

      - name: Login to ECR
        id: ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push
        run: |
          docker build -t ${{ steps.ecr.outputs.registry }}/taxi-backend:${{ github.sha }} .
          docker push ${{ steps.ecr.outputs.registry }}/taxi-backend:${{ github.sha }}

      - name: Update ECS service
        run: |
          aws ecs update-service \
            --cluster ${{ vars.ECS_CLUSTER }} \
            --service taxi-backend \
            --force-new-deployment

  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - run: bun install --frozen-lockfile
      - run: bun run build:frontend

      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: pages deploy packages/frontend/dist --project-name=taxi-frontend
```

---

## Quick Reference

| Action | Command |
|---|---|
| Dev (all) | `bun run dev` |
| Dev (backend only) | `bun run dev:backend` |
| Dev (frontend only) | `bun run dev:frontend` |
| Build frontend | `bun run build:frontend` |
| Build backend Docker image | `docker build -t taxi-backend .` |
| Run DB migrations | `bun run db:migrate` |
| Seed database | `bun run db:seed` |
| Generate VAPID keys | `npx web-push generate-vapid-keys` |
