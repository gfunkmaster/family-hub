# Ändringslogg

## Ej släppt

- Klädtips efter vädret: varje dag med prognos får en ruta "Kläder" med råd efter temperatur, regn, skillnaden mellan morgon och eftermiddag och yngsta barnets ålder (`clothingFor` i `packages/logic`). Saknas temperatur visas inget. Tumregler, inte ett löfte.
- Ny formgivning: varm och tydlig palett (Fjordnatt, Lingon, Mossa, Sol), Familjen Grotesk och Atkinson Hyperlegible Next. Varje förslag leder med restiden som en avgångstavla. Fungerar på mobil, iPad (kolumn bredvid texten, minst 44 px att trycka på) och dator (förslagen i två kolumner), i ljust och mörkt läge.
- Efter "Använd där jag är nu" visas adressen du står vid ("Du är vid Storgatan 3, Södermalm, Stockholm") och sparas som platsens namn och adress. Slås upp via OpenStreetMaps Nominatim från servern, bara när du trycker på knappen.
- Verklig kollektivresa per förslag: knappen "Visa kollektivresa" hämtar linje, byten, gångtid och avgångstider från Trafiklab ResRobot via `/api/travel` (kräver `TRAFIKLAB_KEY`, valfri). Resan hämtas först när man trycker, för att spara kvoten. Är det lika snabbt att gå hela vägen (högst 3 min längre, och högst 30 min) står det "Gå hela vägen" i stället, med kollektivresan bakom "Visa ändå".
- `scripts/lokalt.sh` kör hemsidan lokalt på Macen, med import av data från appen.
- Direktsökningen hittar själv lokala källor runt utgångspunkten (kommun, bibliotek, familjecentraler, babycafé, simhallar, museer). Stadens källregister är bara en startlista och gäller inom sökområdet.

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
