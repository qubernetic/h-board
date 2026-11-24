# syntax=docker/dockerfile:1
# H-Board's self-hosted server. Build from the repository root:
#   docker build --file packages/host-server/Dockerfile --tag h-board-server .

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/store/package.json packages/store/
COPY packages/ui/package.json packages/ui/
COPY packages/host-extension/package.json packages/host-extension/
COPY packages/host-server/package.json packages/host-server/
# No install scripts: better-sqlite3 ships its native part prebuilt, so nothing is compiled here.
RUN npm ci --ignore-scripts
COPY tsconfig.base.json vite.shared.ts ./
COPY packages/core packages/core
COPY packages/host-server packages/host-server
RUN npm run build --workspace @h-board/host-server

# The packages the built server imports at run time, without the development tools.
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/store/package.json packages/store/
COPY packages/ui/package.json packages/ui/
COPY packages/host-extension/package.json packages/host-extension/
COPY packages/host-server/package.json packages/host-server/
RUN npm ci --ignore-scripts --omit=dev --workspace @h-board/host-server

FROM node:24-slim
ENV NODE_ENV=production \
    PORT=8787 \
    HBOARD_DATA_DIR=/data
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/packages/host-server/package.json packages/host-server/package.json
COPY --from=build /app/packages/host-server/dist packages/host-server/dist
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:8787/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "packages/host-server/dist/main.js"]
