FROM node:20-slim AS builder

WORKDIR /app

COPY apps/platform-admin/package.json apps/platform-admin/package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY apps/platform-admin/ ./

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3020
ENV PORT=3020
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
