# AGENTS.md

Regler för agenter (Claude Code, Cline med flera) som arbetar i det här repot. `CLAUDE.md` pekar hit.

## Kommandon

- `npm test`: alla tester (node:test). Måste passera.
- `npm run typecheck`: `tsc` i strict mode för `packages/logic`. Måste passera.
- Hemsidan: `npm run web:test`, `npm run web:typecheck`, `npm run web:lint` och `npm run web:build`. Måste passera. CI kör dessutom migreringarna mot Postgres och ett röktest (`web/scripts/smoke.ts`).
- `npm run lint`: ESLint för JavaScript-filerna. Måste passera.
- `npm run build`: bygger `dist/index.html`. Kör alltid efter ändringar i `src/` och committa resultatet.

## Regler

- Redigera aldrig `dist/index.html` för hand. Den byggs från `src/`.
- `packages/logic/src/index.ts` är ren logik: ingen DOM, inget nätverk, inga sidoeffekter. Ny logik hamnar där och får tester i `test/logic.test.mjs`.
- Logiken inlinas i artifactens klassiska skript. Använd bara syntax som Nodes typstrippning klarar (inga `enum`, `namespace` eller parameteregenskaper). Exporterade `const` och `function` blir globala i `src/app.js`.
- Allt som visas och kommer från databasen eller webben går genom `esc()`, och länkar genom `safeUrl()`.
- Gissa aldrig priser, tider eller åldersgränser. Okänt är `null` och visas som okänt.
- Appen kan inte göra `fetch`, läsa telefonens position eller ladda bilder utifrån. Sådant hör hemma i den schemalagda körningen. Se `docs/arkitektur.md`.
- Ändras datamodellen: uppdatera `docs/datamodell.md` och körningens instruktioner i `docs/schemalagd-korning.md` i samma ändring.
- Text i gränssnittet skrivs på svenska.
- Hemsidan är TypeScript i strict mode, även komponenter och skript. Inga `any`.
- Allt agenten skickar till `/api/agent/*` valideras i `web/src/lib/validate.ts` innan det skrivs. Nya fält får validering och test.
- Ändras `web/prisma/schema.prisma`: lägg till en ny migrering i `web/prisma/migrations/`. CI jämför den första migreringen mot schemat.
- Hemligheter (`FAMILY_PASSWORD`, `SESSION_SECRET`, `AGENT_TOKEN`, `DATABASE_URL`) sätts med `fly secrets` och committas aldrig.

## Klart betyder

Tester tillagda eller uppdaterade, och `npm test`, `npm run typecheck`, `npm run lint` passerar. `dist/index.html` är ombyggd. CI är uppdaterad om skript eller miljö ändras. README, `docs/` och `CHANGELOG.md` är uppdaterade när beteende eller datamodell ändras.
