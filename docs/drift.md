# Drift av hemsidan och flytten från appen

Hemsidan körs på Fly.io med en Postgres-databas i region Stockholm (`arn`). Stegen nedan görs en gång från din dator med `fly` inloggad.

## 1. Skapa appen och databasen

```bash
fly launch --no-deploy --copy-config        # använder fly.toml, appnamn family-hub
fly postgres create --name family-hub-db --region arn
fly postgres attach family-hub-db           # sätter DATABASE_URL som secret
```

Om namnet `family-hub` är upptaget: välj ett annat i `fly launch` och uppdatera `app` i `fly.toml`.

## 2. Hemligheter

```bash
fly secrets set FAMILY_PASSWORD='välj-ett-lösenord' \
  SESSION_SECRET="$(openssl rand -hex 32)" \
  AGENT_TOKEN="$(openssl rand -hex 32)"
```

Spara `AGENT_TOKEN` någonstans säkert. Den schemalagda körningen behöver den.

Direktsökning (valfritt). Nyckeln skapas på platform.claude.com. Sätt ett eget utgiftstak där också, som extra skydd:

```bash
fly secrets set ANTHROPIC_API_KEY='sk-ant-…' AGENT_MONTHLY_BUDGET_USD=10 AGENT_MAX_RUN_USD=1
```

`AGENT_MODEL` är `claude-sonnet-5-5` om den inte sätts. Utan nyckel är "Sök nu" avstängd och allt går via kön.

Kollektivresor (valfritt). Gratis nyckel för ResRobot Reseplanerare v2.1 skapas på trafiklab.se (Bronze: 25 000 anrop per 30 dagar). Utan nyckel döljs ingenting, men "Visa kollektivresa" svarar att resan inte kan hämtas:

```bash
fly secrets set TRAFIKLAB_KEY='…'
```

## 3. Driftsätt

```bash
fly deploy
```

`release_command` i `fly.toml` kör databasmigreringarna innan den nya versionen tar emot trafik. `/api/health` svarar 200 när sidan når databasen.

## 4. Flytta data från appen

Be Claude: "Flytta Familjeaktiviteter från appen till hemsidan på <adress> med token <AGENT_TOKEN>". Claude läser artifactens databas och skickar allt till `POST /api/agent/import`:

```json
{ "profile": {…}, "cities": { "stockholm": {…}, "vaxjo": {…} },
  "runs": { "stockholm-2026-11-09": {…} }, "requests": [ {…, "id": "…"} ], "ratings": [ {…} ] }
```

Allt valideras först och skrivs i en transaktion. Ett fel ger 400 med en lista över vad som är fel, och då skrivs ingenting. Importen går att köra om.

## 5. Byt den schemalagda körningen till hemsidan

Uppdatera instruktionerna (`docs/schemalagd-korning.md` och den schemalagda uppgiften) så att körningen använder sidans API istället för artifactens databasverktyg:

| Förut (artifact) | Nu (hemsidan) |
| --- | --- |
| läs `app/profile`, `cities`, `requests`, `ratings`, `runs` | `GET /api/agent/state` |
| skriv `runs/<stad>-<från>` | `PUT /api/agent/runs/<stad>-<från>` |
| sätt request till klar | `PATCH /api/agent/requests/<id>` med `{"status": "klar", "runId": "…"}` |

Varje anrop har rubriken `Authorization: Bearer <AGENT_TOKEN>`. Körningen anropar sidan med `curl` från sin molnsession. Fly-adressen måste därför vara nåbar därifrån, vilket den är som publik https-adress.

## Lokalt

Enklast: `./scripts/lokalt.sh` från repots rot. Skriptet hittar Postgres (Docker eller en Postgres som redan körs), skapar `web/.env` med slumpade hemligheter, installerar, migrerar, startar sidan på http://localhost:3000 och importerar `web/.data/import.json` en gång om filen finns.

Manuellt:

```bash
docker run -d --name fh-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=familyhub -p 5432:5432 postgres:17
cp web/.env.example web/.env       # fyll i SESSION_SECRET och AGENT_TOKEN
npm install
npm run db:generate -w @family-hub/web && npm run db:migrate -w @family-hub/web
npm run web:dev
```

Röktest mot en körande server: `BASE_URL=http://localhost:3000 AGENT_TOKEN=… node web/scripts/smoke.ts`. Det skriver testdata, så kör det inte mot produktion.
