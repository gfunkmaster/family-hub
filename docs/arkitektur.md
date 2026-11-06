# Arkitektur och begränsningar

## Två delar

1. **Appen** är en Claude-artifact: en enda HTML-sida som körs i en sandlåda på claude.ai. Den har fyra förmågor (capabilities):
   - `db`: en dokumentdatabas per artifact. Ägaren skriver, den som appen delas med kan läsa.
   - `user`: vem som tittar.
   - `sample`: frågar Claude, utan minne och utan webbsökning. Används för "Förbättra med Claude" i dagsplanen och för att uppskatta koordinater för en adress.
   - `mcp`: Google Kalender, verktyget `list_events`, för att visa lediga dagar.
2. **Agenten** är en schemalagd Claude-körning (torsdagar 18.48, Europe/Stockholm). Den har webbsökning, kan hämta sidor och läsa kalendern, och läser och skriver appens databas via Claudes artifact-verktyg. Instruktionerna finns i [schemalagd-korning.md](schemalagd-korning.md).

## Begränsningar som styr designen

| Begränsning | Följd |
| --- | --- |
| Sidan får inte göra `fetch` mot andra sajter | All insamling (evenemang, priser, väder, koordinater) sker i den schemalagda körningen |
| Sidan får inte läsa telefonens position | Platser sparas med koordinater (klistras in från en kartapp eller uppskattas av Claude). Exakt position kan bara komma via chatten |
| Claude i sidan (`sample`) saknar webbsökning | Används bara för planering och grov geokodning, aldrig för fakta om evenemang |
| Bilder utifrån laddas inte | Inga bilder på förslagen |
| Allt måste ligga i en fil | `scripts/build.mjs` lägger ihop stil, logik och UI |

## Restid

Den schemalagda körningen räknar restid från familjens utgångspunkt (beställningens plats, stadens standardplats eller centrum) och sparar `lat`/`lng` för varje förslag. När familjen väljer en annan plats i appen räknas restiden om lokalt med en grov modell (fågelvägen × 1,3, gång 4,5 km/h, bil 35/65 km/h, kollektivt 20 km/h + 10 min). Riktiga reseplanerare (Trafiklab, vägrutter) kräver anrop från en server och finns i [ROADMAP.md](../ROADMAP.md).

## Rangordning

`scoreItem` i `packages/logic`: åldersmatchning (konservativ, sämsta barnet styr), intressen och sådant att undvika, betyg på samma förslag, inlärda taggvikter från alla betyg, budget för hela familjen inklusive resa, restidsgräns per stad och ett litet avdrag när källor säger olika.

## Schema för vecka och månad

`schedulePeriod` väljer en huvudaktivitet per ledig dag (helger, plus vardagar vid föräldraledighet fram till `leaveUntil`), högst poäng först, aldrig samma förslag två dagar i rad eller med bara en dag emellan, och aldrig något som inte passar åldern.

## Hemsidan

`web/` är en Next.js-sida (App Router) i strikt TypeScript som ska ersätta artifacten. Den har inte artifactens begränsningar:

- **Position:** sidan ber om telefonens GPS när du väljer "Där jag är nu", och restid och kostnad räknas om direkt.
- **Data:** Postgres via Prisma 7. Tabellerna speglar artifactens databas, så flytten är en import.
- **Agenten:** den schemalagda körningen fortsätter att vara agenten och kör på Claude-prenumerationen. Den läser och skriver via `/api/agent/*` med en Bearer-token, istället för artifactens databasverktyg. Allt den skickar valideras innan det sparas.
- **Inloggning:** ett familjelösenord ger en signerad kaka (HMAC) som gäller i 90 dagar. Bara sidorna kräver den. Agentens API har sin egen token.
- **Drift:** Fly.io med Postgres, region Stockholm (`arn`). Se [drift.md](drift.md).

Logiken ligger i `packages/logic` och används av både artifacten och hemsidan, så rangordning, kostnad och restid räknas likadant.
