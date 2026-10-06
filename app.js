"use strict";
// Set this to your Buy Me a Coffee, Ko-fi, or Stripe payment link.
const DONATE_URL = "";

const TROOPS = ["cavalry","shieldbearers","archers","spearmen","siege"];
const RARITIES = ["mythic","legendary","epic","rare"];
const POS = ["left","vanguard","right"];
const POS_LABEL = {left:"Left Flank",vanguard:"Vanguard",right:"Right Flank"};
const KEY = "dragonfire-muster.v2", OLD_KEY = "dragonfire-muster.v1";
const HABIT_STARS = [2,4,6,8,10];
const SPEEDS = ["Very Slow","Slow","Average","Fast","Very Fast"];
// Growth stage the game shows for each star rank.
const stage = s => s<=1 ? "Hatchling" : s<=3 ? "Whelp" : s<=5 ? "Juvenile" : "Adult";

// Cavalry > Shieldbearers > Archers > Spearmen > Cavalry.  Siege is weak to all of them.
const TROOP_BEATS = {cavalry:["shieldbearers"], shieldbearers:["archers"], archers:["spearmen"], spearmen:["cavalry"], siege:[]};
const COUNTER_PCT = 15; // our guess at the edge a counter gives; not measured

// Placement fit, in percent of the dragon's power.  Theory, not measured.
const ROLE_FIT = {
  vanguard:{tank:12,control:6,physical:0,fire:0,tactical:0,healer:-8},
  left:{healer:10,tactical:8,control:3,fire:0,physical:-4,tank:-6},
  right:{physical:10,fire:8,control:2,tactical:0,healer:-6,tank:-6}
};
const BREED_FIT = {
  vanguard:{warrior:3,champion:4,sentinel:-3,hunter:-3},
  left:{sentinel:5,champion:0,warrior:-2,hunter:0},
  right:{warrior:3,hunter:4,champion:0,sentinel:-3}
};
// The game gives +20% stats when a dragon's troop affinity matches.  The size of the penalty is not confirmed.
const AFF_PCT = {"+":20,"0":0,"-":-10};

// Plain ability words (as other tools export them) mapped to the tags the scorer reads.
const WORD_TAG = {burn:"applies-burn",panic:"applies-panic",slow:"applies-slow",bleed:"applies-bleed",
  stun:"applies-control",taunt:"applies-control",overwhelm:"applies-control",control:"applies-control",
  advantage:"gives-advantage",firststrike:"gives-firststrike",recovery:"sustain"};
const WANTS = {
  panic:{pct:5,txt:"hits harder into Panic"},
  burn:{pct:4,txt:"taunts twice as often against Burn"},
  slow:{pct:6,txt:"gets its extra fire hit on Slowed enemies",missTxt:"has no Slow applier, so its Slow follow-up sits idle"},
  control:{pct:4,txt:"punishes controlled enemies",self:true,also:["applies-slow","applies-panic"]},
  sentinel:{pct:8,txt:"gets Rising Tide stacks from an allied Sentinel",miss:-10,missTxt:"has no allied Sentinel, so Rising Tide never stacks"},
  advantage:{pct:4,txt:"gets more from an ally's Advantage"},
  firststrike:{pct:4,txt:"gets more from an ally's First Strike"},
  bleed:{pct:4,txt:"gets more from an ally's Bleed"}
};
const TAG_HELP = "Ability words like burn, panic, slow, bleed, stun, taunt, control, advantage, firstStrike, recovery, or wants burn / wants sentinel.  Advanced: long-fight, sustain, vg:left:tactical.  Add @6 if it comes from a habit that unlocks at 6 stars.";

const GOAL_HINT = {
  fit:"Ranks by placement, troop affinity, ability pairings and enemy troops.  This is theory until you test it in game.",
  power:"Ranks by the army power the game shows: base power plus bonuses you have measured.  Untested bonuses are flagged to test, never counted.",
  siege:"Fighting fit with siege troops, and siege affinity counts double.  Theory until tested.",
  even:"Spreads army power so your weakest march is as strong as it can be."
};

/* ---------- catalog ---------- */
const CATALOG = JSON.parse(document.getElementById("catalogData").textContent);
const CAT = new Map(CATALOG.map(c=>[c.name.toLowerCase(), c]));
const catOf = d => CAT.get(String(d.name||"").toLowerCase());

/* ---------- state: a book of rosters ---------- */
let book = {rosters:[], cur:null};
let state = null;              // the current roster: {id,name,roster,saved,tests,isSample}
let lastResults = null;        // {armies:[{ids,troop}], bench, goal}
let builder = {ids:[null,null,null], troop:"auto"};
const ctx = {enemy:""};

function sample(){ return JSON.parse(document.getElementById("sampleData").textContent); }
function newRoster(name, roster){ return {id:uid(), name, roster:roster||[], saved:[], tests:[], isSample:false}; }
function sampleRoster(){
  const s = sample(), r = newRoster("Sample roster", s.roster.map(normalize)); r.isSample = true;
  r.tests = importTests(s.tests||[], r.roster); return r;
}
function switchTo(id){
  state = book.rosters.find(r=>r.id===id) || book.rosters[0]; book.cur = state.id;
  builder = {ids:[null,null,null], troop:"auto"}; lastResults = null;
}
function load(){
  try{
    const b = JSON.parse(localStorage.getItem(KEY));
    if(b && Array.isArray(b.rosters) && b.rosters.length){
      book = b; book.rosters.forEach(r=>{ r.roster = r.roster.map(normalize); r.saved = r.saved||[]; r.tests = r.tests||[]; });
      book.rosters = book.rosters.map(r=>r.isSample ? Object.assign(sampleRoster(), {id:r.id, saved:r.saved}) : r);
      switchTo(book.cur); return;
    }
    const old = JSON.parse(localStorage.getItem(OLD_KEY));
    if(old && Array.isArray(old.roster) && !old.isSample){
      const r = newRoster("My roster", old.roster.map(normalize)); r.saved = old.saved||[]; r.tests = old.tests||[];
      book = {rosters:[r, sampleRoster()], cur:r.id}; switchTo(r.id); return;
    }
  }catch(e){}
  const s = sampleRoster(); book = {rosters:[s], cur:s.id}; switchTo(s.id);
}
function persist(){
  // Stamp a roster when its contents change, so the newer copy wins when devices sync.
  book.rosters.forEach(r=>{ const h = cloudData(r); if(localHash[r.id]!==h){ if(localHash[r.id]!==undefined) r.updatedAt = Date.now(); localHash[r.id] = h; } });
  try{ localStorage.setItem(KEY, JSON.stringify(book)); }catch(e){}
  schedulePush();
}
const localHash = {};
const cloudData = r => JSON.stringify({name:r.name, roster:r.roster, saved:r.saved, tests:r.tests});

/* ---------- accounts and cloud saves ---------- */
// The publishable key is meant to sit in a web page.  Row-level security limits each person to their own rosters.
const SUPABASE_URL = "https://ilxsncixoottqertdzdc.supabase.co";
const SUPABASE_KEY = "sb_publishable_d5DjY_520RU46309FOAXyw_1vVm8uyN";
const cloud = {client:null, user:null, timer:null, busy:false, again:false, hash:{}, deleted:[]};

function cloudInit(){
  if(framed || !window.supabase){ $("acctBox").hidden = true; return; }
  cloud.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  cloud.client.auth.onAuthStateChange((event, session)=>{
    const u = session ? session.user : null, changed = (u&&u.id) !== (cloud.user&&cloud.user.id);
    cloud.user = u; renderAcct();
    if(u && changed) setTimeout(cloudPull, 0);   // never call Supabase inside this callback
  });
}
function setSync(msg, bad){ const s=$("syncStatus"); s.textContent = msg||""; s.style.color = bad ? "var(--bad)" : ""; }
function renderAcct(){
  $("acctBtn").textContent = cloud.user ? "Account" : "Sign in to save";
  if(!cloud.user) setSync("");
}
function schedulePush(){ if(!cloud.user) return; clearTimeout(cloud.timer); cloud.timer = setTimeout(cloudPush, 1200); }
async function cloudPush(){
  if(!cloud.user) return;
  if(cloud.busy){ cloud.again = true; return; }
  cloud.busy = true; setSync("Saving…");
  try{
    const changed = book.rosters.filter(r=>!r.isSample && cloud.hash[r.id]!==cloudData(r));
    if(changed.length){
      const rows = changed.map(r=>({client_id:r.id, name:String(r.name).slice(0,100), data:{roster:r.roster, saved:r.saved, tests:r.tests},
        updated_at:new Date(r.updatedAt||Date.now()).toISOString()}));
      const {error} = await cloud.client.from("rosters").upsert(rows, {onConflict:"user_id,client_id"});
      if(error) throw error;
      changed.forEach(r=>{ cloud.hash[r.id] = cloudData(r); });
    }
    const gone = cloud.deleted.splice(0);
    if(gone.length){ const {error} = await cloud.client.from("rosters").delete().in("client_id", gone); if(error){ cloud.deleted.push(...gone); throw error; } }
    setSync("Saved to your account");
  }catch(e){ setSync("Couldn't reach your account.  Your changes are saved on this device and will sync later.", true); }
  cloud.busy = false;
  if(cloud.again){ cloud.again = false; schedulePush(); }
}
async function cloudPull(){
  setSync("Loading your rosters…");
  const {data, error} = await cloud.client.from("rosters").select("client_id,name,data,updated_at");
  if(error){ setSync("Couldn't reach your account.  Showing what is saved on this device.", true); return; }
  data.forEach(row=>{
    const remote = {id:row.client_id, name:row.name, roster:(row.data.roster||[]).map(normalize), saved:row.data.saved||[], tests:row.data.tests||[], isSample:false, updatedAt:Date.parse(row.updated_at)};
    const i = book.rosters.findIndex(r=>r.id===row.client_id);
    if(i<0) book.rosters.push(remote);
    else if((book.rosters[i].updatedAt||0) <= remote.updatedAt) book.rosters[i] = remote;  // newer copy wins
    cloud.hash[remote.id] = cloudData(remote); localHash[remote.id] = cloudData(book.rosters[i<0?book.rosters.length-1:i]);
  });
  if(state.isSample && data.length) switchTo(data[0].client_id);
  else switchTo(book.cur);
  try{ localStorage.setItem(KEY, JSON.stringify(book)); }catch(e){}
  renderAll(); cloudPush();
}
function accountDialog(){
  if(cloud.user){
    openDialog(`<h2 style="font-size:18px">Your account</h2>
      <p>Signed in as <b>${esc(cloud.user.email||"")}</b>.  Your rosters save to your account and follow you to any device you sign in on.</p>
      <div class="dlg-foot"><button class="btn danger" type="button" id="acDelete">Delete my account</button>
        <div class="row"><button class="btn" type="button" data-close>Close</button><button class="btn primary" type="button" id="acOut">Sign out</button></div></div>
      <p class="hint" id="acMsg"></p>`,()=>{});
    $("acOut").onclick = async ()=>{ await cloud.client.auth.signOut(); $("dlg").close(); toast("Signed out.  Your rosters stay on this device."); };
    $("acDelete").onclick = async e=>{
      if(!armed(e.currentTarget)) return;
      const {error} = await cloud.client.rpc("delete_my_account");
      if(error){ $("acMsg").textContent = "That didn't work.  Try again in a moment."; return; }
      await cloud.client.auth.signOut(); $("dlg").close(); toast("Account deleted.  Your rosters stay on this device only.");
    };
    return;
  }
  openDialog(`<h2 style="font-size:18px">Save your rosters to an account</h2>
    <p class="hint">Sign in to keep your rosters safe and use them on any device.  Everything still works without an account.</p>
    <div class="seg"><label><input type="radio" name="acMode" value="in" checked>I have an account</label><label><input type="radio" name="acMode" value="up">Create an account</label></div>
    <div class="fgrid">
      <label>Email<input type="email" id="acEmail" autocomplete="email" required></label>
      <label>Password<input type="password" id="acPass" autocomplete="current-password" minlength="6" required></label>
    </div>
    <p class="hint" id="acMsg" style="color:var(--bad)"></p>
    <div class="dlg-foot"><span class="hint">Use at least 6 characters.</span><div class="row"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit" id="acGo">Sign in</button></div></div>`,
  ()=>{
    const mode = document.querySelector("input[name=acMode]:checked").value, email = $("acEmail").value.trim(), password = $("acPass").value;
    $("acGo").disabled = true; $("acMsg").textContent = "";
    (async ()=>{
      const fn = mode==="up" ? cloud.client.auth.signUp({email, password}) : cloud.client.auth.signInWithPassword({email, password});
      const {data, error} = await fn;
      $("acGo").disabled = false;
      if(error){
        const m = /invalid login/i.test(error.message) ? "That email and password don't match an account.  Check them, or choose Create an account."
          : /already registered/i.test(error.message) ? "That email already has an account.  Choose I have an account."
          : /password/i.test(error.message) ? "Choose a password with at least 6 characters."
          : "That didn't work: "+error.message;
        $("acMsg").textContent = m; return;
      }
      if(!data.session){ $("acMsg").textContent = "Account created, but it needs email confirmation before you can sign in."; return; }
      $("dlg").close(); toast(mode==="up" ? "Account created.  Your rosters are saving to it." : "Signed in.  Loading your rosters.");
    })();
    return false;
  });
  document.querySelectorAll("input[name=acMode]").forEach(r=>r.onchange=()=>{
    const up = r.value==="up" && r.checked; $("acGo").textContent = up ? "Create account" : "Sign in";
    $("acPass").autocomplete = up ? "new-password" : "current-password";
  });
}

function uid(){ return "d-"+Math.random().toString(36).slice(2,9); }
function mapTag(t){
  t = String(t).trim(); if(!t) return null;
  const w = /^wants[\s-]+(.+)$/i.exec(t); if(w) return "wants-"+w[1].toLowerCase().replace(/\s+/g,"");
  const l = t.toLowerCase();
  if(/^(applies|gives)-/.test(l) || l.startsWith("vg:") || l.includes("@")) return l;
  return WORD_TAG[l] || l;
}
// Accepts this app's format, the catalog shape, and other tools' exports (dmg, star, level, troops, aff).
function normalize(d){
  const c = catOf(d) || {}, low = v => String(v||"").toLowerCase();
  const pick = (...v) => v.find(x=>x!==undefined && x!==null && x!=="");
  const src = d.affinity || d.aff || c.affinity || {};
  const aff = {}; TROOPS.forEach(t=>{ const v = src[t]; aff[t] = v==="+"||v==="-" ? v : v==="−" ? "-" : 0; });
  const rarity = low(pick(d.rarity, c.rarity)), breed = low(pick(d.breed, c.breed)), role = low(pick(d.role, c.role)), dmg = low(pick(d.damageType, d.dmg, c.damageType));
  let hl = Array.isArray(d.habitLevels) ? d.habitLevels.slice(0,5).map(x=>Math.max(0,Math.min(5,+x||0))) : null;
  const star = Math.max(0, +pick(d.starRank,d.star)||0);
  if(!hl) hl = HABIT_STARS.map(s=>star>=s?1:0);
  while(hl.length<5) hl.push(0);
  return {
    id: d.id || uid(), name: String(pick(d.name,"Unnamed")).trim(),
    rarity: RARITIES.includes(rarity) ? rarity : "rare",
    breed: ["warrior","hunter","sentinel","champion"].includes(breed) ? breed : "warrior",
    role: Object.keys(ROLE_FIT.left).includes(role) ? role : "physical",
    damageType: ["physical","fire","tactical"].includes(dmg) ? dmg : "physical",
    power: Math.max(0, +d.power||0), starRank: star,
    reignLevel: Math.max(0, +pick(d.reignLevel,d.level)||0), troopCapacity: Math.max(0, +pick(d.troopCapacity,d.troops)||0),
    isNew: !!d.isNew, active: d.active!==false, affinity: aff,
    // Drop imported tags the catalog already knows, so an export from another tool cannot bypass a star gate.
    tags: Array.isArray(d.tags) ? d.tags.map(mapTag).filter(Boolean).filter(t=>!(c.tags||[]).map(x=>mapTag(x).split("@")[0]).includes(t.split("@")[0])) : [],
    habits: d.habits || (d.habitLevels && !Array.isArray(d.habitLevels) ? d.habitLevels : undefined),
    habitLevels: hl, notes: String(d.notes||"").trim()===String(c.notes||"").trim() ? "" : String(d.notes||""),
    speed: SPEEDS.includes(d.speed) ? d.speed : (SPEEDS.includes(c.speed) ? c.speed : ""),
    xp: Array.isArray(d.xp) && d.xp.length===2 ? d.xp.map(x=>Math.max(0,+x||0)) : null
  };
}
// Power the scorer uses.  A dragon with no power entered gets an estimate from rarity and stars.
const EST_BASE = {rare:18000, epic:26000, legendary:34000, mythic:42000};
const isEst = d => !(d.power>0);
const P = d => d.power>0 ? d.power : EST_BASE[d.rarity] + 1500*Math.max(1,d.starRank);
const byId = id => state.roster.find(d=>d.id===id);
const findDragon = (key, list) => { list = list||state.roster; const k = String(key||"").toLowerCase(); return list.find(d=>d.id.toLowerCase()===k) || list.find(d=>d.name.toLowerCase()===k); };
function importTests(list, roster){
  return list.map(t=>{
    const ids = [t.left,t.vanguard,t.right].map(k=>{ const d=findDragon(k, roster); return d?d.id:null; });
    if(ids.some(x=>!x) || !(+t.inGamePower>0)) return null;
    return {ids, troop: TROOPS.includes(t.troop)?t.troop:null, inGame:+t.inGamePower, kept:!!t.kept};
  }).filter(Boolean);
}

/* ---------- evidence from in-game results ---------- */
const basePower = ids => ids.reduce((s,id)=>s+(byId(id)?P(byId(id)):0),0);
const testBonus = t => t.inGame / basePower(t.ids) - 1;
function exactTest(ids, troop){
  for(let i=state.tests.length-1;i>=0;i--){ const t=state.tests[i];
    if(t.ids.every((x,k)=>x===ids[k]) && (!t.troop || t.troop===troop)) return t; }
  return null;
}
function sameTrioTest(ids){
  const k = ids.slice().sort().join();
  for(let i=state.tests.length-1;i>=0;i--){ if(state.tests[i].ids.slice().sort().join()===k) return state.tests[i]; }
  return null;
}
function pairTests(a, bs){ return state.tests.filter(t=>t.ids.includes(a) && bs.some(b=>t.ids.includes(b))); }
const pct1 = x => (x>=0?"+":"")+(x*100).toFixed(1)+"%";

/* ---------- scoring ---------- */
// Tags without "@N" come from the Command and are always on.  "@N" tags come from a habit and stay
// locked until the dragon reaches N stars.
function allTags(d){ const c = catOf(d) || {}; return (c.tags||[]).concat(d.tags).map(mapTag).filter(Boolean); }
function effTags(d){
  return new Set(allTags(d).filter(t=>{ const p=t.split("@"); return p.length<2 || d.starRank >= +p[1]; }).map(t=>t.split("@")[0]));
}
// How strongly each active tag applies.  Command tags count 1x.  A habit tag scales with that habit's
// upgrade level: level 1 counts 1x and level 5 counts 2x, matching how habit values roughly double.
function tagWeights(d){
  const m = new Map();
  allTags(d).forEach(t=>{
    const p = t.split("@"); let w = 1;
    if(p.length===2){ const s=+p[1]; if(d.starRank < s) return; const lvl = Math.max(1, +d.habitLevels[HABIT_STARS.indexOf(s)]||1); w = 1 + 0.25*(Math.min(5,lvl)-1); }
    m.set(p[0], Math.max(m.get(p[0])||0, w));
  });
  return m;
}
const habitNote = w => w>1 ? " (×"+w.toFixed(2).replace(/\.?0+$/,"")+" for habit level)" : "";
function lockedTags(d){
  const m = new Map();
  allTags(d).forEach(t=>{ const p=t.split("@"); if(p.length===2 && d.starRank < +p[1] && !m.has(p[0])) m.set(p[0], +p[1]); });
  return m;
}
function notePref(d){
  const c = catOf(d); if(c && c.pos && !d.notes) return c.pos;
  const n = d.notes || (c&&c.notes) || "";
  if(/\b(best|ideal|wants|prefers)\b[^.]{0,14}\bleft[- ]flank/i.test(n)) return "left";
  if(/\b(best|ideal|wants|prefers)\b[^.]{0,14}\bright[- ]flank/i.test(n)) return "right";
  if(/(vanguard core|run in the vanguard|free-to-play vanguard|anchor \w+ in the vanguard)/i.test(n)) return "vanguard";
  return c ? c.pos : null;
}
function prep(d){ return {d, tags:effTags(d), w:tagWeights(d), locked:lockedTags(d), pref:notePref(d), p:P(d)}; }
const tagW = (p, tag) => p.w.get(tag) || 1;
const provW = (p, x, w) => x==="sentinel" ? 1 : Math.max(1, ...provKeys(x,w).filter(k=>p.tags.has(k)).map(k=>tagW(p,k)));
const r1 = x => Math.round(x*10)/10;
const provKeys = (x, w) => ["applies-"+x,"gives-"+x,x].concat(w&&w.also||[]);
function provides(p, x, w){
  if(x==="sentinel") return p.d.breed==="sentinel";
  return provKeys(x,w).some(k=>p.tags.has(k));
}
// The star rank at which this dragon would start providing x, or 0 if it never does.
function providesAt(p, x, w){
  if(x==="sentinel") return 0;
  const s = provKeys(x,w).map(k=>p.locked.get(k)).filter(Boolean);
  return s.length ? Math.min(...s) : 0;
}
function matchup(troop, enemy){
  if(!enemy) return 0;
  if(TROOP_BEATS[troop].includes(enemy)) return 1;
  if(troop==="siege" || TROOP_BEATS[enemy].includes(troop)) return -1;
  return 0;
}

// team: [left, vanguard, right] prepared dragons.  Returns theory (fit) and facts (base, measured bonus).
function scoreTeam(team, troop, goal){
  const lines = []; let sum = 0;
  team.forEach((p,i)=>{
    const pos = POS[i], d = p.d;
    let fit = (ROLE_FIT[pos][d.role]||0) + (BREED_FIT[pos][d.breed]||0);
    if(p.pref) fit += p.pref===pos ? 5 : -3;
    let aff = AFF_PCT[String(d.affinity[troop])] || 0;
    if(goal==="siege") aff *= 2;
    const val = p.p * (1 + (fit+aff)/100);
    sum += val;
    lines.push({k:"dragon", name:d.name, pos, fit, aff, troop, val});
  });
  let syn = 0; const pairs = [];
  const add = (pct, txt, pair)=>{ syn += pct; lines.push({k:"team", pct, txt, pair}); if(pair) pairs.push(pair); };
  const has = tag => team.some(p=>p.tags.has(tag));
  team.forEach((p,i)=>{
    const n = p.d.name;
    p.tags.forEach(tag=>{
      if(!tag.startsWith("wants-")) return;
      const x = tag.slice(6), w = WANTS[x] || {pct:4, txt:"gets the "+x+" it wants"};
      const prov = team.filter((q,j)=>(j!==i || w.self) && provides(q,x,w));
      if(prov.length){
        const mult = Math.min(2.5, tagW(p,tag) * Math.max(...prov.map(q=>provW(q,x,w))));
        add(r1(w.pct*mult), n+" "+w.txt+" ("+prov.map(q=>q.d.name).join(", ")+")"+habitNote(mult), [p.d.id, prov.map(q=>q.d.id)]); return;
      }
      const later = team.map((q,j)=>(j!==i || w.self) ? [q, providesAt(q,x,w)] : [q,0]).filter(a=>a[1]).sort((a,b)=>a[1]-b[1])[0];
      if(later) lines.push({k:"team", pct:0, txt:n+" "+w.txt+" once "+later[0].d.name+" reaches "+later[1]+"★ (locked now)"});
      else if(w.missTxt) add(w.miss||0, n+" "+w.missTxt);
    });
    p.locked.forEach((s,tag)=>{ if(tag.startsWith("wants-") && team.some((q,j)=>j!==i && provides(q,tag.slice(6),WANTS[tag.slice(6)])))
      lines.push({k:"team", pct:0, txt:n+" would use "+team.find((q,j)=>j!==i && provides(q,tag.slice(6),WANTS[tag.slice(6)])).d.name+"'s "+tag.slice(6)+" once "+n+" reaches "+s+"★ (locked now)"}); });
    const sw = Math.max(0, ...team.filter(q=>q.tags.has("sustain")).map(q=>tagW(q,"sustain")));
    if(p.tags.has("long-fight")) has("sustain") ? add(r1(4*sw), n+" scales in long fights, and this army has sustain to get there"+habitNote(sw)) : add(-3, n+" scales in long fights but this army has no sustain");
    if(p.tags.has("fire-buff")){ const f = team.filter((q,j)=>j!==i && q.d.damageType==="fire").length; if(f) add(3*f, n+"'s fire buff lifts "+f+" fire-dealing all"+(f>1?"ies":"y")); }
  });
  const vg = team[1];
  vg.tags.forEach(tag=>{
    const m = /^vg:(left|right):(physical|fire|tactical)$/.exec(tag);
    if(m && vg.d.reignLevel>=16){ const fl = team[m[1]==="left"?0:2]; if(fl.d.damageType===m[2]) add(5, vg.d.name+"'s Vanguard skill boosts "+fl.d.name+"'s "+m[2]+" damage on the "+POS_LABEL[m[1]]); }
  });
  if(!has("sustain") && !team.some(p=>p.d.role==="tank" || p.d.role==="healer")) add(-5, "No tank, healer, or sustain in this army");
  if(team[0].d.role===team[1].d.role && team[1].d.role===team[2].d.role) add(-5, "All three dragons fill the same role");
  const mu = matchup(troop, ctx.enemy);
  if(mu>0) add(COUNTER_PCT, cap(troop)+" beat the enemy's "+ctx.enemy+" (size of the edge is our guess)");
  if(mu<0) add(-COUNTER_PCT, cap(troop)+(troop==="siege"?" are weak against every troop type":" lose to the enemy's "+ctx.enemy)+" (size of the edge is our guess)");

  const ids = team.map(p=>p.d.id), base = team.reduce((s,p)=>s+p.p,0);
  const fitPct = (sum*(1+syn/100)/base - 1)*100;
  // Facts first: an exact in-game result, then the same three dragons in another setup.
  let bonus = 0, possible = 0, evidence = "untested", evTxt = "";
  const ex = exactTest(ids, troop), trio = !ex && sameTrioTest(ids);
  if(ex){ bonus = testBonus(ex); evidence = "measured"; evTxt = "Measured in game"; }
  else if(trio){ bonus = testBonus(trio); evidence = "likely"; evTxt = "Likely "+pct1(bonus)+": these three dragons measured "+fmt(trio.inGame)+" in game in another setup"; }
  else {
    // A pairing that earned a bonus in a different army is a lead to test, not power you have.
    pairs.forEach(([a,bs])=>{ pairTests(a,bs).forEach(t=>{ const b=testBonus(t); if(b>possible+0.001){ possible=b; evidence="possible"; evTxt="Could gain "+pct1(b)+": this pairing earned it in game with "+t.ids.map(id=>byId(id).name).join(" / ")+".  Test it to confirm."; } }); });
  }
  const armyPower = Math.round(base*(1+bonus));
  let score;
  if(goal==="fit" || goal==="siege") score = base*(1+fitPct/100)*(1+bonus);
  else score = armyPower*(1+fitPct/2000+possible/4);
  return {ids, troop, base, armyPower, bonus, possible, evidence, evTxt, fitPct, syn, lines, score, mu, estimated: team.some(p=>isEst(p.d))};
}

const PERMS = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
function troopsFor(troopOpt, goal){ return goal==="siege" ? ["siege"] : troopOpt==="auto" ? TROOPS : [troopOpt]; }
function bestArrangement(preps, troopOpt, goal){
  let best = null;
  for(const pm of PERMS){ const team = pm.map(k=>preps[k]);
    for(const t of troopsFor(troopOpt, goal)){ const r = scoreTeam(team, t, goal); if(!best || r.score>best.score) best = r; } }
  return best;
}
function evaluate(ids, troop, goal){ return scoreTeam(ids.map(id=>prep(byId(id))), troop, goal); }

function optimize(pool, k, troopOpt, goal){
  const Pp = pool.map(prep), n = Pp.length, cache = new Map();
  const evalIdx = (a,b,c)=>{ const s=[a,b,c].sort((x,y)=>x-y), key=s.join(","); let r=cache.get(key); if(!r){ r=bestArrangement(s.map(i=>Pp[i]), troopOpt, goal); cache.set(key,r); } return r; };
  const objective = armies => { const sc = armies.map(a=>evalIdx(...a).score); const s = sc.reduce((x,y)=>x+y,0); return goal==="even" ? Math.min(...sc)*1e3 + s : s; };
  let armies = [];
  if(goal==="even"){
    const order = Pp.map((p,i)=>i).sort((a,b)=>Pp[b].p-Pp[a].p).slice(0,k*3);
    armies = Array.from({length:k},()=>[]);
    order.forEach((idx,j)=>{ const round = Math.floor(j/k), pos = j%k; armies[round%2 ? k-1-pos : pos].push(idx); });
  } else {
    const used = new Set();
    for(let a=0;a<k;a++){
      let best=null, bt=null;
      for(let i=0;i<n;i++){ if(used.has(i)) continue;
        for(let j=i+1;j<n;j++){ if(used.has(j)) continue;
          for(let l=j+1;l<n;l++){ if(used.has(l)) continue; const r = evalIdx(i,j,l); if(!best || r.score>best.score){ best=r; bt=[i,j,l]; } } } }
      bt.forEach(x=>used.add(x)); armies.push(bt);
    }
  }
  // Swap pass: trade any slotted dragon with a benched one or with another army until nothing improves.
  let cur = objective(armies), improved = true, passes = 0;
  while(improved && passes++ < 40){
    improved = false;
    const inArmy = new Set(armies.flat());
    for(let a=0;a<armies.length;a++) for(let s=0;s<3;s++){
      for(let c=0;c<n;c++){
        if(c===armies[a][s]) continue;
        const trial = armies.map(x=>x.slice());
        if(inArmy.has(c)){ let b=-1,t=-1; trial.forEach((x,bi)=>{ const ti=x.indexOf(c); if(ti>=0){b=bi;t=ti;} }); if(b===a) continue; trial[b][t]=armies[a][s]; }
        trial[a][s]=c;
        const v = objective(trial);
        if(v>cur+0.5){ armies=trial; cur=v; improved=true; inArmy.clear(); armies.flat().forEach(x=>inArmy.add(x)); }
      }
    }
  }
  return armies.map(a=>evalIdx(...a)).sort((x,y)=>y.score-x.score).map(r=>({ids:r.ids, troop:r.troop}));
}

// Pairings the roster says should work but that no in-game result covers yet.
function suggestions(){
  const act = state.roster.filter(d=>d.active), Pp = act.map(prep), out = [];
  Pp.forEach(p=>p.tags.forEach(tag=>{
    if(!tag.startsWith("wants-")) return; const x = tag.slice(6), w = WANTS[x];
    Pp.forEach(q=>{
      if(q===p || !provides(q,x,w) || pairTests(p.d.id,[q.d.id]).length) return;
      let best=null;
      Pp.forEach(c=>{ if(c===p||c===q) return; const r=bestArrangement([p,q,c],"auto","fit"); if(!best||r.score>best.score) best=r; });
      if(best) out.push({key:p.d.id+">"+x, why:p.d.name+" wants "+x+", "+q.d.name+" provides it", r:best});
    });
  }));
  const bestPer = new Map(); out.forEach(s=>{ const cur=bestPer.get(s.key); if(!cur || s.r.score>cur.r.score) bestPer.set(s.key,s); });
  const seen = new Set();
  return [...bestPer.values()].sort((a,b)=>b.r.score-a.r.score).filter(s=>{ const k=s.r.ids.slice().sort().join(); if(seen.has(k)) return false; seen.add(k); return true; }).slice(0,4);
}

/* ---------- rendering ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = n => Math.round(n).toLocaleString("en-US");
const stars = n => "★".repeat(Math.min(n,10));
const sign = n => (n>0?"+":"")+n;
const cap = s => s ? s[0].toUpperCase()+s.slice(1) : s;
const powerHTML = d => isEst(d) ? `<span class="est" title="Estimated from rarity and stars.  Enter the real power for accurate results.">≈${fmt(P(d))}</span>` : fmt(d.power);
function toast(msg){ const t=$("toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast.h); toast.h=setTimeout(()=>t.hidden=true,2400); }

function renderRosterSel(){
  $("rosterSel").innerHTML = book.rosters.map(r=>`<option value="${r.id}" ${r.id===state.id?"selected":""}>${esc(r.name)} (${r.roster.length})</option>`).join("");
}
const RANK = {rarity:d=>RARITIES.indexOf(d.rarity), name:d=>d.name.toLowerCase(), breed:d=>d.breed, role:d=>d.role, speed:d=>-SPEEDS.indexOf(d.speed)};
function filtered(){
  const q=$("fSearch").value.trim().toLowerCase(), r=$("fRarity").value, b=$("fBreed").value, ro=$("fRole").value, tr=$("fTroop").value, so=$("fSort").value;
  const list = state.roster.filter(d=>(!q||d.name.toLowerCase().includes(q)) && (!r||d.rarity===r) && (!b||d.breed===b) && (!ro||d.role===ro) && (!tr||d.affinity[tr]==="+"));
  const key = RANK[so];
  return list.sort((x,y)=>{ if(key){ const a=key(x), c=key(y); if(a<c) return -1; if(a>c) return 1; } return P(y)-P(x); });
}
function renderRoster(){
  renderRosterSel();
  const list = filtered(), active = state.roster.filter(d=>d.active).length, est = state.roster.filter(isEst).length;
  $("rosterCount").textContent = active+" active of "+state.roster.length;
  $("sampleBanner").hidden = !state.isSample;
  $("roster").innerHTML = (est ? `<li style="display:block;font-size:13px;color:var(--muted);padding:8px 2px">${est} dragon${est>1?"s show":" shows"} an estimated power (≈).  Tap Edit and enter the real number for better results.</li>` : "") +
    (list.length ? list.map(d=>`<li class="${d.active?"":"off"} r-${d.rarity}">
      <span class="dot" title="${d.rarity}"></span>
      <div style="min-width:0"><div class="rn">${esc(d.name)}</div>
        <div class="rs">${d.breed} · ${d.role} · <span class="stars">${stars(d.starRank)}</span> · ${HABIT_STARS.filter(s=>d.starRank>=s).length}/5 habits${d.speed?" · "+d.speed:""} · lvl ${d.reignLevel}</div></div>
      <div class="pw num">${powerHTML(d)}</div>
      <div class="row" style="gap:4px"><label class="tog" title="Include in muster"><input type="checkbox" data-act="toggle" data-id="${d.id}" ${d.active?"checked":""} aria-label="Use ${esc(d.name)}"></label>
        <button class="btn sm" data-act="edit" data-id="${d.id}">Edit</button></div></li>`).join("")
    : `<li style="display:block;color:var(--muted);padding:16px 2px">${state.roster.length?"No dragons match.  Clear a filter.":"This roster is empty.  Press Add dragons to pick the ones you own."}</li>`);
  const max = Math.floor(active/3);
  $("armyMax").textContent = "up to "+Math.min(10,max)+" with "+active+" active";
  $("armyCount").max = Math.max(1,Math.min(10,max));
  renderBuilderSelects();
}

function slotHTML(d,pos){
  if(!d) return `<div class="slot empty ${pos==="vanguard"?"vg":""}"><span class="lbl">${POS_LABEL[pos]}</span>Empty</div>`;
  return `<div class="slot r-${d.rarity} ${pos==="vanguard"?"vg":""}"><span class="lbl">${POS_LABEL[pos]}</span>
    <div class="nm">${esc(d.name)}</div><div class="mt">${d.breed} · ${d.role}</div><div class="mt num">${powerHTML(d)} · ${stars(d.starRank)}</div></div>`;
}
function evidenceFor(pair){
  if(!pair) return "";
  const ts = pairTests(pair[0], pair[1]); if(!ts.length) return `<span class="ev" style="color:var(--muted)">Not tested in game yet</span>`;
  return ts.map(t=>{ const b=testBonus(t); return `<span class="ev ${b>0.005?"pos":"neg"}">In game: ${pct1(b)} with ${t.ids.map(id=>esc(byId(id).name)).join(" / ")}</span>`; }).join("");
}
function whyHTML(r){
  const rows = r.lines.map(l=>{
    if(l.k==="dragon"){ const pct=l.fit+l.aff; return `<tr><td><b>${esc(l.name)}</b> on ${POS_LABEL[l.pos]}: placement ${sign(l.fit)}%, ${l.troop} affinity ${sign(l.aff)}%${l.aff>0?" (the game's +20% stat boost)":""}</td><td class="num ${pct>0?"pos":pct<0?"neg":""}">${sign(pct)}%</td></tr>`; }
    return `<tr><td>${esc(l.txt)}${evidenceFor(l.pair)}</td><td class="num ${l.pct>0?"pos":l.pct<0?"neg":""}">${l.pct?sign(l.pct)+"%":"—"}</td></tr>`;
  }).join("");
  return `<details class="why"><summary>Why this lineup</summary>
    <p class="hint">Army power is base power plus any bonus you have measured in game.  Fighting fit is theory from each dragon's skills and the troop matchups.  Your in-game results override it.</p>
    <table><tr><td>Base power (sum of the three dragons)${r.estimated?", includes estimates":""}</td><td class="num">${fmt(r.base)}</td></tr>
    ${r.evidence==="measured"||r.evidence==="likely"?`<tr><td>${esc(r.evTxt)}</td><td class="num ${r.bonus>=0?"pos":"neg"}">${pct1(r.bonus)}</td></tr>`:""}
    ${r.evidence==="possible"?`<tr><td>${esc(r.evTxt)}</td><td class="num">not counted</td></tr>`:""}
    ${rows}<tr><td>Fighting fit total (theory)</td><td class="num">${sign(Math.round(r.fitPct))}%</td></tr></table></details>`;
}
function slowest(ds){
  const known = ds.filter(d=>d && d.speed); if(!known.length) return "";
  const s = known.reduce((a,b)=>SPEEDS.indexOf(b.speed)<SPEEDS.indexOf(a.speed)?b:a);
  return " · Slowest: "+esc(s.name)+" ("+s.speed.toLowerCase()+")";
}
function formationHTML(r, title, actions){
  const ds = r.ids.map(byId);
  const chip = r.evidence==="measured" ? `<span class="chip measured">Measured in game</span>` : r.evidence==="likely" ? `<span class="chip likely">Same dragons measured in another setup</span>` : r.evidence==="possible" ? `<span class="chip likely">Untested · could gain ${pct1(r.possible)}</span>` : `<span class="chip">Base power · untested</span>`;
  const vs = ctx.enemy ? ` · ${r.mu>0?"beats":r.mu<0?"weak to":"even with"} ${ctx.enemy}` : "";
  return `<article class="form"><div class="fh"><div><h3>${esc(title)}</h3><div class="troop">${r.troop} troops · ${ds.filter(d=>d&&d.affinity[r.troop]==="+").length} of 3 match${vs}</div></div>
    <div style="text-align:right"><div class="score num">${r.estimated&&r.evidence!=="measured"?"≈":""}${fmt(r.armyPower)}</div>${chip}</div></div>
    <div class="field">${POS.map((p,i)=>slotHTML(ds[i],p)).join("")}</div>
    <div class="fitline">Fighting fit ${sign(Math.round(r.fitPct))}% (theory)${slowest(ds)}</div>${whyHTML(r)}<div class="factions">${actions}</div></article>`;
}

function readOpts(){ return {goal:document.querySelector("input[name=goal]:checked").value, troop:$("troopSel").value, k:+$("armyCount").value||1}; }
function renderResults(){
  const el=$("results");
  if(!lastResults){ el.innerHTML = `<div class="empty-state">Pick a goal and press Build formations.  Each army is placed Left Flank, Vanguard, Right Flank, with its reasons underneath.</div>`; return; }
  const valid = lastResults.armies.filter(a=>a.ids.every(byId));
  if(!valid.length){ el.innerHTML = `<div class="empty-state">Your roster changed.  Press Build formations again.</div>`; return; }
  const armies = valid.map(a=>evaluate(a.ids,a.troop,lastResults.goal));
  const total = armies.reduce((s,a)=>s+a.armyPower,0), measured = armies.filter(a=>a.evidence==="measured").length;
  el.innerHTML = `<div class="summary"><span><b class="num">${armies.length}</b> armies</span><span>Total army power <b class="num">${fmt(total)}</b></span><span>Weakest <b class="num">${fmt(Math.min(...armies.map(a=>a.armyPower)))}</b></span><span><b class="num">${measured}</b> measured in game</span><span><b class="num">${lastResults.bench}</b> on the bench</span></div>
    <div class="forms">${armies.map((a,i)=>formationHTML(a,"Army "+(i+1),`<button class="btn sm" data-act="recordRes" data-i="${i}">Record in-game power</button><button class="btn sm" data-act="saveRes" data-i="${i}">Save</button><button class="btn sm" data-act="toBuilder" data-i="${i}">Tweak in builder</button><button class="btn sm ghost" data-act="codeRes" data-i="${i}">Copy code</button>`)).join("")}</div>`;
}
function run(){
  const o = readOpts();
  let pool = state.roster.filter(d=>d.active);
  if($("skipSaved").checked){ const s=new Set(state.saved.flatMap(f=>f.ids)); pool = pool.filter(d=>!s.has(d.id)); }
  const k = Math.min(o.k, Math.floor(pool.length/3), 10);
  if(k<1){ $("runStatus").textContent = "You need at least three active dragons."; return; }
  $("runStatus").textContent = "Building…"; $("runBtn").disabled = true;
  setTimeout(()=>{
    const t0 = performance.now();
    const armies = optimize(pool, k, o.troop, o.goal);
    lastResults = {armies, bench: pool.length - k*3, goal:o.goal};
    $("runStatus").textContent = "Checked every lineup and placement in "+Math.max(1,Math.round(performance.now()-t0))+" ms.";
    $("runBtn").disabled = false; renderResults();
  }, 30);
}

/* ---------- builder ---------- */
function renderBuilderSelects(){
  const opts = state.roster.slice().sort((a,b)=>P(b)-P(a));
  $("bField").innerHTML = POS.map((p,i)=>`<label style="display:flex;flex-direction:column;gap:3px;min-width:0"><span class="lbl">${POS_LABEL[p]}</span>
    <select id="bSel${i}" data-slot="${i}"><option value="">Choose a dragon</option>${opts.map(d=>`<option value="${d.id}" ${builder.ids[i]===d.id?"selected":""}>${esc(d.name)} (${isEst(d)?"≈":""}${fmt(P(d))})</option>`).join("")}</select></label>`).join("");
  renderBuilder();
}
function builderResult(){
  if(builder.ids.some(x=>!x || !byId(x)) || new Set(builder.ids).size<3) return null;
  const goal = readOpts().goal; let best=null;
  troopsFor(builder.troop, goal).forEach(t=>{ const r=evaluate(builder.ids,t,goal); if(!best||r.score>best.score) best=r; });
  return best;
}
function renderBuilder(){
  const r = builderResult();
  if(!r){ const dup = builder.ids.filter(Boolean).length===3 && new Set(builder.ids).size<3;
    $("bResult").innerHTML = `<div class="empty-state">${dup?"Each dragon can only fill one slot.":"Pick a dragon for each slot to see its army power and reasons."}</div>`; return; }
  $("bResult").innerHTML = formationHTML(r, "Your lineup", "");
}

/* ---------- saved, tests, codes ---------- */
function renderSaved(){
  $("savedCount").textContent = state.saved.length || "";
  if(!state.saved.length){ $("saved").innerHTML = `<div class="empty-state">Save any army or builder lineup to keep it here.</div>`; return; }
  $("saved").innerHTML = `<div class="forms">`+state.saved.map((f,i)=>{
    if(f.ids.some(id=>!byId(id))) return `<article class="form"><div class="saved-item"><b>${esc(f.name)}</b><span class="hint">A dragon in this formation was removed.</span><button class="btn sm danger" data-act="delSaved" data-i="${i}">Remove</button></div></article>`;
    return formationHTML(evaluate(f.ids, f.troop, "fit"), f.name, `<button class="btn sm" data-act="recordSaved" data-i="${i}">Record in-game power</button><button class="btn sm" data-act="toBuilderSaved" data-i="${i}">Open in builder</button><button class="btn sm ghost" data-act="codeSaved" data-i="${i}">Copy code</button><button class="btn sm ghost danger" data-act="delSaved" data-i="${i}">Delete</button>`);
  }).join("")+`</div>`;
}
function renderTests(){
  const ts = state.tests.map((t,i)=>({t,i})).filter(x=>x.t.ids.every(byId));
  $("testsCount").textContent = ts.length || "";
  $("tests").innerHTML = ts.length ? `<div class="tbl-wrap"><table class="log"><thead><tr><th>Left Flank / Vanguard / Right Flank</th><th>Troops</th><th class="r">Base</th><th class="r">In game</th><th class="r">Bonus</th><th></th></tr></thead><tbody>${
    ts.map(({t,i})=>{ const b=testBonus(t); return `<tr><td><b>${t.ids.map(id=>esc(byId(id).name)).join(" / ")}</b>${t.kept?' <span class="chip measured">in use</span>':""}</td><td>${t.troop?cap(t.troop):"Not recorded"}</td><td class="r num">${fmt(basePower(t.ids))}</td><td class="r num">${fmt(t.inGame)}</td><td class="r num ${b>0.005?"pos":b<-0.005?"neg":""}">${pct1(b)}</td><td class="r"><button class="btn sm ghost" data-act="toBuilderTest" data-i="${i}">Open</button><button class="btn sm ghost danger" data-act="delTest" data-i="${i}">Delete</button></td></tr>`; }).join("")
  }</tbody></table></div>` : `<div class="empty-state">No results yet.  Set an army in game, read its army power, and record it from any formation card.</div>`;
  const sg = suggestions();
  $("suggest").innerHTML = sg.length ? sg.map((s,i)=>`<div class="sugg"><div><b>${s.r.ids.map(id=>esc(byId(id).name)).join(" / ")}</b> · ${cap(s.r.troop)}<div class="hint" style="margin:0">${esc(s.why)}.  Base ${fmt(s.r.base)}.</div></div>
      <div class="row"><button class="btn sm" data-act="sugBuilder" data-i="${i}">Load in builder</button><button class="btn sm" data-act="sugRecord" data-i="${i}">Record result</button></div></div>`).join("")
    : `<p class="hint">Nothing waiting.  Every pairing your roster calls for has a result, or no dragon in it wants a partner.</p>`;
  renderTests.last = sg;
}
function recordDialog(ids, troop){
  const base = basePower(ids), est = ids.some(id=>isEst(byId(id)));
  openDialog(`<h2 style="font-size:18px">Record in-game army power</h2>
    <p><b>${ids.map(id=>esc(byId(id).name)).join(" / ")}</b><br><span class="hint">Left Flank / Vanguard / Right Flank.  Base power ${fmt(base)}.</span></p>
    ${est?`<p class="hint" style="color:var(--bad)">One of these dragons has an estimated power.  Enter its real power first, or the bonus will be wrong.</p>`:""}
    <div class="fgrid">
      <label>Army power shown in game<input type="number" id="recPower" min="1" required></label>
      <label>Troops<select id="recTroop"><option value="">Not recorded</option>${TROOPS.map(t=>`<option value="${t}" ${t===troop?"selected":""}>${cap(t)}</option>`).join("")}</select></label>
    </div>
    <label class="tog"><input type="checkbox" id="recKept"> I'm keeping this army</label>
    <p class="hint" id="recPrev"></p>
    <div class="dlg-foot"><span></span><div class="row"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Save result</button></div></div>`,
  ()=>{
    const p = +$("recPower").value; if(!(p>0)) return false;
    state.tests.push({ids:ids.slice(), troop:$("recTroop").value||null, inGame:p, kept:$("recKept").checked});
    state.isSample=false; persist(); renderAll(); toast("Result saved.  Rankings now use it.");
  });
  $("recPower").oninput = e=>{ const p=+e.target.value; $("recPrev").textContent = p>0 ? "Bonus over base: "+pct1(p/base-1) : ""; };
}
function saveFormation(r){
  state.saved.push({name:"Formation "+(state.saved.length+1), ids:r.ids.slice(), troop:r.troop}); state.isSample=false; persist(); renderSaved(); toast("Formation saved");
}
const b64e = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const b64d = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g,"+").replace(/_/g,"/")))));
function codeFor(ids,troop){ return "DFM:"+b64e({n:ids.map(id=>byId(id).name),t:troop}); }
async function copyText(txt, label){
  try{ await navigator.clipboard.writeText(txt); toast(label+" copied"); }
  catch(e){ openText(label, txt, "Copy this text."); }
}

/* ---------- roster sharing ---------- */
// Catalog dragons travel as their stats only; custom dragons travel whole.
function shareCode(){
  const d = state.roster.map(x=>catOf(x) ? [x.name,x.power,x.starRank,x.reignLevel,x.troopCapacity,x.active?1:0,x.habitLevels,x.speed,x.xp] : x);
  const t = state.tests.filter(t=>t.ids.every(byId)).map(t=>[...t.ids.map(id=>byId(id).name),t.troop,t.inGame,t.kept?1:0]);
  return "DFR:"+b64e({v:1,n:state.name,d,t});
}
function rosterFromShare(code){
  const o = b64d(code.trim().replace(/^.*?DFR:/,""));
  const roster = o.d.map(x=>normalize(Array.isArray(x) ? {name:x[0],power:x[1],starRank:x[2],reignLevel:x[3],troopCapacity:x[4],active:!!x[5],habitLevels:x[6],speed:x[7],xp:x[8]} : Object.assign({}, x, {id:undefined})));
  const r = newRoster(o.n ? o.n+" (shared)" : "Shared roster", roster);
  r.tests = importTests((o.t||[]).map(a=>({left:a[0],vanguard:a[1],right:a[2],troop:a[3],inGamePower:a[4],kept:a[5]})), roster);
  return r;
}
const framed = (()=>{ try{ return window.self!==window.top; }catch(e){ return true; } })();
function shareDialog(){
  const code = shareCode(), link = framed ? "" : location.href.split("#")[0]+"#share="+code.slice(4);
  openDialog(`<h2 style="font-size:18px">Share ${esc(state.name)}</h2>
    <p class="hint">${link?"Anyone who opens this link gets a copy of this roster, with its in-game results.  Nothing is uploaded; the roster rides inside the link.":"Send this code.  The other person pastes it into Import."}</p>
    <textarea id="shareOut" rows="5" readonly>${esc(link||code)}</textarea>
    <div class="dlg-foot"><span></span><div class="row"><button class="btn" type="button" data-close>Close</button><button class="btn primary" type="button" id="shareCopy">Copy ${link?"link":"code"}</button></div></div>`,()=>{});
  $("shareCopy").onclick = ()=>copyText(link||code, link?"Share link":"Share code");
}
function checkShareLink(){
  const m = /^#share=([A-Za-z0-9_-]+)$/.exec(location.hash); if(!m) return;
  try{ const r = rosterFromShare("DFR:"+m[1]); book.rosters.push(r); switchTo(r.id); persist(); toast("Shared roster added as "+r.name); }
  catch(e){ toast("That share link could not be read"); }
  try{ history.replaceState(null,"",location.pathname+location.search); }catch(e){}
}

/* ---------- dialogs ---------- */
function openDialog(html, onSubmit){
  const f=$("dlgForm"); f.innerHTML=html; f.onsubmit = e=>{ e.preventDefault(); if(onSubmit(e.submitter && e.submitter.value) !== false) $("dlg").close(); };
  f.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>$("dlg").close());
  $("dlg").showModal();
}
function openText(title, txt, hint){
  openDialog(`<h2 style="font-size:18px">${esc(title)}</h2><p class="hint">${esc(hint)}</p><textarea id="txtOut" rows="10" readonly>${esc(txt)}</textarea><div class="dlg-foot"><span></span><button class="btn primary" type="button" data-close>Done</button></div>`,()=>{});
  setTimeout(()=>{ const t=$("txtOut"); t.focus(); t.select(); },20);
}
function nameDialog(title, value, onOk){
  openDialog(`<h2 style="font-size:18px">${esc(title)}</h2><input type="text" id="nameIn" value="${esc(value)}" required style="width:100%">
    <div class="dlg-foot"><span></span><div class="row"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Save</button></div></div>`,
    ()=>{ const v=$("nameIn").value.trim(); if(!v) return false; onOk(v); });
  setTimeout(()=>$("nameIn").select(),20);
}
function catalogDialog(){
  const have = new Set(state.roster.map(d=>d.name.toLowerCase()));
  const avail = CATALOG.filter(c=>!have.has(c.name.toLowerCase())).sort((a,b)=>RARITIES.indexOf(a.rarity)-RARITIES.indexOf(b.rarity) || a.name.localeCompare(b.name));
  if(!avail.length){ toast("You already have every dragon in the list.  Use Custom dragon for a new one."); return; }
  openDialog(`<h2 style="font-size:18px">Add dragons you own</h2>
    <p class="hint">Tick the dragons in your Dragon Pit.  Each starts with an estimated power; enter the real number later from Edit for the best results.</p>
    <div class="row"><button class="btn sm" type="button" data-pick="all">All</button>${["legendary","epic","rare"].map(r=>`<button class="btn sm" type="button" data-pick="${r}">${cap(r)}s</button>`).join("")}<button class="btn sm ghost" type="button" data-pick="none">Clear</button></div>
    <div class="catlist">${avail.map(c=>`<label class="r-${c.rarity}"><input type="checkbox" value="${esc(c.name)}" data-rar="${c.rarity}"><span class="dot"></span><span><b>${esc(c.name)}</b><span class="rs">${c.rarity} · ${c.breed} · ${c.role}</span></span></label>`).join("")}</div>
    <div class="dlg-foot"><span class="hint" id="catCount">0 selected</span><div class="row"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Add selected</button></div></div>`,
  ()=>{
    const picked = [...$("dlgForm").querySelectorAll(".catlist input:checked")].map(i=>i.value);
    if(!picked.length) return false;
    picked.forEach(n=>state.roster.push(normalize({name:n, starRank:1, reignLevel:1})));
    state.isSample=false; persist(); renderAll(); toast(picked.length+" dragon"+(picked.length>1?"s":"")+" added.  Enter real power from Edit.");
  });
  const f = $("dlgForm"), count = ()=>{ $("catCount").textContent = f.querySelectorAll(".catlist input:checked").length+" selected"; };
  f.querySelectorAll("[data-pick]").forEach(b=>b.onclick=()=>{ const p=b.dataset.pick; f.querySelectorAll(".catlist input").forEach(i=>{ if(p==="all") i.checked=true; else if(p==="none") i.checked=false; else if(i.dataset.rar===p) i.checked=true; }); count(); });
  f.querySelector(".catlist").onchange = count;
}
function editDragon(id){
  const isNew = !id; const d = isNew ? normalize({name:"",power:0,starRank:1,reignLevel:1}) : byId(id);
  const c = catOf(d);
  const sel = (name,vals,cur)=>`<select name="${name}" id="e_${name}">${vals.map(v=>`<option ${v===cur?"selected":""}>${v}</option>`).join("")}</select>`;
  const defTags = c ? c.tags.join(", ") : "";
  const levels = d.habitLevels.slice();
  openDialog(`<h2 style="font-size:18px">${isNew?"Add a custom dragon":"Edit "+esc(d.name)}</h2>
    <p class="hint" style="margin:0"><b id="e_stage">${stage(d.starRank)}</b>${d.xp&&d.reignLevel<50?` · Level ${d.reignLevel}, ${fmt(d.xp[0])} of ${fmt(d.xp[1])} XP to the next`:""}</p>
    ${c?`<p class="hint" style="margin:0">${esc(c.notes)}</p>`:""}
    <div class="fgrid">
      <label>Name<input type="text" name="name" id="e_name" required value="${esc(d.name)}"></label>
      <label>Power<input type="number" name="power" id="e_power" min="0" value="${d.power||""}" placeholder="≈${fmt(P(d))}"></label>
      <label>Star rank<input type="number" name="starRank" id="e_starRank" min="0" max="10" value="${d.starRank}"></label>
      <label>Reign level<input type="number" name="reignLevel" id="e_reignLevel" min="0" value="${d.reignLevel}"></label>
      <label>Troop capacity<input type="number" name="troopCapacity" id="e_troopCapacity" min="0" step="any" value="${d.troopCapacity}"></label>
      <label>Speed<select name="speed" id="e_speed"><option value="">Not recorded</option>${SPEEDS.map(v=>`<option ${v===d.speed?"selected":""}>${v}</option>`).join("")}</select></label>
      <label>XP toward next level<input type="number" name="xpCur" id="e_xpCur" min="0" value="${d.xp?d.xp[0]:""}" placeholder="${d.reignLevel>=50?"Max level":""}"></label>
      <label>XP needed<input type="number" name="xpNeed" id="e_xpNeed" min="0" value="${d.xp?d.xp[1]:""}"></label>
      <label>Rarity${sel("rarity",RARITIES,d.rarity)}</label>
      <label>Breed${sel("breed",["warrior","hunter","sentinel","champion"],d.breed)}</label>
      <label>Role${sel("role",["tank","healer","physical","fire","tactical","control"],d.role)}</label>
      <label>Damage type${sel("damageType",["physical","fire","tactical"],d.damageType)}</label>
    </div>
    <div id="e_habits"></div>
    <div><div class="lbl" style="margin-bottom:4px">Troop affinity</div><div class="fgrid">${TROOPS.map(t=>`<label style="text-transform:capitalize">${t}<select name="aff_${t}" id="e_aff_${t}">${[["+","+ bonus"],["0","neutral"],["-","− penalty"]].map(([v,l])=>`<option value="${v}" ${String(d.affinity[t])===v?"selected":""}>${l}</option>`).join("")}</select></label>`).join("")}</div></div>
    <label style="display:flex;flex-direction:column;gap:3px;font-size:13px;font-weight:600">Extra abilities and synergy tags<input type="text" name="tags" id="e_tags" value="${esc(d.tags.join(", "))}"><span class="hint" style="font-weight:400">${defTags?"Built in for "+esc(d.name)+": "+esc(defTags)+".  ":""}${esc(TAG_HELP)}</span></label>
    <label style="display:flex;flex-direction:column;gap:3px;font-size:13px;font-weight:600">Your notes<textarea name="notes" id="e_notes" rows="3">${esc(d.notes)}</textarea></label>
    <label class="tog"><input type="checkbox" name="active" id="e_active" ${d.active?"checked":""}> Include in muster</label>
    <div class="dlg-foot"><div class="row">${isNew?"":`<button class="btn danger" type="submit" value="delete" id="e_del">Remove from roster</button>`}</div>
      <div class="row"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit" value="save">Save</button></div></div>`,
  (action)=>{
    const f=$("dlgForm");
    if(action==="delete"){
      const b=$("e_del"); if(b.dataset.armed!=="1"){ b.dataset.armed="1"; b.textContent="Press again to remove"; return false; }
      state.roster = state.roster.filter(x=>x.id!==d.id); builder.ids = builder.ids.map(x=>x===d.id?null:x);
      state.isSample=false; persist(); renderAll(); toast(d.name+" removed"); return;
    }
    const v = n => f.elements[n].value;
    const nd = normalize({ id:d.id, name:v("name"), rarity:v("rarity"), breed:v("breed"), role:v("role"), damageType:v("damageType"),
      power:v("power"), starRank:v("starRank"), reignLevel:v("reignLevel"), troopCapacity:v("troopCapacity"), isNew:d.isNew, speed:v("speed"), xp:(+v("xpNeed")>0 ? [v("xpCur"), v("xpNeed")] : null),
      active:f.elements.active.checked, habits:d.habits, habitLevels:HABIT_STARS.map((s,i)=>(+v("starRank")||0)>=s ? Math.max(1,levels[i]||1) : 0), notes:v("notes"),
      tags:v("tags").split(",").map(s=>s.trim()).filter(Boolean),
      affinity:Object.fromEntries(TROOPS.map(t=>[t, v("aff_"+t)==="0"?0:v("aff_"+t)])) });
    if(isNew) state.roster.push(nd); else state.roster[state.roster.findIndex(x=>x.id===d.id)] = nd;
    state.isSample=false; persist(); renderAll(); toast(isNew?"Dragon added":"Saved");
  });
  const draw = ()=>{ renderHabitBox(levels); $("e_stage").textContent = stage(+$("e_starRank").value||0); };
  $("e_starRank").addEventListener("input", draw);
  $("e_name").addEventListener("change", draw);
  draw();
}

// What each synergy tag means, for the habit list.
const TAG_LABEL = {"applies-burn":"applies Burn","applies-panic":"applies Panic","applies-slow":"applies Slow","applies-control":"applies control",
  "applies-bleed":"applies Bleed","gives-advantage":"grants Advantage","gives-firststrike":"grants First Strike","sustain":"heals or protects","anti-fire":"fire defense"};
const tagLabel = t => TAG_LABEL[t] || (t.startsWith("wants-") ? "gets more from "+t.slice(6) : t);
function renderHabitBox(levels){
  const star = Math.max(0, +$("e_starRank").value||0), c = catOf({name:$("e_name").value}) || {};
  const names = c.habits || [];
  const unlocked = HABIT_STARS.filter(s=>star>=s).length;
  // Habits that feed a synergy the planner scores, keyed by index.
  const feeds = HABIT_STARS.map(s=>(c.tags||[]).filter(t=>t.endsWith("@"+s)).map(t=>tagLabel(mapTag(t).split("@")[0])));
  const open = HABIT_STARS.map((s,i)=>star>=s && (levels[i]||1)<5 ? i : -1).filter(i=>i>=0);
  const pick = open.find(i=>feeds[i].length);
  const tip = !unlocked ? "No habits unlocked yet.  The first one opens at 2★."
    : !open.length ? (unlocked<5 ? "Every unlocked habit is at level 5.  Star this dragon up to open the next one." : "Every habit is maxed.")
    : pick!==undefined ? "Upgrade first: "+(names[pick]||"Habit "+(pick+1))+".  It "+feeds[pick].join(" and ")+", which the planner counts in team synergy."
    : "None of the unlocked habits feed a team synergy the planner scores, so upgrade whichever suits how you play.";
  $("e_habits").innerHTML = `<div class="lbl" style="margin-bottom:4px">Habits</div>
    <p class="hint" style="margin:0 0 6px">${unlocked} of 5 unlocked at ${star}★${unlocked<5?".  The next opens at "+HABIT_STARS[unlocked]+"★":""}.  Set each one's upgrade level to match your game.</p>
    <div style="display:flex;flex-direction:column;gap:6px">${HABIT_STARS.map((s,i)=>{
      const on = star>=s, lv = on ? Math.max(1,levels[i]||1) : 0;
      return `<div class="hrow ${on?"":"locked"}"><div style="min-width:0"><b>${s}★</b> ${esc(names[i]||"Habit "+(i+1))}${feeds[i].length?` <span class="chip likely">${esc(feeds[i].join(", "))}</span>`:""}</div>
        ${on?`<select id="e_h${i}" data-h="${i}" aria-label="Level for habit ${i+1}">${[1,2,3,4,5].map(n=>`<option value="${n}" ${n===lv?"selected":""}>Level ${n}</option>`).join("")}</select>`:`<span class="hint" style="margin:0;white-space:nowrap">Locked</span>`}</div>`;
    }).join("")}</div>
    <p class="hint" style="margin:6px 0 0">${esc(tip)}</p>`;
  $("e_habits").querySelectorAll("[data-h]").forEach(s=>s.onchange=()=>{ levels[+s.dataset.h] = +s.value; renderHabitBox(levels); });
}
function parseImport(txt){
  txt = txt.trim();
  if(/DFR:[A-Za-z0-9_-]+/.test(txt) || /#share=/.test(txt)) return {share: txt.replace(/^.*#share=/,"DFR:")};
  const block = /```json\s*([\s\S]*?)```/.exec(txt); if(block) txt = block[1];
  else if(!/^[\[{]/.test(txt)){ const i = txt.search(/[\[{]/); if(i>=0) txt = txt.slice(i); }
  const data = JSON.parse(txt);
  if(Array.isArray(data)) return {roster:data, tests:[]};
  if(data && Array.isArray(data.roster)) return {roster:data.roster, tests:Array.isArray(data.tests)?data.tests:[]};
  throw new Error("no roster");
}
function importDialog(){
  openDialog(`<h2 style="font-size:18px">Import a roster</h2>
    <p class="hint">Choose a roster file (.json or .md), or paste its contents, a share code, or a share link.  In-game results inside it come along too.</p>
    <input type="file" id="impFile" accept=".json,.md,.txt,application/json,text/markdown">
    <textarea id="impText" rows="7" placeholder='[{"name":"Vhagar","power":55620, ...}]  or  DFR:...'></textarea>
    <div class="seg"><label><input type="radio" name="impMode" value="update" checked>Update this roster by dragon name</label><label><input type="radio" name="impMode" value="new">Import as a new roster</label></div>
    <p class="hint" id="impErr" style="color:var(--bad)"></p>
    <div class="dlg-foot"><span></span><div class="row"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Import</button></div></div>`,
  ()=>{
    let parsed;
    try{ parsed = parseImport($("impText").value); if(!parsed.share && !parsed.roster.length) throw 0; }
    catch(e){ $("impErr").textContent = "That is not a roster.  Paste a roster file, a share code, or a share link."; return false; }
    const mode = document.querySelector("input[name=impMode]:checked").value;
    if(parsed.share || mode==="new"){
      let r;
      try{ r = parsed.share ? rosterFromShare(parsed.share) : newRoster("Imported roster", parsed.roster.map(normalize)); }
      catch(e){ $("impErr").textContent = "That share code could not be read.  Check that it was copied in full."; return false; }
      if(!parsed.share) r.tests = importTests(parsed.tests, r.roster);
      book.rosters.push(r); switchTo(r.id); persist(); renderAll(); toast("Imported as "+r.name); return;
    }
    let added = 0, updated = 0;
    parsed.roster.map(normalize).forEach(n=>{
      const cur = state.roster.find(d=>d.name.toLowerCase()===n.name.toLowerCase());
      if(!cur){ if(byId(n.id)) n.id = uid(); state.roster.push(n); added++; return; }
      Object.assign(cur, n, {id:cur.id, notes:n.notes||cur.notes, active:cur.active, habits:n.habits||cur.habits}); updated++;
    });
    const seen = new Set(); state.roster.forEach(d=>{ if(seen.has(d.id)) d.id=uid(); seen.add(d.id); });
    const tests = importTests(parsed.tests).filter(t=>!state.tests.some(x=>x.inGame===t.inGame && x.ids.join()===t.ids.join()));
    state.tests.push(...tests);
    state.isSample=false; builder.ids=[null,null,null]; lastResults=null; persist(); renderAll();
    toast(`${updated} updated, ${added} added, ${tests.length} in-game result${tests.length===1?"":"s"}`);
  });
  $("impFile").onchange = e=>{ const file=e.target.files[0]; if(!file) return; const rd=new FileReader(); rd.onload=()=>{$("impText").value=rd.result;}; rd.readAsText(file); };
}
function exportRoster(){
  const tests = state.tests.filter(t=>t.ids.every(byId)).map(t=>({left:t.ids[0],vanguard:t.ids[1],right:t.ids[2],troop:t.troop,inGamePower:t.inGame,basePower:basePower(t.ids),kept:t.kept}));
  const txt = JSON.stringify({name:state.name, roster:state.roster, tests}, null, 2);
  if(!framed){ try{ const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([txt],{type:"application/json"})); a.download=state.name.replace(/[^\w -]+/g,"")+".json"; document.body.appendChild(a); a.click(); a.remove(); toast("Roster file downloaded"); return; }catch(e){} }
  openText("Your roster", txt, "Copy this text and save it, or paste it into Import on another device.");
}
function pasteCode(){
  openDialog(`<h2 style="font-size:18px">Paste a formation code</h2><p class="hint">Codes start with DFM:.  The dragons are matched by name to your roster.</p>
    <input type="text" id="codeIn" style="width:100%"><p class="hint" id="codeErr" style="color:var(--bad)"></p>
    <div class="dlg-foot"><span></span><div class="row"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Load into builder</button></div></div>`,
  ()=>{
    try{
      const o = b64d($("codeIn").value.trim().replace(/^DFM:/,""));
      const ids = o.n.map(nm=>{ const d=findDragon(nm); return d?d.id:null; });
      const missing = o.n.filter((nm,i)=>!ids[i]);
      if(missing.length){ $("codeErr").textContent = "Not in your roster: "+missing.join(", ")+".  Add them first."; return false; }
      toBuilder({ids, troop: TROOPS.includes(o.t)?o.t:"auto"});
    }catch(e){ $("codeErr").textContent = "That code could not be read.  Check that it was copied in full."; return false; }
  });
}
function aboutDialog(){
  openDialog(`<h2 style="font-size:18px">About Dragonfire Muster</h2>
    <p>A free formation planner for Game of Thrones: Dragonfire.  It is fan-made and not affiliated with the game or its publisher.</p>
    <p><b>Privacy.</b>  Without an account, your rosters are saved on this device only and nothing is sent to a server.  An account is optional.  If you create one, we store your email address and your rosters so you can use them on any device; your password is handled by our sign-in provider, Supabase, and we never see it.  You can delete your account and everything in it at any time from Account.  There is no tracking and no advertising.  A share link carries the roster inside the link itself.</p>
    <p><b>How it decides.</b>  Army power is what the game shows: the sum of your dragons' power plus any bonus you have measured.  Fighting fit is our theory from each dragon's skills, the +20% troop affinity stat boost, and the troop counter cycle (Cavalry beats Shieldbearers, Shieldbearers beat Archers, Archers beat Spearmen, Spearmen beat Cavalry, and Siege is weak to all).  Record your in-game results and they override the theory.</p>
    <p><b>Dragon data</b> is compiled from community sources and in-game testing.  The game rebalances, so treat it as a close guide.</p>
    <div class="dlg-foot"><span></span><button class="btn primary" type="button" data-close>Close</button></div>`,()=>{});
}

/* ---------- wiring ---------- */
function renderAll(){ renderRoster(); renderResults(); renderTests(); renderSaved(); }
function setGoalHint(){ $("goalHint").textContent = GOAL_HINT[readOpts().goal]; }
function toBuilder(r){ builder={ids:r.ids.slice(), troop:r.troop||"auto"}; $("bTroop").value=builder.troop; renderBuilderSelects(); $("buildH").scrollIntoView({behavior:"smooth"}); }
const resultAt = i => lastResults.armies[i];
const armed = b => { if(b.dataset.armed==="1") return true; b.dataset.armed="1"; b.dataset.label=b.textContent; b.textContent="Press again to confirm"; setTimeout(()=>{ b.dataset.armed=""; b.textContent=b.dataset.label; },4000); return false; };

document.addEventListener("click", e=>{
  const b = e.target.closest("[data-act]"); if(!b) return; const a=b.dataset.act, i=+b.dataset.i;
  if(a==="edit") editDragon(b.dataset.id);
  if(a==="saveRes") saveFormation(resultAt(i));
  if(a==="toBuilder") toBuilder(resultAt(i));
  if(a==="recordRes") recordDialog(resultAt(i).ids, resultAt(i).troop);
  if(a==="codeRes"){ const r=resultAt(i); copyText(codeFor(r.ids,r.troop),"Formation code"); }
  if(a==="toBuilderSaved") toBuilder(state.saved[i]);
  if(a==="recordSaved") recordDialog(state.saved[i].ids, state.saved[i].troop);
  if(a==="codeSaved"){ const f=state.saved[i]; copyText(codeFor(f.ids,f.troop),"Formation code"); }
  if(a==="delSaved"){ if(!armed(b)) return; state.saved.splice(i,1); persist(); renderSaved(); }
  if(a==="toBuilderTest"){ const t=state.tests[i]; toBuilder({ids:t.ids, troop:t.troop}); }
  if(a==="delTest"){ if(!armed(b)) return; state.tests.splice(i,1); persist(); renderAll(); }
  if(a==="sugBuilder") toBuilder(renderTests.last[i].r);
  if(a==="sugRecord"){ const r=renderTests.last[i].r; recordDialog(r.ids, r.troop); }
});
document.addEventListener("change", e=>{
  const t=e.target;
  if(t.dataset.act==="toggle"){ const d=byId(t.dataset.id); d.active=t.checked; persist(); renderRoster(); renderTests(); }
  if(t.dataset.slot!==undefined){ builder.ids[+t.dataset.slot] = t.value||null; renderBuilder(); }
  if(t.name==="goal"){ setGoalHint(); renderBuilder(); }
});
["fSearch","fRarity","fBreed","fRole","fTroop","fSort"].forEach(id=>$(id).addEventListener("input",renderRoster));
$("selAll").onclick = ()=>{ filtered().forEach(d=>d.active=true); persist(); renderRoster(); renderTests(); };
$("selNone").onclick = ()=>{ filtered().forEach(d=>d.active=false); persist(); renderRoster(); renderTests(); };
$("enemySel").onchange = e=>{ ctx.enemy = e.target.value; renderResults(); renderBuilder(); renderSaved(); };
$("bTroop").onchange = e=>{ builder.troop=e.target.value; renderBuilder(); };
const builderReady = ()=>{ if(builder.ids.some(x=>!x) || new Set(builder.ids).size<3){ toast("Pick three different dragons first"); return false; } return true; };
$("bBest").onclick = ()=>{ if(!builderReady()) return; toBuilder(bestArrangement(builder.ids.map(id=>prep(byId(id))), builder.troop, readOpts().goal)); toast("Arranged for the best score"); };
$("bSave").onclick = ()=>{ if(builderReady()) saveFormation(builderResult()); };
$("bRecord").onclick = ()=>{ if(builderReady()) recordDialog(builder.ids, builderResult().troop); };
$("bPaste").onclick = pasteCode;
$("runBtn").onclick = run;
$("addDragon").onclick = catalogDialog;
$("addCustom").onclick = ()=>editDragon(null);
$("importBtn").onclick = importDialog;
$("exportBtn").onclick = exportRoster;
$("aboutBtn").onclick = aboutDialog;
$("acctBtn").onclick = accountDialog;
$("loadSample").onclick = ()=>{
  const ex = book.rosters.find(r=>r.isSample);
  if(ex) switchTo(ex.id); else { const s=sampleRoster(); book.rosters.push(s); switchTo(s.id); }
  persist(); renderAll(); toast("Showing the sample roster");
};
$("rosterSel").onchange = e=>{ switchTo(e.target.value); persist(); renderAll(); };
$("rosterMenuBtn").onclick = ()=>{ const m=$("rosterMenu"); m.hidden=!m.hidden; $("rosterMenuBtn").setAttribute("aria-expanded", String(!m.hidden)); };
const startNew = ()=>nameDialog("Name your new roster", "My roster", v=>{ const r=newRoster(v); book.rosters.push(r); switchTo(r.id); persist(); renderAll(); toast("Now press Add dragons"); });
$("rNew").onclick = startNew;
$("clearSample").onclick = startNew;
$("rDup").onclick = ()=>{ const r=JSON.parse(JSON.stringify(state)); r.id=uid(); r.name=state.name+" (copy)"; r.isSample=false; book.rosters.push(r); switchTo(r.id); persist(); renderAll(); toast("Duplicated"); };
$("rRename").onclick = ()=>nameDialog("Rename roster", state.name, v=>{ state.name=v; state.isSample=false; persist(); renderRosterSel(); });
$("rShare").onclick = shareDialog;
$("rClear").onclick = e=>{ if(!armed(e.currentTarget)) return; state.roster=[]; state.saved=[]; state.tests=[]; state.isSample=false; builder.ids=[null,null,null]; lastResults=null; persist(); renderAll(); };
$("rDelete").onclick = e=>{
  if(!armed(e.currentTarget)) return;
  cloud.deleted.push(state.id); book.rosters = book.rosters.filter(r=>r.id!==state.id);
  if(!book.rosters.length) book.rosters.push(sampleRoster());
  switchTo(book.rosters[0].id); persist(); renderAll(); toast("Roster deleted");
};
[$("coffeeTop"),$("coffeeFoot")].forEach(a=>{ if(DONATE_URL){ a.href=DONATE_URL; } else { a.removeAttribute("href"); a.setAttribute("aria-disabled","true"); a.title="Donation link not set up yet"; a.style.opacity=".55"; a.style.cursor="default"; } });

load(); book.rosters.forEach(r=>{ localHash[r.id] = cloudData(r); }); checkShareLink(); setGoalHint(); renderAll(); cloudInit();
if(state.roster.filter(d=>d.active).length>=9) run();
