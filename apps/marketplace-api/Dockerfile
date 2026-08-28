FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY apps/marketplace-api/package.json apps/marketplace-api/package-lock.json ./
COPY apps/marketplace-api/prisma ./prisma
RUN npm ci
COPY apps/marketplace-api/tsconfig.json ./
COPY apps/marketplace-api/src ./src
RUN npm run build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache openssl su-exec
COPY apps/marketplace-api/package.json apps/marketplace-api/package-lock.json ./
COPY apps/marketplace-api/prisma ./prisma
RUN npm ci --omit=dev && chown -R node:node /app
COPY --from=build --chown=node:node /app/dist ./dist
RUN mkdir -p /data/artifacts && chown node:node /data/artifacts
EXPOSE 3010
CMD ["sh", "-c", "chown node:node /data/artifacts && exec su-exec node sh -c 'npx prisma migrate deploy && node dist/main.js'"]
