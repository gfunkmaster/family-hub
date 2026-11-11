# Det som återstår

Ordnat efter vad som behövs för att appen ska fungera fullt ut. Varje punkt finns också som issue med samma rubrik.

## P0: Få det att fungera från början till slut

1. **Testkör torsdagskörningen en gång.** Kör den schemalagda uppgiften manuellt och kontrollera att den kan läsa och skriva appens databas från en molnsession, att beställningar markeras som klara och att förslagen får `lat`/`lng`. Klart när en ny `runs/…` syns i appen.
2. **Fyll i familjens uppgifter.** Dotterns riktiga födelsedatum (nu ungefär 1 februari 2026), platser med koordinater (hemma i Stockholm, i Växjö), lediga dagar och föräldraledighetens slutdatum, samt vad torsdagskörningen ska ta fram.
3. **Verifiera Claude i appen.** "Förbättra med Claude" och "Uppskatta med Claude" använder `sample.json`. Det är inte testat mot den riktiga miljön. Klart när båda ger svar i appen på mobilen.
4. **Verifiera kalendern.** Formatet på svaret från Google Kalender (`list_events`) är gissat i `eventsFromPayload`. Testa knappen och justera tolkningen.
5. **Positioner på de fem Växjö-förslagen från första testet** (Strandbjörket, Smålands museum, Huseby, simhallen, Leo's Lekland), eller låt nästa körning ersätta dem.

## P1: Bättre data

6. **Bygg ut källregistret.** Växjö stadsbibliotek och närbibliotek, Stockholms stadsdelsbibliotek nära er, Svenska kyrkans öppna förskola och babycafé per församling, Kulturhuset Stadsteatern barn, museernas familjeprogram. Lägg också till Länstrafiken Kronobergs regler för barn och SL:s pris för 2026.
7. **Riktiga restider.** Trafiklab ResRobot för kollektivtrafik (kräver API-nyckel) och en ruttmotor för bil. Måste köras på en server eller i den schemalagda körningen, eftersom appen inte får anropa andra sajter.
8. **Strukturerade källor istället för fri hämtning.** Många bibliotek och kommuner har evenemangsflöden (ICS, RSS eller JSON). Adaptrar per källa ger stabilare och billigare körningar än att låta Claude läsa hela sidor.
9. ~~Förbokning och biljetter.~~ Klart på hemsidan: `Item.booking` med krav, öppningstid och länk, och påminnelse i kalendern när bokningen öppnar.

## P2: Funktioner

10. **"Här nu" och delade kartlänkar.** Ett fält under Förslag som tar koordinater eller en delad länk från Google Maps eller Apple Kartor. Dessutom ett flöde i chatten: "använd min plats" sparar telefonens position som "Här nu".
11. ~~Lägg aktiviteter i kalendern.~~ Klart på hemsidan: "Lägg i kalendern" öppnar ett ifyllt utkast i Google Kalender. Påminnelse när förbokning öppnar finns, varje val i ett sparat schema kan läggas i kalendern, och hela det sparade schemat kan laddas ner som en enda ICS-fil.
12. **Uppdatera vädret närmare dagen.** Vid månadskörningar saknas väder längre fram. En lätt körning dagen innan kan fylla på.
13. ~~Bättre schemaläggning.~~ Klart på hemsidan: veckobudget, inomhus vid regn, fasta veckodagar för återkommande pass, och restid mellan aktiviteter i dagsplanen.

## P3: Teknik

14. ~~Lås beroenden.~~ Klart: `package-lock.json` är committad och CI och Dockerfile kör `npm ci`.
15. **UI i TypeScript.** Löses av hemsidan, som är TypeScript rakt igenom. Artifactens `src/app.js` tas bort när hemsidan har tagit över.
16. **E2E-test.** Playwright med mockad Claude-runtime (`window.claude.use`) som renderar Förslag, Dagsplan och Familj med testdata och kollar att det inte blir skriptfel.
17. **Publicering från CI.** Det finns inget API för att publicera en artifact från GitHub. Tills vidare publicerar Claude `dist/index.html`. Följ upp om det kommer ett API.
18. **Integritet vid delning.** Adresser och koordinater ligger i den delade databasen. Om appen ska delas: flytta platser till en privat sökväg och se till att körningen fortfarande kan läsa dem.
19. **Arkitekturbeslut om framtiden.** Om appen ska användas av fler familjer, med inloggning och riktiga API:er, är en egen Next.js-app med NestJS och Prisma ett naturligt nästa steg. Det beslutet bör tas som en ADR, kontrollerad mot befintliga beslut.

## Hemsidan (`web/`)

Grunden finns: inloggning, Förslag med GPS, Beställ, betyg och agentens API. Kvar för att den ska ersätta appen:

20. **Driftsätt på Fly.io.** Följ [docs/drift.md](docs/drift.md) steg 1–3.
21. **Flytta data från appen.** Importen i steg 4.
22. **Byt den schemalagda körningen till sidans API.** Steg 5.
23. **Familj-sidan.** Klar (`/familj`).
24. **Schema för vecka och månad.** Klar: vyn Schema under Förslag, där schemat går att ändra (upp till fyra förslag per dag), spara och återställa.
25. **Städer och källor.** Klar (`/stader`).
26. **Installera som app.** Klar: manifest, SVG-ikon och PNG-ikoner.
27. **Stäng artifacten.** När 20–25 är klara: ta bort `src/app.js`, `dist/` och artifact-bygget.
28. **Fler leverantörer för direktsökning.** DeepSeek eller liknande via `LlmProvider`. Kräver en egen sökmotor (t.ex. Brave Search API), eftersom de saknar inbyggd webbsökning.
29. ~~Geokodning på servern.~~ Klart: beställningar med adress eller ort och sparade platser på Familj-sidan får koordinater via Nominatim (`/api/geocode`). Agentens koordinater används bara när adressen inte hittas.
