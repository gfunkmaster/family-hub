# Datamodell

Appens databas (artifact `db`). Sökvägar med jämnt antal segment är dokument. Typerna finns i `src/logic.ts`.

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

## `cities/<id>`

`name`, `origin` (text), `defaultPlaceId`, `transport {car, transit}`, `maxTravelMin`, `carCostPerKm`, `transitTicket {adult, child, note}`, `childFreeTransitUnder` (år), `sources [{name, url, kind}]` (källregistret).

## `runs/<stad>-<från>`

En körning för en period.

```
{ city, from, to, kind, dates: [YYYY-MM-DD…], origin: {name, lat, lng} | null,
  createdAt, summary, weather: [{date, high, low, precip}], items: [Item] }
```

`Item`: `id, title, kind ("event"|"place"), venue, lat, lng, indoor, durationMin,
dates [{date, from, to, adult?}], prices {adult, child, childFreeUnder}, travel {walk?, transit?, car?},
ageFit {level, minMonths, maxMonths, note}, practical {stroller, changing}, note, conflict?, tags, verified, sources [{title, url}]`.

Ett återkommande pass (t.ex. babysång varje tisdag) är ett förslag med ett `dates`-element per tillfälle. Dokument får vara högst 256 kB.

## `requests/<auto-id>`

`{city, from, to, kind ("helg"|"vecka"|"manad"|"egna"), origin {id?, name, address, lat, lng} | null, note, status ("ny"|"klar"), runId?, createdAt}`

## `ratings/<stad>--<förslag>`

`{key, city, itemId, title, tags, verdict ("bra"|"nej"|"besokt"), stars (1–5) | null, ratedAt, runId}`

## `plans/<auto-id>`

Dagsplan: `{runId, city, date, blocks [{time, endTime, kind, title, note}], source ("auto"|"claude"), createdAt}`.
Schema: `{kind: "schema", runId, city, date, days [{date, itemId, title, time}], createdAt}`.

## I webbläsaren

`localStorage["fh-origin"]`: vald utgångspunkt per stad, bara för den som tittar.
