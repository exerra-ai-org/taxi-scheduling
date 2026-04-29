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
                                                                                              
  RUN groupadd --system app && useradd --system --gid app app
                                                                                              
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
                                                                                              
  HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD bun -e "fetch('http://localhost:3000/api/health').then(r=>r.ok||process.exit(1)).catch
  (()=>process.exit(1))"                                                                      
   
  # Migrations run on every container start (idempotent).                                     
  WORKDIR /app/packages/backend                              
  CMD ["sh", "-c", "bunx drizzle-kit migrate && bun run src/index.ts"]