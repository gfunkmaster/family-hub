
/* ---------- Fallback example data (shown until the database answers) ---------- */
const EXAMPLE = {
  profile:{adults:2,budgetMax:400,children:[{id:"c1",name:"Dottern",birthdate:"2026-02-01",approx:true}],naps:[{from:"09:30",to:"10:30"},{from:"13:00",to:"14:30"}],needs:{stroller:true,changing:true},interests:["natur","lek","musik"],avoid:[],homeCity:"stockholm",availability:{weekdays:false,weekends:true},autoRun:"helg"},
  cities:[{id:"vaxjo",name:"Växjö",transport:{car:true,transit:true},maxTravelMin:40,carCostPerKm:2.5,transitTicket:{adult:40,child:null,note:"1 zon via appen, 2026"},childFreeTransitUnder:null,sources:[]}],
  runs:[]
};

/* ---------- State ---------- */
const S = {profile:null,cities:{},runs:[],ratings:{},requests:[],plans:[],db:null,user:null,sample:null,mcp:null,live:false,timedOut:false,
  ui:{city:null,tier:"alla",safeOnly:false,planSel:{},planDate:null,planRun:null,plan:null,planSource:null,editProfile:null,profileDirty:false,editCity:{},cityDirty:{},geoBusy:null,cal:null,calErr:null,calBusy:false,claudeBusy:false}};

function profile(){return S.profile||EXAMPLE.profile;}
function places(){return (profile().places||[]).filter(p=>p&&p.id);}
try{S.ui.originByCity=JSON.parse(localStorage.getItem("fh-origin")||"{}")||{};}catch(e){S.ui.originByCity={};}
function setOrigin(cityId,placeId){S.ui.originByCity[cityId]=placeId;try{localStorage.setItem("fh-origin",JSON.stringify(S.ui.originByCity));}catch(e){}}
/* The origin used for travel in a city: the viewer's choice, else the city's default place, else none (search values from centre). */
function originFor(cityId){
  const chosen=S.ui.originByCity&&Object.prototype.hasOwnProperty.call(S.ui.originByCity,cityId)?S.ui.originByCity[cityId]:cityById(cityId).defaultPlaceId;
  const explicit=S.ui.originByCity&&Object.prototype.hasOwnProperty.call(S.ui.originByCity,cityId);
  const p=places().find(x=>x.id===chosen)||(!explicit&&!chosen?places().find(x=>x.city===cityId&&hasCoords(x)):null);
  return p&&hasCoords(p)?p:null;
}
function placeOptions(selectedId,includeCentre,cityName){
  const list=places();
  return (includeCentre?`<option value="" ${!selectedId?"selected":""}>${esc(cityName||"Stadens")} centrum (sökningens restider)</option>`:"")+
    list.map(p=>`<option value="${esc(p.id)}" ${p.id===selectedId?"selected":""} ${hasCoords(p)?"":"disabled"}>${esc(p.name||p.address)}${hasCoords(p)?"":" (saknar koordinater)"}</option>`).join("");
}
function cityById(id){return S.cities[id]||EXAMPLE.cities.find(c=>c.id===id)||{id,name:id,transport:{car:true,transit:true},maxTravelMin:45};}
function todayIso(){return isoDate(new Date());}
function toast(msg){const t=document.getElementById("toast");t.textContent=msg;t.classList.add("on");clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove("on"),2200);}
function levelClass(l){return l==="säkert"?"good":l==="troligt"?"":l==="oklart"?"warn":"bad";}
function modeLabel(m){return m==="walk"?"Gång":m==="transit"?"Kollektivt":m==="car"?"Bil":"";}
function kr(n){return n==null?"?":n.toLocaleString("sv-SE")+" kr";}
function dayName(iso){return parseDate(iso).toLocaleDateString("sv-SE",{weekday:"short",day:"numeric",month:"short"});}
function canWrite(){return !!S.db&&S.live;}

/* ---------- Header ---------- */
function renderHeader(){
  const p=profile(), t=todayIso();
  document.getElementById("kidChips").innerHTML=(p.children||[]).map(c=>{const m=ageMonths(c.birthdate,t);return `<span class="chip">${esc(c.name||"Barn")} · ${esc(ageLabel(m))}${c.approx?" (ca)":""} · ${esc(stageFor(m))}</span>`;}).join("")+`<span class="chip ghost">${esc(p.adults??2)} vuxna</span>`;
  const latest=S.runs[0];
  const next=nextThursdayRun(new Date());
  const parts=[];
  if(latest)parts.push("Senaste sökning: "+new Date(latest.createdAt).toLocaleDateString("sv-SE",{weekday:"short",day:"numeric",month:"short"}));
  parts.push("Nästa: tors "+next.toLocaleDateString("sv-SE",{day:"numeric",month:"short"})+" kl 18.48");
  if(!S.live)parts.push(S.timedOut?"Datan kan inte nås just nu, visar exempel":"Ansluter…");
  document.getElementById("statusLine").textContent=parts.join(" · ");
}

/* ---------- Förslag ---------- */
function runsByCity(){const m={};for(const r of S.runs){if(!m[r.city])m[r.city]=r;}return m;}
function renderForslag(){
  const el=document.getElementById("view-forslag");
  const byCity=runsByCity(); const ids=Object.keys(byCity);
  if(!ids.length){el.innerHTML=`<div class="card empty">Inga sökningar ännu. Beställ en helg, vecka eller månad under <a href="#bestall">Beställ</a>, så fyller torsdagskörningen på här.</div>`;return;}
  if(!S.ui.city||!byCity[S.ui.city])S.ui.city=ids[0];
  const run=byCity[S.ui.city], city=cityById(run.city), p=profile();
  const origin=originFor(run.city);
  const tw=tagWeightsFrom(Object.values(S.ratings));
  const dates=run.dates||[run.from,run.to].filter(Boolean);
  const evalAt=(it,d)=>{
    const ctx={profile:p,city,cityId:run.city,date:d,ratings:S.ratings,tagWeights:tw,origin};
    const cost=familyCost(it,p,city,d,origin), fit=ageFitFor(it,p.children,d), tf=travelFor(it,city,origin);
    return {it,d,cost,fit,tf,tier:tierFor(cost.entry),score:scoreItem(it,ctx),origin};
  };
  const pass=x=>(S.ui.tier==="alla"||x.tier===S.ui.tier)&&(!S.ui.safeOnly||x.fit.level==="säkert"||x.fit.level==="troligt");
  const scored=(run.items||[]).map(it=>evalAt(it,(it.dates||[]).find(x=>dates.includes(x.date))?.date||dates[0])).filter(pass).sort((a,b)=>b.score-a.score);
  const longRun=dates.length>2;
  const view=longRun?(S.ui.fview||"dag"):"lista";
  const free=activeDays(dates,p); const days=free.length?free:dates;
  const dayCards=view==="dag"?days.map(d=>{
    const list=(run.items||[]).filter(it=>dayEntry(it,d)).map(it=>evalAt(it,d)).filter(pass).sort((a,b)=>b.score-a.score);
    const w=(run.weather||[]).find(x=>x.date===d);
    return `<div class="card"><div class="row between"><h3>${esc(dayName(d))}</h3>${w?`<span class="wx">${esc(Number(w.high).toLocaleString("sv-SE"))}°, ${esc(w.precip)} %</span>`:""}</div>
      ${list.length?list.slice(0,3).map(x=>dayRow(x,run,d)).join(""):`<div class="meta">Inget som passar den här dagen.</div>`}
      ${list.length>3?`<div class="meta">${list.length-3} förslag till under Alla förslag.</div>`:""}</div>`;
  }).join(""):"";
  const wx=(run.weather||[]).map(w=>`<span class="wx">${esc(dayName(w.date))}: ${esc(Number(w.high).toLocaleString("sv-SE"))}° / ${esc(Number(w.low).toLocaleString("sv-SE"))}°, ${esc(w.precip)} % risk för nederbörd</span>`).join("");
  el.innerHTML=`
    <div class="row">${ids.map(id=>`<button class="small" data-act="city" data-id="${esc(id)}" aria-pressed="${id===S.ui.city}">${esc(cityById(id).name||id)}</button>`).join("")}</div>
    <div class="card">
      <div class="row between"><h2>${esc(city.name||run.city)} · ${esc(longRun?dayName(dates[0])+" – "+dayName(dates[dates.length-1]):dates.map(dayName).join(" – "))}</h2></div>
      ${run.summary?`<div class="note">${esc(run.summary)}</div>`:""}
      ${wx?`<div class="weather">${wx}</div>`:""}
      <div class="meta">Sökt ${esc(new Date(run.createdAt).toLocaleString("sv-SE",{dateStyle:"medium",timeStyle:"short"}))} · ${esc((run.items||[]).length)} förslag · rangordnat efter ålder, era betyg, budget och restid</div>
    </div>
    <div class="card">
      <label for="originSel">Restid från<select id="originSel" data-city="${esc(run.city)}">${placeOptions(origin?origin.id:"",true,city.name)}</select></label>
      <div class="meta">${origin?`Restider och resekostnad räknas från ${esc(origin.name||origin.address)}. Det är uppskattningar (fågelvägen × 1,3), så kolla gärna i reseplaneraren.`:(places().length?"Välj var ni är för att räkna om restiderna.":`Lägg in var ni bor under <a href="#profil">Familj</a>, så räknas restiderna därifrån.`)}</div>
    </div>
    <div class="row">
      <div class="seg" role="group" aria-label="Pris">${["alla","gratis","under300","mer"].map(t=>`<button class="small" data-act="tier" data-id="${t}" aria-pressed="${S.ui.tier===t}">${t==="alla"?"Alla":TIER_LABEL[t]}</button>`).join("")}</div>
      <label class="check"><input type="checkbox" id="safeOnly" ${S.ui.safeOnly?"checked":""}> Bara det som passar åldern</label>
    </div>
    ${longRun?`<div class="seg" role="group" aria-label="Visa"><button class="small" data-act="fview" data-id="dag" aria-pressed="${view==="dag"}">Dag för dag</button><button class="small" data-act="fview" data-id="lista" aria-pressed="${view==="lista"}">Alla förslag</button></div>`:""}
    ${longRun&&view==="dag"&&free.length<dates.length?`<div class="meta">Visar dagar ni är lediga (${free.length} av ${dates.length}). Ändra under <a href="#profil">Familj</a>.</div>`:""}
    ${view==="dag"?dayCards:(scored.length?scored.map(x=>itemCard(x,run)).join(""):`<div class="card empty">Inget matchar filtret.</div>`)}`;
}
function dayRow(x,run,d){
  const {it,cost,fit,tf,tier}=x; const de=dayEntry(it,d)||{};
  const travelTxt=tf?`${modeLabel(tf.mode)}${tf.min!=null?(tf.estimated?" ca ":" ")+tf.min+" min":""}`:"";
  return `<div class="tl" style="grid-template-columns:62px 1fr">
    <div class="t">${esc(de.from||"")}</div>
    <div class="what" style="display:grid;gap:6px">
      <div><b>${esc(it.title)}</b>${it.venue?` <span class="meta">· ${esc(it.venue)}</span>`:""}</div>
      <div class="row">
        <span class="chip ${tier==="gratis"?"good":tier==="okänt"?"ghost":""}">${TIER_LABEL[tier]}</span>
        ${cost.total!=null&&cost.total>0?`<span class="chip"><span class="cost">Totalt ${kr(cost.total)}</span></span>`:""}
        <span class="chip ${levelClass(fit.level)}">Ålder: ${esc(fit.level)}</span>
        ${travelTxt?`<span class="chip">${esc(travelTxt)}</span>`:""}
        ${it.conflict?`<span class="chip warn">Källor säger olika</span>`:it.verified?"":`<span class="chip ghost">Ej verifierad</span>`}
      </div>
      <div class="row"><button class="small" data-act="planday" data-run="${esc(run.id)}" data-item="${esc(it.id)}" data-date="${esc(d)}">Planera dagen</button></div>
    </div></div>`;
}
function itemCard(x,run){
  const {it,cost,fit,tf,tier}=x; const key=ratingKey(run.city,it); const r=S.ratings[key];
  const cls=it.conflict?"conflict":it.verified?"verified":"";
  const when=(it.dates||[]).map(d=>`${dayName(d.date)} ${esc(d.from||"")}–${esc(d.to||"")}${d.adult!=null&&it.prices&&d.adult!==it.prices.adult?` (${kr(d.adult)})`:""}`).join(" · ");
  const pr=it.practical||{};
  const yn=v=>v==="ja"?"ja":v==="nej"?"nej":"oklart";
  const sel=(S.ui.planSel[run.id]||{})[it.id];
  const src=(it.sources||[]).map(s=>{const u=safeUrl(s.url);return u?`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(s.title||new URL(u).hostname)}</a>`:"";}).join("");
  const travelTxt=tf?`${modeLabel(tf.mode)}${tf.min!=null?(tf.estimated?" ca ":" ")+tf.min+" min":""}${tf.withinLimit===false?" (över er gräns)":""}`:"Restid okänd";
  const travelBasis=tf&&tf.estimated?tf.basis:(x.origin&&!hasCoords(it)?"saknar position, visar restid från centrum":"");
  const costTxt=cost.total!=null?`Totalt ${kr(cost.total)}`:`Entré ${cost.entry!=null?kr(cost.entry):"?"}${cost.travel!=null?" + resa "+kr(cost.travel):""}`;
  return `<article class="card item ${cls}">
    <div class="row between"><div class="kind">${it.kind==="event"?"Evenemang":"Plats"}${it.indoor?" · inomhus":it.indoor===false?" · utomhus":""}</div>
      <span class="chip ${tier==="gratis"?"good":tier==="okänt"?"ghost":""}">${TIER_LABEL[tier]}</span></div>
    <h3>${esc(it.title)}</h3>
    <div class="meta">${esc(it.venue||"")}${when?" · "+when:""}</div>
    <div class="row">
      <span class="chip ${levelClass(fit.level)}">Ålder: ${esc(fit.level)}</span>
      <span class="chip ${tf&&tf.withinLimit===false?"warn":""}">${esc(travelTxt)}</span>
      <span class="chip"><span class="cost">${esc(costTxt)}</span></span>
      ${it.verified?`<span class="chip good">Verifierad</span>`:`<span class="chip ghost">Ej verifierad</span>`}
    </div>
    ${fit.note?`<div class="note">${esc(fit.note)}</div>`:""}
    ${it.note?`<div class="note">${esc(it.note)}</div>`:""}
    ${it.conflict?`<div class="flag"><b>Källorna säger olika:</b> ${esc(it.conflict)}</div>`:""}
    <div class="meta">Vagn: ${yn(pr.stroller)} · Skötrum: ${yn(pr.changing)}${cost.unknown.length?" · Okänt: "+esc(cost.unknown.join(", ")):""}${travelBasis?" · Restid "+esc(travelBasis):(tf&&tf.note?" · "+esc(tf.note):"")}</div>
    ${src?`<div class="sources">${src}</div>`:""}
    <div class="row">
      <button class="small" data-act="rate" data-key="${esc(key)}" data-run="${esc(run.id)}" data-item="${esc(it.id)}" data-v="bra" aria-pressed="${r&&r.verdict==="bra"}">Bra förslag</button>
      <button class="small" data-act="rate" data-key="${esc(key)}" data-run="${esc(run.id)}" data-item="${esc(it.id)}" data-v="nej" aria-pressed="${r&&r.verdict==="nej"}">Inte för oss</button>
      <button class="small" data-act="rate" data-key="${esc(key)}" data-run="${esc(run.id)}" data-item="${esc(it.id)}" data-v="besokt" aria-pressed="${r&&r.verdict==="besokt"}">Vi var där</button>
      <button class="small" data-act="plansel" data-run="${esc(run.id)}" data-item="${esc(it.id)}" aria-pressed="${!!sel}">${sel?"I dagsplanen":"Lägg i dagsplan"}</button>
    </div>
    ${r&&r.verdict==="besokt"?`<div class="row stars" aria-label="Betyg">${[1,2,3,4,5].map(n=>`<button class="${(r.stars||0)>=n?"on":""}" data-act="stars" data-key="${esc(key)}" data-n="${n}" aria-label="${n} av 5">★</button>`).join("")}</div>`:""}
  </article>`;
}

/* ---------- Dagsplan ---------- */
function renderPlan(){
  const el=document.getElementById("view-plan");
  const run=S.runs.find(r=>r.id===S.ui.planRun)||S.runs.find(r=>S.ui.planSel[r.id]&&Object.values(S.ui.planSel[r.id]).some(Boolean))||S.runs[0];
  if(!run){el.innerHTML=`<div class="card empty">Ingen sökning att planera från ännu.</div>`;return;}
  S.ui.planRun=run.id;
  const dates=run.dates||[run.from,run.to].filter(Boolean);
  if(!S.ui.planDate||!dates.includes(S.ui.planDate))S.ui.planDate=dates[0];
  const sel=S.ui.planSel[run.id]||{};
  const chosen=(run.items||[]).filter(it=>sel[it.id]);
  const p=profile();
  const naps=(p.naps||[]).map(n=>`${n.from}–${n.to}`).join(", ")||"inga angivna";
  el.innerHTML=`
    <div class="card">
      <h2>Dagsplan</h2>
      <div class="grid2">
        <label for="planRun">Sökning<select id="planRun">${S.runs.map(r=>`<option value="${esc(r.id)}" ${r.id===run.id?"selected":""}>${esc(cityById(r.city).name||r.city)} · ${esc((r.dates||[r.from]).map(dayName).join(" – "))}</option>`).join("")}</select></label>
        <label for="planDate">Dag<select id="planDate">${dates.map(d=>`<option value="${d}" ${d===S.ui.planDate?"selected":""}>${esc(dayName(d))}</option>`).join("")}</select></label>
      </div>
      <div class="meta">Sovtider: ${esc(naps)}. Ändra under <a href="#profil">Familj</a>.</div>
      <div class="meta">Valda: ${chosen.length?chosen.map(c=>esc(c.title)).join(", "):"inga. Välj med ”Lägg i dagsplan” under Förslag."}</div>
      <div class="row">
        <button class="primary" data-act="autoplan" ${chosen.length?"":"disabled"}>Gör plan</button>
        <button data-act="claudeplan" ${chosen.length&&S.sample&&!S.ui.claudeBusy?"":"disabled"}>${S.ui.claudeBusy?"Claude planerar…":"Förbättra med Claude"}</button>
        ${S.ui.plan&&canWrite()?`<button data-act="saveplan">Spara plan</button>`:""}
      </div>
      ${!S.sample?`<div class="meta">”Förbättra med Claude” är tillgängligt när appen öppnas i Claude.</div>`:""}
    </div>
    ${S.ui.plan?planCard(S.ui.plan,S.ui.planSource):""}
    ${dates.length>2?scheduleCard(run):""}
    ${S.plans.length?`<div class="card"><h3>Sparade planer</h3>${S.plans.map(pl=>pl.kind==="schema"
      ?`<details><summary>Schema från ${esc(dayName(pl.date))} · ${esc(cityById(pl.city).name||pl.city)}</summary><div class="timeline">${(pl.days||[]).map(d=>`<div class="tl"><div class="t">${esc(dayName(d.date).split(" ")[0])}</div><div class="what">${d.title?esc(d.title)+(d.time?` <span class="meta">${esc(d.time)}</span>`:""):`<span class="meta">Vilodag</span>`}</div></div>`).join("")}</div></details>`
      :`<details><summary>${esc(dayName(pl.date))} · ${esc(cityById(pl.city).name||pl.city)} · ${esc(pl.source==="claude"?"av Claude":"automatisk")}</summary>${timeline(pl.blocks)}</details>`).join("")}</div>`:""}`;
}
function scheduleCard(run){
  const p=profile(), city=cityById(run.city), origin=originFor(run.city), tw=tagWeightsFrom(Object.values(S.ratings));
  const dates=run.dates||datesBetween(run.from,run.to);
  const days=activeDays(dates,p);
  const sched=schedulePeriod(run.items||[],days,(it,d)=>scoreItem(it,{profile:p,city,cityId:run.city,date:d,ratings:S.ratings,tagWeights:tw,origin}),{gap:2});
  S.ui.schedule=sched;
  const total=sched.reduce((sum,x)=>{if(!x.pick)return sum;const c=familyCost(x.pick,p,city,x.date,origin);return c.total==null?sum:sum+c.total;},0);
  const unknown=sched.some(x=>x.pick&&familyCost(x.pick,p,city,x.date,origin).total==null);
  return `<div class="card">
    <div class="row between"><h2>Schema för perioden</h2>${canWrite()?`<button class="small" data-act="saveschedule">Spara schema</button>`:""}</div>
    <div class="meta">En huvudaktivitet per ledig dag (${days.length} dagar), samma sak högst var tredje dag. Kostnad ca ${kr(total)}${unknown?" plus okända priser":""}.</div>
    ${days.length?`<div class="timeline">${sched.map(x=>{const de=x.pick?dayEntry(x.pick,x.date)||{}:{};return `<div class="tl"><div class="t">${esc(dayName(x.date).split(" ").slice(0,2).join(" "))}</div><div class="what">${x.pick?`<div><b>${esc(x.pick.title)}</b> <span class="meta">${esc(de.from||"")}</span></div>${x.alts.length?`<div class="meta">Annars: ${x.alts.map(a=>esc(a.title)).join(", ")}</div>`:""}<div class="row" style="margin-top:4px"><button class="small" data-act="planday" data-run="${esc(run.id)}" data-item="${esc(x.pick.id)}" data-date="${esc(x.date)}">Planera dagen</button></div>`:`<span class="meta">Inget förslag den här dagen, en vilodag.</span>`}</div></div>`;}).join("")}</div>`:`<div class="meta">Inga lediga dagar i perioden. Är du föräldraledig? Slå på vardagar under <a href="#profil">Familj</a>.</div>`}
  </div>`;
}
function timeline(blocks){
  return `<div class="timeline">${(blocks||[]).map(b=>`<div class="tl ${esc(b.kind)}"><div class="t">${esc(b.time)}</div><div class="what"><div class="kind">${esc({aktivitet:"Aktivitet",vila:"Vila",mat:"Mat",resa:"Resa",info:"Obs"}[b.kind]||b.kind)}${b.endTime&&b.endTime!==b.time?" · till "+esc(b.endTime):""}</div><div>${esc(b.title)}</div>${b.note?`<div class="meta">${esc(b.note)}</div>`:""}</div></div>`).join("")}</div>`;
}
function planCard(blocks,source){return `<div class="card"><div class="row between"><h3>${esc(dayName(S.ui.planDate))}</h3><span class="chip ${source==="claude"?"good":"ghost"}">${source==="claude"?"Av Claude":"Automatisk"}</span></div>${timeline(blocks)}</div>`;}
function chosenForPlan(){
  const run=S.runs.find(r=>r.id===S.ui.planRun); if(!run)return {run:null,items:[]};
  const sel=S.ui.planSel[run.id]||{}; const city=cityById(run.city); const origin=originFor(run.city);
  const items=(run.items||[]).filter(it=>sel[it.id]).map(it=>{const tf=travelFor(it,city,origin);return {...it,_travelMin:tf&&tf.min||0,_travelNote:tf?modeLabel(tf.mode)+(tf.basis?" "+tf.basis:"")+(tf.estimated?" (ca)":tf.note?" · "+tf.note:""):""};});
  return {run,items};
}
async function claudePlan(){
  const {run,items}=chosenForPlan(); if(!run||!items.length||!S.sample)return;
  const p=profile(), date=S.ui.planDate;
  const kids=(p.children||[]).map(c=>({namn:c.name,manader:ageMonths(c.birthdate,date)}));
  const data=items.map(it=>({id:it.id,titel:it.title,plats:it.venue,oppet:dayEntry(it,date),resa_min:it._travelMin,resa:it._travelNote,inomhus:it.indoor,vagn:(it.practical||{}).stroller,skotrum:(it.practical||{}).changing,anteckning:it.note||""}));
  const prompt=`Du planerar en familjedag på svenska. Datum: ${date}. Barn: ${JSON.stringify(kids)}. Sovtider: ${JSON.stringify(p.naps||[])}. Behov: ${JSON.stringify(p.needs||{})}.
Valda aktiviteter (håll dig till dessa, hitta inte på nya platser): ${JSON.stringify(data)}.
Regler: lägg aktiviteter inom öppettiderna, lägg tupplurerna där sovtiderna är (gärna som vagnpromenad eller bilresa), lägg in lunch och mellanmål, räkna med restid, starta tidigast 08:30 och sluta senast 18:00. Om något inte får plats, säg det i en block med kind "info".
Svara ENBART med JSON: {"blocks":[{"time":"HH:MM","endTime":"HH:MM","kind":"aktivitet|vila|mat|resa|info","title":"...","note":"kort praktiskt tips"}]}`;
  S.ui.claudeBusy=true; renderPlan();
  try{
    let out;
    if(typeof S.sample.json==="function"){out=await S.sample.json(prompt,{modelTier:"default"});}
    else{const r=await S.sample(prompt,{modelTier:"default"});const m=/\{[\s\S]*\}/.exec(r.text||"");out=m?JSON.parse(m[0]):null;}
    const blocks=out&&Array.isArray(out.blocks)?out.blocks.filter(b=>b&&toMin(b.time)!=null).map(b=>({time:String(b.time),endTime:String(b.endTime||""),kind:["aktivitet","vila","mat","resa","info"].includes(b.kind)?b.kind:"info",title:String(b.title||""),note:String(b.note||"")})):null;
    if(!blocks||!blocks.length)throw {message:"Claude gav ingen plan att visa."};
    S.ui.plan=blocks; S.ui.planSource="claude";
  }catch(e){
    if(e&&e.code==="not_granted"){S.sample=null;toast("Claude är inte tillgängligt här");}
    else if(e&&e.code==="rate_limited")toast("För många förfrågningar, vänta en stund");
    else toast("Kunde inte göra planen: "+((e&&e.message)||"okänt fel"));
  }finally{S.ui.claudeBusy=false;renderPlan();}
}

/* ---------- Beställ ---------- */
function renderBestall(){
  const el=document.getElementById("view-bestall");
  const kind=S.ui.reqKind||"helg";
  const periods=periodOptions(new Date(),kind);
  const plabel=x=>kind==="vecka"?`v. ${isoWeek(x.from)}: ${dayName(x.from)} – ${dayName(x.to)}`:kind==="manad"?parseDate(x.to).toLocaleDateString("sv-SE",{month:"long",year:"numeric"})+(x.from.slice(8)!=="01"?` (från ${dayName(x.from)})`:""):`${dayName(x.from)} – ${dayName(x.to)}`;
  const p=profile(); const calDays=activeDays(datesBetween(isoDate(new Date()),addDays(isoDate(new Date()),27)),p);
  const cityIds=Object.keys(S.cities).length?Object.keys(S.cities):EXAMPLE.cities.map(c=>c.id);
  const reqs=S.requests.map(r=>`<div class="cal-day"><span>${esc(cityById(r.city).name||r.city)} · ${esc(dayName(r.from))}–${esc(dayName(r.to))}${r.origin?" · från "+esc(r.origin.name||r.origin.address):""}${r.note?" · "+esc(r.note):""}</span><span class="chip ${r.status==="klar"?"good":"ghost"}">${r.status==="klar"?"Klar":"Väntar"}</span></div>`).join("");
  el.innerHTML=`
    <div class="card">
      <h2>Beställ en sökning</h2>
      <div class="meta">Torsdagskörningen tar alla väntande beställningar, söker på webben, kollar mot arrangörernas egna sidor och lägger resultatet under Förslag. Har du bråttom: skriv ”kör familjeaktiviteter nu” till Claude i en chatt.</div>
      <form id="reqForm" class="grid2">
        <label for="reqCity">Stad<select id="reqCity">${cityIds.map(id=>`<option value="${esc(id)}">${esc(cityById(id).name||id)}</option>`).join("")}</select></label>
        <label for="reqKind">Period<select id="reqKind">${[["helg","Helg"],["vecka","Vecka"],["manad","Månad"],["egna","Egna datum"]].map(([v,l])=>`<option value="${v}" ${kind===v?"selected":""}>${l}</option>`).join("")}</select></label>
        ${kind==="egna"
          ?`<label for="reqFrom">Från<input id="reqFrom" type="date" value="${esc(isoDate(new Date()))}"></label><label for="reqTo">Till<input id="reqTo" type="date" value="${esc(addDays(isoDate(new Date()),6))}"></label>`
          :`<label for="reqPeriod">${kind==="vecka"?"Vecka":kind==="manad"?"Månad":"Helg"}<select id="reqPeriod">${periods.map(x=>`<option value="${x.from}|${x.to}">${esc(plabel(x))}</option>`).join("")}</select></label>`}
        <label for="reqOrigin">Vi utgår från<select id="reqOrigin"><option value="">Stadens standardplats</option>${places().map(p=>`<option value="${esc(p.id)}">${esc(p.name||p.address)}</option>`).join("")}<option value="__ny">Annan adress…</option></select></label>
        <label for="reqAddr">Annan adress<input id="reqAddr" placeholder="Fyll i om ni är någon annanstans"></label>
        <label for="reqNote" style="grid-column:1/-1">Önskemål (valfritt)<input id="reqNote" placeholder="t.ex. inomhus, mormor följer med"></label>
        <div><button class="primary" type="submit" ${canWrite()?"":"disabled"}>Beställ</button></div>
      </form>
    </div>
    <div class="card"><h3>Beställningar</h3>${reqs||`<div class="meta">Inga beställningar.</div>`}</div>
    <div class="card">
      <div class="row between"><h3>Lediga dagar</h3><button class="small" data-act="cal" ${S.mcp&&!S.ui.calBusy?"":"disabled"}>${S.ui.calBusy?"Hämtar…":"Hämta från Google Kalender"}</button></div>
      ${!S.mcp?`<div class="meta">Kalendern går att läsa när appen är öppen i Claude med Google Kalender kopplad.</div>`:""}
      ${S.ui.calErr?`<div class="flag">${esc(S.ui.calErr)}</div>`:""}
      ${S.ui.cal?calView(S.ui.cal,calDays):""}
    </div>`;
}
function calView(events,days){
  return days.map(day=>{
    const list=events.filter(e=>e.day===day);
    return `<div class="cal-day"><span>${esc(dayName(day))}</span><span>${list.length?list.map(e=>esc((e.time?e.time+" ":"")+e.title)).join(", "):`<span class="chip good">Ledig</span>`}</span></div>`;
  }).join("");
}
function eventsFromPayload(payload){
  const arr=Array.isArray(payload)?payload:(payload&&(payload.events||payload.items||payload.results))||[];
  return arr.map(e=>{
    const st=e.start&&(e.start.dateTime||e.start.date)||e.startTime||e.start||"";
    const s=String(st); const day=s.slice(0,10); const time=s.length>10?s.slice(11,16):"";
    return {day,time,title:e.summary||e.title||"Upptagen"};
  }).filter(e=>/^\d{4}-\d{2}-\d{2}$/.test(e.day));
}
async function loadCalendar(){
  if(!S.mcp)return; const start=isoDate(new Date()), endIso=addDays(start,28);
  S.ui.calBusy=true;S.ui.calErr=null;renderBestall();
  try{
    const res=await S.mcp.callTool("Google Calendar","list_events",{startTime:start+"T00:00:00",endTime:endIso+"T00:00:00",orderBy:"startTime",pageSize:250});
    S.ui.cal=eventsFromPayload(res&&res.payload!==undefined?res.payload:res);
  }catch(e){
    S.ui.calErr=e&&e.code==="server_not_connected"?"Google Kalender är inte kopplad till ditt konto.":"Kunde inte läsa kalendern ("+((e&&(e.code||e.message))||"okänt fel")+").";
  }finally{S.ui.calBusy=false;renderBestall();}
}

/* ---------- Betyg ---------- */
function renderBetyg(){
  const el=document.getElementById("view-betyg");
  const list=Object.values(S.ratings).sort((a,b)=>String(b.ratedAt).localeCompare(String(a.ratedAt)));
  const w=tagWeightsFrom(list);
  const liked=Object.entries(w).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).map(([k])=>k);
  const disliked=Object.entries(w).filter(([,v])=>v<0).sort((a,b)=>a[1]-b[1]).map(([k])=>k);
  const vtxt={bra:"Bra förslag",nej:"Inte för oss",besokt:"Besökt"};
  el.innerHTML=`
    <div class="card">
      <h2>Det agenten har lärt sig</h2>
      <div class="row"><span class="meta">Mer av:</span>${liked.length?liked.map(t=>`<span class="chip good">${esc(t)}</span>`).join(""):`<span class="meta">inget ännu</span>`}</div>
      <div class="row"><span class="meta">Mindre av:</span>${disliked.length?disliked.map(t=>`<span class="chip bad">${esc(t)}</span>`).join(""):`<span class="meta">inget ännu</span>`}</div>
      <div class="meta">Betygen styr rangordningen här i appen och läses av torsdagskörningen, som undviker upprepningar och söker mer av det ni gillar.</div>
    </div>
    <div class="card"><h3>Era betyg</h3>${list.length?list.map(r=>`<div class="cal-day"><span>${esc(r.title)} <span class="meta">· ${esc(cityById(r.city).name||r.city)}</span></span><span class="chip ${r.verdict==="nej"?"bad":r.verdict==="bra"?"good":""}">${esc(vtxt[r.verdict]||r.verdict)}${r.stars?" · "+"★".repeat(r.stars):""}</span></div>`).join(""):`<div class="meta">Inga betyg ännu. Betygsätt förslag under Förslag.</div>`}</div>`;
}

/* ---------- Familj (profil) ---------- */
function renderProfil(){
  const el=document.getElementById("view-profil");
  if(!S.ui.editProfile)S.ui.editProfile=JSON.parse(JSON.stringify(profile()));
  const p=S.ui.editProfile, t=todayIso();
  el.innerHTML=`
    <form class="card" id="profileForm">
      <h2>Familjen</h2>
      <div class="meta">Åldern räknas fram från födelsedatumet, så förslagen följer med när barnen växer.</div>
      ${(p.children||[]).map((c,i)=>{const m=ageMonths(c.birthdate||t,t);return `<div class="grid2" data-child="${i}">
        <label for="cn${i}">Namn<input id="cn${i}" data-f="name" value="${esc(c.name||"")}"></label>
        <label for="cb${i}">Födelsedatum${c.approx?" (ungefärligt)":""}<input id="cb${i}" type="date" data-f="birthdate" value="${esc(c.birthdate||"")}"></label>
        <div class="row"><span class="chip">${esc(ageLabel(m))} · ${esc(stageFor(m))}</span><button type="button" class="small" data-act="rmchild" data-i="${i}">Ta bort</button></div>
      </div>`;}).join("")}
      <div><button type="button" class="small" data-act="addchild">Lägg till barn</button></div>
      <div class="grid2">
        <label for="pAdults">Vuxna<input id="pAdults" type="number" min="1" max="6" value="${esc(p.adults??2)}"></label>
        <label for="pBudget">Maxkostnad per dag, hela familjen (kr)<input id="pBudget" type="number" min="0" step="50" value="${esc(p.budgetMax??"")}"></label>
      </div>
      <h3>När är ni lediga?</h3>
      <label class="check"><input type="checkbox" id="avWeekdays" ${p.availability&&p.availability.weekdays?"checked":""}> Vardagar (föräldraledig)</label>
      <label class="check"><input type="checkbox" id="avWeekends" ${!p.availability||p.availability.weekends!==false?"checked":""}> Helger</label>
      <div class="grid2">
        <label for="pLeave">Föräldraledig till (valfritt)<input id="pLeave" type="date" value="${esc(p.leaveUntil||"")}"></label>
        <label for="pAuto">Torsdagskörningen tar fram<select id="pAuto">
          <option value="helg" ${(p.autoRun||"helg")==="helg"?"selected":""}>Kommande helg</option>
          <option value="vecka" ${p.autoRun==="vecka"?"selected":""}>Nästa vecka, mån–sön</option>
          <option value="ingen" ${p.autoRun==="ingen"?"selected":""}>Bara det vi beställer</option>
        </select></label>
      </div>
      <h3>Platser ni utgår från</h3>
      <div class="meta">T.ex. hemma i Stockholm och där ni bor i Växjö. Enklast: öppna adressen i Google Maps, håll fingret på platsen och kopiera koordinaterna hit.</div>
      ${(p.places||[]).map((pl,i)=>{const q=pl.address?"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(pl.address):null;return `<div class="card" data-place="${i}" style="padding:10px">
        <div class="grid2">
          <label for="pln${i}">Namn<input id="pln${i}" data-f="name" value="${esc(pl.name||"")}" placeholder="Hemma"></label>
          <label for="plc${i}">Stad<select id="plc${i}" data-f="city">${Object.keys(S.cities).concat(EXAMPLE.cities.map(c=>c.id)).filter((v,j,a)=>a.indexOf(v)===j).map(id=>`<option value="${esc(id)}" ${pl.city===id?"selected":""}>${esc(cityById(id).name||id)}</option>`).join("")}</select></label>
          <label for="pla${i}" style="grid-column:1/-1">Adress<input id="pla${i}" data-f="address" value="${esc(pl.address||"")}" placeholder="Gatuadress, ort"></label>
          <label for="plk${i}" style="grid-column:1/-1">Koordinater (lat, lng)<input id="plk${i}" data-f="coords" inputmode="decimal" value="${hasCoords(pl)?esc(pl.lat+", "+pl.lng):""}" placeholder="56.8777, 14.8091"></label>
        </div>
        ${pl.geoNote?`<div class="meta">${esc(pl.geoNote)}</div>`:""}
        <div class="row">
          ${q?`<a class="btn small" href="${esc(q)}" target="_blank" rel="noopener">Öppna i Google Maps</a>`:""}
          <button type="button" class="small" data-act="geocode" data-i="${i}" ${S.sample&&S.ui.geoBusy==null?"":"disabled"}>${S.ui.geoBusy===i?"Söker…":"Uppskatta med Claude"}</button>
          <button type="button" class="small" data-act="rmplace" data-i="${i}">Ta bort</button>
        </div>
      </div>`;}).join("")}
      <div><button type="button" class="small" data-act="addplace">Lägg till plats</button></div>
      <h3>Sovtider</h3>
      ${(p.naps||[]).map((n,i)=>`<div class="grid2"><label for="nf${i}">Från<input id="nf${i}" type="time" data-nap="${i}" data-f="from" value="${esc(n.from)}"></label><label for="nt${i}">Till<input id="nt${i}" type="time" data-nap="${i}" data-f="to" value="${esc(n.to)}"></label><div class="row"><button type="button" class="small" data-act="rmnap" data-i="${i}">Ta bort</button></div></div>`).join("")}
      <div><button type="button" class="small" data-act="addnap">Lägg till sovtid</button></div>
      <h3>Behov och intressen</h3>
      <label class="check"><input type="checkbox" id="needStroller" ${p.needs&&p.needs.stroller?"checked":""}> Vi har barnvagn med oss</label>
      <label class="check"><input type="checkbox" id="needChanging" ${p.needs&&p.needs.changing?"checked":""}> Vi behöver skötrum</label>
      <label for="pInterests">Mer av (taggar, kommaseparerade)<input id="pInterests" value="${esc((p.interests||[]).join(", "))}" placeholder="natur, lek, musik, djur"></label>
      <label for="pAvoid">Undvik<input id="pAvoid" value="${esc((p.avoid||[]).join(", "))}" placeholder="trängsel, sent"></label>
      <div class="row"><button class="primary" type="submit" ${canWrite()?"":"disabled"}>Spara familjen</button>${canWrite()?"":`<span class="meta">Sparas när databasen är ansluten.</span>`}</div>
    </form>`;
}
function readProfileForm(){
  const p=S.ui.editProfile; const f=document.getElementById("profileForm"); if(!f)return p;
  f.querySelectorAll("[data-child]").forEach(row=>{const i=+row.dataset.child;row.querySelectorAll("input[data-f]").forEach(inp=>{p.children[i][inp.dataset.f]=inp.value; if(inp.dataset.f==="birthdate")p.children[i].approx=p.children[i].approx&&inp.value===p.children[i].birthdate;});});
  f.querySelectorAll("input[data-nap]").forEach(inp=>{p.naps[+inp.dataset.nap][inp.dataset.f]=inp.value;});
  p.places=p.places||[];
  f.querySelectorAll("[data-place]").forEach(row=>{
    const pl=p.places[+row.dataset.place];
    row.querySelectorAll("[data-f]").forEach(inp=>{
      if(inp.dataset.f==="coords"){
        const c=parseCoords(inp.value);
        if(c){if(!hasCoords(pl)||c.lat!==pl.lat||c.lng!==pl.lng){pl.lat=c.lat;pl.lng=c.lng;pl.geoNote="";}}
        else if(!inp.value.trim()){delete pl.lat;delete pl.lng;pl.geoNote="";}
        else pl.geoNote="Koordinaterna gick inte att läsa. Skriv dem som 56.8777, 14.8091.";
      }
      else pl[inp.dataset.f]=inp.value.trim();
    });
  });
  p.adults=Math.max(1,parseInt(document.getElementById("pAdults").value||"2",10));
  const b=document.getElementById("pBudget").value; p.budgetMax=b===""?null:Math.max(0,parseInt(b,10));
  p.needs={stroller:document.getElementById("needStroller").checked,changing:document.getElementById("needChanging").checked};
  p.availability={weekdays:document.getElementById("avWeekdays").checked,weekends:document.getElementById("avWeekends").checked};
  p.leaveUntil=document.getElementById("pLeave").value||null;
  p.autoRun=document.getElementById("pAuto").value;
  const tags=v=>v.split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
  p.interests=tags(document.getElementById("pInterests").value); p.avoid=tags(document.getElementById("pAvoid").value);
  return p;
}

async function geocodePlace(i){
  const pl=S.ui.editProfile.places[i]; if(!pl||!S.sample)return;
  if(!pl.address){toast("Skriv en adress först");return;}
  S.ui.geoBusy=i; renderProfil();
  const prompt=`Ge ungefärliga WGS84-koordinater för den här svenska adressen: "${pl.address}"${pl.city?` (stad: ${cityById(pl.city).name||pl.city})`:""}.
Svara ENBART med JSON: {"lat":number,"lng":number,"precision":"gata"|"område"|"ort"|"okänd"}. Är du osäker, ange en grövre precision hellre än att gissa en exakt punkt.`;
  try{
    let out;
    if(typeof S.sample.json==="function")out=await S.sample.json(prompt,{modelTier:"quick"});
    else{const r=await S.sample(prompt,{modelTier:"quick"});const m=/\{[\s\S]*\}/.exec(r.text||"");out=m?JSON.parse(m[0]):null;}
    const lat=Number(out&&out.lat),lng=Number(out&&out.lng);
    if(!out||out.precision==="okänd"||!hasCoords({lat,lng}))throw {message:"Claude kunde inte placera adressen. Kopiera koordinaterna från Google Maps."};
    pl.lat=Math.round(lat*1e5)/1e5; pl.lng=Math.round(lng*1e5)/1e5;
    pl.geoNote=`Uppskattat av Claude (noggrannhet: ${out.precision||"okänd"}). Kontrollera i Google Maps innan du sparar.`;
  }catch(e){
    if(e&&e.code==="not_granted")S.sample=null;
    pl.geoNote=(e&&e.message)||"Kunde inte uppskatta koordinaterna.";
  }finally{S.ui.geoBusy=null;renderProfil();}
}

/* ---------- Städer & källor ---------- */
function renderKallor(){
  const el=document.getElementById("view-kallor");
  const ids=Object.keys(S.cities).length?Object.keys(S.cities):EXAMPLE.cities.map(c=>c.id);
  el.innerHTML=`<div class="banner">Källregistret är det torsdagskörningen läser först, före vanlig webbsökning. Lägg till kalendrar ni litar på: bibliotek, kyrkans öppna förskola, museer, kommunens evenemangssida.</div>`+
  ids.map(id=>{
    if(!S.ui.editCity[id])S.ui.editCity[id]=JSON.parse(JSON.stringify(cityById(id)));
    const c=S.ui.editCity[id];
    return `<form class="card" data-cityform="${esc(id)}">
      <h2>${esc(c.name||id)}</h2>
      <label for="def-${esc(id)}">Standardplats i ${esc(c.name||id)}<select id="def-${esc(id)}" data-f="defaultPlaceId"><option value="">Centrum</option>${places().filter(p=>!p.city||p.city===id).map(p=>`<option value="${esc(p.id)}" ${c.defaultPlaceId===p.id?"selected":""}>${esc(p.name||p.address)}</option>`).join("")}</select></label>
      <div class="row"><label class="check"><input type="checkbox" data-f="car" ${c.transport&&c.transport.car?"checked":""}> Bil finns</label><label class="check"><input type="checkbox" data-f="transit" ${c.transport&&c.transport.transit?"checked":""}> Kollektivtrafik</label></div>
      <div class="grid2">
        <label>Max restid (min)<input type="number" min="5" step="5" data-f="maxTravelMin" value="${esc(c.maxTravelMin??"")}"></label>
        <label>Bilkostnad (kr/km)<input type="number" min="0" step="0.1" data-f="carCostPerKm" value="${esc(c.carCostPerKm??"")}"></label>
        <label>Biljett vuxen (kr)<input type="number" min="0" data-f="ticketAdult" value="${esc(c.transitTicket&&c.transitTicket.adult!=null?c.transitTicket.adult:"")}"></label>
        <label>Barn åker gratis under (år)<input type="number" min="0" max="20" data-f="childFreeTransitUnder" value="${esc(c.childFreeTransitUnder??"")}"></label>
      </div>
      ${c.transitTicket&&c.transitTicket.note?`<div class="meta">${esc(c.transitTicket.note)}</div>`:""}
      <h3>Källor</h3>
      ${(c.sources||[]).map((s,i)=>{const u=safeUrl(s.url);return `<div class="cal-day"><span>${u?`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(s.name)}</a>`:esc(s.name)} <span class="meta">· ${esc(s.kind||"")}</span></span><button type="button" class="small" data-act="rmsrc" data-city="${esc(id)}" data-i="${i}">Ta bort</button></div>`;}).join("")||`<div class="meta">Inga källor ännu.</div>`}
      <div class="grid2">
        <label>Namn<input data-new="name" placeholder="Stadsbiblioteket"></label>
        <label>Adress<input data-new="url" type="url" placeholder="https://"></label>
        <label>Typ<select data-new="kind"><option>bibliotek</option><option>kyrka</option><option>museum</option><option>kommun</option><option>turism</option><option>biljetter</option><option>trafik</option><option>annat</option></select></label>
        <div class="row" style="align-items:end"><button type="button" class="small" data-act="addsrc" data-city="${esc(id)}">Lägg till källa</button></div>
      </div>
      <div class="row"><button class="primary" type="submit" ${canWrite()?"":"disabled"}>Spara ${esc(c.name||id)}</button></div>
    </form>`;}).join("");
}
function readCityForm(id){
  const c=S.ui.editCity[id]; const f=document.querySelector(`[data-cityform="${CSS.escape(id)}"]`); if(!f)return c;
  const v=k=>f.querySelector(`[data-f="${k}"]`);
  const num=k=>{const x=v(k).value;return x===""?null:Number(x);};
  c.transport={car:v("car").checked,transit:v("transit").checked};
  c.defaultPlaceId=v("defaultPlaceId").value||null;
  c.maxTravelMin=num("maxTravelMin"); c.carCostPerKm=num("carCostPerKm");
  c.transitTicket=Object.assign({},c.transitTicket||{},{adult:num("ticketAdult")});
  c.childFreeTransitUnder=num("childFreeTransitUnder");
  return c;
}

/* ---------- Routing & render ---------- */
const VIEWS=["forslag","plan","bestall","betyg","profil","kallor"];
function currentView(){const h=location.hash.replace("#","");return VIEWS.includes(h)?h:"forslag";}
function render(){
  renderHeader();
  const v=currentView();
  document.querySelectorAll("nav.tabs a").forEach(a=>a.setAttribute("aria-current",a.dataset.view===v?"page":"false"));
  document.querySelectorAll("section.view").forEach(s=>s.classList.toggle("on",s.id==="view-"+v));
  ({forslag:renderForslag,plan:renderPlan,bestall:renderBestall,betyg:renderBetyg,profil:renderProfil,kallor:renderKallor})[v]();
}
window.addEventListener("hashchange",render);

/* ---------- Writes (one at a time per doc) ---------- */
async function write(fn,okMsg){
  if(!canWrite()){toast("Databasen är inte ansluten");return false;}
  try{await fn();if(okMsg)toast(okMsg);return true;}
  catch(e){toast(e&&e.code==="quota_exceeded"?"Lagringen är full":e&&e.code==="invalid_argument"?"Du har inte behörighet att spara här":"Kunde inte spara, försök igen");return false;}
}
async function rate(key,runId,itemId,verdict){
  const run=S.runs.find(r=>r.id===runId); const it=run&&(run.items||[]).find(i=>i.id===itemId); if(!it)return;
  const prev=S.ratings[key];
  if(prev&&prev.verdict===verdict&&verdict!=="besokt"){await write(()=>S.db.doc("ratings/"+key).delete(),"Betyget togs bort");return;}
  const doc={key,city:run.city,itemId,title:it.title,tags:it.tags||[],verdict,stars:verdict==="besokt"?(prev&&prev.stars)||null:null,ratedAt:new Date().toISOString(),runId};
  await write(()=>S.db.doc("ratings/"+key).set(doc),"Sparat");
}

document.addEventListener("click",async ev=>{
  const b=ev.target.closest("[data-act]"); if(!b)return;
  const a=b.dataset.act;
  if(a==="city"){S.ui.city=b.dataset.id;renderForslag();}
  else if(a==="tier"){S.ui.tier=b.dataset.id;renderForslag();}
  else if(a==="fview"){S.ui.fview=b.dataset.id;renderForslag();}
  else if(a==="planday"){S.ui.planRun=b.dataset.run;S.ui.planDate=b.dataset.date;S.ui.planSel[b.dataset.run]={[b.dataset.item]:true};S.ui.plan=null;location.hash="#plan";}
  else if(a==="saveschedule"){const run=S.runs.find(r=>r.id===S.ui.planRun);if(run&&S.ui.schedule)write(()=>S.db.collection("plans").add({kind:"schema",runId:run.id,city:run.city,date:S.ui.schedule[0]&&S.ui.schedule[0].date||run.from,days:S.ui.schedule.map(x=>({date:x.date,itemId:x.pick?x.pick.id:null,title:x.pick?x.pick.title:null,time:x.pick?(dayEntry(x.pick,x.date)||{}).from||"":""})),createdAt:new Date().toISOString()}),"Schemat sparades");}
  else if(a==="rate"){rate(b.dataset.key,b.dataset.run,b.dataset.item,b.dataset.v);}
  else if(a==="stars"){const r=S.ratings[b.dataset.key];if(r)write(()=>S.db.doc("ratings/"+b.dataset.key).update({stars:+b.dataset.n,ratedAt:new Date().toISOString()}),"Sparat");}
  else if(a==="plansel"){const m=S.ui.planSel[b.dataset.run]=S.ui.planSel[b.dataset.run]||{};m[b.dataset.item]=!m[b.dataset.item];S.ui.planRun=b.dataset.run;S.ui.plan=null;renderForslag();toast(m[b.dataset.item]?"Tillagd i dagsplanen":"Borttagen ur dagsplanen");}
  else if(a==="autoplan"){const {items}=chosenForPlan();S.ui.plan=autoPlan(items,profile(),S.ui.planDate);S.ui.planSource="auto";renderPlan();}
  else if(a==="claudeplan"){claudePlan();}
  else if(a==="saveplan"){const run=S.runs.find(r=>r.id===S.ui.planRun);if(run&&S.ui.plan)write(()=>S.db.collection("plans").add({runId:run.id,city:run.city,date:S.ui.planDate,blocks:S.ui.plan,source:S.ui.planSource,createdAt:new Date().toISOString()}),"Planen sparades");}
  else if(a==="cal"){loadCalendar();}
  else if(a==="addchild"){S.ui.profileDirty=true;readProfileForm();S.ui.editProfile.children.push({id:"c"+Date.now(),name:"",birthdate:todayIso()});renderProfil();}
  else if(a==="rmchild"){S.ui.profileDirty=true;readProfileForm();S.ui.editProfile.children.splice(+b.dataset.i,1);renderProfil();}
  else if(a==="addplace"){S.ui.profileDirty=true;readProfileForm();(S.ui.editProfile.places=S.ui.editProfile.places||[]).push({id:"p"+Date.now(),name:"",address:"",city:S.ui.city||Object.keys(S.cities)[0]||"stockholm"});renderProfil();}
  else if(a==="rmplace"){S.ui.profileDirty=true;readProfileForm();S.ui.editProfile.places.splice(+b.dataset.i,1);renderProfil();}
  else if(a==="geocode"){S.ui.profileDirty=true;readProfileForm();geocodePlace(+b.dataset.i);}
  else if(a==="addnap"){S.ui.profileDirty=true;readProfileForm();S.ui.editProfile.naps.push({from:"13:00",to:"14:00"});renderProfil();}
  else if(a==="rmnap"){S.ui.profileDirty=true;readProfileForm();S.ui.editProfile.naps.splice(+b.dataset.i,1);renderProfil();}
  else if(a==="addsrc"){S.ui.cityDirty[b.dataset.city]=true;const id=b.dataset.city;readCityForm(id);const f=b.closest("form");const name=f.querySelector('[data-new="name"]').value.trim(),url=safeUrl(f.querySelector('[data-new="url"]').value.trim()),kind=f.querySelector('[data-new="kind"]').value;if(!name||!url){toast("Fyll i namn och en adress som börjar med https://");return;}(S.ui.editCity[id].sources=S.ui.editCity[id].sources||[]).push({name,url,kind});renderKallor();}
  else if(a==="rmsrc"){S.ui.cityDirty[b.dataset.city]=true;const id=b.dataset.city;readCityForm(id);S.ui.editCity[id].sources.splice(+b.dataset.i,1);renderKallor();}
});
document.addEventListener("input",ev=>{
  const f=ev.target.closest&&ev.target.closest("form"); if(!f)return;
  if(f.id==="profileForm")S.ui.profileDirty=true;
  else if(f.dataset.cityform)S.ui.cityDirty[f.dataset.cityform]=true;
});
document.addEventListener("change",ev=>{
  const t=ev.target;
  if(t.id==="safeOnly"){S.ui.safeOnly=t.checked;renderForslag();}
  else if(t.id==="reqKind"){S.ui.reqKind=t.value;renderBestall();}
  else if(t.id==="originSel"){setOrigin(t.dataset.city,t.value);renderForslag();toast(t.value?"Restider omräknade":"Visar sökningens restider");}
  else if(t.id==="planRun"){S.ui.planRun=t.value;S.ui.plan=null;renderPlan();}
  else if(t.id==="planDate"){S.ui.planDate=t.value;S.ui.plan=null;renderPlan();}
});
document.addEventListener("submit",async ev=>{
  ev.preventDefault(); const f=ev.target;
  if(f.id==="profileForm"){const p=readProfileForm();p.updatedAt=new Date().toISOString();const ok=await write(()=>S.db.doc("app/profile").set(JSON.parse(JSON.stringify(p))),"Familjen sparades");if(ok){S.ui.editProfile=null;S.ui.profileDirty=false;}}
  else if(f.id==="reqForm"){
    const kindSel=document.getElementById("reqKind").value;
    let from,to;
    if(kindSel==="egna"){from=document.getElementById("reqFrom").value;to=document.getElementById("reqTo").value;if(!from||!to||to<from){toast("Välj ett giltigt datumintervall");return;}if(datesBetween(from,to).length>31){toast("Högst 31 dagar per beställning");return;}}
    else [from,to]=document.getElementById("reqPeriod").value.split("|");
    const city=document.getElementById("reqCity").value;
    const oSel=document.getElementById("reqOrigin").value, addr=document.getElementById("reqAddr").value.trim();
    let origin=null;
    if(addr)origin={name:addr,address:addr};
    else if(oSel&&oSel!=="__ny"){const p=places().find(x=>x.id===oSel);if(p)origin={id:p.id,name:p.name||p.address,address:p.address||"",lat:p.lat??null,lng:p.lng??null};}
    else{const p=places().find(x=>x.id===cityById(city).defaultPlaceId);if(p)origin={id:p.id,name:p.name||p.address,address:p.address||"",lat:p.lat??null,lng:p.lng??null};}
    if(oSel==="__ny"&&!addr){toast("Skriv adressen ni utgår från");return;}
    await write(()=>S.db.collection("requests").add({city,from,to,kind:kindSel,origin,note:document.getElementById("reqNote").value.trim(),status:"ny",createdAt:new Date().toISOString()}),"Beställningen är sparad");
  }
  else if(f.dataset.cityform){const id=f.dataset.cityform;const c=readCityForm(id);const ok=await write(()=>S.db.doc("cities/"+id).set(JSON.parse(JSON.stringify(c))),"Sparat");if(ok){delete S.ui.editCity[id];S.ui.cityDirty[id]=false;}}
});

/* ---------- Capabilities ---------- */
function subscribe(){
  const db=S.db; let got=false;
  const timer=setTimeout(()=>{if(!got){S.timedOut=true;render();}},10000);
  const live=()=>{if(!got){got=true;clearTimeout(timer);}S.live=true;S.timedOut=false;};
  const onErr=()=>{clearTimeout(timer);S.timedOut=true;render();};
  db.doc("app/profile").onSnapshot(s=>{live();S.profile=s.exists?s.data():null;if(!S.ui.profileDirty)S.ui.editProfile=null;render();},onErr);
  db.collection("cities").onSnapshot(s=>{live();const m={};s.docs.forEach(d=>{m[d.id]=Object.assign({id:d.id},d.data());});S.cities=m;for(const id of Object.keys(S.ui.editCity))if(!S.ui.cityDirty[id])delete S.ui.editCity[id];render();},onErr);
  db.collection("runs").orderBy("createdAt","desc").limit(20).onSnapshot(s=>{live();S.runs=s.docs.map(d=>Object.assign({id:d.id},d.data()));render();},onErr);
  db.collection("ratings").onSnapshot(s=>{live();const m={};s.docs.forEach(d=>{m[d.id]=d.data();});S.ratings=m;render();},onErr);
  db.collection("requests").orderBy("createdAt","desc").limit(20).onSnapshot(s=>{live();S.requests=s.docs.map(d=>Object.assign({id:d.id},d.data()));render();},onErr);
  db.collection("plans").orderBy("createdAt","desc").limit(10).onSnapshot(s=>{live();S.plans=s.docs.map(d=>Object.assign({id:d.id},d.data()));if(currentView()==="plan")renderPlan();},onErr);
}
render();
(function connect(tries){
  if(window.claude&&typeof window.claude.use==="function"){
    window.claude.use("db").then(db=>{if(db){S.db=db;subscribe();}else{S.timedOut=true;render();}}).catch(()=>{S.timedOut=true;render();});
    window.claude.use("sample").then(s=>{S.sample=s||null;render();}).catch(()=>{});
    window.claude.use("mcp").then(m=>{S.mcp=m||null;render();}).catch(()=>{});
    window.claude.use("user").then(u=>{S.user=u||null;}).catch(()=>{});
  }else if(tries<30){setTimeout(()=>connect(tries+1),100);}
  else{S.timedOut=true;render();}
})(0);
