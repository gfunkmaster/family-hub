# Ändringslogg

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
