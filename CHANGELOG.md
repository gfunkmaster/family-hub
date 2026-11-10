# Ändringslogg

## Ej släppt

- Spara schemat och välj flera förslag samma dag: i vyn Schema går det att lägga till upp till fyra förslag per dag, ta bort ett, göra en dag till vilodag och spara. Ett sparat schema visas i stället för det automatiska, med veckosummor som följer det valda. "Planera dagen" tar med dagens alla val, och varje val kan läggas i kalendern. Ny tabell `SavedSchedule` (migrering `0004_sparat_schema`), kontrollerad av `parseSchedule`.
- Smartare schema (`schedulePeriod`): när prognosen säger regn (minst 1 mm eller 50 % risk) går inomhus före utomhus, ett återkommande pass hålls på veckodagen det först fick, och med en veckobudget under Familj (`weekBudget`) väljs bara det som ryms i veckan. Schemat visar varför en dag ser ut som den gör och en summa per vecka. Okända priser räknas inte mot budgeten, och okänt väder räknas inte som regn.
- Dagsplanen räknar resan mellan två aktiviteter från den förra aktiviteten i stället för hemifrån (uppskattat från koordinaterna), och lägger resan hem sist. Saknas koordinater gäller restiden hemifrån som förut.
- Geokodning på servern (`web/src/lib/geo/forward.ts`, `/api/geocode`): en beställning med "Adress eller ort" får koordinater direkt via OpenStreetMaps Nominatim (bara Sverige, ett dygns cache), så att sökningen får en exakt mittpunkt och restiderna inte hänger på modellens koordinater. På Familj-sidan slår "Slå upp adressen" upp en sparad plats. En adress som finns på flera orter ("Storgatan 3") väljs inte: beställningen ber om orten. Ingen träff ger inga koordinater: då tar sökningen reda på platsen själv, som förut.
- Förbokning på förslagen (`Item.booking`): om bokning krävs, när den öppnar och en länk till bokningssidan. Förslag-sidan visar "Förbokning krävs" eller "Drop-in", när bokningen öppnar, och en länk som lägger en påminnelse i Google Kalender den dagen. Okänt visas inte alls. Valideras i `parseRun`, och både direktsökningen och torsdagskörningens instruktioner frågar efter fältet.
- Dagsplanen flyttar inte längre ett evenemang med fast tid för en tupplur (`autoPlan`). Tuppluren kortas till avresan med rådet att låta barnet sova vidare i vagnen, och en tupplur under evenemanget kortar inte evenemanget. Platser utan fast tid planeras som förut. Exempel: Babykyrka 10.15 planerades tidigare 10.42.
- Förslag: valet "Restid från" heter "Sökningens utgångspunkt" när ingen sparad plats finns, så att det stämmer med texten under. "Sökningens egna restider" visas bara när det skiljer sig från standardvalet.
- Förslag öppnar på rätt period: för varje stad visas sökningen som täcker idag, annars den närmast kommande, annars den senast passerade (`pickRun`). Tidigare visades den senast skapade, så en sökning för om två veckor kunde skymma veckans. När en stad har flera sökningar finns en rad med perioderna att växla mellan.
- Passerade dagar visas inte längre: datum, väder och förslag före idag tas bort (`withoutPastDays`), även i listan och schemat. En helt passerad sökning visas med en notis och länk till Beställ, utan Planera dagen. Dagsplanen säger till om dagen har passerat. "Idag" räknas i svensk tid på servern.
- "Öppna i Kartor" och "Lägg i kalendern" på varje förslag och på aktiviteterna i dagsplanen (`web/src/lib/links.ts`). Kartlänken använder koordinater, annars plats och stad. Kalenderlänken öppnar ett ifyllt utkast i Google Kalender i svensk tid, utan API: evenemang får sina tider, platser blir heldag med öppettiderna i beskrivningen, och i dagsplanen används planens tid (eller evenemangets egen).
- PNG-ikoner (192, 512 och Apple touch 180) så att sidan får rätt ikon på iPhone och Android när den läggs på hemskärmen. Ikonerna når inloggningssidan utan inloggning.
- Beställ: radioknapparna under Var bröts upp i smala kolumner (`width: 100%` gällde även radioknappar), och statusmärket ("Klar") blev en rund bubbla när raden hade två rader text. Länkar i märken är inte längre understrukna.
- Städer-sidan (`/stader`): redigera stadens utgångspunkt, standardplats, bil och kollektivt, längsta restid, bilkostnad, biljettpriser, gratis resor för barn och källregistret, eller skapa en ny stad. `parseCity` tar nu bort okända fält och avvisar orimliga värden (även vid import). Okända värden förblir tomma och visas som okända.
- Schema för vecka och månad på hemsidan: under Förslag, för sökningar längre än en helg, finns vyn Schema med en huvudaktivitet per ledig dag, alternativ, väder, total kostnad (okända priser markeras) och länk till Planera dagen. Räknas i webbläsaren med `scheduleFor`, utan ny tabell.
- Ny struktur på Förslag och Familj. Förslag: dagen är rubriken (stort datum med väder), sökningens sammanfattning ligger hopfälld under en rad, det bästa förslaget leder med en stor avgångstavla och resten är rader i stället för rutor. Familj: ett blad med avsnitt i stället för staplade kort, barnets ålder står stort, sovtiderna visas som ett band över dagen och Spara ligger fast längst ned.
- Ikon och webbmanifest (`/icon.svg`, `/manifest.webmanifest`): sidan får en flikikon och kan läggas på hemskärmen. På Familj-sidan står det att en ledighet utan slutdatum betyder alla vardagar framåt.
- Familj-sidan på hemsidan (`/familj`): barn, sovtider, lediga dagar och föräldraledighet, vad torsdagskörningen tar fram, budget, behov, intressen, hemstad och platser. "Spara där jag är nu" sparar telefonens position som en plats.
- Profilen kontrolleras och rensas på servern (samma kontroll vid import): rimliga tal, giltiga tider och koordinater, inga okända fält.
- Källrapport per direktsökning: Förslag visar vilka sidor sökningen faktiskt hämtade, vilka som misslyckades, vilka av stadens källor som inte försöktes och vilka som inte gav förslag. Loggen kommer från verktygssvaren i Claude API:et och sparas i `Run.fetched` (migrering `0003_kallogg`).
- Beroenden är låsta: `package-lock.json` är committad, och CI och Dockerfile kör `npm ci` i stället för `npm install`.
- Hårdare drift: inloggningen spärras efter 5 felaktiga lösenord per IP-adress och kvart (`web/src/lib/ratelimit.ts`), och `lokalt.sh` skapar längre lösenord.
- Direktsökningar som fastnat på "pågår" i mer än 20 minuter (till exempel när maskinen startats om) sätts till "fel" med en förklaring i stället för att visa "Söker…" för evigt.
- Budgettaket håller även vid samtidiga sökningar: en sökning gör anspråk på beställningen atomärt, och varje pågående sökning reserverar `AGENT_MAX_RUN_USD` tills den är klar.
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
