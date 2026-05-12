FROM oven/bun:1.2 AS install                                                                
  WORKDIR /app                                                                                
  COPY package.json bun.lock ./                              
  COPY packages/backend/package.json packages/backend/                                        
  COPY packages/shared/package.json packages/shared/                                          
  COPY packages/frontend/package.json packages/frontend/
  RUN bun install --frozen-lockfile                                                           
                                                             
  # ── Stage 2: production runtime ─────────────────────────────────────────────              
  FROM oven/bun:1.2-slim AS production
  WORKDIR /app                                                                                
                                                                                              
  RUN groupadd --system app && useradd --system --gid app --create-home --home-dir /home/app app                                                                                                
  # Bun hoists workspace deps to the root node_modules — that's all we need.                  
  COPY --from=install /app/node_modules ./node_modules
                                                                                              
  # Workspace root package.json (bun reads it to resolve workspace symlinks)                  
  COPY package.json ./                   
                                                                                              
  # Source for runtime deps                                                                   
  COPY packages/shared ./packages/shared 
  COPY packages/backend/src ./packages/backend/src                                            
  COPY packages/backend/drizzle ./packages/backend/drizzle   
  COPY packages/backend/drizzle.config.ts ./packages/backend/                                 
  COPY packages/backend/package.json ./packages/backend/
                                                                                              
  RUN mkdir -p /app/packages/backend/uploads && chown -R app:app /app/packages/backend/uploads
                                                                                              
  USER app                                                   
                                         
  EXPOSE 3000                                                                                 
  ENV NODE_ENV=production
                                                                                               
  # Migrations run on every container start. The runner is idempotent
  # (each SQL file uses IF NOT EXISTS / DO blocks) and serialised across
  # replicas via a Postgres advisory lock inside migrate.ts. If migrations
  # fail the container exits non-zero so the orchestrator does not start
  # serving traffic from a half-migrated DB.
  WORKDIR /app/packages/backend
  CMD ["sh", "-c", "bun run src/db/migrate.ts && bun run src/index.ts"]