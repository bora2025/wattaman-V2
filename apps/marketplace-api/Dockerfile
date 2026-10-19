FROM node:20-alpine AS build
WORKDIR /workspace/apps/marketplace-api
RUN apk add --no-cache openssl
COPY packages/marketplace-contracts /workspace/packages/marketplace-contracts
COPY apps/marketplace-api/package.json apps/marketplace-api/package-lock.json ./
COPY apps/marketplace-api/prisma ./prisma
RUN npm ci
COPY apps/marketplace-api/tsconfig.json ./
COPY apps/marketplace-api/src ./src
RUN npm run build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /workspace/apps/marketplace-api
RUN apk add --no-cache openssl su-exec
COPY packages/marketplace-contracts /workspace/packages/marketplace-contracts
COPY apps/marketplace-api/package.json apps/marketplace-api/package-lock.json ./
COPY apps/marketplace-api/prisma ./prisma
COPY apps/marketplace-api/scripts/seed-platform-rbac.js ./scripts/seed-platform-rbac.js
COPY apps/marketplace-api/scripts/ensure-plugin-pricing-permission.js ./scripts/ensure-plugin-pricing-permission.js
RUN npm ci --omit=dev && chown -R node:node /workspace
COPY --from=build --chown=node:node /workspace/apps/marketplace-api/dist ./dist
RUN mkdir -p /data/artifacts && chown node:node /data/artifacts
EXPOSE 3010
CMD ["sh", "-c", "mkdir -p /data/artifacts && chown node:node /data/artifacts && exec su-exec node sh -c 'npx prisma migrate deploy && PLATFORM_APP_ROOT=/workspace/apps/marketplace-api node scripts/seed-platform-rbac.js && PLATFORM_APP_ROOT=/workspace/apps/marketplace-api node scripts/ensure-plugin-pricing-permission.js && node dist/main.js'"]
