# Ändringslogg

## 0.5.0 – 2026-11-06

- Sök var som helst: där du är (GPS), en adress eller ort, eller en sparad stad, med en radie i minuter. En enskild dag går också att beställa.
- "Sök nu": sidan söker själv via Claude API med webbsökning, med ett månadstak i USD. Förbrukningen sparas per sökning. Utan API-nyckel, eller när taket är nått, hamnar beställningen i kön till torsdagen.
- Beställningar visar Väntar, Söker, Klar eller Fel med orsak. Klar länkar till förslagen.
- Dagsplan (`/plan`) från "Planera dagen": restid från körningen eller GPS, sovtider och för varje måltid ta med (matlådor för barnets ålder med källa hos Livsmedelsverket, och packlista) eller köpa nära aktiviteten (barnstol, mikro, skötrum, pris).
- Dagsplanen får alltid lunch, direkt efter en aktivitet som täcker lunchtiden.
- Datamodell: `place`, `food`, `packed`, `mode`, `error` och tabellen `AgentUsage` (migrering `0002_plats_mat_budget`). CI jämför migreringarna mot schemat med en skuggdatabas.

## 0.4.0 – 2026-11-06

- Hemsidan påbörjad i `web/`: Next.js (App Router), strikt TypeScript, Prisma 7 och Postgres.
  - Förslag dag för dag eller som lista, med restid och kostnad från telefonens GPS, en sparad plats eller sökningens egna värden.
  - Beställ helg, vecka eller månad, med adress eller nuvarande position som utgångspunkt.
  - Betyg sparas och påverkar rangordningen.
  - Agentens API (`/api/agent/state`, `runs/[id]`, `requests/[id]`, `import`) med Bearer-token och validering av allt som skrivs.
  - Inloggning med familjelösenord.
- Logiken flyttad till arbetsytan `packages/logic` och delas av appen och hemsidan.
- Dockerfile och `fly.toml` för Fly.io. CI kör migreringar mot Postgres, bygger sidan, kör ett röktest och bygger Docker-avbilden.

## 0.3.1 – 2026-11-06

Efter första testkörningen av den schemalagda uppgiften (issue #1):

- Vädret kan anges som risk i procent (`precip`) eller mängd i mm (`precipMm`), och appen visar rätt enhet. Körningen skrev mm i `precip`.
- Datumen i en beställning räknas som lediga även om profilen säger annat. En helgbeställning blev kvar som "ny" när helger var avmarkerade.

## 0.3.0 – 2026-11-06

- Repo med bygge (`npm run build` → `dist/index.html`), tester, typecheck, lint och CI.
- Logiken flyttad till `src/logic.ts` i strikt TypeScript.
- Dagraderna i Förslag visar totalkostnad för familjen.

## 0.2.0 – 2026-11-06

- Döpt om från Familjehelg till Familjeaktiviteter.
- Perioder: helg, vecka, månad och egna datum.
- Föräldraledighet: lediga vardagar och slutdatum. Torsdagskörningen kan ta fram nästa vecka.
- Förslag dag för dag och ett schema för hela perioden.
- Platser med koordinater. Restid och resekostnad räknas om från vald plats.

## 0.1.0 – 2026-11-06

- Första versionen: familjeprofil, källregister, förslag med åldersmatchning, kostnad för hela familjen och flaggor för overifierat och motstridiga källor, dagsplan runt sovtider, betyg, beställningar och Google Kalender.
- Schemalagd körning varje torsdag som söker, verifierar och skriver in förslag.
