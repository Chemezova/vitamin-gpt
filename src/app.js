// @ts-check
import {storage, demoState, uid} from "./store.js";
import {t} from "./i18n.js";
import {publishedRules, markerNames, topProducts} from "./data.js";

/** @typedef {import("./store.js").ShelfItem} ShelfItem */
/** @typedef {import("./store.js").Intake} Intake */

const $ = (selector) => /** @type {HTMLElement} */(document.querySelector(selector));
const main = $("#main"), nav = $("#nav"), topbar = $("#topbar"), dialog = /** @type {HTMLDialogElement} */($("#dialog"));
/** @type {import("./store.js").AppState} */
let state;
/** @type {"today"|"plan"|"progress"|"settings"} */
let page = "today";
let currentDate = new Date();
let installPrompt = /** @type {any} */(null);
/** @type {Array<Record<string,any>>} */ let rules=[];
/** @type {Array<Record<string,any>>} */ let products=[];
/** @type {number|undefined} */ let reminderTimer;
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const todayKey = () => dateKey(currentDate);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const lang = () => state.language;
const tr = (key) => t(lang(), key);
const listForDay = () => state.items.filter(item => item.active && item.days.includes(currentDate.getDay())).sort((a,b) => a.time.localeCompare(b.time));
const todayIntakes = () => state.intakes.filter(mark => mark.date === todayKey());
const statusFor = (item) => todayIntakes().find(mark => mark.itemId === item.id)?.status ?? "pending";
const friendlyDate = (date) => new Intl.DateTimeFormat(lang()==="ru"?"ru-RU":"en-US",{weekday:"long",month:"long",day:"numeric"}).format(date);
const number = (value) => new Intl.NumberFormat(lang()==="ru"?"ru-RU":"en-US",{maximumFractionDigits:1}).format(value);
const dayName = (date) => new Intl.DateTimeFormat(lang()==="ru"?"ru-RU":"en-US",{weekday:"short"}).format(date);
const dayLabels = () => lang()==="ru"?["Вс","Пн","Вт","Ср","Чт","Пт","Сб"]:["Su","Mo","Tu","We","Th","Fr","Sa"];

function toast(message) {
  const node=$("#toast"); node.textContent=message; node.classList.add("visible");
  window.setTimeout(()=>node.classList.remove("visible"),2600);
}

async function persist() {
  try { await storage.save(state); scheduleReminder(); }
  catch { toast(tr("saveError")); }
}

function badge(label, type="") { return `<span class="badge ${type}">${label}</span>`; }
function progressRing(percent,color="#77b255") { const circ=2*Math.PI*22, dash=circ*Math.max(0,Math.min(100,percent))/100; return `<svg class="ring" viewBox="0 0 52 52" aria-label="${Math.round(percent)}%"><circle class="ring-track" cx="26" cy="26" r="22"/><circle cx="26" cy="26" r="22" stroke="${color}" stroke-dasharray="${dash} ${circ}" transform="rotate(-90 26 26)"/></svg>`; }

function renderHeader() {
  const title={today:tr("today"),plan:tr("plan"),progress:tr("progress"),settings:tr("settingsTitle")}[page];
  topbar.innerHTML=`<a class="brand" href="#today" aria-label="Vitamin CHE"><img src="./assets/icon.svg" alt=""><span>Vitamin <b>CHE</b></span></a><span class="test-tag">${tr("demo")}</span><button class="avatar" data-page="settings" aria-label="${tr("settings")}">EL</button>`;
  document.title=`${title} · Vitamin CHE`;
}

function renderNav() {
  const icons={today:"⌂",plan:"▤",progress:"◷",settings:"⚙"};
  nav.innerHTML=["today","plan","progress","settings"].map(key=>`<button class="nav-item ${page===key?"selected":""}" data-page="${key}"><span class="nav-icon">${icons[key]}</span><span>${tr(key)}</span></button>`).join("");
}

function renderGoalCards() {
  if(!state.goals.length) return `<section class="section"><div class="section-heading"><h2>${tr("goals")}</h2><button class="text-button" data-action="goal-form">+ ${tr("addGoal")}</button></div><div class="card subtle">${tr("chartNote")}</div></section>`;
  return `<section class="section"><div class="section-heading"><h2>${tr("goals")}</h2><button class="text-button" data-action="goal-form">+ ${tr("addGoal")}</button></div><div class="goal-scroll">${state.goals.map(goal=>{const count=state.entries.filter(entry=>entry.name.toLowerCase()===goal.name.toLowerCase()).length;return `<article class="goal-card"><div class="goal-target">◎</div><div><p class="eyebrow">${esc(goal.name)}</p><strong>${esc(goal.value)} ${esc(goal.unit)}</strong><span class="muted small">${tr("target")} · ${count} ${tr("measurements").toLowerCase()}</span></div></article>`;}).join("")}</div></section>`;
}

function renderPairingNotes() {
  const scheduled=listForDay().filter(item=>item.kind==="supplement");
  const shown=new Set();const cards=[];
  for(let i=0;i<scheduled.length;i++) for(let j=i+1;j<scheduled.length;j++) {
    const one=scheduled[i],two=scheduled[j],left=one.nutrient.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,""),right=two.nutrient.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
    const gap=Math.abs((Number(one.time.slice(0,2))*60+Number(one.time.slice(3,5)))-(Number(two.time.slice(0,2))*60+Number(two.time.slice(3,5))));
    const rule=rules.find(row=>((row.a_key===left&&row.b_key===right)||(row.a_key===right&&row.b_key===left))&&gap<Number(row.buffer_min||0));
    if(!rule||shown.has(rule.id))continue;shown.add(rule.id);
    const fact=lang()==="ru"?rule.fact_ru:rule.fact_en;if(!fact)continue;
    cards.push(`<article class="pair-note"><span class="pair-icon">💡</span><div><strong>${tr("pair")}</strong><p>${esc(fact)}</p><small>${esc(one.name)} · ${esc(two.name)}</small><a href="https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(rule.source_ref)}/" target="_blank" rel="noopener noreferrer">${tr("source")} · ${esc(rule.source_ref)} ↗</a></div></article>`);
  }
  return cards.length?`<section class="section pair-notes">${cards.join("")}</section>`:"";
}

function renderTimelineCard(item,index) {
  const status=statusFor(item), tag=status==="taken"?tr("done"):index===0?tr("now"):tr("next");
  const cls=status==="taken"?"taken":status==="skipped"?"skipped":index===0?"current":"";
  const isRoutine=item.kind==="routine";
  const dose=isRoutine?"":`<span class="item-dose">${esc(item.amount)} · ${number(item.units)} ${tr("units")}</span>`;
  const notes=item.notes?`<p class="item-note">${esc(item.notes)}</p>`:"";
  const actions=status==="pending"?`<button class="primary small-button" data-action="mark" data-id="${item.id}" data-status="taken">${tr("taken")}</button><button class="icon-button" aria-label="${tr("skip")}" data-action="mark" data-id="${item.id}" data-status="skipped">···</button>`:`<button class="text-button" data-action="undo" data-id="${item.id}">${tr("undo")}</button>`;
  return `<article class="timeline-row ${cls}"><div class="time-col"><time>${esc(item.time)}</time><span>${tag}</span></div><div class="timeline-card ${cls}"><div class="item-mark">${isRoutine?"✦":"●"}</div><div class="item-info"><h3>${esc(item.name)}</h3>${dose}${item.meal?`<span class="item-note">${tr(item.meal)}</span>`:""}${notes}</div><div class="card-actions">${actions}</div></div></article>`;
}

function renderCheckin() {
  const existing=state.checkins.find(row=>row.date===todayKey());
  const moodOptions=[["great","😊"],["okay","😐"],["tired","😔"],["nauseous","🤢"]];
  return `<section class="section"><div class="section-heading"><h2>${tr("routine")}</h2></div><div class="checkin-card"><p>${tr("mood")}</p><div class="mood-row">${moodOptions.map(([key,emoji])=>`<button class="mood ${existing?.mood===key?"active":""}" data-action="mood" data-value="${key}">${emoji}<span>${tr(key)}</span></button>`).join("")}</div><div class="habit-row"><button class="habit ${existing?.water?"active":""}" data-action="water">💧 ${tr("water")} <b>${existing?.water??0}</b></button><button class="habit ${existing?.walk?"active":""}" data-action="toggle-habit" data-habit="walk">🚶 ${tr("walk")}</button><button class="habit ${existing?.workout?"active":""}" data-action="toggle-habit" data-habit="workout">✦ ${tr("workout")}</button></div></div></section>`;
}

function renderStock() {
  const items=state.items.filter(item=>item.active && item.kind==="supplement");
  return `<section class="section"><div class="section-heading"><h2>${tr("inventory")}</h2><button class="text-button" data-page="plan">${tr("shelf")} →</button></div><div class="stock-grid">${items.map(item=>{
    const max=Math.max(item.remaining??0,1); const pct=item.remaining===null?0:Math.min(100,Math.round((item.remaining/Math.max(30,max))*100));
    return `<article class="stock-card ${pct<=25?"low":""}"><div class="stock-top"><span>${esc(item.name)}</span>${item.remaining!==null&&pct<=25?"⚠":""}</div><strong>${item.remaining===null?"—":`${pct}%`}</strong>${item.remaining!==null?`<div class="meter"><i style="width:${pct}%"></i></div><small>${number(item.remaining)} ${tr("units")}</small>`:`<small>${tr("noStock")}</small>`}</article>`;
  }).join("")||`<div class="card subtle">${tr("noItems")}</div>`}</div></section>`;
}

function renderToday() {
  const schedule=listForDay();
  const count=todayIntakes().filter(mark=>mark.status==="taken").length;
  const morning=new Date().getHours()<12;
  const currentCount=schedule.filter(item=>statusFor(item)==="taken").length;
  const percent=schedule.length?Math.round(currentCount/schedule.length*100):0;
  const diffDays=Math.floor((new Date(todayKey()+"T00:00:00")-new Date(state.startedAt+"T00:00:00"))/86400000);
  main.innerHTML=`<section class="hero"><div class="hero-greeting"><div><p class="eyebrow">${friendlyDate(currentDate)}</p><h1>${morning?tr("hello"):lang()==="ru"?"Добрый день":"Good afternoon"}, Elena</h1><p class="muted">${tr("day")} ${Math.max(1,diffDays+1)} <span>${tr("active")}</span><i class="status-dot"></i></p></div><button class="circle-button" data-page="settings" aria-label="${tr("settings")}">♧</button></div><div class="daily-progress"><span>${currentCount} ${tr("of")} ${schedule.length} ${tr("taken").toLowerCase()}</span><div class="meter"><i style="width:${percent}%"></i></div><strong>${percent}%</strong></div></section>
    ${renderGoalCards()}
    <section class="section"><div class="section-heading"><h2>${tr("schedule")}</h2><div class="date-controls"><button data-action="date" data-delta="-1" aria-label="Previous day">‹</button><button data-action="date" data-delta="1" aria-label="Next day">›</button></div></div>${schedule.length?schedule.map(renderTimelineCard).join(""):`<div class="card empty-card"><div class="empty-illustration">☀</div><h3>${tr("empty")}</h3><p>${tr("addFirst")}</p><button class="primary" data-action="add-item">${tr("add")}</button></div>`}</section>
    ${renderPairingNotes()}${renderCheckin()}${renderStock()}<footer class="disclaimer">${tr("medDisclaimer")}</footer>`;
}

function renderPlan() {
  const days=dayLabels();
  const items=state.items.slice().sort((a,b)=>a.time.localeCompare(b.time));
  main.innerHTML=`<section class="page-intro"><p class="eyebrow">${tr("demo")}</p><h1>${tr("planTitle")}</h1><p class="muted">${tr("local")}</p><button class="primary" data-action="add-item">＋ ${tr("addToShelf")}</button></section><section class="section"><div class="section-heading"><h2>${tr("shelf")}</h2><span class="muted small">${items.length}</span></div>${items.length?items.map(item=>`<article class="plan-card ${item.active?"":"inactive"}"><div class="plan-icon">${item.kind==="routine"?"✦":"●"}</div><div class="plan-info"><div class="plan-title-row"><h3>${esc(item.name)}</h3><span class="muted">${esc(item.time)}</span></div>${item.kind==="supplement"?`<p>${esc(item.amount)} · ${number(item.units)} ${tr("units")}</p><p class="muted small">${tr("stock")}: ${item.remaining===null?"—":number(item.remaining)}</p>`:`<p class="muted">${tr("routine")}</p>`}<div class="week-days">${days.map((d,i)=>`<i class="${item.days.includes(i)?"on":""}">${d}</i>`).join("")}</div></div><div class="plan-menu"><button data-action="edit-item" data-id="${item.id}" aria-label="${tr("edit")}">✎</button><button data-action="toggle-item" data-id="${item.id}" aria-label="${item.active?tr("pause"):tr("resume")}">${item.active?"Ⅱ":"▶"}</button><button data-action="delete-item" data-id="${item.id}" aria-label="${tr("delete")}">⋯</button></div></article>`).join(""):`<div class="card empty-card"><h3>${tr("noItems")}</h3><button class="primary" data-action="add-item">${tr("addToShelf")}</button></div>`}</section>
    <section class="section"><div class="card premium-card"><div><p class="eyebrow">${tr("premium")}</p><h3>${tr("premiumNote")}</h3></div><button class="secondary" data-action="premium">${tr("ok")}</button></div></section>`;
}

function chartFor(name) {
  const rows=state.entries.filter(entry=>entry.name.toLowerCase()===name.toLowerCase()).sort((a,b)=>a.date.localeCompare(b.date));
  if(rows.length<1) return `<div class="chart-empty">${tr("noEntries")}</div>`;
  const values=rows.map(r=>r.value), min=Math.min(...values), max=Math.max(...values), span=Math.max(max-min,1);
  const points=rows.map((r,i)=>`${rows.length===1?50:14+i*72/(rows.length-1)},${86-(r.value-min)/span*62}`).join(" ");
  const target=rows.at(-1)?.target;
  const targetY=target===null||target===undefined?null:86-(target-min)/span*62;
  return `<svg class="chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${esc(name)} entries"><line x1="0" y1="86" x2="100" y2="86" class="axis"/>${targetY===null?"":`<line x1="0" y1="${targetY}" x2="100" y2="${targetY}" class="target-line"/>`}<polyline points="${points}" class="chart-line"/>${rows.map((row,i)=>`<circle cx="${rows.length===1?50:14+i*72/(rows.length-1)}" cy="${86-(row.value-min)/span*62}" r="2.3" class="chart-dot"><title>${esc(row.date)}: ${esc(row.value)} ${esc(row.unit)}</title></circle>`).join("")}</svg>`;
}

function renderProgress() {
  const days=Array.from({length:7},(_,i)=>{ const d=new Date(currentDate); d.setDate(d.getDate()-(6-i)); return d; });
  const chart=days.map(day=>{
    const planned=state.items.filter(item=>item.active&&item.kind==="supplement"&&item.days.includes(day.getDay())).length;
    const date=dateKey(day), taken=state.intakes.filter(mark=>mark.date===date&&mark.status==="taken").length;
    return {day,planned,taken};
  });
  const max=Math.max(1,...chart.map(x=>x.planned));
  const streak=(()=>{let n=0;const d=new Date();for(let i=0;i<90;i++){const key=dateKey(d);const plan=state.items.filter(item=>item.active&&item.days.includes(d.getDay()));const taken=state.intakes.filter(mark=>mark.date===key&&mark.status==="taken");if(plan.length&&taken.length<plan.length)break;if(plan.length)n++;d.setDate(d.getDate()-1);}return n;})();
  const names=[...new Set(state.entries.map(entry=>entry.name))];
  main.innerHTML=`<section class="page-intro"><p class="eyebrow">${tr("progressTitle")}</p><h1>${tr("progress")}</h1><p class="muted">${tr("chartNote")}</p></section><section class="section"><div class="section-heading"><h2>${tr("thisWeek")}</h2><span class="streak">✦ ${streak} ${tr("days")}</span></div><div class="card"><div class="bar-chart">${chart.map(x=>`<div class="bar-column"><span>${x.planned?`${x.taken}/${x.planned}`:"—"}</span><div class="bar-track"><i style="height:${Math.max(5,x.taken/max*100)}%"></i></div><small>${dayName(x.day)}</small></div>`).join("")}</div><div class="legend"><i></i>${tr("adherence")}</div></div></section><section class="section"><div class="section-heading"><h2>${tr("measurements")}</h2><button class="text-button" data-action="entry-form">＋ ${tr("addEntry")}</button></div><p class="muted small">${tr("entriesOnPage")}</p>${names.length?names.map(name=>{const rows=state.entries.filter(entry=>entry.name===name).sort((a,b)=>a.date.localeCompare(b.date));const last=rows.at(-1);return `<article class="card lab-card"><div class="section-heading"><div><h3>${esc(name)}</h3><p class="muted small">${rows.length} ${tr("measurements").toLowerCase()}</p></div><strong>${esc(last?.value)} ${esc(last?.unit)}</strong></div><div class="chart-wrap">${chartFor(name)}</div><div class="lab-values">${rows.map(row=>`<span><b>${esc(row.value)} ${esc(row.unit)}</b><small>${esc(row.date)}</small>${row.target===null?"":`<i>${tr("target")}: ${esc(row.target)}</i>`}</span>`).join("")}</div></article>`;}).join(""):`<div class="card empty-card"><h3>${tr("noEntries")}</h3><p>${tr("chartNote")}</p><button class="primary" data-action="entry-form">${tr("addEntry")}</button></div>`}</section><footer class="disclaimer">${tr("notAdvice")}</footer>`;
}

function renderSettings() {
  main.innerHTML=`<section class="page-intro"><p class="eyebrow">Vitamin CHE</p><h1>${tr("settingsTitle")}</h1><p class="muted">${tr("local")}</p></section>
    <section class="settings-list"><div class="setting-row"><div><h3>${tr("language")}</h3><p class="muted small">${tr("english")} · ${tr("russian")}</p></div><select id="language"><option value="en" ${lang()==="en"?"selected":""}>English</option><option value="ru" ${lang()==="ru"?"selected":""}>Русский</option></select></div>
    <div class="setting-row"><div><h3>${tr("reminders")}</h3><p class="muted small">${tr("reminderNote")}</p></div><label class="switch"><input type="checkbox" id="reminders" ${state.reminders?"checked":""}><i></i></label></div>
    <button class="setting-row setting-button" data-action="install"><div><h3>${tr("install")}</h3><p class="muted small">Add Vitamin CHE to your home screen</p></div><span>＋</span></button>
    <button class="setting-row setting-button" data-action="account"><div><h3>${tr("account")}</h3><p class="muted small">${tr("signInDemo")}</p></div><span>›</span></button>
    <button class="setting-row setting-button" data-action="premium"><div><h3>${tr("premium")}</h3><p class="muted small">${tr("premiumNote")}</p></div><span>›</span></button>
    <button class="setting-row setting-button" data-action="export"><div><h3>${tr("export")}</h3><p class="muted small">${tr("exportNote")}</p></div><span>↓</span></button>
    <button class="setting-row setting-button" data-action="data-info"><div><h3>${tr("privacy")}</h3><p class="muted small">${tr("local")}</p></div><span>›</span></button>
    <button class="setting-row setting-button destructive" data-action="clear"><div><h3>${tr("clear")}</h3><p class="muted small">${tr("clearConfirm")}</p></div><span>×</span></button></section>
    <div class="notice-card"><strong>${tr("demo")}</strong><p>${tr("premiumNote")}</p><p>${tr("medDisclaimer")}</p></div>`;
}

function renderWelcome() {
  main.innerHTML=`<section class="welcome"><img src="./assets/logo.svg" alt="Vitamin CHE" class="welcome-logo"><div class="eyebrow">${tr("demo")}</div><h1>Your daily vitamin <em>CHE</em>ck.</h1><p class="welcome-sub">From your routine to your own notes.</p><div class="notice-card"><p>${tr("consent")}</p><p>${tr("local")}</p></div><button class="primary wide" data-action="welcome">${tr("getStarted")}</button><p class="disclaimer">${tr("medDisclaimer")}</p></section>`;
}

function render() {
  renderHeader();renderNav();
  if(!state.welcomeDone) { renderWelcome(); return; }
  if(page==="today")renderToday(); else if(page==="plan")renderPlan(); else if(page==="progress")renderProgress(); else renderSettings();
}

function dialogForm(title,content,submitLabel=tr("save")) {
  dialog.innerHTML=`<form method="dialog" class="dialog-card"><div class="dialog-heading"><h2>${title}</h2><button class="icon-button" value="cancel" aria-label="${tr("cancel")}">×</button></div>${content}<div class="dialog-actions"><button class="secondary" value="cancel">${tr("cancel")}</button><button class="primary" value="submit">${submitLabel}</button></div></form>`;
  dialog.showModal();
}

function itemForm(item,prefill={}) {
  const old=item;
  const preset=/** @type {any} */(prefill);
  const days=dayLabels();
  dialogForm(old?tr("edit"):tr("addToShelf"),`${old?"":`<button type="button" class="secondary catalog-button" data-action="showcase">${tr("chooseProduct")}</button><p class="muted small">${tr("catalogNote")}</p>`}<input type="hidden" name="id" value="${esc(old?.id??"")}"><label>${tr("itemName")}<input name="name" required maxlength="80" value="${esc(old?.name??preset.name??"")}" placeholder="${tr("itemName")}"></label><label>${tr("nutrient")}<input name="nutrient" maxlength="80" value="${esc(old?.nutrient??preset.nutrient??"")}" placeholder="${tr("nutrient")}"></label><div class="form-grid"><label>${tr("amount")}<input name="amount" maxlength="30" value="${esc(old?.amount??"")}" placeholder="${tr("amountHint")}"></label><label>${tr("servings")}<input name="units" type="number" min="0.5" step="0.5" value="${old?.units??preset.labelUnits??1}"></label></div><div class="form-grid"><label>${tr("unitsPerBottle")}<input name="remaining" type="number" min="0" step="1" value="${old?.remaining??30}"></label><label>${tr("time")}<input name="time" type="time" required value="${old?.time??"08:00"}"></label></div><label>${tr("notes")}<textarea name="notes" rows="2" maxlength="500">${esc(old?.notes??"")}</textarea></label><fieldset><legend>${tr("selectedDays")}</legend><div class="weekday-picker">${days.map((d,i)=>`<label><input type="checkbox" name="days" value="${i}" ${(old?.days??[0,1,2,3,4,5,6]).includes(i)?"checked":""}><span>${d}</span></label>`).join("")}</div></fieldset><label class="checkbox-line"><input type="checkbox" name="routine" ${old?.kind==="routine"?"checked":""}> ${tr("addRoutine")}</label>`);
  dialog.querySelector("form")?.addEventListener("submit",async event=>{
    event.preventDefault();const form=/** @type {HTMLFormElement} */(event.currentTarget);const fd=new FormData(form);
    const id=String(fd.get("id")||uid()),name=String(fd.get("name")||"").trim(),time=String(fd.get("time")||"");
    if(!name||!time){toast(tr("invalid"));return;}
    const daysPicked=fd.getAll("days").map(Number);const prior=state.items.find(row=>row.id===id);
    /** @type {ShelfItem} */const updated={id,name,nutrient:String(fd.get("nutrient")||"").trim().toLowerCase(),amount:String(fd.get("amount")||"").trim(),units:Math.max(.5,Number(fd.get("units"))||1),remaining:fd.get("remaining")===""?null:Math.max(0,Number(fd.get("remaining"))),time,meal:"",days:daysPicked.length?daysPicked:[new Date().getDay()],notes:String(fd.get("notes")||"").trim(),task:prior?.task??"",active:prior?.active??true,kind:fd.has("routine")?"routine":"supplement",createdAt:prior?.createdAt??new Date().toISOString()};
    if(prior)state.items=state.items.map(row=>row.id===id?updated:row);else state.items.push(updated);
    dialog.close();await persist();page="plan";render();
  });
}

function renderProductResults() {
  const filter=/** @type {HTMLSelectElement|null} */(dialog.querySelector("#collection-filter"))?.value??"";
  const query=(/** @type {HTMLInputElement|null} */(dialog.querySelector("#product-search"))?.value??"").toLowerCase().trim();
  const matches=products.filter(product=>(!filter||product.collection===filter)&&(!query||`${product.name} ${product.brand} ${product.collection}`.toLowerCase().includes(query))).slice(0,40);
  const results=dialog.querySelector("#product-results");
  if(results)results.innerHTML=matches.map(product=>`<button type="button" class="product-option" data-action="pick-product" data-id="${esc(product.id)}"><span class="product-glyph">${esc(String(product.name).charAt(0).toUpperCase())}</span><span><strong>${esc(product.name)}</strong><small>${esc(product.brand)} · ${esc(product.collection)}</small></span><i>›</i></button>`).join("")||`<p class="muted small">${tr("noItems")}</p>`;
}

async function showcasePicker() {
  try { if(!products.length)products=await topProducts(); }
  catch { simpleDialog(tr("chooseProduct"),tr("saveError"));return; }
  if(dialog.open)dialog.close();
  const collections=[...new Set(products.map(product=>product.collection))].sort((a,b)=>String(a).localeCompare(String(b)));
  dialogForm(tr("chooseProduct"),`<p class="muted small">${tr("catalogNote")}</p><label>${tr("nutrient")}<select id="collection-filter"><option value="">${tr("allCollections")}</option>${collections.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join("")}</select></label><label>${tr("searchProducts")}<input id="product-search" type="search" placeholder="${tr("searchProducts")}"></label><div id="product-results" class="product-results"></div>`);
  dialog.querySelector(".dialog-actions")?.remove();
  renderProductResults();
  dialog.querySelector("#collection-filter")?.addEventListener("change",renderProductResults);
  dialog.querySelector("#product-search")?.addEventListener("input",renderProductResults);
}

async function entryForm() {
  let options=[];try { options=await markerNames(lang()); } catch { /* local form stays usable without reference lists */ }
  const hints=options.slice(0,60).map(marker=>`<option value="${esc(marker.name)}">`).join("");
  dialogForm(tr("addEntry"),`<label>${tr("marker")}<input name="name" list="marker-list" required maxlength="80" placeholder="${tr("markerPlaceholder")}"><datalist id="marker-list">${hints}</datalist></label><div class="form-grid"><label>${tr("value")}<input name="value" type="number" step="any" required></label><label>${tr("unit")}<input name="unit" maxlength="20" required placeholder="ng/mL"></label></div><div class="form-grid"><label>${tr("date")}<input name="date" type="date" required value="${todayKey()}"></label><label>${tr("target")}<input name="target" type="number" step="any"></label></div><label>${tr("notes")}<textarea name="note" rows="2" maxlength="500"></textarea></label>`);
  dialog.querySelector("form")?.addEventListener("submit",async event=>{event.preventDefault();const fd=new FormData(/** @type {HTMLFormElement} */(event.currentTarget));const name=String(fd.get("name")||"").trim(),value=Number(fd.get("value")),unit=String(fd.get("unit")||"").trim(),date=String(fd.get("date")||todayKey());if(!name||!unit||!Number.isFinite(value)){toast(tr("invalid"));return;}state.entries.push({id:uid(),name,value,unit,target:fd.get("target")===""?null:Number(fd.get("target")),date,note:String(fd.get("note")||"").trim()});dialog.close();await persist();page="progress";render();});
}

function goalForm() {
  dialogForm(tr("addGoal"),`<label>${tr("marker")}<input name="name" required maxlength="80" placeholder="${tr("markerPlaceholder")}"></label><div class="form-grid"><label>${tr("target")}<input name="value" type="number" step="any" required></label><label>${tr("unit")}<input name="unit" maxlength="20" required></label></div>`);
  dialog.querySelector("form")?.addEventListener("submit",async event=>{event.preventDefault();const fd=new FormData(/** @type {HTMLFormElement} */(event.currentTarget));const name=String(fd.get("name")||"").trim(),value=Number(fd.get("value")),unit=String(fd.get("unit")||"").trim();if(!name||!unit||!Number.isFinite(value)){toast(tr("invalid"));return;}state.goals.push({id:uid(),name,value,unit,target:value});dialog.close();await persist();render();});
}

async function markItem(itemId,status) {
  const item=state.items.find(row=>row.id===itemId);if(!item)return;
  state.intakes=state.intakes.filter(mark=>!(mark.itemId===itemId&&mark.date===todayKey()));
  /** @type {Intake} */const mark={id:uid(),itemId,date:todayKey(),status,time:new Date().toTimeString().slice(0,5),note:"",units:item.units};
  state.intakes.push(mark);
  if(status==="taken"&&item.kind==="supplement"&&item.remaining!==null)item.remaining=Math.max(0,item.remaining-item.units);
  await persist();render();
}

async function undoMark(itemId) {
  const mark=state.intakes.find(row=>row.itemId===itemId&&row.date===todayKey());
  const item=state.items.find(row=>row.id===itemId);
  if(mark?.status==="taken"&&item?.kind==="supplement"&&item.remaining!==null)item.remaining+=mark.units;
  state.intakes=state.intakes.filter(row=>row.id!==mark?.id);await persist();render();
}

function exportEntries() {
  const data={exportedAt:new Date().toISOString(),format:"Vitamin CHE personal test export v1",entries:state.entries,goals:state.goals,checkins:state.checkins,intakes:state.intakes,items:state.items};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=`vitamin-che-entries-${todayKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(tr("exportDone"));
}

function simpleDialog(title,text) {
  dialogForm(title,`<div class="notice-card"><p>${text}</p></div>`,tr("ok"));
}

function onMainClick(event) {
  const target=/** @type {HTMLElement} */(event.target);const button=target.closest("button");if(!button)return;
  const destination=button.dataset.page;
  if(destination){page=/** @type {any} */(destination);render();return;}
  const action=button.dataset.action;
  if(action==="welcome"){state.welcomeDone=true;persist().then(render);return;}
  if(action==="add-item"){itemForm(null);return;}
  if(action==="showcase"){showcasePicker();return;}
  if(action==="pick-product"){const product=products.find(row=>row.id===button.dataset.id);if(product){dialog.close();itemForm(null,{name:product.name,nutrient:product.nutrient,labelUnits:product.labelUnits});}return;}
  if(action==="edit-item"){const item=state.items.find(row=>row.id===button.dataset.id);if(item)itemForm(item);return;}
  if(action==="delete-item"){const id=button.dataset.id;if(!confirm(tr("deleteConfirm")))return;state.items=state.items.filter(row=>row.id!==id);persist().then(render);return;}
  if(action==="toggle-item"){const item=state.items.find(row=>row.id===button.dataset.id);if(item)item.active=!item.active;persist().then(render);return;}
  if(action==="mark"){markItem(String(button.dataset.id),/** @type {any} */(button.dataset.status));return;}
  if(action==="undo"){undoMark(String(button.dataset.id));return;}
  if(action==="date"){currentDate.setDate(currentDate.getDate()+Number(button.dataset.delta));render();return;}
  if(action==="entry-form"){entryForm();return;}
  if(action==="goal-form"){goalForm();return;}
  if(action==="export"){exportEntries();return;}
  if(action==="clear"){simpleDialog(tr("clear"),`${tr("clearConfirm")}<br><br><button type="button" class="primary" id="confirm-clear">${tr("confirm")}</button>`);$("#confirm-clear").addEventListener("click",async()=>{await storage.clear();state={...structuredClone(demoState),items:[],intakes:[],entries:[],goals:[],checkins:[],welcomeDone:true,startedAt:dateKey(new Date())};dialog.close();await persist();page="today";render();});return;}
  if(action==="premium"){simpleDialog(tr("premium"),`${tr("premiumNote")}<br><br>${tr("noPayment")}`);return;}
  if(action==="account"){simpleDialog(tr("account"),tr("signInDemo"));return;}
  if(action==="data-info"){simpleDialog(tr("privacy"),`${tr("local")}<br><br>${tr("consent")}<br><br>${tr("exportNote")}`);return;}
  if(action==="install"){if(installPrompt){installPrompt.prompt();installPrompt=null;}else simpleDialog(tr("install"),"Use your browser menu and choose “Add to Home Screen” or “Install app”.");return;}
  if(action==="mood"){const check=getCheckin();check.mood=String(button.dataset.value);persist().then(render);return;}
  if(action==="water"){const check=getCheckin();check.water++;persist().then(render);return;}
  if(action==="toggle-habit"){const check=getCheckin();const key=/** @type {"walk"|"workout"} */(button.dataset.habit);check[key]=!check[key];persist().then(render);return;}
}

function getCheckin() {
  let check=state.checkins.find(row=>row.date===todayKey());
  if(!check){check={date:todayKey(),mood:"",water:0,walk:false,workout:false};state.checkins.push(check);}
  return check;
}

function scheduleReminder() {
  if(reminderTimer!==undefined)window.clearTimeout(reminderTimer);
  reminderTimer=undefined;
  if(!state?.reminders||!("Notification" in window)||Notification.permission!=="granted")return;
  const now=new Date();let next=null;
  for(let offset=0;offset<8;offset++){
    const date=new Date();date.setDate(date.getDate()+offset);
    for(const item of state.items.filter(row=>row.active&&row.days.includes(date.getDay()))){
      const at=new Date(date);at.setHours(Number(item.time.slice(0,2)),Number(item.time.slice(3,5)),0,0);
      if(at>now&&(!next||at<next))next=at;
    }
  }
  if(!next)return;
  reminderTimer=window.setTimeout(()=>{
    if(Notification.permission==="granted")new Notification("Vitamin CHE",{body:lang()==="ru"?"Вы настроили напоминание о своей рутине.":"You set a reminder for your routine."});
    scheduleReminder();
  },Math.min(next.getTime()-now.getTime(),2147480000));
}

nav.addEventListener("click",onMainClick);main.addEventListener("click",onMainClick);topbar.addEventListener("click",onMainClick);dialog.addEventListener("click",onMainClick);
$("#dialog").addEventListener("click",event=>{if(event.target===dialog)dialog.close();});
$("#main").addEventListener("change",event=>{
  const target=/** @type {HTMLInputElement|HTMLSelectElement} */(event.target);
  if(target.id==="language"){state.language=/** @type {"en"|"ru"} */(target.value);persist().then(render);}
  if(target.id==="reminders"){
    if(target.checked&&"Notification" in window)Notification.requestPermission().then(permission=>{state.reminders=permission==="granted";persist().then(render);if(!state.reminders)toast(lang()==="ru"?"Разрешение на уведомления не получено.":"Notification permission was not granted.");});
    else {state.reminders=false;persist().then(render);if(target.checked)simpleDialog(tr("reminders"),tr("reminderNote"));}
  }
});
window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();installPrompt=event;});
window.addEventListener("online",()=>{if(state)toast(tr("sync"));});
window.addEventListener("offline",()=>{if(state)toast(tr("offline"));});

try { const saved=await storage.load(); state=saved??structuredClone(demoState);if(!saved&&navigator.language.toLowerCase().startsWith("ru"))state.language="ru";render();scheduleReminder(); }
catch { document.body.innerHTML=`<main class="fatal"><h1>Vitamin CHE</h1><p>Browser storage is unavailable. Open this PWA in a modern browser with local storage enabled.</p></main>`; }

if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
publishedRules().then(value=>{rules=value;render();}).catch(()=>{});
