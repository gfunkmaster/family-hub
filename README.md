# Familjeaktiviteter

En agent och en app som hittar saker att göra med barn: en helg, en vecka eller en hel månad, till exempel under föräldraledighet. Förslagen anpassas efter barnens ålder, var familjen är, hur ni tar er dit och vad det kostar för hela familjen. Allt från gratis till evenemang som kostar.

- **Appen:** en Claude-artifact, [Familjeaktiviteter](https://claude.ai/artifact/TP4M5ckuaMeNDXtWAs8aBW) (privat).
- **Agenten:** en schemalagd Claude-körning varje torsdag kl 18.48 som söker, verifierar och skriver in förslag i appens databas.

## Hur det hänger ihop

```
 ┌──────────────────────────────┐        ┌───────────────────────────────────┐
 │ Schemalagd körning (torsdag) │        │ Appen (Claude-artifact)           │
 │ - läser profil, städer,      │  db    │ - Förslag dag för dag / lista     │
 │   beställningar, betyg       │◀──────▶│ - Dagsplan runt sovtider          │
 │ - WebSearch / WebFetch       │        │ - Schema för vecka/månad          │
 │ - verifierar hos arrangören  │        │ - Beställ, Betyg, Familj, Källor  │
 │ - skriver runs/<stad>-<från> │        │ - "Förbättra med Claude" (sample) │
 └──────────────────────────────┘        │ - Google Kalender (mcp)           │
                                          └───────────────────────────────────┘
```

Appen kan inte själv hämta data från webben (sidor i Claude får inte göra `fetch` mot andra sajter, och Claude inuti appen saknar webbsökning). Därför görs all insamling i den schemalagda körningen. Appen räknar, rangordnar, planerar och tar emot betyg. Se [docs/arkitektur.md](docs/arkitektur.md).

## Kom igång

Kräver Node 22.18 eller senare. Inga körtidsberoenden.

```bash
npm install        # typescript och eslint (dev)
npm test           # node:test, logik + bygge
npm run typecheck  # tsc, strict
npm run lint       # eslint
npm run build      # skriver dist/index.html
```

## Publicera en ny version

Appen är en enda HTML-fil, `dist/index.html`. Den publiceras som en ny version av artifacten av Claude (`publish_files` med slug `d5a207bf-b032-4b8d-be82-336bde49b99d`). Det finns inget publikt API för att publicera från CI ännu, se [ROADMAP.md](ROADMAP.md).

1. `npm run build` och committa `dist/index.html` (CI kontrollerar att den är aktuell).
2. Be Claude publicera `dist/index.html` till artifacten.
3. Ändras körningens instruktioner: uppdatera [docs/schemalagd-korning.md](docs/schemalagd-korning.md) och be Claude uppdatera den schemalagda uppgiften.

## Struktur

| Sökväg | Innehåll |
| --- | --- |
| `src/logic.ts` | Ren logik i strikt TypeScript: ålder, kostnad, restid, poäng, dagsplan, perioder och schema |
| `src/app.js` | Gränssnittet: rendering, händelser, databas, Claude och kalender |
| `src/index.html`, `src/styles.css` | Mall och stil |
| `scripts/build.mjs` | Strippar typer (Nodes inbyggda) och lägger ihop allt till `dist/index.html` |
| `test/` | Tester för logik och bygge |
| `docs/` | Arkitektur, datamodell och den schemalagda körningens instruktioner |

## Dokumentation

- [Arkitektur och begränsningar](docs/arkitektur.md)
- [Datamodell](docs/datamodell.md)
- [Den schemalagda körningen](docs/schemalagd-korning.md)
- [Det som återstår](ROADMAP.md)
- [Ändringslogg](CHANGELOG.md)
