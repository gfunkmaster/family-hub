#!/usr/bin/env bash
# Kör hemsidan lokalt på Macen: Postgres, .env, beroenden, migreringar, ev. import, och utvecklingsservern.
# Användning: ./scripts/lokalt.sh   (från repots rot). Stoppa med Ctrl-C.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=web/.env
IMPORT_FILE=web/.data/import.json
PORT="${PORT:-3000}"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

# Node 22.18+ (kör .ts-skript och tester utan byggsteg)
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=18)?0:1)' \
  || fail "Node 22.18 eller senare krävs (du har $(node -v)). Med nvm: nvm install 22 && nvm use 22"

# 1. Postgres
if [ -f "$ENV_FILE" ] && grep -q '^DATABASE_URL=.' "$ENV_FILE"; then
  DATABASE_URL="$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2-)"
  say "Använder DATABASE_URL från $ENV_FILE"
elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  say "Startar Postgres i Docker (behållaren fh-pg, port 5432)"
  docker start fh-pg >/dev/null 2>&1 || docker run -d --name fh-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=familyhub -p 5432:5432 postgres:17 >/dev/null
  for _ in $(seq 1 30); do docker exec fh-pg pg_isready -U postgres -q && break; sleep 1; done
  DATABASE_URL="postgresql://postgres:dev@localhost:5432/familyhub"
elif command -v pg_isready >/dev/null 2>&1 && pg_isready -q; then
  say "Använder Postgres som redan körs på Macen"
  createdb familyhub 2>/dev/null || true
  DATABASE_URL="postgresql://$(whoami)@localhost:5432/familyhub"
else
  fail "Hittar ingen Postgres. Starta Docker Desktop, eller: brew install postgresql@17 && brew services start postgresql@17. Kör sedan skriptet igen."
fi

# 2. web/.env (skapas en gång, med slumpade hemligheter)
if [ ! -f "$ENV_FILE" ]; then
  PASSWORD="familj-$(openssl rand -hex 3)"
  cat > "$ENV_FILE" <<ENV
DATABASE_URL=$DATABASE_URL
FAMILY_PASSWORD=$PASSWORD
SESSION_SECRET=$(openssl rand -hex 32)
AGENT_TOKEN=$(openssl rand -hex 32)
ENV
  say "Skapade $ENV_FILE. Lösenordet att logga in med: $PASSWORD"
elif ! grep -q '^DATABASE_URL=' "$ENV_FILE"; then
  echo "DATABASE_URL=$DATABASE_URL" >> "$ENV_FILE"
fi
AGENT_TOKEN="$(grep '^AGENT_TOKEN=' "$ENV_FILE" | cut -d= -f2-)"

# 3. Beroenden och databas
say "Installerar beroenden"
npm install --no-audit --no-fund
say "Genererar Prisma-klienten och kör migreringar"
npm run -s db:generate -w @family-hub/web
npm run -s db:migrate -w @family-hub/web

# 4. Starta servern
say "Startar hemsidan på http://localhost:$PORT"
npm run dev -w @family-hub/web -- -p "$PORT" &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT INT TERM
for _ in $(seq 1 60); do curl -sf "http://localhost:$PORT/api/health" >/dev/null && break; sleep 1; done
curl -sf "http://localhost:$PORT/api/health" >/dev/null || fail "Servern svarar inte på /api/health. Se loggen ovan."

# 5. Importera data från appen, en gång
if [ -f "$IMPORT_FILE" ] && [ ! -f "$IMPORT_FILE.importerad" ]; then
  say "Importerar $IMPORT_FILE"
  if curl -sf -X POST "http://localhost:$PORT/api/agent/import" \
      -H "authorization: Bearer $AGENT_TOKEN" -H "content-type: application/json" \
      --data-binary @"$IMPORT_FILE"; then
    touch "$IMPORT_FILE.importerad"; echo
  else
    echo "Importen misslyckades. Kör om skriptet när felet är rättat."
  fi
fi

say "Klart. Öppna http://localhost:$PORT och logga in med lösenordet i $ENV_FILE (FAMILY_PASSWORD). Ctrl-C stoppar."
wait $SERVER
