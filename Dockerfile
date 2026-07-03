# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS dependencies
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ pkg-config libpq-dev \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

RUN apt-get update \
  && apt-get install -y --no-install-recommends libpq5 \
  && rm -rf /var/lib/apt/lists/*

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/health').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
