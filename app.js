(() => {
const SYSTEMS = [
  {code:'01',name:'Structure'},{code:'02',name:'Powertrain'},{code:'03',name:'Suspensions'},
  {code:'04',name:'Wheels'},{code:'05',name:'Brakes'},{code:'06',name:'Aerodynamics'},{code:'07',name:'Others'}
];
const BASE_ASM = [
  ['01','MF','Main Frame','mech'],['01','SF','Subframe','aero'],['01','SP','Spider','aero'],['01','BC','Battery Case','aero'],
  ['02','BM','Battery Module','mech'],['02','DT','Drivetrain','mech'],
  ['03','FF','Front Fork','mech'],['03','TC','Triple Clamp','mech'],['03','RS','Rear Shock','mech'],['03','SW','Swingarm','mech'],['03','HB','Handle Bars','mech'],
  ['04','FW','Front Wheel','mech'],['04','RW','Rear Wheel','mech'],
  ['05','FB','Front Brakes','mech'],['05','RB','Rear Brakes','mech'],
  ['06','MG','Mudguard','aero'],['06','FF','Front Fairing','aero'],['06','SF','Side Fairing','aero'],['06','TF','Tail Fairing','aero'],['06','GT','Gas Tank','aero']
].map(([sys,code,name,scheme]) => ({sys,code,name,scheme,base:true}));
const TYPES = {1:'Part itself',2:'Mould',3:'Mounting / fixture',4:'Other'};
const POS = {0:'Single piece',1:'Right side',2:'Left side',3:'Top / front',4:'Bottom / rear'};
const THIS_YEAR = new Date().getFullYear();
const MAX_WORDS = 7;          // longest allowed part description
const PN_RE = /^(\d{2})\s*([A-Z]{2})-(\d{3})-(P\d{2}-\d+|\d{3})$/;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad3 = n => String(n).padStart(3,'0');
const yy = y => String(Number(y) % 100).padStart(2,'0');
const money = n => '$' + Number(n).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2});
const words = s => s.trim().split(/\s+/).filter(Boolean);
const clean = s => String(s ?? '').trim().replace(/\s+/g,' ');
function numOrNull(v){ if (v === '' || v == null) return null; const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null; }

const ls = {
  get(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

/* ---------- storage: Google Sheet if configured, else this browser ---------- */
const SHEETS_URL = (window.TB_SHEETS_URL || '').trim();
function normPart(p){
  return {
    number: String(p.number), system: String(p.system).padStart(2,'0'), assembly: String(p.assembly).toUpperCase(),
    scheme: p.scheme || 'mech', sub: pad3(p.sub), suffix: String(p.suffix).match(/^\d+$/) ? pad3(p.suffix) : String(p.suffix),
    proto: p.proto === true || p.proto === 'Yes', iteration: p.iteration ? Number(p.iteration) : null,
    description: String(p.description ?? ''), qty: numOrNull(p.qty), cost: numOrNull(p.cost),
    createdBy: p.createdBy ? String(p.createdBy) : '', createdAt: p.createdAt ? String(p.createdAt) : '',
    updatedAt: p.updatedAt ? String(p.updatedAt) : '', updatedBy: p.updatedBy ? String(p.updatedBy) : ''
  };
}
function normSub(s){ return {sys: String(s.sys).padStart(2,'0'), code: String(s.code).toUpperCase(), sub: pad3(s.sub), name: String(s.name ?? ''), createdBy: s.createdBy || '', createdAt: s.createdAt ? String(s.createdAt) : ''}; }
const sheetStore = {
  shared: true,
  async load(){
    const r = await fetch(SHEETS_URL, {cache:'no-store'});
    const j = await r.json(); if (j.error) throw new Error(j.error);
    return {parts: j.parts.map(normPart), subassemblies: (j.subassemblies || []).map(normSub),
      assemblies: j.assemblies.map(a => ({...a, sys:String(a.sys).padStart(2,'0')}))};
  },
  async call(body){
    // text/plain keeps this a "simple" request, which Apps Script accepts without a CORS preflight
    const r = await fetch(SHEETS_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify(body)});
    const j = await r.json(); if (j.error) throw new Error(j.error); return j;
  },
  async create(record){ return (await this.call({action:'create', record})).ok; },
  async update(number, patch){ await this.call({action:'update', number, patch}); },
  async remove(number){ await this.call({action:'remove', number}); },
  async addAssembly(assembly){ return (await this.call({action:'addAssembly', assembly})).ok; },
  async addSub(sub){ return (await this.call({action:'addSub', sub})).ok; },
  async removeSub(sub){ await this.call({action:'removeSub', sub}); },
  async bulk(ops){ return (await this.call({action:'import', ops})).results.map(r => r.ok); }
};
const KEY = 'tb-parts-v2';
const localStore = {
  shared: false,
  data(){ return {parts:[], assemblies:[], subassemblies:[], ...ls.get(KEY, {})}; },
  async load(){ const d = this.data(); return {parts: d.parts.map(normPart), assemblies: d.assemblies, subassemblies: d.subassemblies.map(normSub)}; },
  async create(record){ const d = this.data(); if (d.parts.some(p => p.number === record.number)) return false; d.parts.push(record); ls.set(KEY, d); return true; },
  async update(number, patch){ const d = this.data(), p = d.parts.find(p => p.number === number); if (p) Object.assign(p, patch); ls.set(KEY, d); },
  async remove(number){ const d = this.data(); d.parts = d.parts.filter(p => p.number !== number); ls.set(KEY, d); },
  async addAssembly(a){ const d = this.data(); if (d.assemblies.some(x => x.sys===a.sys && x.code===a.code)) return false; d.assemblies.push(a); ls.set(KEY, d); return true; },
  async addSub(s){ const d = this.data(); if (d.subassemblies.some(x => x.sys===s.sys && x.code===s.code && x.sub===s.sub)) return false; d.subassemblies.push(s); ls.set(KEY, d); return true; },
  async removeSub(s){ const d = this.data(); d.subassemblies = d.subassemblies.filter(x => !(x.sys===s.sys && x.code===s.code && x.sub===s.sub)); ls.set(KEY, d); },
  async bulk(ops){
    const out = [];
    for (const op of ops){
      if (op.type === 'update'){ await this.update(op.number, op.patch); out.push(true); }
      else if (op.type === 'addSub') out.push(await this.addSub(op.sub));
      else out.push(await this.create(op.record));
    }
    return out;
  }
};
const store = SHEETS_URL ? sheetStore : localStore;

const parts = new Map();          // part number -> record
let subs = [];                    // named subassemblies of mechanical assemblies
let customAsm = [];
const expanded = new Set(['sys:03']);
let editing = null, confirmDel = null, confirmSub = null, busy = false;

function allAsm(){
  const seen = new Set(BASE_ASM.map(a => a.sys+a.code));
  return BASE_ASM.concat(customAsm.filter(a => !seen.has(a.sys+a.code)));
}
const asmOf = (sys, code) => allAsm().find(a => a.sys===sys && a.code===code);
const sysName = c => (SYSTEMS.find(s => s.code===c)||{}).name || c;
const me = () => $('me').value.trim();

/* ---------- numbering ----------
   Mechanical: SS AA-SSS-PPP. SSS = named subassembly, 001… in order within the assembly;
               PPP = part, 001… in order within the subassembly.
   Aero:       SS AA-TXP-NNN. T = type, P = position, NNN = 001… in order for that type + position;
               prototypes end in P<yy>-<iteration>. */
const subsOf = (sys, code) => subs.filter(s => s.sys===sys && s.code===code).sort((a,b) => a.sub.localeCompare(b.sub));
const subOf = (sys, code, sub) => subs.find(s => s.sys===sys && s.code===code && s.sub===sub);
const partsIn = (sys, code) => [...parts.values()].filter(p => p.system===sys && p.assembly===code);
function nextSubNum(sys, code){
  let max = 0;
  subsOf(sys, code).forEach(s => max = Math.max(max, Number(s.sub)));
  partsIn(sys, code).forEach(p => max = Math.max(max, Number(p.sub)));   // covers parts imported without a named subassembly
  return max < 999 ? pad3(max + 1) : null;
}
function nextSeq(list){
  let max = 0;
  list.forEach(p => { if (/^\d{3}$/.test(p.suffix)) max = Math.max(max, Number(p.suffix)); });
  return max < 999 ? pad3(max + 1) : null;
}
function nextIteration(sys, code, mid){
  let max = 0;
  partsIn(sys, code).forEach(p => { if (p.sub===mid && p.proto && p.suffix.startsWith('P'+yy(THIS_YEAR))) max = Math.max(max, p.iteration||0); });
  return max + 1;
}
// returns {number, sub, suffix, iteration, newSub} or {error}
function buildNumber(s){
  if (s.asm.scheme === 'aero'){
    const mid = s.type + '0' + s.pos;
    if (s.proto){
      const it = nextIteration(s.sys, s.code, mid), suffix = `P${yy(THIS_YEAR)}-${it}`;
      return {number:`${s.sys} ${s.code}-${mid}-${suffix}`, sub:mid, suffix, iteration:it};
    }
    const seq = nextSeq(partsIn(s.sys, s.code).filter(p => p.sub===mid && !p.proto));
    if (!seq) return {error:`All 999 numbers for ${s.sys} ${s.code}-${mid} are used.`};
    return {number:`${s.sys} ${s.code}-${mid}-${seq}`, sub:mid, suffix:seq, iteration:null};
  }
  if (s.sub === 'new'){
    const sub = nextSubNum(s.sys, s.code);
    if (!sub) return {error:`${s.sys} ${s.code} already has 999 subassemblies.`};
    return {number:`${s.sys} ${s.code}-${sub}-001`, sub, suffix:'001', iteration:null, newSub:true};
  }
  const seq = nextSeq(partsIn(s.sys, s.code).filter(p => p.sub===s.sub));
  if (!seq) return {error:`Subassembly ${s.sub} already has 999 parts.`};
  return {number:`${s.sys} ${s.code}-${s.sub}-${seq}`, sub:s.sub, suffix:seq, iteration:null};
}
function makeRecord(s, built, desc, qty, cost){
  return {
    number: built.number, system: s.sys, assembly: s.code, scheme: s.asm.scheme,
    sub: built.sub, suffix: built.suffix, proto: !!built.iteration, iteration: built.iteration,
    description: desc, qty, cost, createdBy: me(), createdAt: new Date().toISOString(), updatedAt: '', updatedBy: ''
  };
}
// the subassembly that deleting this part would empty, if any
function lastInSub(p){
  if (p.scheme === 'aero') return null;
  const sb = subOf(p.system, p.assembly, p.sub);
  return sb && !partsIn(p.system, p.assembly).some(q => q !== p && q.sub === p.sub) ? sb : null;
}
async function deleteSub(sb){
  if (!sb) return;
  await store.removeSub(sb);
  subs = subs.filter(x => x !== sb);
}
function subLabel(p){
  if (p.scheme === 'aero'){ const t = p.sub[0], pos = p.sub[2]; return `${TYPES[t] || ''}${POS[pos] ? ', ' + POS[pos].toLowerCase() : ''}`; }
  const s = subOf(p.system, p.assembly, p.sub);
  return `${p.sub}${s ? ' · ' + s.name : ''}`;
}

function toast(msg){
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2800);
}
function notice(msg){ const n = $('notice'); n.textContent = msg; n.hidden = !msg; }
async function copy(text){
  try { await navigator.clipboard.writeText(text); toast('Copied'); }
  catch { toast('Copy blocked here. Select the text and copy it manually.'); }
}
async function refresh(){
  try {
    const d = await store.load();
    parts.clear(); d.parts.forEach(p => parts.set(p.number, p));
    subs = d.subassemblies || [];
    customAsm = d.assemblies || [];
    if (editing && !parts.has(editing)) editing = null;
    notice(store.shared ? '' : 'Running in this-browser-only mode: parts are saved in this browser and nobody else can see them. Follow README.md to connect the shared Google Sheet.');
    fillAsm(); renderAll();
  } catch(e){
    notice('Could not reach the parts Google Sheet. Check your connection, or check the URL in config.js. (' + e.message + ')');
  }
}
function failMsg(e){ return 'Could not save: ' + (e && e.message ? e.message : 'unknown error') + '. Try again.'; }

/* ---------- form ---------- */
function fillSelects(){
  const sysOpts = SYSTEMS.map(s => `<option value="${s.code}">${s.code} · ${esc(s.name)}</option>`).join('');
  $('f-sys').innerHTML = sysOpts; $('f-sys').value = '03';
  $('a-sys').innerHTML = sysOpts;
  $('q-sys').innerHTML = '<option value="">All systems</option>' + sysOpts;
  $('proto-yy').textContent = yy(THIS_YEAR);
  fillAsm();
}
function fillAsm(){
  const sys = $('f-sys').value, keep = $('f-asm').value;
  const list = allAsm().filter(a => a.sys === sys);
  $('f-asm').innerHTML = list.length
    ? list.map(a => `<option value="${a.code}">${a.code} · ${esc(a.name)}</option>`).join('')
    : '<option value="">No assemblies yet. Add one below.</option>';
  if (list.some(a => a.code === keep)) $('f-asm').value = keep;
  fillSubs();
}
function fillSubs(want){
  const sel = $('f-sub'), keep = want || sel.value;
  const sys = $('f-sys').value, code = $('f-asm').value, all = partsIn(sys, code);
  const list = subsOf(sys, code);
  sel.innerHTML = list.map(s => `<option value="${s.sub}">${s.sub} · ${esc(s.name)} (${all.filter(p => p.sub===s.sub).length} parts)</option>`).join('')
    + '<option value="new">+ New subassembly</option>';
  sel.value = list.some(s => s.sub === keep) ? keep : (keep === 'new' || !list.length ? 'new' : list[list.length-1].sub);
  updatePreview();
}
function formState(){
  const sys = $('f-sys').value, code = $('f-asm').value, asm = asmOf(sys, code);
  return {sys, code, asm, sub: $('f-sub').value, type: $('f-type').value, pos: $('f-pos').value, proto: $('f-proto').checked};
}
function updatePreview(){
  const s = formState();
  if (!s.asm){ $('pv').textContent = '—'; $('pv-legend').textContent=''; $('aero-block').hidden = true; $('mech-block').hidden = true; $('scheme-hint').textContent=''; $('f-go').disabled = true; return; }
  $('f-go').disabled = busy;
  const aero = s.asm.scheme === 'aero';
  $('aero-block').hidden = !aero;
  $('mech-block').hidden = aero;
  $('new-sub-field').hidden = aero || s.sub !== 'new';
  $('scheme-hint').textContent = aero ? 'Aero / composite numbering' : 'Mechanical numbering';
  const built = buildNumber(s);
  if (built.error){ $('pv').textContent = `${s.sys} ${s.code}-???-???`; $('pv-legend').innerHTML = `<span>${esc(built.error)}</span>`; return; }
  $('pv').innerHTML = `${s.sys} ${s.code}-${built.sub}-<span class="seg-r">${esc(built.suffix)}</span>`;
  let detail;
  if (aero) detail = `${TYPES[s.type]}, ${POS[s.pos].toLowerCase()} · ${s.proto ? 'prototype iteration ' + built.iteration : 'no. ' + Number(built.suffix)}`;
  else if (built.newSub) detail = `new subassembly ${built.sub}${clean($('f-subname').value) ? ' · ' + esc(clean($('f-subname').value)) : ''} · first part`;
  else { const sb = subOf(s.sys, s.code, s.sub); detail = `subassembly ${s.sub}${sb ? ' · ' + esc(sb.name) : ''} · part ${Number(built.suffix)}`; }
  $('pv-legend').innerHTML = `<span>${esc(sysName(s.sys))}</span><span>${esc(s.asm.name)}</span><span>${detail}</span>`;
}
function updateDescHint(){
  const n = words($('f-desc').value).length, h = $('desc-hint');
  h.textContent = `${n} / ${MAX_WORDS} words`; h.classList.toggle('bad', n > MAX_WORDS);
}

$('f').addEventListener('submit', async ev => {
  ev.preventDefault();
  const err = $('f-err'), res = $('f-res'); err.hidden = true;
  const fail = (msg, focus) => { err.textContent = msg; err.hidden = false; if (focus) $(focus).focus(); };
  const desc = clean($('f-desc').value), subName = clean($('f-subname').value);
  let s = formState();
  if (!me()) return fail('Enter your name so the team knows who made this part.', 'me');
  if (!s.asm) return fail('Choose an assembly first.');
  if (s.asm.scheme !== 'aero' && s.sub === 'new' && !subName) return fail('Name the new subassembly, like "fork bracket assembly".', 'f-subname');
  const wc = words(desc).length;
  if (!wc) return fail('Add a short description, like "front fork bracket bolt".', 'f-desc');
  if (wc > MAX_WORDS) return fail(`Description is ${wc} words. Keep it to ${MAX_WORDS} or fewer.`, 'f-desc');
  busy = true; $('f-go').disabled = true; $('f-go').textContent = 'Creating…';
  try {
    if (store.shared) await refresh();   // number from the latest list so two people don't collide
    let built, ok = false;
    for (let tries = 0; tries < 6 && !ok; tries++){
      s = formState();
      built = buildNumber(s);
      if (built.error) return fail(built.error);
      if (built.newSub){
        const sb = {sys:s.sys, code:s.code, sub:built.sub, name:subName, createdBy:me(), createdAt:new Date().toISOString()};
        if (!await store.addSub(sb)){ await refresh(); continue; }   // someone just took that subassembly number
        subs.push(sb);
      }
      const rec = makeRecord(s, built, desc, numOrNull($('f-qty').value), numOrNull($('f-cost').value));
      ok = await store.create(rec);
      if (ok) parts.set(rec.number, rec);
      else { await refresh(); if (built.newSub) fillSubs(built.sub); }
    }
    if (!ok) return fail('Could not find a free number. Try again.');
    res.innerHTML = `<div class="result-top"><span class="pn">${esc(built.number)}</span><button type="button" class="btn-sm" id="res-copy">Copy</button></div><div class="hint">${esc(desc)}</div>`;
    res.hidden = false;
    $('res-copy').onclick = () => copy(built.number);
    $('f-desc').value = ''; $('f-qty').value = ''; $('f-cost').value = ''; $('f-subname').value = ''; updateDescHint();
    expanded.add('sys:'+s.sys); expanded.add('asm:'+s.sys+s.code); expanded.add('sub:'+s.sys+s.code+built.sub);
    if (s.asm.scheme !== 'aero') fillSubs(built.sub);   // the next part goes into the same subassembly
    renderAll();
    toast('Created ' + built.number);
  } catch(e){ fail(failMsg(e)); }
  finally { busy = false; $('f-go').textContent = 'Create part number'; updatePreview(); }
});
['f-type','f-pos','f-proto','f-sub'].forEach(id => $(id).addEventListener('change', updatePreview));
$('f-subname').addEventListener('input', updatePreview);
$('f-sys').addEventListener('change', () => { $('f-sub').value = ''; fillAsm(); });
$('f-asm').addEventListener('change', () => { $('f-sub').value = ''; fillSubs(); });
$('f-desc').addEventListener('input', updateDescHint);
$('me').value = ls.get('tb-me', '');
$('me').addEventListener('change', () => ls.set('tb-me', me()));

/* ---------- custom assemblies ---------- */
$('a').addEventListener('submit', async ev => {
  ev.preventDefault();
  const err = $('a-err'); err.hidden = true;
  const sys = $('a-sys').value, code = $('a-code').value.trim().toUpperCase(), name = $('a-name').value.trim();
  if (!/^[A-Z]{2}$/.test(code)){ err.textContent = 'The code must be exactly two letters.'; err.hidden = false; return; }
  if (!name){ err.textContent = 'Give the assembly a name.'; err.hidden = false; return; }
  if (asmOf(sys, code)){ err.textContent = `${sys} ${code} already exists.`; err.hidden = false; return; }
  try {
    const ok = await store.addAssembly({sys, code, name, scheme: $('a-scheme').value, createdAt: new Date().toISOString()});
    if (!ok){ err.textContent = `${sys} ${code} already exists.`; err.hidden = false; return; }
    $('a-code').value=''; $('a-name').value='';
    await refresh();
    toast(`Added ${sys} ${code} · ${name}`);
  } catch(e){ err.textContent = failMsg(e); err.hidden = false; }
});

/* ---------- explorer ---------- */
function sortedParts(){ return [...parts.values()].sort((a,b) => a.number.localeCompare(b.number)); }
const leaf = p => `<div class="leaf"><span class="pn">${esc(p.number)}</span><span class="d">${esc(p.description)}</span>${p.cost!=null?`<span class="hint">${money(p.cost)}</span>`:''}</div>`;
const caret = open => `<span class="caret">${open?'▾':'▸'}</span>`;
function renderTree(){
  const all = sortedParts(), asms = allAsm();
  $('tree').innerHTML = SYSTEMS.map(s => {
    const sk = 'sys:'+s.code, open = expanded.has(sk);
    const sa = asms.filter(a => a.sys === s.code);
    const n = all.filter(p => p.system === s.code).length;
    const inner = !open ? '' : '<ul>' + (sa.length ? sa.map(a => {
      const ak = 'asm:'+a.sys+a.code, aopen = expanded.has(ak);
      const ap = all.filter(p => p.system===a.sys && p.assembly===a.code);
      let body = '';
      if (aopen && a.scheme === 'aero'){
        body = '<ul><li>' + `<button class="btn-sm btn-ghost addhere" data-new="${a.sys}|${a.code}|">+ New part in ${esc(a.name)}</button>` +
          (ap.length ? ap.map(leaf).join('') : '<div class="empty-leaf">No parts yet.</div>') + '</li></ul>';
      } else if (aopen){
        const nums = new Set(subsOf(a.sys, a.code).map(x => x.sub));
        ap.forEach(p => nums.add(p.sub));
        const rows = [...nums].sort().map(num => {
          const sb = subOf(a.sys, a.code, num), bk = 'sub:'+a.sys+a.code+num, bopen = expanded.has(bk);
          const sp = ap.filter(p => p.sub === num);
          const kids = !bopen ? '' : '<ul><li>' + `<button class="btn-sm btn-ghost addhere" data-new="${a.sys}|${a.code}|${num}">+ Add part to ${esc(sb ? sb.name : num)}</button>` +
            (sp.length ? sp.map(leaf).join('') : '<div class="empty-leaf">No parts yet.</div>') + '</li></ul>';
          const key = `${a.sys}|${a.code}|${num}`;
          const del = !(!sp.length && sb) ? '' : confirmSub === key
            ? `<div class="confirm-sub"><span>Are you sure you want to delete subassembly <b>${a.sys} ${a.code}-${num}</b> "${esc(sb.name)}"? This can't be undone.</span>
                 <button class="btn-sm btn-danger" data-delsub-yes="${key}">Yes, delete it</button><button class="btn-sm btn-ghost" data-delsub-no>Cancel</button></div>`
            : `<button class="btn-sm btn-ghost btn-danger addhere" data-delsub="${key}">Delete empty subassembly ${num}</button>`;
          return `<li><button class="node sub" data-k="${bk}" aria-expanded="${bopen}">${caret(bopen)}<span class="code">${num}</span><span class="name">${esc(sb ? sb.name : 'Unnamed subassembly')}</span><span class="count">${sp.length}</span></button>${del}${kids}</li>`;
        }).join('');
        body = '<ul>' + rows + `<li><button class="btn-sm btn-ghost addhere" data-new="${a.sys}|${a.code}|new">+ New subassembly in ${esc(a.name)}</button></li></ul>`;
      }
      const subCount = a.scheme === 'aero' ? '' : ` · ${subsOf(a.sys, a.code).length} sub`;
      return `<li><button class="node asm" data-k="${ak}" aria-expanded="${aopen}">${caret(aopen)}<span class="code">${a.code}</span><span class="name">${esc(a.name)}</span><span class="scheme">${a.scheme==='aero'?'Aero':'Mech'}</span><span class="count">${ap.length} parts${subCount}</span></button>${body}</li>`;
    }).join('') : '<li><div class="empty-leaf">No assemblies yet. Use "Add a new assembly code" in the form.</div></li>') + '</ul>';
    return `<li><button class="node sys" data-k="${sk}" aria-expanded="${open}">${caret(open)}<span class="code">${s.code}</span><span class="name">${esc(s.name)}</span><span class="count">${sa.length} assemblies · ${n} parts</span></button>${inner}</li>`;
  }).join('');
}
$('tree').addEventListener('click', ev => {
  const nb = ev.target.closest('[data-new]');
  if (nb){
    const [sys, code, sub] = nb.dataset.new.split('|');
    $('f-sys').value = sys; fillAsm(); $('f-asm').value = code; fillSubs(sub || undefined);
    (sub === 'new' ? $('f-subname') : $('f-desc')).focus(); $('f').scrollIntoView({block:'nearest'}); return;
  }
  const ask = ev.target.closest('[data-delsub]');
  if (ask){ confirmSub = ask.dataset.delsub; renderTree(); return; }
  if (ev.target.closest('[data-delsub-no]')){ confirmSub = null; renderTree(); return; }
  const yes = ev.target.closest('[data-delsub-yes]');
  if (yes){
    const [sys, code, sub] = yes.dataset.delsubYes.split('|');
    confirmSub = null;
    deleteSub(subOf(sys, code, sub)).then(() => { renderAll(); fillSubs(); toast(`Deleted subassembly ${sys} ${code}-${sub}`); }, e => toast(failMsg(e)));
    return;
  }
  const b = ev.target.closest('[data-k]'); if (!b) return;
  const k = b.dataset.k; expanded.has(k) ? expanded.delete(k) : expanded.add(k); renderTree();
});
$('tr-open').onclick = () => {
  SYSTEMS.forEach(s => expanded.add('sys:'+s.code));
  allAsm().forEach(a => expanded.add('asm:'+a.sys+a.code));
  subs.forEach(s => expanded.add('sub:'+s.sys+s.code+s.sub));
  parts.forEach(p => expanded.add('sub:'+p.system+p.assembly+p.sub));
  renderTree();
};
$('tr-close').onclick = () => { expanded.clear(); renderTree(); };

/* ---------- parts table ---------- */
function filtered(){
  const q = $('q').value.trim().toLowerCase(), fs = $('q-sys').value;
  return sortedParts().filter(p => (!fs || p.system===fs) &&
    (!q || p.number.toLowerCase().includes(q) || (p.description||'').toLowerCase().includes(q) || subLabel(p).toLowerCase().includes(q)));
}
function renderTable(){
  const rows = filtered(), tb = $('tb');
  if (!parts.size){
    tb.innerHTML = `<tr><td colspan="9"><div class="empty"><strong>No parts yet</strong>Create the first one with the form, or upload a BOM.</div></td></tr>`;
  } else if (!rows.length){
    tb.innerHTML = `<tr><td colspan="9"><div class="empty"><strong>No matches</strong>Try a different search or filter.</div></td></tr>`;
  } else tb.innerHTML = rows.map(p => {
    const id = esc(p.number), a = asmOf(p.system, p.assembly);
    const date = p.createdAt ? p.createdAt.slice(0,10) : '';
    const who = esc(p.createdBy || '—') + (p.updatedBy && p.updatedBy !== p.createdBy ? `<div class="hint">edited by ${esc(p.updatedBy)}</div>` : '');
    if (editing === p.number) return `<tr data-id="${id}">
      <td><span class="pn">${esc(p.number)}</span></td>
      <td><input type="text" id="e-desc" value="${esc(p.description)}" maxlength="80"></td>
      <td>${esc(a ? a.name : p.assembly)}</td><td>${esc(subLabel(p))}</td>
      <td class="num"><input type="number" id="e-qty" min="0" step="1" value="${p.qty ?? ''}" style="width:70px"></td>
      <td class="num"><input type="number" id="e-cost" min="0" step="0.01" value="${p.cost ?? ''}" style="width:96px"></td>
      <td>${who}</td><td>${date}</td>
      <td><div class="acts"><button class="btn-sm" data-act="save">Save</button><button class="btn-sm btn-ghost" data-act="cancel">Cancel</button></div></td></tr>`;
    const acts = confirmDel === p.number
      ? `<span class="hint">${lastInSub(p) ? `Delete? This is the last part, so subassembly "${esc(lastInSub(p).name)}" will be deleted too.` : 'Delete?'}</span><button class="btn-sm btn-danger" data-act="del-yes">Delete</button><button class="btn-sm btn-ghost" data-act="del-no">Keep</button>`
      : `<button class="btn-sm" data-act="copy">Copy</button><button class="btn-sm" data-act="edit">Edit</button><button class="btn-sm btn-ghost btn-danger" data-act="del">Delete</button>`;
    return `<tr data-id="${id}">
      <td><span class="pn">${esc(p.number)}</span>${p.proto?' <span class="pill gen">Proto</span>':''}</td>
      <td>${esc(p.description)}</td>
      <td>${esc(a ? a.name : p.assembly)}</td><td>${esc(subLabel(p))}</td>
      <td class="num">${p.qty ?? '—'}</td>
      <td class="num">${p.cost != null ? money(p.cost) : '—'}</td>
      <td>${who}</td><td>${date}</td>
      <td><div class="acts">${acts}</div></td></tr>`;
  }).join('');
  const withCost = rows.filter(p => p.cost != null);
  const total = withCost.reduce((s,p) => s + p.cost * (p.qty ?? 1), 0);
  $('totals').innerHTML = `<span><b>${rows.length}</b> parts shown</span><span><b>${withCost.length}</b> with a cost</span><span>Total <b>${money(total)}</b> (unit cost × qty; blank qty counts as 1)</span>`;
}
$('tb').addEventListener('click', async ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return;
  const id = b.closest('tr').dataset.id, p = parts.get(id), act = b.dataset.act;
  if (act === 'copy') return copy(p.number);
  if (act === 'edit'){ editing = id; confirmDel = null; renderTable(); $('e-desc').focus(); return; }
  if (act === 'cancel'){ editing = null; renderTable(); return; }
  if (act === 'del'){ confirmDel = id; renderTable(); return; }
  if (act === 'del-no'){ confirmDel = null; renderTable(); return; }
  if (act === 'del-yes'){
    try {
      await store.remove(id); parts.delete(id); confirmDel = null;
      // a mechanical subassembly goes away with its last part
      const sb = p.scheme !== 'aero' && subOf(p.system, p.assembly, p.sub);
      const emptied = sb && !partsIn(p.system, p.assembly).some(q => q.sub === p.sub);
      if (emptied) await deleteSub(sb);
      fillSubs(); renderAll();
      toast('Deleted ' + p.number + (emptied ? ` and its now-empty subassembly "${sb.name}"` : ''));
    }
    catch(e){ toast(failMsg(e)); } return;
  }
  if (act === 'save'){
    if (!me()){ toast('Enter your name in the New part form first.'); $('me').focus(); return; }
    const desc = clean($('e-desc').value), wc = words(desc).length;
    if (!wc || wc > MAX_WORDS){ toast(`Description must be 1 to ${MAX_WORDS} words.`); return; }
    const patch = {description: desc, qty: numOrNull($('e-qty').value), cost: numOrNull($('e-cost').value), updatedAt: new Date().toISOString(), updatedBy: me()};
    try { await store.update(id, patch); Object.assign(p, patch); editing = null; renderAll(); toast('Saved ' + p.number); }
    catch(e){ toast(failMsg(e)); }
  }
});
['q','q-sys'].forEach(id => $(id).addEventListener('input', renderTable));

/* ---------- tabs ---------- */
const TABS = ['explorer','parts','bom'];
function showTab(t){
  TABS.forEach(x => { $('t-'+x).setAttribute('aria-selected', x===t); $('v-'+x).hidden = x!==t; });
  try { history.replaceState(null, '', '#'+t); } catch {}
}
TABS.forEach(t => $('t-'+t).addEventListener('click', () => showTab(t)));
if (TABS.includes(location.hash.slice(1))) showTab(location.hash.slice(1));

/* ---------- export ---------- */
function exportRows(){
  return sortedParts().map(p => {
    const a = asmOf(p.system, p.assembly), sb = p.scheme === 'aero' ? null : subOf(p.system, p.assembly, p.sub);
    return {'Part Number':p.number,'System':p.system,'System Name':sysName(p.system),'Assembly':p.assembly,'Assembly Name':a?a.name:'',
      'Subassembly':p.sub,'Subassembly Name':p.scheme === 'aero' ? subLabel(p) : (sb ? sb.name : ''),'Part':p.suffix,
      'Description':p.description,'Qty':p.qty ?? '','Unit Cost (CAD)':p.cost ?? '','Prototype':p.proto?'Yes':'',
      'Created By':p.createdBy || '','Created':p.createdAt ? p.createdAt.slice(0,10) : '','Updated By':p.updatedBy || ''};
  });
}
function save(ext){
  if (!parts.size){ toast('No parts to export yet.'); return; }
  if (!window.XLSX){ toast('The spreadsheet library did not load. Reload the page.'); return; }
  const ws = XLSX.utils.json_to_sheet(exportRows());
  ws['!cols'] = [{wch:18},{wch:7},{wch:14},{wch:9},{wch:16},{wch:11},{wch:26},{wch:7},{wch:34},{wch:6},{wch:14},{wch:9},{wch:16},{wch:11},{wch:16}];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Parts');
  XLSX.writeFile(wb, `thunderbikes-parts-${new Date().toISOString().slice(0,10)}.${ext}`, {bookType: ext});
}
$('x-xlsx').onclick = () => save('xlsx');
$('x-csv').onclick = () => save('csv');
$('x-copy').onclick = () => {
  const rows = exportRows(); if (!rows.length){ toast('No parts to copy yet.'); return; }
  const head = Object.keys(rows[0]);
  copy([head.join('\t')].concat(rows.map(r => head.map(h => String(r[h]).replace(/\t|\n/g,' ')).join('\t'))).join('\n'));
};

/* ---------- BOM import ---------- */
let pending = [];
function findCol(headers, re){ return headers.find(h => re.test(h.toLowerCase().replace(/[^a-z#]/g,''))); }
function parseBom(rows){
  if (!rows.length) return [];
  const H = Object.keys(rows[0]);
  const cPn = findCol(H, /^(partnumber|partno|partnum|part#|pn|number)$/), cDesc = findCol(H, /desc/) || findCol(H, /^(name|partname)$/),
        cQty = findCol(H, /^(qty|quantity|count)$/), cCost = findCol(H, /cost|price/),
        cSys = findCol(H, /^system$/), cAsm = findCol(H, /^assembly$/),
        cSub = findCol(H, /^(subassembly|subassy|sub)$/), cSubName = findCol(H, /^(subassemblyname|subassyname)$/);
  const seen = new Set();
  return rows.map((r, i) => {
    const raw = cPn ? clean(r[cPn]).toUpperCase() : '';
    const desc = cDesc ? clean(r[cDesc]) : '';
    const qty = cQty ? numOrNull(r[cQty]) : null, cost = cCost ? numOrNull(String(r[cCost] ?? '').replace(/[$,]/g,'')) : null;
    const subRaw = cSub ? clean(r[cSub]) : '', subName = cSubName ? clean(r[cSubName]) : '';
    const row = {line: i + 2, desc, qty, cost};
    if (raw){
      const m = raw.match(PN_RE);
      if (!m) return {...row, status:'skip', why:`"${raw}" is not a valid part number`};
      const number = `${m[1]} ${m[2]}-${m[3]}-${m[4]}`;
      if (seen.has(number)) return {...row, number, status:'skip', why:'Duplicate row in this file'};
      seen.add(number);
      if (parts.has(number)) return {...row, number, status:'upd'};
      const a = asmOf(m[1], m[2]);
      if (!a) return {...row, number, status:'skip', why:`Unknown assembly ${m[1]} ${m[2]}`};
      if (!desc) return {...row, number, status:'skip', why:'No description'};
      const proto = m[4].startsWith('P');
      const name = subName || (subRaw && !/^\d+$/.test(subRaw) ? subRaw : '');
      return {...row, number, status:'new', asm:a, subName:name, rec:{number, system:m[1], assembly:m[2], scheme:a.scheme, sub:m[3], suffix:m[4], proto,
        iteration: proto ? Number(m[4].split('-')[1]) : null, description: words(desc).slice(0,MAX_WORDS).join(' '), qty, cost, updatedAt:'', updatedBy:''}};
    }
    const sysRaw = cSys ? clean(r[cSys]) : '', code = cAsm ? clean(r[cAsm]).toUpperCase() : '';
    if (!sysRaw && !code && !desc) return null;      // blank row
    const sys = sysRaw.padStart(2,'0'), a = asmOf(sys, code);
    if (!a) return {...row, status:'skip', why:'No part number, and no valid System + Assembly'};
    if (a.scheme === 'aero') return {...row, status:'skip', why:'Aero rows need a part number (type and position)'};
    if (!subRaw && !subName) return {...row, status:'skip', why:'No Subassembly (number or name)'};
    if (!desc) return {...row, status:'skip', why:'No description'};
    if (words(desc).length > MAX_WORDS) return {...row, status:'skip', why:`Description over ${MAX_WORDS} words`};
    return {...row, status:'gen', sys, code, asm:a, subRef: subRaw || subName, subName: subName || (/^\d+$/.test(subRaw) ? '' : subRaw)};
  }).filter(Boolean);
}
function renderBom(){
  const out = $('bom-out');
  if (!pending.length){ out.innerHTML = ''; return; }
  const c = k => pending.filter(r => r.status===k).length;
  const label = {new:'Add',upd:'Update',gen:'Generate number',skip:'Skip'};
  out.innerHTML = `<div class="tbl-tools" style="margin-top:16px">
      <span><span class="pill new">${c('new')} add</span> <span class="pill upd">${c('upd')} update</span> <span class="pill gen">${c('gen')} generate</span> <span class="pill skip">${c('skip')} skip</span></span>
      <span style="flex:1"></span>
      <button class="btn-sm btn-ghost" id="bom-clear">Clear</button>
      <button class="btn-sm" id="bom-go" style="background:var(--accent);color:var(--accent-ink);border-color:var(--accent)" ${pending.every(r=>r.status==='skip')?'disabled':''}>Import ${pending.length - c('skip')} rows</button>
    </div>
    <div class="tbl-wrap"><table><thead><tr><th>Row</th><th>Action</th><th>Part number</th><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Cost</th><th>Note</th></tr></thead><tbody>
    ${pending.map(r => `<tr><td>${r.line}</td><td><span class="pill ${r.status}">${label[r.status]}</span></td><td><span class="pn">${esc(r.number || (r.asm ? r.sys+' '+r.code+'-…' : ''))}</span></td><td>${esc(r.desc)}</td><td class="num">${r.qty ?? ''}</td><td class="num">${r.cost!=null?money(r.cost):''}</td><td class="hint">${esc(r.why || (r.status==='gen' ? 'Subassembly: ' + r.subRef : ''))}</td></tr>`).join('')}
    </tbody></table></div>`;
  $('bom-clear').onclick = () => { pending = []; $('bom-file').value=''; renderBom(); };
  $('bom-go').onclick = runImport;
}
async function readFile(file){
  if (!window.XLSX){ toast('The spreadsheet library did not load. Reload the page.'); return; }
  try {
    const wb = XLSX.read(await file.arrayBuffer(), {type:'array'});
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:''});
    pending = parseBom(rows);
    if (!pending.length) toast('No rows found on the first sheet.');
    renderBom();
  } catch { toast('Could not read that file. Save it as .xlsx or .csv and try again.'); }
}
async function runImport(){
  if (!me()){ toast('Enter your name in the New part form first, so imported parts show who added them.'); $('me').focus(); return; }
  const btn = $('bom-go'); btn.disabled = true; btn.textContent = 'Importing…';
  const now = new Date().toISOString(), ops = [];
  // Numbers are worked out row by row against the current list, so new rows are reserved locally as we go.
  const addSub = (sys, code, sub, name) => {
    const sb = {sys, code, sub, name, createdBy: me(), createdAt: now};
    subs.push(sb); ops.push({type:'addSub', sub: sb});
  };
  for (const r of pending){
    if (r.status === 'upd'){
      const patch = {updatedAt: now, updatedBy: me()};
      if (r.desc && words(r.desc).length <= MAX_WORDS) patch.description = r.desc;
      if (r.qty != null) patch.qty = r.qty;
      if (r.cost != null) patch.cost = r.cost;
      ops.push({type:'update', number:r.number, patch});
    } else if (r.status === 'new'){
      const rec = r.rec;
      if (rec.scheme !== 'aero' && !subOf(rec.system, rec.assembly, rec.sub)) addSub(rec.system, rec.assembly, rec.sub, r.subName || `Subassembly ${rec.sub}`);
      ops.push({type:'create', record:{...rec, createdBy: me(), createdAt: now}});
      parts.set(rec.number, rec);
    } else if (r.status === 'gen'){
      const ref = r.subRef.toLowerCase();
      let sb = /^\d{1,3}$/.test(r.subRef) ? subOf(r.sys, r.code, pad3(r.subRef)) : subsOf(r.sys, r.code).find(x => x.name.toLowerCase() === ref);
      let subNum = sb ? sb.sub : (/^\d{1,3}$/.test(r.subRef) ? pad3(r.subRef) : null);
      if (!subNum){ subNum = nextSubNum(r.sys, r.code); if (!subNum) continue; }
      if (!subOf(r.sys, r.code, subNum)) addSub(r.sys, r.code, subNum, r.subName || `Subassembly ${subNum}`);
      const s = {sys:r.sys, code:r.code, asm:r.asm, sub:subNum};
      const built = buildNumber(s);
      if (built.error) continue;
      const rec = makeRecord(s, built, r.desc, r.qty, r.cost);
      ops.push({type:'create', record:{...rec, createdAt: now}});
      parts.set(rec.number, rec);
    }
  }
  try {
    const results = await store.bulk(ops);
    const partOps = ops.map((op, i) => [op, results[i]]).filter(([op]) => op.type !== 'addSub');
    const ok = partOps.filter(([, r]) => r).length, failed = partOps.length - ok;
    toast(`Imported ${ok} row${ok===1?'':'s'}` + (failed ? `. ${failed} skipped because the number was already taken.` : ''));
    pending = []; $('bom-file').value = '';
  } catch(e){ toast(failMsg(e)); }
  await refresh(); renderBom();
}
$('bom-file').addEventListener('change', e => e.target.files[0] && readFile(e.target.files[0]));
const drop = $('drop');
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) readFile(f); });

/* ---------- render all ---------- */
function renderStats(){
  const all = [...parts.values()];
  $('st-parts').textContent = all.length;
  $('st-year').textContent = all.filter(p => p.createdAt.startsWith(String(THIS_YEAR))).length;
  $('st-cost').textContent = money(all.reduce((s,p) => s + (p.cost != null ? p.cost * (p.qty ?? 1) : 0), 0)).replace(/\.\d\d$/,'');
}
function renderAll(){ renderStats(); renderTree(); if (!editing) renderTable(); updatePreview(); }

$('mode').textContent = store.shared ? 'Saving to the team Google Sheet' : 'Saving in this browser only';
if (window.TB_PROJECT) $('project').textContent = window.TB_PROJECT;
$('max-words').textContent = MAX_WORDS;
fillSelects(); updateDescHint(); renderAll(); refresh();
if (store.shared) setInterval(() => { if (!busy && !editing && !document.hidden) refresh(); }, 30000);
})();
