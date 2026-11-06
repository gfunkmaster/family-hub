# Den schemalagda körningen

- **Namn:** Familjeaktiviteter (Claude scheduled task `trig_01JP3ctSzSLCnYs7sBsRHTv7`)
- **Schema:** `CRON_TZ=Europe/Stockholm 48 18 * * 4`, torsdagar kl 18.48
- **Körs:** i molnet, utan att fråga om lov (auto). Pushnotis när den är klar.
- **Manuellt:** skriv "kör familjeaktiviteter nu" till Claude, eller be Claude köra den schemalagda uppgiften direkt.

Texten nedan är källan. Ändras den här: be Claude uppdatera den schemalagda uppgiften med samma text.

Körningen skriver fortfarande till artifactens databas. Hemsidans direktsökning (`web/src/lib/agent/prompt.ts`) har egna instruktioner med plats, radie och mat. När körningen flyttas till sidans API (drift.md steg 5) ska den ta beställningar med `mode: "kö"` och kan skicka `place`, `food` och `packed` enligt [datamodell.md](datamodell.md).

---

```text
Schemalagd körning: Familjeaktiviteter. Gör den utan att fråga användaren något. Skriv allt på svenska.

MÅL
Ta fram aktiviteter för en barnfamilj för en helg, en vecka eller en månad och skriv in dem i appen Familjeaktiviteter (artifact slug d5a207bf-b032-4b8d-be82-336bde49b99d, https://claude.ai/artifact/TP4M5ckuaMeNDXtWAs8aBW). Appen läser allt från artifactens databas. Använd verktygen db_get, db_list, db_query och db_write från claude-artifacts (ladda dem med ToolSearch om de är uppskjutna). Läs ett dokument innan du skriver om det och skicka dess version som ifVersion. Skicka en db_write i taget.

1. LÄS LÄGET
- app/profile: barn (födelsedatum), antal vuxna, budgetMax (kr per dag för hela familjen), sovtider, behov (vagn, skötrum), intressen och saker att undvika, homeCity, availability {weekdays, weekends} (weekdays = föräldraledig), leaveUntil (sista lediga vardag), autoRun ("helg" | "vecka" | "ingen") och places [{id, name, address, lat, lng, city}].
- cities/<id>: namn, defaultPlaceId, transportsätt (bil/kollektivt), maxTravelMin, carCostPerKm, transitTicket, childFreeTransitUnder och sources (källregistret).
- requests: dokument med status "ny" ({city, from, to, kind "helg"|"vecka"|"manad"|"egna", origin {name, address, lat, lng} eller null, note}).
- ratings: {city, itemId, title, tags, verdict "bra"|"nej"|"besokt", stars, ratedAt}.
- runs: tidigare körningar, för att undvika upprepningar.

2. VAD SOM SKA KÖRAS
- En körning för varje request med status "ny". Behandla alla. Hinner du inte: skriv i rapporten vilka som återstår.
- Datumen i en request räknas som lediga även om availability säger annat, eftersom familjen själv har valt dem.
- Finns ingen och autoRun är "helg": kommande lördag–söndag. "vecka": nästa måndag–söndag. "ingen": gör ingenting och avsluta med en rad om det.
- Stad: homeCity, om inte Google Kalender (list_events för perioden) visar att familjen är i en annan stad som finns i cities. Skriv i summary vilken stad du valde och varför.
- Lediga dagar: helger om availability.weekends inte är false, vardagar bara om availability.weekdays är true och dagen är senast leaveUntil. Leta aktiviteter för de lediga dagarna, men run.dates ska innehålla hela perioden.

3. UTGÅNGSPUNKT FÖR RESTID
I ordning: requestens origin; annars places-posten som cities/<id>.defaultPlaceId pekar på; annars den första i places med samma city; annars stadens centrum. Skriv i summary vilken utgångspunkt du använde. Saknar utgångspunkten koordinater: ta fram dem med WebSearch från adressen.

4. SÖK
- Börja med källregistret: hämta varje källa med WebFetch och leta efter aktiviteter för periodens lediga dagar som passar barnens ålder (räkna månader från födelsedatum per datum).
- Vardagar som föräldraledig: prioritera återkommande aktiviteter som öppen förskola, babysång och sagostund på biblioteket, kyrkans babycafé, babysim, bebisbio och museernas småbarnsvisningar. Ett återkommande pass (t.ex. babysång varje tisdag) blir ETT förslag med ett dates-element per tillfälle i perioden.
- Komplettera med WebSearch. Helg: 6–12 förslag. Vecka: 10–20. Månad: 15–35. Blanda gratis, under 300 kr och dyrare. Ta med några platser som fungerar alla dagar (lekplats, natur, bad, museum) med öppettider per datum.
- Vädret: prognos för de första 7–10 dagarna. precip är risken för nederbörd i procent (0–100). Ger prognosen bara mängd: använd precipMm (mm) i stället. Längre fram: inget väder.
- Hämta aldrig sajter som tools nekar. Gå inte runt en nekad sajt.

5. VERIFIERA OCH BEDÖM
- För varje evenemang: hämta arrangörens egen sida. verified: true bara om den bekräftar datum och tid. Säger källor olika saker: skriv det i conflict och sätt verified: false.
- Priser: skriv bara priser du har hittat. Okänt pris = null. Gissa aldrig. childFreeUnder i år när barn under en viss ålder går gratis. Olika pris olika dagar: adult per datum i dates.
- ageFit: level "säkert" (uttryckligen för åldern), "troligt" (passar men är inte riktat), "oklart"; minMonths och maxMonths om arrangören anger ålder; note med en mening om varför.
- Position: lat och lng för varje förslag. Obligatoriskt; appen räknar restid från familjens valda plats med dem.
- Restid från utgångspunkten i steg 3: walk {min}, transit {min, note}, car {km, min}. Skriv "ca" i note när det är uppskattat.
- Ratings: ta inte med något som har verdict "nej". Ta inte med en plats med verdict "besokt" från de senaste 8 veckorna. Ge fler förslag med taggar från förslag som fått "bra" eller 4–5 stjärnor.

6. SKRIV
- runs/<cityId>-<from> (set). Finns dokumentet: läs versionen först. Håll dokumentet under 200 kB (korta noter vid månadskörningar). Format:
{city, from, to, kind, dates:[alla datum från from till to], origin:{name, lat, lng} eller null, createdAt: ISO-tid nu, summary: 1–3 meningar, weather:[{date, high, low, precip?, precipMm?}], items:[{id (kort slug), title, kind "event"|"place", venue, lat, lng, indoor true|false, durationMin, dates:[{date, from "HH:MM", to "HH:MM", adult?}], prices:{adult, child, childFreeUnder}, travel:{walk?, transit?, car?}, ageFit:{level, minMonths, maxMonths, note}, practical:{stroller "ja"|"nej"|"oklart", changing "ja"|"nej"|"oklart"}, note, conflict?, tags:[…], verified, sources:[{title, url}]}]}
- Sätt varje behandlad request till status "klar" och runId.
- Hittade du en pålitlig kalender som saknas i källregistret: lägg till högst 3 nya i cities/<id>.sources ({name, url, kind}).
- Ändra aldrig app/profile eller ratings.

7. RAPPORT
Avsluta med högst 6 rader: stad, period och utgångspunkt, antal förslag (gratis / under 300 / mer), de 3 bästa för barnens ålder, vad som inte gick att verifiera, och länken till appen.
```
