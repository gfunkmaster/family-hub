# Hemsidan (web/) med det delade logikpaketet. Byggs från repots rot.
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/logic/package.json packages/logic/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY packages packages
COPY web web
# prisma.config.ts läser DATABASE_URL redan vid generate; ingen databas behövs i bygget.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build NEXT_TELEMETRY_DISABLED=1
RUN npm run db:generate -w @family-hub/web && npm run build -w @family-hub/web

FROM node:22-slim
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build /app /app
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@family-hub/web", "--", "-H", "0.0.0.0", "-p", "3000"]
