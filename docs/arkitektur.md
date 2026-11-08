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

## Kläder efter väder

`clothingFor` i `packages/logic` ger klädtips per dag av prognosen i körningen (`weather`): temperaturtrappa (varmt, milt, svalt, kallt, mycket kallt), regn (risk i procent eller mm), stor skillnad mellan morgon och eftermiddag och ett extra råd när yngsta barnet är under 12 månader. Utan temperatur ger funktionen `null` och sidan visar inget. Råden är tumregler och visas som det.

## Restid

Den schemalagda körningen räknar restid från familjens utgångspunkt (beställningens plats, stadens standardplats eller centrum) och sparar `lat`/`lng` för varje förslag. När familjen väljer en annan plats i appen räknas restiden om lokalt med en grov modell (fågelvägen × 1,3, gång 4,5 km/h, bil 35/65 km/h, kollektivt 20 km/h + 10 min). Kollektivt är alltså en grov siffra tills man trycker "Visa kollektivresa" på ett förslag: då frågar sidan Trafiklab ResRobot Reseplanerare v2.1 via `/api/travel` (server, inloggning krävs, 10 minuters cache) och visar linje, byten, gångtid och avgångstider för den dag och tid förslaget gäller. ResRobot saknar uppgift om barnvagn, så det står det i kortet. Bil är fortfarande uppskattad. Vägrutter finns i [ROADMAP.md](../ROADMAP.md).

## Rangordning

`scoreItem` i `packages/logic`: åldersmatchning (konservativ, sämsta barnet styr), intressen och sådant att undvika, betyg på samma förslag, inlärda taggvikter från alla betyg, budget för hela familjen inklusive resa, restidsgräns per stad och ett litet avdrag när källor säger olika.

## Schema för vecka och månad

`schedulePeriod` väljer en huvudaktivitet per ledig dag (helger, plus vardagar vid föräldraledighet fram till `leaveUntil`), högst poäng först, aldrig samma förslag två dagar i rad eller med bara en dag emellan, och aldrig något som inte passar åldern.

## Hemsidan

`web/` är en Next.js-sida (App Router) i strikt TypeScript som ska ersätta artifacten. Den har inte artifactens begränsningar:

- **Position:** sidan ber om telefonens GPS när du väljer "Där jag är nu", och restid och kostnad räknas om direkt. Adressen slås upp via `/api/reverse` (OpenStreetMaps Nominatim, från servern, inloggning krävs, en timmes cache) och visas under knappen. Koordinaterna skickas alltså till OpenStreetMap, och bara när du trycker.
- **Data:** Postgres via Prisma 7. Tabellerna speglar artifactens databas, så flytten är en import.
- **Agenten:** den schemalagda körningen fortsätter att vara agenten och kör på Claude-prenumerationen. Den läser och skriver via `/api/agent/*` med en Bearer-token, istället för artifactens databasverktyg. Allt den skickar valideras innan det sparas.
- **Inloggning:** ett familjelösenord ger en signerad kaka (HMAC) som gäller i 90 dagar. Bara sidorna kräver den. Agentens API har sin egen token.
- **Drift:** Fly.io med Postgres, region Stockholm (`arn`). Se [drift.md](drift.md).

### Direktsökning

"Sök nu" under Beställ låter sidan söka själv via Claude API (Messages API med verktygen `web_search` och `web_fetch`), utan att vänta på torsdagen. Beställningen sparas först, och sökningen körs efter svaret med `after()` från Next. Sidan laddar om var 10:e sekund tills den är klar.

- **Var:** där du är (GPS), en adress eller ort, eller en sparad stad, med en radie i minuter som räknas om till km (`radiusKmForMinutes`).
- **Källor:** följer utgångspunkten. Stadens källregister (`cities.sources`) skickas med som startlista för det som ligger inom sökområdet, och agenten får alltid i uppgift att hitta lokala källor runt platsen själv (kommun, bibliotek, familjecentraler, babycafé, simhallar, museer) och redovisa i `summary` vilka som hämtades eller nekades. Utan det missas allt som inte står i registret, särskilt vid sökning runt GPS-position utan stad.
- **Mat:** svaret innehåller matställen nära förslagen och matlådor för barnens ålder. Matlådorna måste ha en källa på livsmedelsverket.se, annars avvisas svaret.
- **Kontroll:** svaret går genom samma `parseRun` som torsdagskörningen. Perioden, staden och platsen tas från beställningen, inte från modellen.
- **Budget:** varje sökning sparar sin förbrukning i `AgentUsage`. En ny sökning gör först anspråk på beställningen (atomärt, så att den inte körs två gånger) och startar sedan bara om månadens kostnad, plus `AGENT_MAX_RUN_USD` för varje redan pågående sökning, plus `AGENT_MAX_RUN_USD` för den nya, ryms i `AGENT_MONTHLY_BUDGET_USD`. Annars hamnar beställningen i kön. En sökning som stått på "pågår" i mer än 20 minuter (servern stoppades eller startades om) sätts till "fel" när Beställ-sidan eller nästa sökning läser den, och reserverar då ingen budget.
- **Inloggning:** 5 felaktiga lösenord per IP-adress (`fly-client-ip`) och 15 minuter, i minnet (`ratelimit.ts`). Startas maskinen om nollställs räknaren.
- **Leverantör:** `web/src/lib/agent/types.ts` beskriver en leverantör (`LlmProvider`). Claude är den enda nu; en annan (t.ex. DeepSeek) blir en ny fil med samma gränssnitt, men behöver egen webbsökning.

Torsdagskörningen tar bara beställningar i kön (`mode: "kö"`).

### Dagsplan med mat

`/plan?run=…&date=…&item=…` lägger valda förslag runt sovtiderna (`autoPlan`) med restid från körningens utgångspunkt eller GPS. Varje måltid har två val: ta med (matlådor för det yngsta barnet och en packlista) eller köpa (de närmaste matställena till aktiviteten, med barnstol, mikro, skötrum och pris).

Logiken ligger i `packages/logic` och används av både artifacten och hemsidan, så rangordning, kostnad och restid räknas likadant.
