# Datamodell

Appens databas (artifact `db`). Sökvägar med jämnt antal segment är dokument. Typerna finns i `packages/logic/src/index.ts`. Hemsidan har samma innehåll i Postgres, se `web/prisma/schema.prisma`: JSON-dokumenten blir tabellerna Profile, City, Run, Request och Rating.

Regler: alla inloggade som appen delas med kan läsa, och bara ägaren skriver (`{path: "", read: "view", write: "owner"}`). Delar du appen kan mottagaren alltså se adresserna i `app/profile`.

## `app/profile`

| Fält | Typ | Beskrivning |
| --- | --- | --- |
| `adults` | number | Antal vuxna |
| `budgetMax` | number \| null | Maxkostnad per dag för hela familjen, inklusive resa |
| `children` | `{id, name, birthdate, approx?}[]` | Födelsedatum `YYYY-MM-DD`. Åldern räknas fram per datum |
| `naps` | `{from, to}[]` | Sovtider `HH:MM` |
| `needs` | `{stroller, changing}` | Vagn och skötrum |
| `interests`, `avoid` | string[] | Taggar som viktas upp eller ned |
| `homeCity` | string | Stad när inget annat anges |
| `availability` | `{weekdays, weekends}` | `weekdays` = föräldraledig |
| `leaveUntil` | string \| null | Sista lediga vardag |
| `autoRun` | `"helg" \| "vecka" \| "ingen"` | Vad torsdagskörningen tar fram utan beställning |
| `places` | `{id, name, address, city, lat?, lng?, geoNote?}[]` | Utgångspunkter för restid |

På hemsidan skrivs profilen från Familj-sidan (`/familj`). Den går genom `parseProfile`, som tar bort okända fält och kräver giltiga tider (`to` efter `from`) och koordinater (både `lat` och `lng`, eller ingen).

## `cities/<id>`

`name`, `origin` (text), `defaultPlaceId`, `transport {car, transit}`, `maxTravelMin`, `carCostPerKm`, `transitTicket {adult, child, note}`, `childFreeTransitUnder` (år), `sources [{name, url, kind}]` (källregistret).

På hemsidan skrivs staden från Städer-sidan (`/stader`). Den går genom `parseCity`, som tar bort okända fält, kräver rimliga tal (restidsgräns 5–300 min, bilkostnad 0–20 kr/km, biljetter 0–2000 kr, gratis under 0–18 år) och en http(s)-adress på varje källa. Ett värde som saknas sparas som `null`, aldrig som 0.

## `runs/<stad>-<från>`

En körning för en period.

```
{ city, from, to, kind, dates: [YYYY-MM-DD…], origin: {name, lat, lng} | null,
  createdAt, summary, weather: [{date, high, low, precip?, precipMm?}], items: [Item] }
```

`Item`: `id, title, kind ("event"|"place"), venue, lat, lng, indoor, durationMin,
dates [{date, from, to, adult?}], prices {adult, child, childFreeUnder}, travel {walk?, transit?, car?},
ageFit {level, minMonths, maxMonths, note}, practical {stroller, changing}, booking? {required, opensAt, url, note}, note, conflict?, tags, verified, sources [{title, url}]`.

`booking` är förbokning: `required` (`"ja"|"nej"|"oklart"`, bara "ja" eller "nej" när arrangören säger det), `opensAt` (`YYYY-MM-DD` eller `YYYY-MM-DDTHH:MM` i svensk tid, eller `null`), `url` (bokningssidan) och `note`. Saknas fältet är inget känt, och hemsidan visar då inget om bokning.

`precip` är risken för nederbörd i procent, `precipMm` mängden i mm. Appen visar det som finns.

Ett återkommande pass (t.ex. babysång varje tisdag) är ett förslag med ett `dates`-element per tillfälle. Dokument får vara högst 256 kB.

## `requests/<auto-id>`

`{city, from, to, kind ("helg"|"vecka"|"manad"|"egna"), origin {id?, name, address, lat, lng} | null, note, status ("ny"|"klar"), runId?, createdAt}`

Datumen i en beställning räknas som lediga även om `availability` säger annat.

## `ratings/<stad>--<förslag>`

`{key, city, itemId, title, tags, verdict ("bra"|"nej"|"besokt"), stars (1–5) | null, ratedAt, runId}`

## `plans/<auto-id>`

Dagsplan: `{runId, city, date, blocks [{time, endTime, kind, title, note}], source ("auto"|"claude"), createdAt}`.
Schema: `{kind: "schema", runId, city, date, days [{date, itemId, title, time}], createdAt}`.

## Bara på hemsidan

Hemsidans tabeller har några fält till, som artifacten saknar:

- **Run:** `cityId` kan vara null när sökningen gjordes runt en plats. Då finns `place {name, address?, lat?, lng?, radiusKm?}`. Förslag och betyg grupperas på staden, annars på `plats-<slug av platsens namn>`.
  - `food [FoodSpot]`: matställen nära förslagen. `{id, title, venue?, lat?, lng?, near [item-id], highChair, microwave, changing ("ja"|"nej"|"oklart"), priceNote?, hoursNote?, note?, sources [{title, url}]}`. Minst en källa.
  - `packed [PackedFood]`: matlådor att ta med. `{id, title, fromMonths, toMonths?, ingredients [text], steps [text], keeps?, note?, sources}`. Minst en källa ska ligga på livsmedelsverket.se.
- **Request:** `cityId` eller `place`, `radiusKm`, `mode` (`"direkt"` sidan söker själv, `"kö"` torsdagskörningen), `status` (`"ny"|"pågår"|"klar"|"fel"`) och `error` (varför den inte gick).
- **Run.fetched:** `[{url, ok, error?}]`. Sidor som direktsökningen hämtade, ur Claude API:ets verktygssvar (inte modellens egen redovisning). Tom för körningar utan logg, som torsdagskörningen. Förslag-sidan jämför loggen med stadens källregister och visar vilka källor som hämtades, misslyckades, inte försöktes eller inte gav förslag (`web/src/lib/sourceReport.ts`).
- **AgentUsage:** en rad per direktsökning: `requestId, model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, webSearches, webFetches, costUsd, createdAt`. Månadens summa styr budgettaket.

## I webbläsaren

`localStorage["fh-origin"]`: vald utgångspunkt per stad, bara för den som tittar.
