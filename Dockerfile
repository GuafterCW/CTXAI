# ---- build stage ----------------------------------------------------------
FROM node:22-alpine AS builder
RUN corepack enable && apk add --no-cache python3 make g++
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/mcp-stdio/package.json packages/mcp-stdio/
COPY packages/cli/package.json packages/cli/
RUN pnpm install --frozen-lockfile

COPY . .
# Build-time-only dummies: `next build` imports route modules, which makes
# Better Auth complain without a secret. The runtime stage doesn't inherit
# these — real values come from the container environment.
RUN BETTER_AUTH_SECRET=build-only-dummy-not-a-secret \
    BETTER_AUTH_URL=http://localhost:3000 \
    pnpm --filter @ctxai/web build

# ---- runtime stage --------------------------------------------------------
FROM node:22-alpine AS runner
RUN apk add --no-cache ffmpeg && mkdir -p /data && chown node:node /data

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe \
    DATABASE_PATH=/data/ctxai.db \
    ASSETS_DIR=/data/assets

WORKDIR /app
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/drizzle ./apps/web/drizzle

USER node
WORKDIR /app/apps/web
VOLUME /data
EXPOSE 3000

CMD ["node", "server.js"]
