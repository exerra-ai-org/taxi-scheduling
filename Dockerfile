# ── Backend Dockerfile (Bun + Hono on ECS) ─────────────────────────────────────
# Multi-stage build for minimal production image

# ── Stage 1: Install dependencies ──────────────────────────────────────────────
FROM oven/bun:1.2 AS deps

WORKDIR /app

# Copy workspace root files
COPY package.json bun.lock ./

# Copy all workspace package.json files for dependency resolution
COPY packages/backend/package.json packages/backend/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/frontend/package.json packages/frontend/package.json

# Install production dependencies only
RUN bun install --frozen-lockfile --production

# ── Stage 2: Production image ──────────────────────────────────────────────────
FROM oven/bun:1.2-slim AS production

WORKDIR /app

# Create non-root user for security
RUN groupadd --system app && useradd --system --gid app app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/backend/node_modules ./packages/backend/node_modules 2>/dev/null || true
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules 2>/dev/null || true

# Copy workspace root
COPY package.json ./

# Copy shared package (runtime dependency of backend)
COPY packages/shared ./packages/shared

# Copy backend source and drizzle migrations
COPY packages/backend/src ./packages/backend/src
COPY packages/backend/package.json ./packages/backend/package.json
COPY packages/backend/drizzle ./packages/backend/drizzle
COPY packages/backend/drizzle.config.ts ./packages/backend/drizzle.config.ts

# Create uploads directory with correct permissions
RUN mkdir -p /app/packages/backend/uploads && chown -R app:app /app/packages/backend/uploads

# Switch to non-root user
USER app

# Expose backend port
EXPOSE 3000

# Health check against the /api/health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

# Run the backend
CMD ["bun", "run", "packages/backend/src/index.ts"]
