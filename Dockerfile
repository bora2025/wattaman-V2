FROM node:20-slim AS builder

RUN apt-get update -qq && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and prisma schema (needed for postinstall prisma generate)
COPY backend/package.json backend/package-lock.json ./
COPY backend/prisma/ prisma/

# Reproducible install from the committed lockfile (postinstall generates Prisma client).
RUN npm ci --legacy-peer-deps

# Copy rest of backend source code
COPY backend/src/ ./src/
COPY backend/scripts/ ./scripts/
COPY backend/nest-cli.json backend/tsconfig.json backend/tsconfig.build.json backend/build.js ./

# Build NestJS
RUN npm run build

# --- Production stage ---
FROM node:20-slim AS runner

ARG POSTGRES_CLIENT_MAJOR=18
RUN apt-get update -qq \
    && apt-get install -y --no-install-recommends ca-certificates curl gnupg openssl \
    && install -d -m 0755 /usr/share/postgresql-common/pgdg \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
       | gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo ${VERSION_CODENAME})-pgdg main" \
       > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update -qq \
    && apt-get install -y --no-install-recommends "postgresql-client-${POSTGRES_CLIENT_MAJOR}" \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --chown=node:node --from=builder /app/package.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node --from=builder /app/scripts ./scripts
COPY --chown=node:node --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=node:node --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --chown=node:node --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --chown=node:node --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

RUN mkdir -p /data/backups /data/plugins /data/plugin-data && chown -R node:node /data

ENV NODE_ENV=production

EXPOSE 3001

USER node

# Apply only checked-in, immutable production migrations. A migration failure
# prevents the application from starting.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma && exec node dist/main"]
