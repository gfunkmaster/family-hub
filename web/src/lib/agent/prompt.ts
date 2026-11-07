/**
 * Instruktionerna till agenten vid en direktsökning. Samma regler som den schemalagda körningen
 * (docs/schemalagd-korning.md), plus mat. Ren logik, så att prompten kan testas.
 */
import { ageMonths, datesBetween, type City, type Profile } from "@family-hub/logic";

export interface PromptRequest {
  from: string; to: string; kind: string; note: string;
  cityName: string | null;
  place: { name: string; address?: string; lat?: number; lng?: number } | null;
  radiusKm: number | null;
}

export interface PromptInput {
  profile: Profile;
  request: PromptRequest;
  city: (City & { name: string }) | null;
  liked: string[];
  disliked: string[];
  recentlyVisited: string[];
  today: string;
}

export const SYSTEM = `Du är en researchagent som hittar aktiviteter för en barnfamilj i Sverige. Du skriver på svenska.
Regler:
- Använd webbsökning och hämta arrangörens egen sida för varje evenemang. verified=true bara om arrangörens sida bekräftar datum och tid. Säger källor olika saker: förklara i conflict och sätt verified=false.
- Gissa aldrig priser, tider eller åldersgränser. Okänt är null.
- Varje förslag, matställe och matlåda ska ha minst en källa (url) som du faktiskt har läst.
- Åldersråd för mat följer Livsmedelsverket. Varje matlåda ska ha minst en källa på https://www.livsmedelsverket.se/ som stöder att maten passar åldern.
- Svara till sist med EXAKT ett JSON-objekt i ett kodblock märkt json, och inget efter det.`;

const SCHEMA = `{
  "place": {"name": "kort namn på området", "lat": tal, "lng": tal} eller null,
  "summary": "1–3 meningar: område, utgångspunkt, väder och vad som inte gick att verifiera",
  "weather": [{"date": "YYYY-MM-DD", "high": tal, "low": tal, "precip": risk i procent eller null, "precipMm": mm eller null}],
  "items": [{"id": "kort-slug", "title": "", "kind": "event"|"place", "venue": "", "lat": tal, "lng": tal, "indoor": true|false, "durationMin": tal,
     "dates": [{"date": "YYYY-MM-DD", "from": "HH:MM", "to": "HH:MM", "adult": tal eller utelämna}],
     "prices": {"adult": tal|null, "child": tal|null, "childFreeUnder": år|null},
     "travel": {"walk": {"min": tal, "note": "ca"}, "transit": {"min": tal, "note": ""}, "car": {"km": tal, "min": tal, "note": "ca"}},
     "ageFit": {"level": "säkert"|"troligt"|"oklart", "minMonths": tal|null, "maxMonths": tal|null, "note": "en mening"},
     "practical": {"stroller": "ja"|"nej"|"oklart", "changing": "ja"|"nej"|"oklart"},
     "note": "", "conflict": "text" eller utelämna, "tags": [""], "verified": true|false, "sources": [{"title": "", "url": ""}]}],
  "food": [{"id": "kort-slug", "title": "", "venue": "", "lat": tal, "lng": tal, "near": ["id på förslag i items"],
     "highChair": "ja"|"nej"|"oklart", "microwave": "ja"|"nej"|"oklart", "changing": "ja"|"nej"|"oklart",
     "priceNote": "t.ex. lunch ca 120 kr, eller okänt", "hoursNote": "", "note": "", "sources": [{"title": "", "url": ""}]}],
  "packed": [{"id": "kort-slug", "title": "", "fromMonths": tal, "toMonths": tal|null, "ingredients": [""], "steps": [""],
     "keeps": "hur länge och hur det håller sig i väskan", "note": "", "sources": [{"title": "", "url": "https://www.livsmedelsverket.se/..."}]}]
}`;

export function buildResearchPrompt(input: PromptInput): { system: string; prompt: string } {
  const { profile, request: r, city } = input;
  const dates = datesBetween(r.from, r.to);
  const kids = (profile.children ?? []).map((c) => `${c.name ?? "barn"}: ${ageMonths(c.birthdate, r.from)} månader`).join(", ") || "inga angivna";
  const where = r.place
    ? `Runt "${r.place.name}"${r.place.address ? ` (${r.place.address})` : ""}${r.place.lat != null && r.place.lng != null ? `, koordinater ${r.place.lat.toFixed(5)}, ${r.place.lng.toFixed(5)}` : ""}${r.radiusKm ? `, inom ca ${r.radiusKm} km` : ""}.`
    : `I ${r.cityName ?? "staden"}${r.radiusKm ? `, inom ca ${r.radiusKm} km från utgångspunkten` : ""}.`;
  const transport = city?.transport ? [city.transport.car !== false ? "bil" : null, city.transport.transit !== false ? "kollektivtrafik" : null].filter(Boolean).join(" och ") : "bil och kollektivtrafik";
  const sources = (city?.sources ?? []).map((s) => `- ${s.name}: ${s.url}`).join("\n");
  const lines = [
    `Idag är det ${input.today}. Hitta aktiviteter för ${dates.length === 1 ? `den ${r.from}` : `perioden ${r.from}–${r.to}`}.`,
    where,
    `Familjen: ${profile.adults ?? 2} vuxna. Barn: ${kids}. Sovtider: ${(profile.naps ?? []).map((n) => `${n.from}–${n.to}`).join(", ") || "okända"}.`,
    `Budget per dag för hela familjen inklusive resa: ${profile.budgetMax != null ? `${profile.budgetMax} kr` : "ingen angiven"}. Transport: ${transport}.`,
    profile.interests?.length ? `Mer av: ${profile.interests.join(", ")}.` : "",
    profile.avoid?.length ? `Undvik: ${profile.avoid.join(", ")}.` : "",
    input.liked.length ? `De har gillat: ${input.liked.join(", ")}.` : "",
    input.disliked.length ? `Ta inte med: ${input.disliked.join(", ")}.` : "",
    input.recentlyVisited.length ? `Nyligen besökta, ta inte med igen: ${input.recentlyVisited.join(", ")}.` : "",
    r.note ? `Önskemål: ${r.note}.` : "",
    sources ? `Börja med de här källorna:\n${sources}` : "",
    "",
    "Uppgift:",
    `1. ${dates.length === 1 ? "6–10" : dates.length <= 3 ? "6–12" : "10–20"} förslag som passar barnens ålder, en blandning av gratis, under 300 kr och dyrare. Återkommande pass (t.ex. babysång varje tisdag) blir ett förslag med ett dates-element per tillfälle. Ta med några platser som fungerar alla dagar.`,
    "2. Restid från utgångspunkten och lat/lng för varje förslag.",
    "3. Mat nära aktiviteterna: 1–2 ställen per förslag där det går, med barnstol, möjlighet att värma mat och skötrum om det framgår (annars oklart), och ungefärligt pris om det står.",
    "4. 3–5 matlådor att ta med hemifrån som passar barnens ålder enligt Livsmedelsverket: enkla, går att äta kalla eller värmas, med ingredienser, steg och hur länge de håller i väskan.",
    "5. Väder för dagarna om prognos finns.",
    "",
    `Svara med ett JSON-objekt enligt:\n${SCHEMA}`,
  ];
  return { system: SYSTEM, prompt: lines.filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n") };
}

/** Plockar ut JSON-objektet ur svaret: sista ```json-blocket, annars från första { till sista }. */
export function extractJson(text: string): unknown {
  const blocks = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)];
  const last = blocks.at(-1)?.[1];
  const candidate = last ?? (text.includes("{") ? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1) : "");
  if (!candidate) throw new Error("Svaret innehöll inget JSON-objekt");
  try { return JSON.parse(candidate); } catch { throw new Error("Svaret innehöll ogiltig JSON"); }
}
