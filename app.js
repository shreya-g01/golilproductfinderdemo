'use strict';
/* =====================================================================
   GULF LUBRICATION INTELLIGENCE – APPLICATION (PROTOTYPE)
   Vanilla JS single-page app. Every module reads the same central data
   model (gulfData in data.js). Sections:
   CENTRAL DATA · APPLICATION STATE · ROUTING · GLOBAL SEARCH · AI ADVISOR ·
   PRODUCT FINDER · EQUIPMENT DATABASE · OIL ANALYSIS · TCO CALCULATOR ·
   LUBRICATION PASSPORT · KNOWLEDGE GRAPH · TECHNICAL KNOWLEDGE ·
   LEAD GENERATION · DISTRIBUTOR/GARAGE FINDER · PRODUCT AUTHENTICATION ·
   ANALYTICS · DEMO · UI RENDERING

   FUTURE INTEGRATION (not implemented here):
   Frontend → API Gateway → Central Gulf Database
     (Product Data · Equipment Data · Technical Knowledge · Oil Analysis · Customer Data)
     → Salesforce CRM · ERP · Payment Systems · WhatsApp Business API
   The functions marked "PRODUCTION:" are the seams where those calls go.
   ===================================================================== */

/* ============================ CENTRAL DATA ============================ */
const D = gulfData;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const uniq = a => [...new Set(a)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const by = (coll, id) => D[coll].find(x => x.id === id);
const prod = id => by('products', id), eqp = id => by('equipment', id), sysOf = id => by('systems', id);
const cond = id => by('conditions', id), oemOf = id => by('oems', id), indOf = id => by('industries', id), art = id => by('technicalArticles', id);
const specByName = n => D.specifications.find(s => s.name === n);
const pSpecs = p => p.specs.concat(/^\d+W/.test(p.grade) ? ['SAE ' + p.grade] : []);
const eqPath = e => `equipment/${e.oem}/${e.slug}`;
const fmtDate = iso => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
const inr = n => '₹ ' + Math.round(n).toLocaleString('en-IN');
const today = () => new Date().toISOString().slice(0, 10);
const eqSystems = e => Object.fromEntries(e.lubrication.map(l => [l.system, l.products]));
const equipmentUsing = id => D.equipment.filter(e => e.lubrication.some(l => l.products.includes(id)));
const articlesFor = (key, id) => D.technicalArticles.filter(a => a[key].includes(id));

/* ========================== APPLICATION STATE ==========================
   Browser-local persistence (passports, user oil samples, analytics).
   PRODUCTION: replace Store with authenticated API calls.               */
const mem = {};
const Store = {
  get(k, d) { if (k in mem) return mem[k]; try { const v = localStorage.getItem('gli_' + k); if (v) return (mem[k] = JSON.parse(v)); } catch (e) {} return d; },
  set(k, v) { mem[k] = v; try { localStorage.setItem('gli_' + k, JSON.stringify(v)); } catch (e) {} },
  reset() { Object.keys(mem).forEach(k => delete mem[k]); try { Object.keys(localStorage).filter(k => k.startsWith('gli_')).forEach(k => localStorage.removeItem(k)); } catch (e) {} }
};
const state = { chat: [], advisorEq: null, compare: [], multi: { key: '', sel: [] }, gsel: null, trend: 'fe', tcoShown: false, tcoStarted: false, lead: null, demo: null };
let R = { seg: [], q: {} };

/* ============================== ANALYTICS ==============================
   Mock first-party data layer. PRODUCTION: push to GA4 / CDP / CRM.      */
const Analytics = {
  track(event, payload = {}) { const ev = Store.get('events', []); ev.push({ event, ...payload, ts: new Date().toISOString() }); Store.set('events', ev.slice(-400)); (window.dataLayer = window.dataLayer || []).push({ event, ...payload }); },
  events: () => Store.get('events', [])
};

/* =============================== ROUTING ===============================
   Hash routes mirror the production URL structure, e.g. #/equipment/jcb/3dx
   → /equipment/jcb/3dx. Browser Back, Forward and refresh all work.      */
function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, ''), [p, qs = ''] = raw.split('?');
  return { seg: p.split('/').filter(Boolean).map(decodeURIComponent), q: Object.fromEntries(new URLSearchParams(qs)) };
}
function go(path) { const h = '#/' + path; if (location.hash === h) render(); else location.hash = h; }
window.addEventListener('hashchange', () => render());

function crumbs(items) {
  const all = [['Lubrication Intelligence', '']].concat(items.map(i => Array.isArray(i) ? i : [i]));
  $('#ld-breadcrumb').textContent = JSON.stringify({ '@context':'https://schema.org', '@type':'BreadcrumbList', itemListElement: all.map((c, i) => ({ '@type':'ListItem', position: i + 1, name: c[0] })) });
  return `<div class="crumbs"><div class="wrap"><a href="#/">Home</a>${all.map((c, i) => `<span class="sep">›</span>${i < all.length - 1 && c[1] !== undefined ? `<a href="#/${c[1]}">${esc(c[0])}</a>` : `<span ${i === all.length - 1 ? 'aria-current="page"' : ''}>${esc(c[0])}</span>`}`).join('')}</div></div>`;
}
const setLD = o => { $('#ld-entity').textContent = JSON.stringify(o); };
const urlStrip = path => `<div class="urlstrip">Indexable page in production: <b>/${esc(path)}</b></div>`;
const DISC = `<p class="disclaimer"><strong>Demo / illustrative data.</strong> Specifications, approvals, intervals, prices and analysis limits are placeholders and should be validated against current Gulf technical documentation before production use.</p>`;
const pageHead = (eyebrow, h1, lead) => `<div class="pagehead"><div class="wrap"><div class="eyebrow">${eyebrow}</div><h1 id="view-title" tabindex="-1">${h1}</h1>${lead ? `<p class="lead">${lead}</p>` : ''}</div></div>`;
const chain = nodes => `<div class="chain">${nodes.map((n, i) => (i ? '<span class="arr" aria-hidden="true">→</span>' : '') + (n.href ? `<a class="node ${n.c || ''}" href="#/${n.href}">${esc(n.t)}</a>` : `<span class="node ${n.c || ''}">${esc(n.t)}</span>`)).join('')}</div>`;

/* ============================ GLOBAL SEARCH ============================ */
function norm(s) { return String(s).toLowerCase().replace(/bs[\s-]?vi\b/g, 'bs6').replace(/[^a-z0-9]+/g, ' ').trim(); }
function matches(text, q) {
  const hay = norm(text), sq = hay.replace(/ /g, ''), toks = norm(q).split(' ').filter(Boolean);
  return toks.length > 0 && (toks.every(t => hay.includes(t) || sq.includes(t)) || sq.includes(toks.join('')));
}
const productText = p => [p.name, p.grade, D.categories[p.category], p.category, p.systems.map(s => sysOf(s).name + ' ' + sysOf(s).fluid).join(' '), pSpecs(p).join(' '), p.applications.join(' '), p.tags.map(t => cond(t).name).join(' '), p.industries.map(i => indOf(i).name).join(' ')].join(' ');
const eqText = e => [e.name, oemOf(e.oem).name, e.type, e.group, indOf(e.industry).name, e.environment, 'equipment'].join(' ');
function globalSearch(q) {
  const m = t => matches(t, q);
  const equipment = D.equipment.filter(e => m(eqText(e)));
  const focus = equipment.length && equipment.length <= 2 ? equipment[0] : null;   // a specific machine was searched
  return {
    equipment, focus,
    recommended: focus ? uniq(focus.lubrication.map(l => bestFor(focus, l.system).primary)) : [],
    products: D.products.filter(p => m(productText(p))),
    applications: uniq([...D.applications.filter(a => m(a.name)), ...(focus ? D.applications.filter(a => a.industry === focus.industry || focus.lubrication.some(l => l.system === a.system)) : [])]),
    industries: D.industries.filter(i => m(i.name + ' industry')),
    oems: D.oems.filter(o => o.id !== 'generic' && m(o.name)),
    specs: D.specifications.filter(s => m(s.name)),
    articles: uniq([...D.technicalArticles.filter(a => m(a.title + ' ' + a.category + ' ' + a.summary)), ...(focus ? articlesFor('equipment', focus.id) : [])]),
    params: uniq([...D.oilParams.filter(p => m(p.name + ' oil analysis')), ...(focus ? flaggedParams(focus.id) : [])]),
    problems: D.problems.filter(p => m(p.name)),
    passports: Store.get('passports', []).filter(p => m(p.assetId + ' ' + eqp(p.equipment).name) || (focus && p.equipment === focus.id))
  };
}

/* ======================== RECOMMENDATION ENGINE ========================
   Pure functions, no DOM. Used by the Finder, the Equipment Database, the
   AI Advisor, the Passport, the TCO Calculator and the Knowledge Graph.
   ctx = { subject, systems:{systemId:[productIds]}, sys, conditions:[tagIds] }
   PRODUCTION: replace scoring with the validated lubrication chart / OEM
   specification table; keep this input/output contract.                  */
function recommend(ctx) {
  const ids = ctx.systems[ctx.sys] || [];
  const scored = ids.map((id, i) => { const p = prod(id), hit = ctx.conditions.filter(c => p.tags.includes(c)); return { p, hit, score: hit.length * 3 + (ids.length - i) * 0.5 }; }).sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  const top = scored[0], s = sysOf(ctx.sys), r = [];
  r.push({ ok: true, t: `${top.p.grade} is a suitable grade for the ${s.name.toLowerCase()} of ${ctx.subject} (demo mapping)` });
  top.hit.forEach(c => r.push({ ok: true, t: `Formulated for ${cond(c).name.toLowerCase()}` }));
  ctx.conditions.filter(c => !top.hit.includes(c)).forEach(c => r.push({ ok: false, t: `${cond(c).name} is not this product's primary strength. Confirm with a Gulf technical expert` }));
  r.push({ ok: true, t: `Meets the performance level in the demo data: ${top.p.specs.join(', ')}` });
  r.push({ ok: true, t: `Designed for ${D.categories[top.p.category].toLowerCase()}: ${top.p.applications[0]}` });
  return { primary: top.p, alternatives: scored.slice(1).map(x => x.p), reasons: r, hit: top.hit };
}
const bestFor = (e, sys, conds) => recommend({ subject: e.name, systems: eqSystems(e), sys, conditions: conds || e.tags });

/* ============================== AI ADVISOR ==============================
   Rule-based simulated advisor: extracts entities from the question, then
   answers from the same data and engines as every other module.
   PRODUCTION: an LLM grounded on the knowledge graph (retrieval over the
   central database), with the same structured response.                  */
function advise(q) {
  const t = ' ' + norm(q) + ' ';
  const typeWords = { excavator:'Excavator', backhoe:'Backhoe Loader', loader:'Wheel Loader', tractor:'Tractor', harvester:'Combine Harvester', truck:'Truck', bus:'Bus', compressor:'Screw Compressor', gearbox:'Gearbox', turbine:'Turbine', genset:'Diesel Genset', generator:'Diesel Genset', scooter:'Scooter', motorcycle:'Motorcycle', bike:'Motorcycle' };
  let e = D.equipment.find(x => t.includes(' ' + norm(x.name) + ' ')) || D.equipment.find(x => norm(x.model).length >= 3 && t.includes(' ' + norm(x.model) + ' '));
  if (!e) { const w = Object.keys(typeWords).find(k => t.includes(' ' + k)); if (w) e = D.equipment.find(x => x.type === typeWords[w]); }
  const carried = !e && state.advisorEq; if (carried) e = eqp(state.advisorEq);
  if (e) state.advisorEq = e.id;
  const param = D.oilParams.find(p => t.includes(' ' + p.name.toLowerCase())) || (t.includes(' aluminum') ? by('oilParams', 'al') : null);
  const sysWords = [['hydraulic','hydraulic'],['gear oil','transmission'],['transmission','transmission'],['differential','differential'],['axle','differential'],['grease','grease'],['compressor','compressor'],['engine','engine']];
  let sys = (sysWords.find(w => t.includes(' ' + w[0])) || [])[1];
  if (e && (!sys || !e.lubrication.some(l => l.system === sys))) sys = param && e.lubrication.some(l => l.system === 'engine') ? 'engine' : (sys && e.lubrication.some(l => l.system === sys) ? sys : e.lubrication[0].system);
  const conds = [[/high temp|hot |heat/, 'hot'], [/ heavy| load | loads | loaded /, 'heavy'], [/dust/, 'dusty'], [/\d+\s*hours? (a|per) day|long hours|round the clock/, 'longhours'], [/stop start|start stop|city/, 'startstop']].filter(c => c[0].test(t)).map(c => c[1]);
  let intent = 'fallback';
  if (param || /oil analysis|sample|lab report/.test(t)) intent = 'analysis';
  else if (/ sav|cost|tco|cheaper|price/.test(t)) intent = 'tco';
  else if (/switch|current lubricant|equivalent|change from|replace my/.test(t)) intent = 'switch';
  else if (/what oil|which oil|which lubricant|should i use|recommend|right oil|what should/.test(t)) intent = 'recommend';
  else if (/overheat|temperature|running hot/.test(t)) intent = 'temperature';
  else if (/how often|interval|when should|check my/.test(t)) intent = 'interval';
  else if (e) intent = 'recommend';

  const rec = e ? bestFor(e, sys, conds.length ? conds : undefined) : null;
  const P = rec ? rec.primary : null, S = sys ? sysOf(sys) : null;
  const idf = [];
  if (e) idf.push(['Equipment', e.name + (carried ? ' (from earlier in this conversation)' : ''), eqPath(e)]);
  if (S) idf.push(['System', S.name]);
  if (param) idf.push(['Issue', 'High ' + param.name.toLowerCase(), 'knowledge/' + param.article]);
  conds.forEach(c => idf.push(['Operating condition', cond(c).name]));
  const out = { intent, identified: idf, equipment: e, product: P, why: [], evidence: [], related: [], knowledge: [], actions: [], next: [] };
  const relEq = () => (out.related = D.equipment.filter(x => e && x.id !== e.id && x.type === e.type).concat(D.equipment.filter(x => e && x.id !== e.id && x.industry === e.industry && x.type !== e.type)).slice(0, 3));
  const needMore = msg => { out.answer = 'We need a little more information to make a recommendation. ' + msg; out.related = D.equipment.slice(0, 4); out.next = [['Open the Equipment Database', 'equipment'], ['Use the Product Finder', 'finder']]; return out; };

  if (intent === 'analysis') {
    const p = param || by('oilParams', 'fe');
    const reps = e ? reportsFor(e.id, sys) : [], last = reps[reps.length - 1];
    out.answer = `${p.meaning}`;
    if (last) { const st = paramStatus(p, last.values[p.id], last); out.why.push(`Latest sample ${last.id} (${fmtDate(last.date)}): ${p.name} ${last.values[p.id]} ${p.unit}, status ${STATUS[st].toUpperCase()}`); if (reps.length > 1) out.why.push(`Trend across ${reps.length} samples: ${reps.map(r => r.values[p.id]).join(' → ')} ${p.unit}`); out.evidence.push([`Oil analysis report ${last.id}`, 'oil-analysis/' + last.id]); }
    else if (e) out.why.push(`No analysis available for ${e.name} yet. Submit a sample to start a trend.`);
    out.why.push('A single value matters less than the trend at similar hours on oil');
    out.actions = ['Review the latest oil analysis', 'Compare previous samples', 'Check operating conditions', 'Review the lubricant specification', 'Consult a Gulf technical expert'];
    out.knowledge = [art(p.article)].concat(articlesFor('params', p.id).filter(a => a.id !== p.article)).slice(0, 3);
    out.next = [[last ? 'View the analysis report' : 'Start an oil analysis', last ? 'oil-analysis/' + last.id : 'oil-analysis' + (e ? '?eq=' + e.id : '')], ['Calculate maintenance impact', 'tco' + (e ? '?eq=' + e.id : '')]];
    relEq();
  } else if (intent === 'tco') {
    if (!e) return needMore('Tell me which machine you run, for example "JCB 3DX", so I can set up the cost model.');
    const l = e.lubrication.find(x => x.system === sys);
    out.answer = `The saving from a lubricant change depends on more than the price per litre. For ${e.name} the cost model covers lubricant, filters, labour and downtime per service, plus the number of services per year. I have set up an illustrative scenario you can adjust.`;
    out.why = [`Demo service interval for the ${S.name.toLowerCase()}: ${l.interval} h; sump ${l.capacity} L`, 'Fewer services per year reduce filter, labour and downtime cost, not only oil cost', 'Any interval change should be validated with oil analysis'];
    out.actions = ['Open the TCO Calculator with this machine pre-filled', 'Enter your own oil price, labour and downtime cost', 'Request a Gulf technical assessment to validate the numbers'];
    out.knowledge = [art('extending-drain-intervals-safely')];
    out.next = [['Open TCO Calculator', 'tco?eq=' + e.id]]; relEq();
  } else if (intent === 'switch') {
    if (!e) return needMore('Which machine or vehicle is the lubricant used in?');
    out.answer = `A switch to Gulf is usually straightforward when the Gulf product meets the same grade and specification the equipment maker requires. For the ${S.name.toLowerCase()} of ${e.name}, the demo data points to ${P.name} (${P.grade}).`;
    out.why = [`Match the specification first: ${P.specs.join(', ')} (demo data)`, 'Check the current product’s grade and performance level against the Gulf product', 'Drain fully and change the filter when switching; avoid mixing where the product types differ'];
    out.actions = ['Compare the current product’s specification with the Gulf product', 'Take a baseline oil sample before the switch', 'Ask a Gulf technical expert to validate the switch'];
    out.knowledge = [art('understanding-api-acea-specifications'), art('oem-requirements-and-approvals')];
    out.next = [['See why this product', finderLink(e, sys)], ['Compare products', 'products?cat=' + P.category]]; relEq();
  } else if (intent === 'temperature') {
    const hyd = sys === 'hydraulic';
    out.answer = 'Rising oil temperature usually has a mechanical or operating cause before it has a lubricant cause. Check oil level and cooling first, then filters and load, then take an oil sample to see whether the oil has oxidised or changed viscosity.';
    out.why = ['Low level, a blocked cooler or overloading are the most common causes', 'Oxidised or wrong-grade oil carries heat less well', 'Oxidation and viscosity in an oil analysis show whether the oil is part of the problem'];
    out.actions = ['Check oil level and cooler / radiator condition', 'Check filters and pressure settings', 'Take an oil sample', 'Review the grade against the operating temperature'];
    out.knowledge = [art(hyd ? 'hydraulic-oil-overheating' : 'high-oil-temperature-causes'), art(hyd ? 'high-oil-temperature-causes' : 'hydraulic-oil-overheating')];
    if (e) { const hot = bestFor(e, sys, ['hot']); out.product = hot.primary; out.why.push(`For high-temperature duty the demo data suggests ${hot.primary.name}`); relEq(); }
    out.next = [['See products for high oil temperature', 'problems/high-oil-temperature'], ['Start an oil analysis', 'oil-analysis' + (e ? '?eq=' + e.id : '')]];
  } else if (intent === 'interval') {
    if (!e) { out.answer = 'Check levels daily or at every shift start, and follow the equipment maker’s service schedule for changes. Oil analysis at a regular interval shows whether the schedule suits your operating conditions.'; out.knowledge = [art('extending-drain-intervals-safely'), art('reading-an-oil-analysis-report')]; out.actions = ['Check level and look for leaks at every shift start', 'Sample at a fixed interval', 'Tell me your machine for its demo service schedule']; out.next = [['Open the Equipment Database', 'equipment']]; return out; }
    const l = e.lubrication.find(x => x.system === sys);
    out.answer = `For ${e.name}, the prototype lists a demo ${S.name.toLowerCase()} service interval of ${l.interval} hours. Check the level daily, and sample the oil part-way through the interval so problems show up before the change is due.`;
    out.why = ['The equipment maker’s schedule is the baseline', `${e.environment} duty may justify shorter checks`, 'Oil analysis confirms whether the interval suits the real conditions'];
    out.actions = ['Daily level and leak check', `Sample around ${Math.round(l.interval / 2)} hours on oil`, 'Record each service in the Lubrication Passport'];
    out.knowledge = [art('extending-drain-intervals-safely'), art(sys === 'hydraulic' ? 'hydraulic-oil-overheating' : 'reading-an-oil-analysis-report')];
    out.next = [['Open the equipment profile', eqPath(e)]]; relEq();
  } else if (intent === 'recommend') {
    if (!e) return needMore('Which machine or vehicle is it for? You can name a model such as "JCB 3DX" or a type such as "excavator".');
    out.answer = `For the ${S.name.toLowerCase()} of ${e.name}, the recommended Gulf product in the demo data is ${P.name} (${P.grade}).`;
    out.why = rec.reasons.filter(r => r.ok).map(r => r.t);
    out.actions = ['Review why this product was selected', 'Check the other systems on this machine', 'Validate with a Gulf technical expert before changing product'];
    out.knowledge = articlesFor('equipment', e.id).slice(0, 3);
    out.next = [['See the full recommendation', finderLink(e, sys, conds)], ['Open the equipment profile', eqPath(e)], ['Estimate cost impact', 'tco?eq=' + e.id]]; relEq();
  } else {
    out.answer = 'I can help with lubricant selection, switching to Gulf, oil analysis results, service intervals, temperature problems and lubrication cost. Tell me the machine or vehicle and what you want to know.';
    out.next = [['Open the Equipment Database', 'equipment'], ['Browse Technical Knowledge', 'knowledge']];
    out.related = D.equipment.slice(0, 4);
  }
  if (out.product) { out.evidence.unshift([`${out.product.name} technical data`, 'products/' + out.product.id]); out.evidence.push([`Specification ${out.product.specs[0]}`, 'specifications/' + specByName(out.product.specs[0]).id]); }
  return out;
}
const EXAMPLE_QS = ['What oil should I use in my JCB 3DX?', 'My excavator is operating 10 hours a day in high temperatures. What should I use?', 'Can I switch from my current lubricant to Gulf?', 'Why is my oil temperature increasing?', 'How often should I check my hydraulic oil?', 'My oil analysis shows high iron. What does that mean?', 'How much could I save by switching lubricants?'];
function ask(q) {
  q = q.trim(); if (!q) return;
  const item = { q, r: null }; state.chat.push(item); Analytics.track('advisor_question', { question: q });
  if (R.seg[0] !== 'advisor') { go('advisor'); } else render(true);
  setTimeout(() => { item.r = advise(q); if (item.r.equipment) Analytics.track('recommendation_generated', { source:'advisor', equipment: item.r.equipment.name, intent: item.r.intent }); if (R.seg[0] === 'advisor') { render(true); const m = $$('.msg-q').pop(); if (m) m.scrollIntoView({ block:'start' }); } }, 800);
}
function answerHTML(r) {
  const e = r.equipment, sec = (h, body) => body ? `<h4>${h}</h4>${body}` : '';
  const used = ['Equipment Database', 'Product Finder', 'Technical Knowledge'].concat(r.intent === 'analysis' ? ['Oil Analysis'] : [], r.intent === 'tco' ? ['TCO Calculator'] : [], ['Lubrication Passport']);
  return `<article class="msg-a fade">
    ${r.identified.length ? `<h4>Identified</h4><div>${r.identified.map(i => i[2] ? `<a class="chip" href="#/${i[2]}"><span class="muted">${i[0]}:</span> ${esc(i[1])}</a>` : `<span class="chip"><span class="muted">${i[0]}:</span> ${esc(i[1])}</span>`).join('')}</div>` : ''}
    <h4>Answer</h4><p>${esc(r.answer)}</p>
    ${sec('Why', r.why.length ? `<ul>${r.why.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : '')}
    ${sec('Recommended Gulf product', r.product ? `<p><a href="#/products/${r.product.id}"><strong>${esc(r.product.name)}</strong></a> · ${esc(r.product.grade)} · ${esc(r.product.specs.join(', '))} <span class="demo-badge">demo</span></p>` : '')}
    ${sec('Technical evidence', r.evidence.length ? `<div>${r.evidence.map(x => `<a class="chip" href="#/${x[1]}">${esc(x[0])}</a>`).join('')}</div>` : '')}
    ${sec('Related equipment', r.related.length ? `<div>${r.related.map(x => `<a class="chip" href="#/${eqPath(x)}">${esc(x.name)}</a>`).join('')}</div>` : '')}
    ${sec('Related knowledge', r.knowledge.length ? `<div>${r.knowledge.map(a => `<a class="chip" href="#/knowledge/${a.id}">${esc(a.title)}</a>`).join('')}</div>` : '')}
    ${sec('Recommended next action', r.actions.length ? `<ol>${r.actions.map(a => `<li>${esc(a)}</li>`).join('')}</ol>` : '')}
    <div class="cta-row">${e ? `<a class="btn sm" href="#/${ppLink(e)}">Add to Lubrication Passport</a>` : ''}${r.next.map(n => `<a class="btn sm sec" href="#/${n[1]}">${esc(n[0])}</a>`).join('')}<button class="btn sm sec" data-act="lead" data-arg="expert|${e ? esc(e.name) : ''}|AI Advisor question">Talk to a Gulf Technical Expert</button></div>
    <p class="small muted" style="margin:14px 0 0">Answered from: ${used.join(' → ')} <span class="demo-badge">simulated advisor</span></p>
  </article>`;
}
function viewAdvisor() {
  return `${crumbs(['AI Advisor'])}${pageHead('01 · AI Advisor', 'Ask the Gulf AI Advisor', 'Describe your machine, your operating conditions or a problem. The advisor answers from the same equipment, product, oil analysis and knowledge data as the rest of the platform.')}
  <section class="band"><div class="wrap"><div class="split">
    <div>
      <form class="askbar" data-form="ask"><label class="sr" for="aq">Your question</label><input id="aq" name="q" autocomplete="off" placeholder="e.g. My JCB 3DX has high iron in the engine oil"><button type="submit">Ask</button></form>
      <div class="chat" id="chat" style="margin-top:22px" aria-live="polite">
        ${state.chat.length ? state.chat.map(c => `<div class="msg-q">${esc(c.q)}</div>${c.r ? answerHTML(c.r) : `<div class="msg-a"><div class="thinking"><i></i><i></i><i></i> Reading equipment, product and knowledge data…</div></div>`}`).join('') : `<div class="card plain"><h3>Ask your first question</h3><p class="muted">Pick an example on the right or type your own. Name a machine such as “JCB 3DX” or “Tata Signa” for a specific answer.</p></div>`}
      </div>
      ${state.chat.length ? `<div class="cta-row"><button class="btn sm sec" data-act="clearchat">Start a new conversation</button></div>` : ''}
    </div>
    <aside><div class="card"><h3>Try asking</h3>${EXAMPLE_QS.map(q => `<button class="chip" style="text-align:left" data-act="ask" data-arg="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <div class="card plain" style="margin-top:16px"><h4>How it works in this prototype</h4><p class="small muted">A rule-based engine recognises the equipment, system, operating conditions and oil-analysis parameters in your question, then reads the central data model. No external AI service is called.</p></div></aside>
  </div>${DISC}</div></section>`;
}

/* ============================ PRODUCT FINDER ============================ */
const pool = (kind, s) => D.equipment.filter(e => e.kind === kind && (!s.group || slugify(e.group) === s.group) && (!s.type || slugify(e.type) === s.type) && (!s.oem || e.oem === s.oem));
const condOpts = () => D.conditions.slice(0, 5).map(c => ({ v: c.id, label: c.name }));
const kindSteps = kind => [
  { key:'group', q: kind === 'vehicle' ? 'What kind of vehicle?' : 'Which sector is the equipment used in?', opts: s => uniq(pool(kind, {}).map(e => e.group)).map(g => ({ v: slugify(g), label: g })) },
  { key:'type', q:'Which type?', opts: s => uniq(pool(kind, s).map(e => e.type)).map(t => ({ v: slugify(t), label: t })) },
  { key:'oem', q:'Who is the OEM / manufacturer?', opts: s => uniq(pool(kind, s).map(e => e.oem)).map(o => ({ v: o, label: oemOf(o).name })) },
  { key:'eq', q:'Which model?', opts: s => pool(kind, s).map(e => ({ v: e.id, label: e.model })) },
  { key:'conds', multi: true, q:'What are the operating conditions?', opts: condOpts }
];
const eqCtx = (s, l) => { const e = eqp(s.eq); return { equipment: e, subject: e.name, trail: [e.group, e.type, oemOf(e.oem).name, e.model], systems: eqSystems(e), conditions: s.conds }; };
const FPATHS = {
  equipment: { title:'My Equipment', icon:'🚜', sub:'Construction, farm and industrial equipment', steps: kindSteps('equipment'), build: eqCtx },
  vehicle: { title:'My Vehicle', icon:'🚗', sub:'Cars, two-wheelers, trucks and buses', steps: kindSteps('vehicle'), build: eqCtx },
  industry: { title:'My Industry', icon:'🏭', sub:'Start from your sector', steps: [
    { key:'industry', q:'Which industry are you in?', opts: () => D.industries.filter(i => D.products.some(p => p.industries.includes(i.id))).map(i => ({ v: i.id, label: i.name, icon: i.icon })) },
    { key:'system', q:'Which application?', opts: s => D.systems.filter(y => D.products.some(p => p.industries.includes(s.industry) && p.systems.includes(y.id))).map(y => ({ v: y.id, label: y.name, icon: y.icon, sub: y.fluid })) },
    { key:'conds', multi: true, q:'What is your requirement?', opts: condOpts }
  ], build: s => ({ subject: `${indOf(s.industry).name} equipment`, trail: [indOf(s.industry).name, sysOf(s.system).name], systems: { [s.system]: D.products.filter(p => p.industries.includes(s.industry) && p.systems.includes(s.system)).map(p => p.id) }, sys: s.system, conditions: s.conds }) },
  application: { title:'My Application', icon:'⚙️', sub:'Engine, hydraulics, gears, grease', steps: [
    { key:'system', q:'What needs lubricating?', opts: () => D.systems.map(y => ({ v: y.id, label: y.name, icon: y.icon, sub: y.fluid })) },
    { key:'industry', q:'Where is it used?', opts: s => D.industries.filter(i => D.products.some(p => p.industries.includes(i.id) && p.systems.includes(s.system))).map(i => ({ v: i.id, label: i.name, icon: i.icon })) },
    { key:'conds', multi: true, q:'What are the operating conditions?', opts: condOpts }
  ], build: s => ({ subject: `${indOf(s.industry).name.toLowerCase()} use`, trail: [sysOf(s.system).name, indOf(s.industry).name], systems: { [s.system]: D.products.filter(p => p.industries.includes(s.industry) && p.systems.includes(s.system)).map(p => p.id) }, sys: s.system, conditions: s.conds }) },
  problem: { title:'My Problem', icon:'🛠️', sub:'Temperature, load, dust, wear and more', steps: [
    { key:'problem', q:'What are you trying to solve?', opts: () => D.problems.map(p => ({ v: p.id, label: p.name, icon: p.icon })) },
    { key:'system', q:'In which system?', opts: s => { const tag = by('problems', s.problem).tag; return D.systems.filter(y => D.products.some(p => p.tags.includes(tag) && p.systems.includes(y.id))).map(y => ({ v: y.id, label: y.name, icon: y.icon, sub: y.fluid })); } }
  ], build: s => { const pr = by('problems', s.problem); return { subject: pr.name.toLowerCase(), trail: [pr.name, sysOf(s.system).name], systems: { [s.system]: D.products.filter(p => p.tags.includes(pr.tag) && p.systems.includes(s.system)).map(p => p.id) }, sys: s.system, conditions: [pr.tag], problem: pr }; } }
};
const finderLink = (e, sys, conds) => `finder/${e.kind}/${slugify(e.group)}/${slugify(e.type)}/${e.oem}/${e.id}/${(conds && conds.length ? conds : e.tags).join(',')}${sys ? '?sys=' + sys : ''}`;
function viewFinder(r) {
  const path = FPATHS[r.seg[1]];
  if (!path) {
    const extra = [['specifications', '📋', 'Specification / Approval', 'API, ACEA, JASO, ISO VG, SAE'], ['products', '🔍', 'I Know the Product', 'Browse the Gulf range'], ['oems', '🏷️', 'By OEM', 'Start from the equipment maker']];
    return `${crumbs(['Product Finder'])}${pageHead('02 · Product Finder', 'Find the Right Gulf Lubricant', 'Search by vehicle, equipment, industry, application, specification, problem, product or OEM. Every route reads the same data.')}
    <section class="band"><div class="wrap"><h2>How would you like to search?</h2>
      <div class="grid g4">${Object.entries(FPATHS).map(([k, p]) => `<a class="opt" href="#/finder/${k}"><span class="ico" aria-hidden="true">${p.icon}</span><strong>${p.title}</strong><span class="sub">${p.sub}</span></a>`).join('')}${extra.map(x => `<a class="opt" href="#/${x[0]}"><span class="ico" aria-hidden="true">${x[1]}</span><strong>${x[2]}</strong><span class="sub">${x[3]}</span></a>`).join('')}</div>
      <div class="cta-row"><a class="btn" href="#/${finderLink(eqp('jcb-3dx'), 'engine', ['heavy', 'hot'])}">See an example: JCB 3DX</a><button class="btn sec" data-act="lead" data-arg="recommendation||Product Finder">Get Product Recommendation</button></div>${DISC}</div></section>`;
  }
  const segs = r.seg.slice(2), sel = {}, labels = [];
  for (let i = 0; i < segs.length && i < path.steps.length; i++) { const st = path.steps[i]; if (st.multi) sel[st.key] = segs[i] === 'none' ? [] : segs[i].split(',').filter(c => cond(c)); else { const o = st.opts(sel).find(x => x.v === segs[i]); if (!o) return notFound(); sel[st.key] = o.v; labels.push(o.label); } }
  const base = `finder/${r.seg[1]}`;
  if (segs.length >= path.steps.length) { const ctx = path.build(sel, labels); ctx.sys = r.q.sys && ctx.systems[r.q.sys] ? r.q.sys : (ctx.sys || Object.keys(ctx.systems)[0]); return viewResult(ctx, base + '/' + segs.join('/'), path); }
  const i = segs.length, st = path.steps[i], opts = st.opts(sel), here = base + (segs.length ? '/' + segs.join('/') : '');
  if (state.multi.key !== here) state.multi = { key: here, sel: [] };
  return `${crumbs([['Product Finder', 'finder'], path.title])}
  <section class="band"><div class="wrap">
    <div class="eyebrow">${path.title} · Step ${i + 1} of ${path.steps.length}</div>
    <ol class="steps" aria-hidden="true">${path.steps.map((x, j) => `<li class="${j < i ? 'done' : j === i ? 'cur' : ''}"></li>`).join('')}</ol>
    ${labels.length ? `<p><span class="muted">Your selection:</span> ${labels.map(t => `<span class="tag">${esc(t)}</span>`).join('→ ')}</p>` : ''}
    <h1 id="view-title" tabindex="-1" style="font-size:clamp(24px,3vw,32px)">${esc(st.q)}</h1>
    ${st.multi ? '<p class="muted">Select all that apply, then continue.</p>' : ''}
    <div class="grid g4" role="group" aria-label="${esc(st.q)}">${opts.map(o => st.multi
      ? `<button class="opt ${state.multi.sel.includes(o.v) ? 'sel' : ''}" data-act="multi" data-arg="${o.v}" aria-pressed="${state.multi.sel.includes(o.v)}"><strong>${esc(o.label)}</strong></button>`
      : `<a class="opt" href="#/${here}/${o.v}">${o.icon ? `<span class="ico" aria-hidden="true">${o.icon}</span>` : ''}<strong>${esc(o.label)}</strong>${o.sub ? `<span class="sub">${esc(o.sub)}</span>` : ''}</a>`).join('')}</div>
    <div class="cta-row">${st.multi ? `<a class="btn" id="wiz-go" href="#/${here}/${state.multi.sel.join(',') || 'none'}">Show Recommendation</a>` : ''}<button class="btn sec" data-act="back">← Back</button><a href="#/finder">Reset Finder</a></div>${DISC}
  </div></section>`;
}
function packSVG(p) {
  const col = { MCO:'#d6336c', PCMO:'#12407f', CVO:'#0b2a5b', GEAR:'#5b6676', HYD:'#1e6b45', AGRI:'#2f7d32', IND:'#4a3f8f', GREASE:'#7a5200', EV:'#0a7e8c' }[p.category];
  return `<svg class="pack" viewBox="0 0 108 150" role="img" aria-label="Pack placeholder for ${esc(p.name)}"><rect x="30" y="6" width="34" height="18" rx="3" fill="#1c2533"/><rect x="8" y="28" width="92" height="116" rx="9" fill="${col}"/><rect x="8" y="60" width="92" height="50" fill="#fff"/><text x="54" y="80" text-anchor="middle" font-size="11" font-weight="800" fill="#0b2a5b" font-family="Arial">${p.category}</text><text x="54" y="98" text-anchor="middle" font-size="${p.grade.length > 9 ? 7 : 11}" font-weight="800" fill="#c9480c" font-family="Arial">${esc(p.grade)}</text><rect x="8" y="118" width="92" height="6" fill="#f26522"/></svg>`;
}
function productCard(p) {
  const on = state.compare.includes(p.id);
  return `<article class="pcard"><div class="img">${packSVG(p)}</div><div class="body"><span class="cat">${D.categories[p.category]}</span><h3>${esc(p.name)}</h3>
    <div><span class="tag">${esc(p.grade)}</span><span class="tag">${esc(p.specs[0])}</span></div><p class="small muted" style="margin:0">${esc(p.applications[0])}</p>
    <div class="acts"><a class="btn sm" href="#/products/${p.id}">View Product</a><button class="btn sm sec" data-act="cmp" data-arg="${p.id}" aria-pressed="${on}">${on ? '✓ In Compare' : 'Add to Compare'}</button></div></div></article>`;
}
function viewResult(ctx, basePath, path) {
  const rec = recommend(ctx), keys = Object.keys(ctx.systems), e = ctx.equipment;
  const head = `${crumbs([['Product Finder', 'finder'], path.title, 'Recommendation'])}<section class="band"><div class="wrap"><div class="eyebrow">Recommended Gulf lubricant</div><h1 id="view-title" tabindex="-1" style="font-size:clamp(24px,3vw,32px)">Recommended for ${esc(ctx.subject)}</h1>`;
  if (!rec) return head + `<div class="card"><h3>We couldn't find an exact match.</h3><p>Try another equipment model, specification or application, or ask a Gulf technical expert.</p><button class="btn" data-act="lead" data-arg="recommendation||Product Finder">Get Product Recommendation</button></div></div></section>`;
  const p = rec.primary, S = sysOf(ctx.sys), sel = uniq(ctx.trail.concat(ctx.conditions.map(c => cond(c).name)));
  return head + `
    ${keys.length > 1 ? `<div style="margin-bottom:14px"><span class="muted">What are you looking for?</span> ${keys.map(k => `<a class="chip ${k === ctx.sys ? 'on' : ''}" href="#/${basePath}?sys=${k}" ${k === ctx.sys ? 'aria-current="true"' : ''}>${sysOf(k).fluid}</a>`).join('')}</div>` : ''}
    <article class="reco"><div>${packSVG(p)}</div><div>
      <span class="tag" style="background:var(--orange);color:#1a0d05">Recommended for your application</span>
      <h2 style="margin-top:8px">${esc(p.name)}</h2><p>${esc(p.description)}</p>
      <dl class="kv"><div><dt>Viscosity / grade</dt><dd>${esc(p.grade)}</dd></div><div><dt>Application</dt><dd>${S.name} · ${S.fluid}</dd></div><div><dt>Specifications <span class="demo-badge">demo</span></dt><dd>${esc(p.specs.join(', '))}</dd></div><div><dt>Approvals</dt><dd>From technical database in production</dd></div><div><dt>Compatibility</dt><dd>${esc(ctx.subject)}</dd></div><div><dt>Operating conditions</dt><dd>${esc(p.tags.slice(0, 4).map(t => cond(t).name).join(', '))}</dd></div></dl>
      <div class="cta-row"><button class="btn" data-act="lead" data-arg="recommendation|${e ? esc(e.name) : ''}|Product Finder: ${esc(p.name)}">Get Product Recommendation</button><a class="btn sec" href="#/products/${p.id}">View Product &amp; TDS</a>${e ? `<a class="btn sec" href="#/${eqPath(e)}">Equipment Profile</a>` : ''}<a class="btn sec" href="#/locator/distributor">Find a Distributor</a></div>
    </div></article>
    <h2 id="why" style="margin-top:36px">Why this product?</h2>
    <div class="logic"><div class="card"><h4>Your selection</h4>${sel.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div><div class="arr" aria-hidden="true">→</div>
      <div class="card hot"><h4>Recommendation</h4><strong style="color:var(--blue);font-size:18px">${esc(p.name)}</strong><br><span class="muted">${esc(p.grade)} · ${S.fluid}</span></div><div class="arr" aria-hidden="true">→</div>
      <div class="card"><h4>Why?</h4><ul class="why">${rec.reasons.map(x => `<li class="${x.ok ? '' : 'warn'}">${esc(x.t)}</li>`).join('')}</ul></div></div>
    <h3 style="margin-top:32px">Key benefits</h3><div class="grid g4">${p.benefits.map(b => `<div class="card plain"><strong>${esc(b)}</strong></div>`).join('')}</div>
    ${rec.alternatives.length ? `<h3 style="margin-top:32px">Related Gulf products for this application</h3><div class="grid g3">${rec.alternatives.slice(0, 3).map(productCard).join('')}</div>` : ''}
    ${e ? `<h3 style="margin-top:32px">Continue with ${esc(e.name)}</h3><div class="grid g4">
      <a class="opt" href="#/oil-analysis?eq=${e.id}"><span class="num">04</span><strong>Analyze my oil</strong><span class="sub">Turn oil condition into maintenance decisions</span></a>
      <a class="opt" href="#/tco?eq=${e.id}"><span class="num">05</span><strong>Calculate lubrication cost</strong><span class="sub">Illustrative TCO scenario</span></a>
      <a class="opt" href="#/${ppLink(e)}"><span class="num">06</span><strong>Add to Lubrication Passport</strong><span class="sub">Build a permanent record</span></a>
      <a class="opt" href="#/graph?focus=${e.id}"><span class="num">07</span><strong>See the knowledge graph</strong><span class="sub">How everything connects</span></a></div>` : ''}
    <div class="cta-row"><button class="btn sec" data-act="back">← Back</button><a href="#/finder">Reset Finder</a></div>${DISC}</div></section>`;
}
function viewProducts(r) {
  if (r.seg[1]) return viewProduct(prod(r.seg[1]));
  const cat = r.q.cat, list = D.products.filter(p => !cat || p.category === cat);
  return `${crumbs([['Product Finder', 'finder'], 'Products'])}${pageHead('Product Finder · Products', 'Gulf product range', 'Filter by category, open a product, or add up to three to compare.')}
  <section class="band"><div class="wrap"><div role="group" aria-label="Filter by category" style="margin-bottom:16px"><a class="chip ${!cat ? 'on' : ''}" href="#/products">All (${D.products.length})</a>${Object.keys(D.categories).map(c => `<a class="chip ${cat === c ? 'on' : ''}" href="#/products?cat=${c}">${D.categories[c]}</a>`).join('')}</div>
  <div class="grid g4">${list.map(productCard).join('')}</div>${DISC}</div></section>`;
}
function viewProduct(p) {
  if (!p) return notFound();
  const used = equipmentUsing(p.id), arts = articlesFor('products', p.id), on = state.compare.includes(p.id), related = D.products.filter(x => x.id !== p.id && x.systems.some(s => p.systems.includes(s))).slice(0, 3);
  // PRODUCTION: Product schema with isRelatedTo → equipment pages (vehicle/product relationships)
  setLD({ '@context':'https://schema.org', '@type':'Product', name: p.name, category: D.categories[p.category], description: p.description, brand: { '@type':'Brand', name:'Gulf' }, additionalProperty: [['Grade', p.grade], ['Specifications', p.specs.join(', ')]].map(([name, value]) => ({ '@type':'PropertyValue', name, value })), isRelatedTo: used.slice(0, 5).map(e => ({ '@type':'Product', name: e.name })) });
  return `${crumbs([['Product Finder', 'finder'], ['Products', 'products'], p.name])}
  <section class="band"><div class="wrap">${urlStrip('products/' + p.id)}
    <div class="reco" style="border-left-color:var(--blue)"><div>${packSVG(p)}</div><div><div class="eyebrow">${D.categories[p.category]}</div><h1 id="view-title" tabindex="-1">${esc(p.name)}</h1><p>${esc(p.description)}</p>
      <div>${[p.grade, ...p.systems.map(s => sysOf(s).fluid), ...p.tags.slice(0, 4).map(t => cond(t).name)].map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      <div class="cta-row"><button class="btn" data-act="lead" data-arg="recommendation||Product: ${esc(p.name)}">Get Product Recommendation</button><button class="btn sec" data-act="cmp" data-arg="${p.id}" aria-pressed="${on}">${on ? '✓ In Compare' : 'Add to Compare'}</button><button class="btn sec" data-act="tds" data-arg="${p.id}">Download TDS</button><a class="btn sec" href="#/locator/distributor">Find a Distributor</a></div></div></div>
  </div></section>
  <section class="band grey"><div class="wrap"><div class="grid g2">
    <div class="card"><h2>Technical data <span class="demo-badge">demo</span></h2><div class="tblwrap"><table class="tbl"><tbody>
      ${[['Grade', p.grade], ['Performance level', p.specs.join(', ')], ['Base oil type', p.base], ['Systems', p.systems.map(s => sysOf(s).name).join(', ')], ['Applications', p.applications.join('; ')], ['Operating conditions', p.tags.map(t => cond(t).name).join(', ')], ['Indicative cost position', p.position + ' (illustrative)']].map(x => `<tr><th scope="row">${x[0]}</th><td>${esc(x[1])}</td></tr>`).join('')}</tbody></table></div>
      <p class="small muted" style="margin-top:8px">Rendered as HTML so search engines and AI answer engines can read it. The TDS PDF stays available.</p></div>
    <div class="card"><h2>Specifications <span class="demo-badge">demo</span></h2><div>${pSpecs(p).map(s => `<a class="chip" href="#/specifications/${specByName(s).id}">${esc(s)}</a>`).join('')}</div>
      <h3 style="margin-top:16px">OEM approvals</h3><p class="small muted">Deliberately not shown in this prototype. In production this block lists verified approvals from the Gulf technical database, each linked to its OEM page.</p>
      <h3>Why Gulf recommends this</h3><ul>${p.benefits.map(b => `<li>${esc(b)}</li>`).join('')}</ul></div>
  </div></div></section>
  <section class="band"><div class="wrap">
    <h2>Used in these machines</h2>${used.length ? `<div>${used.map(e => `<a class="chip" href="#/${eqPath(e)}">${esc(e.name)} <span class="muted">· ${esc(e.type)}</span></a>`).join('')}</div>` : '<p class="muted">Application-based product. Ask a technical expert about your equipment.</p>'}
    ${arts.length ? `<h2 style="margin-top:32px">Related technical knowledge</h2><div class="grid g3">${arts.slice(0, 3).map(articleCard).join('')}</div>` : ''}
    ${related.length ? `<h2 style="margin-top:32px">Related products</h2><div class="grid g3">${related.map(productCard).join('')}</div>` : ''}
    <div class="cta-row"><a class="btn sec" href="#/graph?focus=${used[0] ? used[0].id : 'jcb-3dx'}">See in Knowledge Graph</a><button class="btn sec" data-act="ask" data-arg="Can I switch from my current lubricant to Gulf?">Ask Gulf AI</button><button class="btn sec" data-act="back">← Back</button></div>${DISC}
  </div></section>`;
}
function toggleCompare(id) {
  if (state.compare.includes(id)) state.compare = state.compare.filter(x => x !== id);
  else if (state.compare.length >= 3) return toast('You can compare up to 3 products. Remove one first.');
  else state.compare.push(id);
  render(true);
}
function renderTray() {
  const t = $('#tray'); if (!state.compare.length || R.seg[0] === 'compare') { t.hidden = true; return; }
  t.hidden = false;
  t.innerHTML = `<div class="wrap"><strong>Compare (${state.compare.length}/3)</strong>${state.compare.map(id => `<button class="chip" data-act="cmp" data-arg="${id}" aria-label="Remove ${esc(prod(id).name)}">${esc(prod(id).name)} ✕</button>`).join('')}<span style="flex:1"></span><a class="btn sm" href="#/compare">Compare Products</a></div>`;
}
function viewCompare() {
  const ps = state.compare.map(prod);
  const rows = [['Category', p => D.categories[p.category]], ['Viscosity / grade', p => p.grade], ['Application', p => p.applications.join('; ')], ['Specifications', p => p.specs.join(', ')], ['Approvals', () => 'From technical database in production'], ['Operating conditions', p => p.tags.map(t => cond(t).name).join(', ')], ['Benefits', p => p.benefits.join('; ')], ['Indicative cost position', p => p.position + ' (illustrative)'], ['Recommended use', p => p.systems.map(s => sysOf(s).name).join(', ') + ' · ' + p.industries.map(i => indOf(i).name).slice(0, 3).join(', ')]];
  return `${crumbs([['Product Finder', 'finder'], 'Compare'])}${pageHead('Product Finder · Compare', 'Compare Products', 'Up to three products side by side.')}
  <section class="band"><div class="wrap">${ps.length < 2 ? `<div class="card"><p>Select at least two products with “Add to Compare”.${ps.length ? ` Selected so far: <strong>${esc(ps[0].name)}</strong>.` : ''}</p><a class="btn" href="#/products">Browse Products</a></div>` :
    `<div class="tblwrap"><table class="tbl"><thead><tr><th scope="col">Product</th>${ps.map(p => `<th scope="col">${esc(p.name)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr><th scope="row">${r[0]}</th>${ps.map(p => `<td>${esc(r[1](p))}</td>`).join('')}</tr>`).join('')}
      <tr><th scope="row">Actions</th>${ps.map(p => `<td><a class="btn sm" href="#/products/${p.id}">View</a> <button class="link" data-act="cmp" data-arg="${p.id}">Remove</button></td>`).join('')}</tr></tbody></table></div>
      <div class="cta-row"><button class="btn" data-act="lead" data-arg="expert||Comparison: ${esc(ps.map(p => p.name).join(' vs '))}">Ask an Expert Which Is Right</button><button class="btn sec" data-act="clearcmp">Clear Comparison</button></div>`}${DISC}</div></section>`;
}

/* =========================== EQUIPMENT DATABASE =========================== */
function viewEquipment(r) {
  if (r.seg[1]) return viewEquipmentProfile(D.equipment.find(e => e.oem === r.seg[1] && e.slug === r.seg[2]));
  const g = r.q.group, groups = uniq(D.equipment.map(e => e.group)), list = D.equipment.filter(e => !g || slugify(e.group) === g);
  return `${crumbs(['Equipment Database'])}${pageHead('03 · Equipment Database', 'Equipment Database', 'Find your machine or vehicle to see its lubrication requirements, recommended Gulf products and everything connected to it.')}
  <section class="band"><div class="wrap">
    <div class="field" style="max-width:520px"><label for="eqf">Search equipment</label><input id="eqf" type="search" data-input="eqfilter" placeholder="e.g. JCB, excavator, tractor, compressor" autocomplete="off"></div>
    <div role="group" aria-label="Filter by category" style="margin-bottom:16px"><a class="chip ${!g ? 'on' : ''}" href="#/equipment">All (${D.equipment.length})</a>${groups.map(x => `<a class="chip ${g === slugify(x) ? 'on' : ''}" href="#/equipment?group=${slugify(x)}">${x}</a>`).join('')}</div>
    <div class="grid g4" id="eqlist">${list.map(e => `<a class="opt" data-t="${esc(norm(eqText(e)))}" href="#/${eqPath(e)}"><span class="sub">${esc(e.group)} · ${esc(e.type)}</span><strong>${esc(e.name)}</strong><span class="sub">${e.lubrication.length} lubricated systems</span></a>`).join('')}</div>
    <p id="eq-empty" class="card plain" hidden>We couldn't find an exact match. Try another equipment model, specification or application.</p>
    <div class="cta-row"><button class="btn" data-act="lead" data-arg="profile||Equipment Database">Build Lubrication Profile</button><a class="btn sec" href="#/oems">Browse by OEM</a></div>${DISC}
  </div></section>`;
}
function viewEquipmentProfile(e) {
  if (!e) return notFound();
  const reps = allReports().filter(x => x.equipment === e.id), last = reps.sort((a, b) => a.date.localeCompare(b.date))[reps.length - 1], arts = articlesFor('equipment', e.id), pp = passportFor(e.id);
  // PRODUCTION: FAQPage schema generated from the lubrication chart for this model
  setLD({ '@context':'https://schema.org', '@type':'FAQPage', mainEntity: e.lubrication.map(l => ({ '@type':'Question', name: `Which ${sysOf(l.system).fluid.toLowerCase()} is recommended for ${e.name}?`, acceptedAnswer: { '@type':'Answer', text: `${bestFor(e, l.system).primary.name} (${bestFor(e, l.system).primary.grade}) – demo data.` } })) });
  return `${crumbs([['Equipment Database', 'equipment'], [oemOf(e.oem).name, 'oems/' + e.oem], e.model])}
  <section class="band"><div class="wrap">${urlStrip(eqPath(e))}
    <div class="eyebrow">${esc(e.group)} · ${esc(e.type)}</div><h1 id="view-title" tabindex="-1">${esc(e.name)}</h1>
    <dl class="kv"><div><dt>Equipment</dt><dd>${esc(e.name)}</dd></div><div><dt>Category</dt><dd>${esc(e.type)}</dd></div><div><dt>Industry</dt><dd><a href="#/industries/${e.industry}">${indOf(e.industry).name}</a></dd></div><div><dt>Engine</dt><dd>${esc(e.engine)}</dd></div><div><dt>Operating environment</dt><dd>${esc(e.environment)}</dd></div><div><dt>OEM</dt><dd><a href="#/oems/${e.oem}">${oemOf(e.oem).name}</a></dd></div></dl>
    <div class="cta-row"><a class="btn" href="#/${ppLink(e)}">${pp ? 'Open Lubrication Passport' : 'Build Lubrication Profile'}</a><a class="btn sec" href="#/oil-analysis?eq=${e.id}">Analyze My Oil</a><a class="btn sec" href="#/tco?eq=${e.id}">Calculate TCO</a><button class="btn sec" data-act="lead" data-arg="expert|${esc(e.name)}|Equipment profile">Expert Support</button></div>
    <h2 style="margin-top:34px">Lubrication requirements <span class="demo-badge">prototype technical data</span></h2>
    <div class="tblwrap"><table class="tbl"><thead><tr><th scope="col">System</th><th scope="col">Recommended fluid</th><th scope="col">Grade</th><th scope="col">Specification</th><th scope="col">Interval</th><th scope="col"></th></tr></thead><tbody>
      ${e.lubrication.map(l => { const p = bestFor(e, l.system).primary; return `<tr><th scope="row">${sysOf(l.system).name}</th><td><a href="#/products/${p.id}"><strong>${esc(p.name)}</strong></a></td><td>${esc(p.grade)}</td><td><a href="#/specifications/${specByName(p.specs[0]).id}">${esc(p.specs[0])}</a></td><td>Demo: ${l.interval} h</td><td><a href="#/${finderLink(e, l.system)}">Why this product?</a></td></tr>`; }).join('')}</tbody></table></div>
  </div></section>
  <section class="band grey"><div class="wrap"><h2>Everything connected to ${esc(e.name)}</h2>
    <div class="grid g4">
      <a class="opt" href="#/${finderLink(e)}"><span class="num">Recommended products</span><strong>${uniq(e.lubrication.map(l => bestFor(e, l.system).primary.id)).length} Gulf products</strong><span class="sub">With the reasoning for each</span></a>
      <a class="opt" href="#/industries/${e.industry}"><span class="num">Applications</span><strong>${indOf(e.industry).name}</strong><span class="sub">${esc(e.environment)}</span></a>
      <a class="opt" href="#/oil-analysis${last ? '/' + last.id : '?eq=' + e.id}"><span class="num">Oil analysis</span><strong>${last ? `${reps.length} report${reps.length > 1 ? 's' : ''} · ${STATUS[reportStatus(last)].toUpperCase()}` : 'No analysis yet'}</strong><span class="sub">${last ? 'Latest ' + fmtDate(last.date) : 'No analysis available for this equipment yet.'}</span></a>
      <a class="opt" href="#/tco?eq=${e.id}"><span class="num">TCO</span><strong>Lubrication cost model</strong><span class="sub">Illustrative scenario</span></a>
      <a class="opt" href="#/${ppLink(e)}"><span class="num">Lubrication Passport</span><strong>${pp ? 'Asset ' + esc(pp.assetId) : 'Create a passport'}</strong><span class="sub">Maintenance record and QR</span></a>
      <a class="opt" href="#/knowledge?eq=${e.id}"><span class="num">Technical knowledge</span><strong>${arts.length} related article${arts.length === 1 ? '' : 's'}</strong><span class="sub">Guides and troubleshooting</span></a>
      <a class="opt" href="#/graph?focus=${e.id}"><span class="num">Knowledge graph</span><strong>See the relationships</strong><span class="sub">OEM to TCO in one view</span></a>
      <button class="opt" data-act="ask" data-arg="What oil should I use in my ${esc(e.name)}?"><span class="num">AI Advisor</span><strong>Ask about this machine</strong><span class="sub">Answers from this profile</span></button>
    </div>
    ${arts.length ? `<h2 style="margin-top:32px">Maintenance and troubleshooting</h2><div class="grid g3">${arts.slice(0, 3).map(articleCard).join('')}</div>` : ''}${DISC}
  </div></section>`;
}

/* ============================== OIL ANALYSIS ==============================
   PRODUCTION: reports arrive from the laboratory system (LIMS) through the
   API; limits come from the technical team per product and system.        */
const STATUS = { good:'Good', watch:'Watch', action:'Action required', na:'n/a' };
const allReports = () => D.oilAnalysis.concat(Store.get('reports', []));
const reportsFor = (eqId, sys) => allReports().filter(r => r.equipment === eqId && (!sys || r.system === sys)).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
function paramStatus(p, v, rep) {
  if (p.dir === 'band') { const dev = Math.abs(v - rep.viscNominal) / rep.viscNominal * 100; return dev >= p.action ? 'action' : dev >= p.watch ? 'watch' : 'good'; }
  if (p.dir === 'low') return !v ? 'na' : v <= p.action ? 'action' : v <= p.watch ? 'watch' : 'good';
  return v >= p.action ? 'action' : v >= p.watch ? 'watch' : 'good';
}
const reportStatus = rep => { const s = D.oilParams.map(p => paramStatus(p, rep.values[p.id], rep)); return s.includes('action') ? 'action' : s.includes('watch') ? 'watch' : 'good'; };
const flaggedParams = eqId => { const reps = reportsFor(eqId), last = reps[reps.length - 1]; return last ? D.oilParams.filter(p => ['watch', 'action'].includes(paramStatus(p, last.values[p.id], last))) : []; };
const badge = st => `<span class="status ${st === 'na' ? '' : st}">${STATUS[st]}</span>`;
function generateReport(e, sys, info) {   // deterministic demo values that scale with hours on oil
  const l = e.lubrication.find(x => x.system === sys), p = prod(info.product || l.products[0]), f = Math.max(0.1, info.hoursOnOil / (l.interval || 250));
  const nominal = sys === 'engine' ? 14.5 : (parseInt((p.grade.match(/VG (\d+)/) || [])[1]) || 46), r1 = n => Math.round(n * 10) / 10;
  const n = Store.get('reports', []).length + 101;
  return { id: 'OA-' + n, user: true, equipment: e.id, system: sys, product: p.id, date: info.date, hoursOnOil: info.hoursOnOil, equipmentHours: info.equipmentHours, sampleId: info.sampleId, viscNominal: nominal,
    values: { visc: r1(nominal * (1 - 0.03 * f)), fe: Math.round(6 + 20 * f), cu: Math.round(2 + 5 * f), al: Math.round(1 + 4 * f), si: Math.round(5 + 8 * f), water: Math.round((0.02 + 0.03 * f) * 100) / 100, oxidation: Math.round(4 + 9 * f), tbn: sys === 'engine' ? r1(Math.max(3, 9 - 3.2 * f)) : 0, tan: r1(0.6 + 1.2 * f), pc: Math.round(17 + 1.5 * f) } };
}
function viewOil(r) {
  if (r.seg[1]) return viewOilReport(allReports().find(x => x.id === r.seg[1]));
  const e = eqp(r.q.eq) || eqp('jcb-3dx'), sys = e.lubrication.find(l => l.system === r.q.sys) ? r.q.sys : e.lubrication.filter(l => l.system !== 'grease')[0].system, l = e.lubrication.find(x => x.system === sys), existing = reportsFor(e.id);
  return `${crumbs(['Oil Analysis'])}${pageHead('04 · Gulf Oil Analysis', 'Gulf Oil Analysis', 'Turn oil condition into maintenance intelligence.')}
  <section class="band"><div class="wrap"><div class="split"><div>
    <form data-form="oil" novalidate>
      <fieldset><legend>Step 1 · Select equipment</legend><div class="field"><label for="oa-eq">Equipment</label><select id="oa-eq" name="eq" data-change="oaeq">${D.equipment.map(x => `<option value="${x.id}" ${x.id === e.id ? 'selected' : ''}>${esc(x.name)} – ${esc(x.type)}</option>`).join('')}</select></div></fieldset>
      <fieldset><legend>Step 2 · Select system</legend><div class="field"><label for="oa-sys">System</label><select id="oa-sys" name="sys" data-change="oasys">${e.lubrication.filter(x => x.system !== 'grease').map(x => `<option value="${x.system}" ${x.system === sys ? 'selected' : ''}>${sysOf(x.system).name}</option>`).join('')}</select></div></fieldset>
      <fieldset><legend>Step 3 · Enter sample information</legend><div class="formgrid three">
        <div class="field" data-f="sampleId"><label for="oa-id">Sample ID</label><input id="oa-id" name="sampleId" value="S-${String(Date.now()).slice(-5)}"><span class="err" role="alert"></span></div>
        <div class="field" data-f="hoursOnOil"><label for="oa-h">Hours on oil</label><input id="oa-h" name="hoursOnOil" type="number" min="1" value="${Math.round(l.interval * 0.6)}"><span class="err" role="alert"></span></div>
        <div class="field" data-f="equipmentHours"><label for="oa-eh">Equipment hours</label><input id="oa-eh" name="equipmentHours" type="number" min="1" value="5900"><span class="err" role="alert"></span></div>
        <div class="field"><label for="oa-g">Oil in use</label><select id="oa-g" name="product">${l.products.map(id => `<option value="${id}">${esc(prod(id).name)} ${esc(prod(id).grade)}</option>`).join('')}</select></div>
        <div class="field" data-f="date"><label for="oa-d">Sampling date</label><input id="oa-d" name="date" type="date" value="${today()}"><span class="err" role="alert"></span></div>
      </div></fieldset>
      <fieldset><legend>Step 4 · Show analysis</legend><p class="small muted">The prototype generates illustrative laboratory values that scale with hours on oil. In production the laboratory result is attached to the sample ID.</p><button class="btn" type="submit">Analyze Sample</button></fieldset>
    </form></div>
    <aside><div class="card"><h3>Reports for ${esc(e.name)}</h3>${existing.length ? existing.slice().reverse().map(x => `<p style="margin-bottom:8px"><a href="#/oil-analysis/${x.id}"><strong>${x.id}</strong></a> · ${sysOf(x.system).name} · ${fmtDate(x.date)} ${badge(reportStatus(x))}</p>`).join('') : '<p class="muted">No analysis available for this equipment yet.</p>'}</div>
      <div class="card plain" style="margin-top:16px"><h4>Sample reports in the demo data</h4>${D.oilAnalysis.filter(x => x.equipment !== e.id).map(x => `<p class="small" style="margin-bottom:6px"><a href="#/oil-analysis/${x.id}">${x.id}</a> · ${esc(eqp(x.equipment).name)} ${badge(reportStatus(x))}</p>`).join('')}</div></aside>
  </div>${DISC}</div></section>`;
}
function chartSVG(series, p) {
  const W = 720, H = 280, L = 56, Rt = 24, T = 20, B = 44, vals = series.map(r => r.values[p.id]);
  const limits = p.dir === 'high' ? [p.watch, p.action] : p.dir === 'low' ? [p.watch, p.action] : [];
  const max = Math.max(...vals, ...(p.dir === 'high' ? [p.watch] : limits)) * 1.15 || 1, min = p.dir === 'band' ? Math.min(...vals) * 0.96 : 0, top = p.dir === 'band' ? Math.max(...vals) * 1.04 : max;
  const x = i => L + (series.length === 1 ? (W - L - Rt) / 2 : i * (W - L - Rt) / (series.length - 1)), y = v => T + (H - T - B) * (1 - (v - min) / (top - min));
  const ticks = [0, 1, 2, 3, 4].map(i => min + (top - min) * i / 4);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${p.name} trend across ${series.length} samples: ${vals.join(', ')} ${p.unit}">
    ${ticks.map(t => `<line x1="${L}" x2="${W - Rt}" y1="${y(t)}" y2="${y(t)}" stroke="#e6e9ef"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end" font-size="12" fill="#5b6676">${top - min < 8 ? Math.round(t * 100) / 100 : Math.round(t)}</text>`).join('')}
    ${p.dir === 'high' && p.watch < top ? `<line x1="${L}" x2="${W - Rt}" y1="${y(p.watch)}" y2="${y(p.watch)}" stroke="#8a5a00" stroke-dasharray="6 4"/><text x="${W - Rt}" y="${y(p.watch) - 6}" text-anchor="end" font-size="12" font-weight="700" fill="#8a5a00">Watch limit ${p.watch} (demo)</text>` : ''}
    <polyline fill="none" stroke="#0b2a5b" stroke-width="2.5" points="${series.map((r, i) => x(i) + ',' + y(r.values[p.id])).join(' ')}"/>
    ${series.map((r, i) => { const st = paramStatus(p, r.values[p.id], r); return `<circle cx="${x(i)}" cy="${y(r.values[p.id])}" r="7" fill="${st === 'good' ? '#0b2a5b' : st === 'watch' ? '#f26522' : '#b3261e'}" stroke="#fff" stroke-width="2" tabindex="0" data-tip="${r.id} · ${fmtDate(r.date)} · ${p.name} ${r.values[p.id]} ${p.unit} · ${STATUS[st]}"/><text x="${x(i)}" y="${y(r.values[p.id]) - 13}" text-anchor="middle" font-size="13" font-weight="700" fill="#1c2533">${r.values[p.id]}</text><text x="${x(i)}" y="${H - 22}" text-anchor="middle" font-size="12" fill="#5b6676">${r.id}</text><text x="${x(i)}" y="${H - 7}" text-anchor="middle" font-size="11" fill="#5b6676">${fmtDate(r.date).slice(0, 6)}</text>`; }).join('')}
    <text x="14" y="${T + 4}" font-size="12" fill="#5b6676">${p.unit}</text></svg>`;
}
function trendHTML(rep) {
  const series = reportsFor(rep.equipment, rep.system), p = by('oilParams', state.trend);
  return `<div role="group" aria-label="Trend parameter" style="margin-bottom:10px">${['fe', 'visc', 'si', 'water'].map(id => `<button class="chip ${id === p.id ? 'on' : ''}" data-act="trend" data-arg="${id}" aria-pressed="${id === p.id}">${by('oilParams', id).name}</button>`).join('')}</div>
    <div class="chartbox">${chartSVG(series, p)}</div><p class="small muted" style="margin-top:8px">${series.length} sample${series.length > 1 ? 's' : ''} for the ${sysOf(rep.system).name.toLowerCase()} of ${esc(eqp(rep.equipment).name)}. Orange and red points are outside the demo limits. Hover or focus a point for details.</p>`;
}
function viewOilReport(rep) {
  if (!rep) return notFound();
  const e = eqp(rep.equipment), st = reportStatus(rep), flagged = D.oilParams.filter(p => ['watch', 'action'].includes(paramStatus(p, rep.values[p.id], rep))), main = flagged[0];
  const ctx = `${esc(e.name)}|Analysis ID: ${rep.id}`;
  return `${crumbs([['Oil Analysis', 'oil-analysis'], rep.id])}
  <section class="band"><div class="wrap"><div class="eyebrow">Gulf Oil Analysis · Report ${rep.id} ${rep.user ? '<span class="demo-badge">your sample</span>' : '<span class="demo-badge">demo report</span>'}</div>
    <h1 id="view-title" tabindex="-1" style="font-size:clamp(24px,3vw,32px)">${esc(e.name)} · ${sysOf(rep.system).name} oil</h1>
    <div class="card hot gauge"><div><div class="muted small">Overall condition</div><div class="bigstatus" style="color:var(--${st === 'good' ? 'ok' : st === 'watch' ? 'watch' : 'bad'})" id="overall">${STATUS[st].toUpperCase()}</div></div>
      <dl class="kv" style="margin:0"><div><dt>Equipment</dt><dd><a href="#/${eqPath(e)}">${esc(e.name)}</a></dd></div><div><dt>Oil</dt><dd><a href="#/products/${rep.product}">${esc(prod(rep.product).name)}</a></dd></div><div><dt>Sampled</dt><dd>${fmtDate(rep.date)}</dd></div><div><dt>Hours on oil</dt><dd>${rep.hoursOnOil} h</dd></div><div><dt>Equipment hours</dt><dd>${Number(rep.equipmentHours).toLocaleString('en-IN')} h</dd></div></dl></div>
    <h2 style="margin-top:30px">Parameters <span class="demo-badge">demo values and limits</span></h2>
    <div class="tblwrap"><table class="tbl"><thead><tr><th scope="col">Parameter</th><th scope="col">Result</th><th scope="col">Status</th><th scope="col">Interpretation</th></tr></thead><tbody>
      ${D.oilParams.map(p => { const v = rep.values[p.id], s = paramStatus(p, v, rep); return `<tr id="param-${p.id}" class="${s === 'watch' || s === 'action' ? 'flag' : ''}"><th scope="row">${p.name}</th><td><strong>${s === 'na' ? '–' : p.id === 'pc' ? `ISO ${v}/${v - 2}/${v - 5}` : v + ' ' + p.unit}</strong></td><td>${badge(s)}</td><td>${s === 'good' ? 'Within the expected range.' : s === 'na' ? 'Not applicable to this fluid.' : `${esc(p.meaning)} <a href="#/knowledge/${p.article}">Understand this issue</a>`}</td></tr>`; }).join('')}</tbody></table></div>
    <div class="grid g2" style="margin-top:26px">
      <div class="card ${main ? 'hot' : ''}"><h2>Recommended action</h2>${main ? `<p><strong>${main.name}: ${rep.values[main.id]} ${main.unit}</strong> ${badge(paramStatus(main, rep.values[main.id], rep))}</p><ul>${main.actions.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : '<p>No action needed. Continue sampling at the planned interval to keep the trend.</p>'}
        <div class="cta-row"><button class="btn" data-act="lead" data-arg="analysis|${ctx}">Discuss With Technical Expert</button><button class="btn sec" data-act="ask" data-arg="My ${esc(e.name)} has high ${main ? main.name.toLowerCase() : 'iron'} in the ${sysOf(rep.system).name.toLowerCase()} oil.">Ask Gulf AI</button></div></div>
      <div class="card"><h2>Use this result</h2><p class="muted">Oil analysis → trend → early warning → maintenance decision.</p>
        <div class="cta-row"><a class="btn sec" href="#/tco?eq=${e.id}">Calculate Maintenance Impact</a><button class="btn sec" data-act="oapass" data-arg="${rep.id}">Add to Lubrication Passport</button><a class="btn sec" href="#/oil-analysis?eq=${e.id}&sys=${rep.system}">New Sample</a></div></div>
    </div>
    <h2 style="margin-top:30px">Trend</h2><div id="trend">${trendHTML(rep)}</div>${DISC}
  </div></section>`;
}

/* ============================= TCO CALCULATOR =============================
   Pure calculation, separate from rendering. All defaults are illustrative
   and editable. PRODUCTION: defaults come from validated field data.      */
function tcoCalc(i) {
  const annualHours = i.hoursDay * i.daysMonth * 12;
  const side = (cost, interval, maint) => { const events = interval > 0 ? annualHours / interval : 0, m = i.machines; return { events: events * m, lubricant: events * i.sump * cost * m, filters: events * i.filterCost * m, labour: events * i.labourCost * m, downtime: events * i.downtimeHours * i.downtimeCost * m, maintenance: maint * m }; };
  const total = s => s.lubricant + s.filters + s.labour + s.downtime + s.maintenance;
  const cur = side(i.curCost, i.curInterval, i.unplanned), gulf = side(i.gulfCost, i.gulfInterval, i.unplanned * (1 - i.impact / 100));
  cur.total = total(cur); gulf.total = total(gulf);
  return { annualHours, cur, gulf, diff: cur.total - gulf.total };
}
function tcoDefaults(e) {
  const l = e.lubrication.find(x => x.system === 'engine') || e.lubrication[0], p = bestFor(e, l.system).primary;
  return { system: l.system, machines: 1, curProduct: 'Current lubricant', curCost: 320, sump: l.capacity, hoursDay: 10, daysMonth: 26, curInterval: l.interval, filterCost: 1800, labourCost: 1500, downtimeCost: 2500, downtimeHours: 3, unplanned: 60000, gulfProduct: p.id, gulfCost: p.price, gulfInterval: Math.round(l.interval * 1.2), impact: 5 };
}
function viewTCO(r) {
  const e = eqp(r.q.eq) || eqp('jcb-3dx'), d = tcoDefaults(e), l = e.lubrication.find(x => x.system === d.system);
  const f = (id, label, val, attrs = 'type="number" min="0" step="any"') => `<div class="field"><label for="t-${id}">${label}</label><input id="t-${id}" name="${id}" value="${esc(val)}" ${attrs}></div>`;
  return `${crumbs(['TCO Calculator'])}${pageHead('05 · TCO Calculator', 'Lubrication Cost &amp; TCO Calculator', 'Move the conversation from “what does the oil cost?” to “what does lubrication actually cost my operation?”')}
  <section class="band"><div class="wrap"><div class="split half"><div>
    <form data-form="tco" id="tcoform" novalidate>
      <fieldset><legend>Equipment</legend><div class="formgrid"><div class="field"><label for="t-eq">Equipment</label><select id="t-eq" name="eq" data-change="tcoeq">${D.equipment.map(x => `<option value="${x.id}" ${x.id === e.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>${f('machines', 'Number of machines', d.machines, 'type="number" min="1" step="1"')}</div><p class="small muted">System: ${sysOf(d.system).name}</p></fieldset>
      <fieldset><legend>Current lubricant</legend><div class="formgrid three">${f('curProduct', 'Product', d.curProduct, 'type="text"')}${f('curCost', 'Oil cost (₹ / L)', d.curCost)}${f('sump', 'Sump capacity (L)', d.sump)}</div></fieldset>
      <fieldset><legend>Usage</legend><div class="formgrid three">${f('hoursDay', 'Operating hours / day', d.hoursDay)}${f('daysMonth', 'Operating days / month', d.daysMonth)}<div class="field"><label for="t-annual">Annual operating hours</label><input id="t-annual" value="${d.hoursDay * d.daysMonth * 12}" readonly aria-describedby="annual-note"></div></div><p class="small muted" id="annual-note">Calculated from hours per day and days per month.</p></fieldset>
      <fieldset><legend>Maintenance</legend><div class="formgrid three">${f('curInterval', 'Oil change interval (h)', d.curInterval)}${f('filterCost', 'Filter cost per service (₹)', d.filterCost)}${f('labourCost', 'Labour cost per service (₹)', d.labourCost)}${f('downtimeCost', 'Downtime cost (₹ / h)', d.downtimeCost)}${f('downtimeHours', 'Downtime per service (h)', d.downtimeHours)}${f('unplanned', 'Other maintenance (₹ / machine / yr)', d.unplanned)}</div></fieldset>
      <fieldset><legend>Gulf scenario <span class="demo-badge">your assumptions</span></legend><div class="formgrid three"><div class="field"><label for="t-gulfProduct">Gulf product</label><select id="t-gulfProduct" name="gulfProduct">${l.products.map(id => `<option value="${id}" ${id === d.gulfProduct ? 'selected' : ''}>${esc(prod(id).name)}</option>`).join('')}</select></div>${f('gulfCost', 'Gulf product cost (₹ / L)', d.gulfCost)}${f('gulfInterval', 'Assumed interval (h)', d.gulfInterval)}${f('impact', 'Estimated maintenance impact (%)', d.impact)}</div><p class="small muted">Interval and maintenance impact are assumptions to be validated by oil analysis and field trial. They are not Gulf performance claims.</p></fieldset>
      <button class="btn" type="submit">Calculate</button>
    </form></div>
    <div id="tco-out" aria-live="polite">${state.tcoShown ? '' : `<div class="card plain"><h3>Your results appear here</h3><p class="muted">Adjust the inputs for ${esc(e.name)} and select Calculate. Results then update as you type.</p></div>`}</div>
  </div></div></section>`;
}
function tcoInputs() { const fd = new FormData($('#tcoform')), o = {}; for (const [k, v] of fd) o[k] = ['eq', 'curProduct', 'gulfProduct'].includes(k) ? v : Math.max(0, parseFloat(v) || 0); o.machines = Math.max(1, Math.round(o.machines)); return o; }
function tcoRender() {
  const i = tcoInputs(), r = tcoCalc(i), e = eqp(i.eq), gp = prod(i.gulfProduct);
  $('#t-annual').value = r.annualHours;
  const rows = [['Lubricant', 'lubricant'], ['Filters', 'filters'], ['Labour', 'labour'], ['Downtime', 'downtime'], ['Other maintenance', 'maintenance']], max = Math.max(...rows.flatMap(x => [r.cur[x[1]], r.gulf[x[1]]]), 1);
  $('#tco-out').innerHTML = `<div class="card hot fade"><div class="eyebrow">Illustrative calculation</div>
    <div class="grid g3" style="gap:12px"><div><div class="small muted">Current Annual Lubrication Cost</div><div class="bigfig" id="tco-cur">${inr(r.cur.total)}</div></div><div><div class="small muted">Gulf Annual Lubrication Cost</div><div class="bigfig" id="tco-gulf">${inr(r.gulf.total)}</div></div><div><div class="small muted">Potential Annual Difference</div><div class="bigfig" id="tco-diff" style="color:var(--${r.diff >= 0 ? 'ok' : 'bad'})">${r.diff >= 0 ? '' : '− '}${inr(Math.abs(r.diff))}</div><div class="small muted">${r.diff >= 0 ? 'lower in the Gulf scenario' : 'higher in the Gulf scenario'}</div></div></div>
    <h3 style="margin-top:22px">Breakdown</h3><div class="legend"><span><i style="background:#8795ab"></i>Current (${esc(i.curProduct)})</span><span><i style="background:var(--orange)"></i>Gulf scenario (${esc(gp.name)})</span></div>
    <div class="bars">${rows.map(x => `<div class="row"><strong class="small">${x[0]}</strong><div><div class="line"><div class="bar" style="width:${r.cur[x[1]] / max * 70}%"></div><span class="val">${inr(r.cur[x[1]])}</span></div><div class="line"><div class="bar g" style="width:${r.gulf[x[1]] / max * 70}%"></div><span class="val">${inr(r.gulf[x[1]])}</span></div></div></div>`).join('')}
      <div class="row"><strong class="small">Maintenance events / yr</strong><div class="small">${r.cur.events.toFixed(1)} current · ${r.gulf.events.toFixed(1)} Gulf scenario · ${r.annualHours.toLocaleString('en-IN')} h/yr × ${i.machines} machine${i.machines > 1 ? 's' : ''}</div></div></div>
    <p class="disclaimer">Illustrative prototype calculation. Actual savings depend on equipment, lubricant, operating conditions and validated field performance.</p>
    <div class="cta-row"><button class="btn" data-act="lead" data-arg="assessment|${esc(e.name)}|TCO Scenario: ${esc(e.name)}">Request a Gulf Technical Assessment</button><button class="btn sec" data-act="tcosave">Add to Equipment Profile</button><a class="btn sec" href="#/oil-analysis?eq=${e.id}">Validate With Oil Analysis</a></div></div>`;
  return { i, r };
}

/* ========================== LUBRICATION PASSPORT ==========================
   One record per physical asset. Stored in the browser for the prototype.
   PRODUCTION: customer account + asset registry; QR resolves to the asset.  */
const passports = () => Store.get('passports', []);
const passportFor = eqId => passports().find(p => p.equipment === eqId);
const ppLink = e => { const p = passportFor(e.id); return p ? 'passport/' + p.assetId : 'passport?new=' + e.id; };
function savePassport(p) { Store.set('passports', passports().filter(x => x.assetId !== p.assetId).concat([p])); }
function createPassport(eqId, assetId, location, hours) {
  const e = eqp(eqId), sample = D.maintenanceEvents.filter(m => m.equipment === eqId).map(m => ({ ...m, sample: true }));
  const p = { assetId, equipment: eqId, location, hours: +hours, created: today(), events: sample.concat([{ date: today(), type:'new', title:'Lubrication Passport created', notes: `Asset ${assetId} registered at ${location}.`, hours: +hours }]), scenarios: [], verified: [] };
  savePassport(p); Analytics.track('passport_created', { equipment: e.name, assetId }); return p;
}
function nextAssetId(e) { const pre = oemOf(e.oem).name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'EQP'; let n = 1; while (passports().some(p => p.assetId === `${pre}-${String(n).padStart(3, '0')}`)) n++; return `${pre}-${String(n).padStart(3, '0')}`; }
function qrSVG(text) {   // deterministic demo pattern, not a scannable code
  let h = 2166136261; const bit = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) % 2; }; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const N = 21, finder = (x, y) => (x < 7 && y < 7) || (x >= N - 7 && y < 7) || (x < 7 && y >= N - 7), fpix = (x, y) => { const fx = x >= N - 7 ? x - (N - 7) : x, fy = y >= N - 7 ? y - (N - 7) : y; return fx === 0 || fx === 6 || fy === 0 || fy === 6 || (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4); };
  let cells = ''; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (finder(x, y) ? fpix(x, y) : bit()) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
  return `<svg class="qr" viewBox="-1 -1 ${N + 2} ${N + 2}" role="img" aria-label="Demo QR pattern for ${esc(text)}" style="background:#fff" fill="#0b2a5b">${cells}</svg>`;
}
function profileRows(p) {
  const e = eqp(p.equipment);
  return e.lubrication.map(l => {
    const changes = p.events.filter(ev => ev.system === l.system && ev.type === 'change').sort((a, b) => a.date.localeCompare(b.date)), last = changes[changes.length - 1];
    const product = prod((last && last.product) || bestFor(e, l.system).primary.id), lastHours = last ? last.hours : Math.max(0, p.hours - Math.round(l.interval * 0.4)), since = Math.max(0, p.hours - lastHours);
    const reps = reportsFor(e.id, l.system), rs = reps.length ? reportStatus(reps[reps.length - 1]) : 'good';
    const st = rs !== 'good' ? rs : since >= l.interval * 0.9 ? 'watch' : 'good', label = rs !== 'good' ? `Oil analysis: ${STATUS[rs]}` : since >= l.interval * 0.9 ? 'Due soon' : 'OK';
    return { l, product, last, lastHours, since, st, label, next: lastHours + l.interval };
  });
}
function viewPassport(r) {
  const list = passports();
  if (r.seg[1]) { const p = list.find(x => x.assetId === r.seg[1]); return p ? viewPassportDetail(p) : notFound(); }
  const pre = eqp(r.q.new), creating = pre || r.q.create;
  const e0 = pre || eqp('jcb-3dx');
  return `${crumbs(['My Lubrication Passport'])}${pageHead('06 · Lubrication Passport', 'My Lubrication Passport', 'A permanent digital lubrication record for each machine: what is in it, what was done, what the oil is telling you.')}
  <section class="band"><div class="wrap">
    ${list.length ? `<h2>Your equipment</h2><div class="grid g3">${list.map(p => { const e = eqp(p.equipment), flags = profileRows(p).filter(x => x.st !== 'good').length; return `<a class="opt" href="#/passport/${p.assetId}"><span class="num">${esc(p.assetId)}</span><strong>${esc(e.name)}</strong><span class="sub">${esc(p.location)} · ${p.hours.toLocaleString('en-IN')} hrs</span><span>${flags ? `<span class="status watch">${flags} item${flags > 1 ? 's' : ''} to review</span>` : '<span class="status good">All OK</span>'}</span></a>`; }).join('')}</div>` :
      (creating ? '' : `<div class="card"><h2>Create your first Lubrication Passport.</h2><p class="muted">Register a machine to keep its lubricants, service history, oil analysis and cost scenarios in one place.</p><div class="cta-row"><a class="btn" href="#/passport?create=1">Create a Passport</a><button class="btn sec" data-act="ppsample">Load Sample: JCB 3DX (JCB-001)</button></div></div>`)}
    ${list.length && !creating ? `<div class="cta-row"><a class="btn" href="#/passport?create=1">Add Another Machine</a></div>` : ''}
    ${creating ? `<div class="card" style="margin-top:22px;max-width:760px"><h2>Create equipment profile</h2><form data-form="passport" novalidate><div class="formgrid">
        <div class="field"><label for="p-eq">Equipment</label><select id="p-eq" name="eq" data-change="ppeq">${D.equipment.map(x => `<option value="${x.id}" ${x.id === e0.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
        <div class="field" data-f="assetId"><label for="p-id">Asset ID</label><input id="p-id" name="assetId" value="${nextAssetId(e0)}"><span class="err" role="alert"></span></div>
        <div class="field" data-f="location"><label for="p-loc">Location</label><input id="p-loc" name="location" value="Mumbai"><span class="err" role="alert"></span></div>
        <div class="field" data-f="hours"><label for="p-h">Operating hours</label><input id="p-h" name="hours" type="number" min="0" value="5820"><span class="err" role="alert"></span></div>
      </div><div class="cta-row"><button class="btn" type="submit">Create Passport</button><a class="btn sec" href="#/passport">Cancel</a></div></form></div>` : ''}
    <p class="disclaimer">This prototype uses demonstration data and stores passports only in this browser. Production implementation would require appropriate data governance, consent, authentication, security and integration controls.</p>
  </div></section>`;
}
function viewPassportDetail(p) {
  const e = eqp(p.equipment), rows = profileRows(p), ev = p.events.slice().sort((a, b) => a.date.localeCompare(b.date)), flag = rows.find(x => x.st !== 'good'), fp = flaggedParams(e.id)[0];
  return `${crumbs([['My Lubrication Passport', 'passport'], p.assetId])}
  <section class="band"><div class="wrap"><div class="split"><div>
    <div class="eyebrow">Lubrication Passport · ${esc(p.assetId)}</div><h1 id="view-title" tabindex="-1">${esc(e.name)}</h1>
    <dl class="kv"><div><dt>Equipment profile</dt><dd><a href="#/${eqPath(e)}">${esc(e.name)}</a></dd></div><div><dt>Asset ID</dt><dd>${esc(p.assetId)}</dd></div><div><dt>Location</dt><dd>${esc(p.location)}</dd></div><div><dt>Operating hours</dt><dd>${p.hours.toLocaleString('en-IN')} hrs</dd></div></dl>
    <div class="cta-row"><button class="btn" data-act="lead" data-arg="service|${esc(e.name)}|Passport: ${esc(p.assetId)}">Connect With Gulf Service</button><a class="btn sec" href="#/oil-analysis?eq=${e.id}">Analyze Oil</a><a class="btn sec" href="#/tco?eq=${e.id}">TCO</a>${fp ? `<a class="btn sec" href="#/knowledge/${fp.article}">Understand This Issue</a>` : ''}</div>
  </div><aside class="card" style="text-align:center"><h3>Equipment QR</h3><div id="qrbox">${p.qr ? qrSVG('/passport/' + p.assetId) + `<p class="small muted" style="margin-top:8px">Demo pattern, not scannable. Represents <strong>/passport/${esc(p.assetId)}</strong></p>` : `<button class="btn sm" data-act="qr" data-arg="${esc(p.assetId)}">Create Equipment QR</button>`}</div><p class="small muted" style="margin:10px 0 0">Technicians can scan the equipment QR to access the latest lubrication requirements and maintenance record.</p></aside></div>
    <h2 style="margin-top:30px">Current lubrication profile <span class="demo-badge">demo intervals</span></h2>
    <div class="tblwrap"><table class="tbl"><thead><tr><th scope="col">System</th><th scope="col">Gulf product</th><th scope="col">Grade</th><th scope="col">Last change</th><th scope="col">Next change</th><th scope="col">Hours on oil</th><th scope="col">Status</th></tr></thead><tbody>
      ${rows.map(x => `<tr class="${x.st !== 'good' ? 'flag' : ''}"><th scope="row">${sysOf(x.l.system).fluid}</th><td><a href="#/products/${x.product.id}">${esc(x.product.name)}</a></td><td>${esc(x.product.grade)}</td><td>${x.last ? fmtDate(x.last.date) : 'Not recorded'}</td><td>at ${x.next.toLocaleString('en-IN')} h</td><td>${x.since} h</td><td><span class="status ${x.st}">${x.label}</span></td></tr>`).join('')}</tbody></table></div>
    <div class="grid g2" style="margin-top:30px"><div>
      <h2>Timeline</h2><ol class="timeline" id="timeline">${ev.map(x => `<li class="${x.type === 'flag' ? 'flag' : x.type === 'new' || x.user ? 'new' : ''}"><span class="d">${fmtDate(x.date).slice(0, 6)}</span> · <strong>${esc(x.title)}</strong>${x.sample ? ' <span class="demo-badge">sample history</span>' : ''}<br><span class="small muted">${esc(x.notes || '')}${x.ref ? ` <a href="#/oil-analysis/${x.ref}">${x.ref}</a>` : ''}</span></li>`).join('')}</ol>
      ${p.scenarios.length ? `<h3>Saved TCO scenarios</h3>${p.scenarios.map(s => `<p class="small">${fmtDate(s.date)} · ${esc(s.product)} · current ${inr(s.cur)} / Gulf scenario ${inr(s.gulf)} per year <span class="demo-badge">illustrative</span></p>`).join('')}` : ''}
      ${p.verified.length ? `<h3>Verified products</h3>${p.verified.map(v => `<p class="small">✓ ${esc(prod(v.product).name)} · ${esc(v.code)}</p>`).join('')}` : ''}
    </div><div class="card"><h2>Add maintenance event</h2><form data-form="maint" data-asset="${esc(p.assetId)}" novalidate><div class="formgrid">
        <div class="field" data-f="date"><label for="m-d">Date</label><input id="m-d" name="date" type="date" value="${today()}"><span class="err" role="alert"></span></div>
        <div class="field"><label for="m-e">Equipment</label><input id="m-e" value="${esc(e.name)} (${esc(p.assetId)})" readonly></div>
        <div class="field"><label for="m-s">System</label><select id="m-s" name="system" data-change="msys">${e.lubrication.map(l => `<option value="${l.system}">${sysOf(l.system).name}</option>`).join('')}</select></div>
        <div class="field"><label for="m-p">Product</label><select id="m-p" name="product">${e.lubrication[0].products.map(id => `<option value="${id}">${esc(prod(id).name)}</option>`).join('')}</select></div>
        <div class="field" data-f="qty"><label for="m-q">Quantity (L or kg)</label><input id="m-q" name="qty" type="number" min="0" step="any" value="${e.lubrication[0].capacity}"><span class="err" role="alert"></span></div>
        <div class="field" data-f="hours"><label for="m-h">Operating hours</label><input id="m-h" name="hours" type="number" min="0" value="${p.hours}"><span class="err" role="alert"></span></div>
        <div class="field" data-f="tech"><label for="m-t">Technician</label><input id="m-t" name="tech" placeholder="Name"><span class="err" role="alert"></span></div>
        <div class="field"><label for="m-n">Notes</label><input id="m-n" name="notes" placeholder="e.g. Oil and filter changed"></div>
      </div><button class="btn" type="submit">Save Event</button></form></div></div>
    <div class="cta-row"><a class="btn sec" href="#/graph?focus=${e.id}">Knowledge Graph</a><button class="btn sec" data-act="ask" data-arg="${flag ? `My ${esc(e.name)} has high ${fp ? fp.name.toLowerCase() : 'iron'} in the engine oil.` : `How often should I check my ${esc(e.name)} oil?`}">Ask Gulf AI</button><a class="btn sec" href="#/verify">Verify a Gulf Product</a><a class="btn sec" href="#/passport">All Passports</a></div>
    <p class="disclaimer">Stored only in this browser. Production implementation would require appropriate data governance, consent, authentication, security and integration controls.</p>
  </div></section>`;
}

/* ============================= KNOWLEDGE GRAPH =============================
   Built on the fly from the central data for one machine. No graph database.
   PRODUCTION: the same relationships live in the central database and are
   exposed as linked, indexable entity pages plus JSON-LD.                   */
function buildGraph(e) {
  const nodes = [], edges = [], add = (id, layer, label, type, href, detail) => { if (!nodes.find(n => n.id === id)) nodes.push({ id, layer, label, type, href, detail }); return id; };
  const link = (a, b) => { if (a !== b && !edges.find(x => x.a === a && x.b === b)) edges.push({ a, b }); };
  const o = oemOf(e.oem), reps = reportsFor(e.id), arts = articlesFor('equipment', e.id).slice(0, 2);
  add('oem', 0, o.name, 'oem', 'oems/' + o.id, `OEM with ${D.equipment.filter(x => x.oem === o.id).length} equipment record(s).`);
  add('eq', 1, e.name, 'equipment', eqPath(e), `${e.type} · ${e.environment}. ${e.lubrication.length} lubricated systems.`); link('oem', 'eq');
  add('ind', 2, indOf(e.industry).name, 'application', 'industries/' + e.industry, 'Industry and application context.'); add('type', 2, e.type, 'application', 'equipment?group=' + slugify(e.group), 'Equipment category.'); link('eq', 'ind'); link('eq', 'type');
  e.tags.forEach(t => { add('c-' + t, 3, cond(t).name, 'condition', null, 'Operating condition used by the recommendation engine.'); link('ind', 'c-' + t); });
  add('ts', 9, 'Service intervals', 'maintenance', eqPath(e), 'Demo service intervals per system.'); add('pp', 9, 'Lubrication Passport', 'maintenance', ppLink(e), 'Permanent record for the individual asset.'); add('tco', 10, 'TCO scenario', 'tco', 'tco?eq=' + e.id, 'Illustrative annual lubrication cost model.');
  e.lubrication.forEach(l => {
    const s = sysOf(l.system), rec = bestFor(e, l.system), p = rec.primary, sp = specByName(p.specs[0]);
    add('s-' + s.id, 4, s.name, 'system', 'applications/' + (D.applications.find(a => a.system === s.id) || {}).id, `${s.fluid}. Demo interval ${l.interval} h.`);
    const from = e.tags.filter(t => p.tags.includes(t)); (from.length ? from.map(t => 'c-' + t) : ['type']).forEach(a => link(a, 's-' + s.id));
    add('sp-' + sp.id, 5, sp.name, 'specification', 'specifications/' + sp.id, `Specification met by ${D.products.filter(x => pSpecs(x).includes(sp.name)).length} demo product(s).`); link('s-' + s.id, 'sp-' + sp.id);
    add('p-' + p.id, 6, p.name.replace('Gulf ', ''), 'product', 'products/' + p.id, `<strong>${esc(p.name)}</strong> ${esc(p.grade)}.<br>Compatible equipment: ${equipmentUsing(p.id).slice(0, 5).map(x => `<a href="#/${eqPath(x)}">${esc(x.name)}</a>`).join(', ')}.<br>Applications: ${esc(p.applications.join('; '))}.<br>Specifications: ${esc(p.specs.join(', '))}.<br>Articles: ${articlesFor('products', p.id).slice(0, 3).map(a => `<a href="#/knowledge/${a.id}">${esc(a.title)}</a>`).join(', ') || 'none yet'}.`); link('sp-' + sp.id, 'p-' + p.id);
    add('tds', 7, 'TDS documents', 'evidence', 'products/' + p.id, 'Technical data sheets, rendered as HTML and PDF.'); add('appr', 7, 'Approvals database', 'evidence', 'knowledge/oem-requirements-and-approvals', 'Verified OEM approvals (empty in this prototype).'); link('p-' + p.id, 'tds'); link('p-' + p.id, 'appr');
    const sr = reps.filter(x => x.system === l.system);
    if (l.system !== 'grease') { add('oa', 8, sr.length || reps.length ? `Oil analysis (${reps.length})` : 'Oil analysis', 'analysis', reps.length ? 'oil-analysis/' + reps[reps.length - 1].id : 'oil-analysis?eq=' + e.id, reps.length ? `${reps.length} report(s) for this machine.` : 'No analysis available for this equipment yet.'); link('p-' + p.id, 'oa'); }
    link('s-' + s.id, 'ts');
  });
  arts.forEach(a => { add('a-' + a.id, 7, a.title.length > 26 ? a.title.slice(0, 25) + '…' : a.title, 'evidence', 'knowledge/' + a.id, esc(a.summary)); a.systems.forEach(s => nodes.find(n => n.id === 's-' + s) && link('s-' + s, 'a-' + a.id)); if (!edges.some(x => x.b === 'a-' + a.id)) link('eq', 'a-' + a.id); });
  flaggedParams(e.id).slice(0, 2).forEach(p => { add('f-' + p.id, 8, `${p.name}: flagged`, 'analysis', 'knowledge/' + p.article, esc(p.meaning)); link('oa', 'f-' + p.id); link('f-' + p.id, 'pp'); });
  if (nodes.find(n => n.id === 'oa')) { link('oa', 'ts'); link('oa', 'pp'); }
  link('ts', 'tco'); link('pp', 'tco');
  return { nodes, edges };
}
const LAYERS = ['OEM', 'Equipment', 'Application', 'Operating condition', 'System', 'Specification', 'Gulf product', 'Technical evidence', 'Oil analysis', 'Maintenance', 'TCO'];
let GRAPH = null;
function graphSVG(g) {
  const W = 1120, RH = 62, X0 = 170, NH = 34, pos = {};
  LAYERS.forEach((_, li) => { const row = g.nodes.filter(n => n.layer === li), span = (W - X0 - 20) / (row.length || 1); row.forEach((n, i) => { const w = Math.min(span - 10, Math.max(84, n.label.length * 7.6 + 24)); pos[n.id] = { x: X0 + span * i + span / 2, y: 30 + li * RH, w }; }); });
  return `<svg viewBox="0 0 ${W} ${LAYERS.length * RH + 20}" role="group" aria-label="Knowledge graph">
    ${LAYERS.map((l, i) => `<text class="glabel" x="10" y="${34 + i * RH}">${l}</text><line x1="${X0 - 14}" x2="${W - 10}" y1="${30 + i * RH + RH / 2}" y2="${30 + i * RH + RH / 2}" stroke="#f0f2f6"/>`).join('')}
    ${g.edges.map(ed => { const a = pos[ed.a], b = pos[ed.b], y1 = a.y + NH / 2, y2 = b.y - NH / 2, my = (y1 + y2) / 2; return `<path class="gedge" data-a="${ed.a}" data-b="${ed.b}" d="M${a.x},${y1} C${a.x},${my} ${b.x},${my} ${b.x},${y2}"/>`; }).join('')}
    ${g.nodes.map(n => { const p = pos[n.id]; return `<g class="gnode t-${n.type}" data-node="${n.id}" tabindex="0" role="button" aria-label="${esc(LAYERS[n.layer] + ': ' + n.label)}"><rect x="${p.x - p.w / 2}" y="${p.y - NH / 2}" width="${p.w}" height="${NH}" rx="4"/><text x="${p.x}" y="${p.y + 4.5}" text-anchor="middle">${esc(n.label.length > p.w / 7.4 ? n.label.slice(0, Math.floor(p.w / 7.4) - 1) + '…' : n.label)}</text></g>`; }).join('')}</svg>`;
}
function graphSelect(id) {
  const g = GRAPH; if (!g) return; const n = g.nodes.find(x => x.id === id); if (!n) return; state.gsel = id;
  const walk = (start, dir) => { const seen = new Set(), q = [start]; while (q.length) { const c = q.pop(); g.edges.forEach(e => { const nx = dir > 0 ? (e.a === c ? e.b : null) : (e.b === c ? e.a : null); if (nx && !seen.has(nx)) { seen.add(nx); q.push(nx); } }); } return seen; };
  const set = new Set([id, ...walk(id, 1), ...walk(id, -1)]);
  $$('.gnode').forEach(el => { el.classList.toggle('dim', !set.has(el.dataset.node)); el.classList.toggle('sel', el.dataset.node === id); });
  $$('.gedge').forEach(el => { const on = set.has(el.dataset.a) && set.has(el.dataset.b); el.classList.toggle('dim', !on); el.classList.toggle('hi', on); });
  const conn = g.nodes.filter(x => set.has(x.id) && x.id !== id);
  $('#gpanel').innerHTML = `<div class="eyebrow">${LAYERS[n.layer]}</div><h3>${esc(g.nodes.find(x => x.id === id).label)}</h3><p class="small">${n.detail || ''}</p>${n.href ? `<a class="btn sm" href="#/${n.href}">Open</a>` : ''}
    <h4 style="margin-top:16px">Connected entities (${conn.length})</h4><div>${conn.map(x => x.href ? `<a class="chip" href="#/${x.href}">${esc(x.label)}</a>` : `<span class="chip">${esc(x.label)}</span>`).join('')}</div>`;
}
function viewGraph(r) {
  const e = eqp(r.q.focus) || eqp('jcb-3dx'); GRAPH = buildGraph(e);
  return `${crumbs([['Technical Knowledge', 'knowledge'], 'Knowledge Graph'])}${pageHead('07 · Technical Knowledge Graph', 'Gulf Technical Knowledge Graph', 'One machine, and everything Gulf knows that connects to it. Select any entity to highlight its relationships.')}
  <section class="band"><div class="wrap">
    <div class="field" style="max-width:420px"><label for="g-eq">Show the graph for</label><select id="g-eq" data-change="graph">${D.equipment.map(x => `<option value="${x.id}" ${x.id === e.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
    <div class="split side"><div class="graphbox" id="graph">${graphSVG(GRAPH)}</div><aside class="card" id="gpanel" aria-live="polite"></aside></div>
    <p class="small muted" style="margin-top:10px">${GRAPH.nodes.length} entities and ${GRAPH.edges.length} relationships, generated from the central data model. <button class="link" data-act="gclear">Clear highlight</button></p>
    <div class="cta-row"><a class="btn" href="#/${eqPath(e)}">Open Equipment Profile</a><a class="btn sec" href="#/knowledge">Technical Knowledge Library</a><button class="btn sec" data-act="lead" data-arg="expert|${esc(e.name)}|Knowledge Graph">Speak to a Lubrication Specialist</button></div>${DISC}
  </div></section>`;
}

/* =========================== TECHNICAL KNOWLEDGE =========================== */
const articleCard = a => `<a class="opt" data-t="${esc(norm(a.title + ' ' + a.category + ' ' + a.summary))}" href="#/knowledge/${a.id}"><span class="num">${esc(a.category)}</span><strong>${esc(a.title)}</strong><span class="sub">${esc(a.summary)}</span></a>`;
function viewKnowledge(r) {
  if (r.seg[1]) return viewArticle(art(r.seg[1]));
  const cat = r.q.cat, fe = eqp(r.q.eq), list = D.technicalArticles.filter(a => (!cat || slugify(a.category) === cat) && (!fe || a.equipment.includes(fe.id)));
  return `${crumbs(['Technical Knowledge'])}${pageHead('07 · Technical Knowledge', 'Technical Knowledge', 'Guides, troubleshooting and specifications, each linked to the equipment, products and analysis it relates to.')}
  <section class="band"><div class="wrap">
    <div class="field" style="max-width:520px"><label for="kf">Search articles</label><input id="kf" type="search" data-input="kfilter" placeholder="e.g. hydraulic, iron, viscosity, grease" autocomplete="off"></div>
    ${fe ? `<p>Showing articles related to <strong>${esc(fe.name)}</strong>. <a href="#/knowledge">Show all</a></p>` : ''}
    <div role="group" aria-label="Filter by category" style="margin-bottom:16px"><a class="chip ${!cat ? 'on' : ''}" href="#/knowledge">All</a>${D.knowledgeCategories.map(c => `<a class="chip ${cat === slugify(c) ? 'on' : ''}" href="#/knowledge?cat=${slugify(c)}">${c}</a>`).join('')}</div>
    <div class="grid g3" id="klist">${list.map(articleCard).join('')}</div>
    <p id="k-empty" class="card plain" ${list.length ? 'hidden' : ''}>We couldn't find an exact match. Try another equipment model, specification or application.</p>
    <div class="cta-row"><a class="btn" href="#/graph">Open the Knowledge Graph</a><button class="btn sec" data-act="lead" data-arg="expert||Technical Knowledge">Speak to a Lubrication Specialist</button></div>
  </div></section>`;
}
function viewArticle(a) {
  if (!a) return notFound();
  // PRODUCTION: Article schema with "about" and "mentions" pointing at entity pages
  setLD({ '@context':'https://schema.org', '@type':'Article', headline: a.title, articleSection: a.category, description: a.summary, publisher: { '@type':'Organization', name:'Gulf Oil Lubricants India Limited' }, about: a.systems.map(s => sysOf(s).name), mentions: a.equipment.map(id => eqp(id).name).concat(a.products.map(id => prod(id).name)) });
  const e0 = a.equipment[0] && eqp(a.equipment[0]), p0 = a.products[0] && prod(a.products[0]);
  return `${crumbs([['Technical Knowledge', 'knowledge'], a.title])}
  <section class="band"><div class="wrap"><div class="split"><article>${urlStrip('knowledge/' + a.id)}
    <div class="eyebrow">${esc(a.category)}</div><h1 id="view-title" tabindex="-1">${esc(a.title)}</h1><p style="font-size:18px" class="muted">${esc(a.summary)}</p>
    ${a.body.map(p => `<p>${esc(p)}</p>`).join('')}
    <h3 style="margin-top:24px">How this article connects</h3>
    ${chain([...a.systems.slice(0, 1).map(s => ({ t: sysOf(s).name + ' systems', href:'applications/' + (D.applications.find(x => x.system === s) || {}).id })), ...(e0 ? [{ t: indOf(e0.industry).name + ' equipment', href:'industries/' + e0.industry }, { t: e0.name, href: eqPath(e0) }] : []), ...(p0 ? [{ t: sysOf(p0.systems[0]).fluid, c:'e' }] : []), { t:'Oil Analysis', c:'e', href:'oil-analysis' + (e0 ? '?eq=' + e0.id : '') }, ...(p0 ? [{ t: p0.name, c:'p', href:'products/' + p0.id }] : [])])}
    <div class="cta-row"><button class="btn" data-act="ask" data-arg="${esc(a.title)}${e0 ? ' ' + esc(e0.name) : ''}">Ask Gulf AI</button><button class="btn sec" data-act="lead" data-arg="expert|${e0 ? esc(e0.name) : ''}|Article: ${esc(a.title)}">Speak to a Lubrication Specialist</button><button class="btn sec" data-act="back">← Back</button></div>
    <p class="disclaimer">General guidance for the prototype. Always follow the equipment maker’s manual and current Gulf technical documentation.</p></article>
    <aside><div class="card"><h3>Related</h3>
      ${a.equipment.length ? `<h4>Equipment</h4><div>${a.equipment.map(id => `<a class="chip" href="#/${eqPath(eqp(id))}">${esc(eqp(id).name)}</a>`).join('')}</div>` : ''}
      ${a.products.length ? `<h4>Gulf products</h4><div>${a.products.map(id => `<a class="chip" href="#/products/${id}">${esc(prod(id).name)}</a>`).join('')}</div>` : ''}
      ${a.problems.length ? `<h4>Problems</h4><div>${a.problems.map(id => `<a class="chip" href="#/problems/${id}">${esc(by('problems', id).name)}</a>`).join('')}</div>` : ''}
      ${a.params.length ? `<h4>Oil analysis parameters</h4><div>${a.params.map(id => `<span class="chip">${by('oilParams', id).name}</span>`).join('')}</div>` : ''}</div></aside>
  </div></div></section>`;
}

/* ====================== ENTITY HUB PAGES (SEO ENTRY POINTS) ======================
   /specifications/{id} · /problems/{id} · /industries/{id} · /applications/{id} · /oems/{id} */
function hub(kind, r) {
  const id = r.seg[1], C = {
    specifications: { title:'Specifications', list: D.specifications, get: () => by('specifications', id), products: s => D.products.filter(p => pSpecs(p).includes(s.name)), intro: s => `Gulf products that list ${s.name} in the demo data, and the equipment they are recommended for.` },
    problems: { title:'Problems', list: D.problems, get: () => by('problems', id), products: s => D.products.filter(p => p.tags.includes(s.tag)), intro: s => `Products, equipment and guidance related to ${s.name.toLowerCase()}.`, articles: s => articlesFor('problems', s.id) },
    industries: { title:'Industries', list: D.industries, get: () => by('industries', id), products: s => D.products.filter(p => p.industries.includes(s.id)), equipment: s => D.equipment.filter(e => e.industry === s.id), intro: s => `Equipment, applications and Gulf products for ${s.name.toLowerCase()}.` },
    applications: { title:'Applications', list: D.applications, get: () => by('applications', id), products: s => D.products.filter(p => s.system ? p.systems.includes(s.system) : p.industries.includes(s.industry)), equipment: s => D.equipment.filter(e => s.system ? e.lubrication.some(l => l.system === s.system) : e.industry === s.industry), intro: s => `Where ${s.name.toLowerCase()} matter, and what Gulf recommends.`, articles: s => s.system ? articlesFor('systems', s.system) : [] },
    oems: { title:'OEMs', list: D.oems.filter(o => o.id !== 'generic'), get: () => by('oems', id), products: s => uniq(D.equipment.filter(e => e.oem === s.id).flatMap(e => e.lubrication.map(l => bestFor(e, l.system).primary))), equipment: s => D.equipment.filter(e => e.oem === s.id), intro: s => `${s.name} equipment in the database and the Gulf products recommended for it. OEM names identify equipment only and do not imply approval.` }
  }[kind];
  if (!id) return `${crumbs([C.title])}${pageHead('Explore by', C.title, 'Each entry is an indexable page in production.')}<section class="band"><div class="wrap"><div>${C.list.map(x => `<a class="chip" href="#/${kind}/${x.id}">${x.icon ? x.icon + ' ' : ''}${esc(x.name)}</a>`).join('')}</div>${DISC}</div></section>`;
  const s = C.get(); if (!s) return notFound();
  if (kind === 'specifications') Analytics.track('specification_searched', { specification: s.name });
  const ps = C.products(s), es = C.equipment ? C.equipment(s) : uniq(ps.flatMap(p => equipmentUsing(p.id))).slice(0, 8), as = C.articles ? C.articles(s) : uniq(ps.flatMap(p => articlesFor('products', p.id))).slice(0, 3);
  return `${crumbs([[C.title, kind], s.name])}<section class="band"><div class="wrap">${urlStrip(kind + '/' + s.id)}<div class="eyebrow">${C.title}</div><h1 id="view-title" tabindex="-1">${esc(s.name)}</h1><p class="muted" style="font-size:18px;max-width:760px">${esc(C.intro(s))}</p>
    ${ps.length ? `<h2 style="margin-top:26px">${kind === 'specifications' ? 'Products matching this specification' : 'Gulf products'} (${ps.length}) <span class="demo-badge">demo</span></h2><div class="grid g4">${ps.slice(0, 8).map(productCard).join('')}</div>` : `<div class="card plain"><p>We couldn't find an exact match. Try another equipment model, specification or application.</p></div>`}
    ${es.length ? `<h2 style="margin-top:30px">Equipment</h2><div>${es.map(e => `<a class="chip" href="#/${eqPath(e)}">${esc(e.name)} <span class="muted">· ${esc(e.type)}</span></a>`).join('')}</div>` : ''}
    ${as.length ? `<h2 style="margin-top:30px">Technical knowledge</h2><div class="grid g3">${as.slice(0, 3).map(articleCard).join('')}</div>` : ''}
    <div class="cta-row"><button class="btn" data-act="lead" data-arg="recommendation||${C.title}: ${esc(s.name)}">Get Product Recommendation</button>${kind === 'problems' ? `<a class="btn sec" href="#/finder/problem/${s.id}">Find a product for this problem</a>` : ''}<button class="btn sec" data-act="back">← Back</button></div>${DISC}</div></section>`;
}

/* ============================ SEARCH RESULTS VIEW ============================ */
function viewSearch(r) {
  const q = (r.q.q || '').trim(), s = q ? globalSearch(q) : null;
  const n = s ? s.equipment.length + s.products.length + s.recommended.length + s.specs.length + s.articles.length + s.params.length + s.problems.length + s.industries.length + s.oems.length + s.passports.length : 0;
  const grp = (h, body) => body ? `<h2 style="margin-top:28px">${h}</h2>${body}` : '';
  return `${crumbs(['Search'])}${pageHead('Global search', q ? `Results for “${esc(q)}”` : 'Search Gulf Lubrication Intelligence', 'Equipment, OEMs, products, specifications, applications, articles, problems and oil analysis parameters.')}
  <section class="band"><div class="wrap">
    ${!q ? `<p class="muted">Try:</p>${['JCB 3DX', 'API CK-4', 'hydraulic', 'iron', 'excavator', 'high oil temperature', '15W-40', 'Tata'].map(x => `<a class="chip" href="#/search?q=${encodeURIComponent(x)}">${x}</a>`).join('')}` : !n ? `<div class="card"><h3>We couldn't find an exact match.</h3><p>Try another equipment model, specification or application.</p><div class="cta-row"><button class="btn" data-act="ask" data-arg="${esc(q)}">Ask Gulf AI</button><button class="btn sec" data-act="lead" data-arg="expert||Search: ${esc(q)}">Talk to an Expert</button></div></div>` : `
    ${grp('Equipment', s.equipment.length ? `<div class="grid g4">${s.equipment.slice(0, 8).map(e => `<a class="opt" href="#/${eqPath(e)}"><span class="sub">${esc(e.group)} · ${esc(e.type)}</span><strong>${esc(e.name)}</strong><span class="sub">${esc(e.environment)}</span></a>`).join('')}</div>` : '')}
    ${grp(s.focus ? `Products: ${s.recommended.length} recommended Gulf products for ${esc(s.focus.name)}` : '', s.recommended.length ? `<div class="grid g4">${s.recommended.map(productCard).join('')}</div>` : '')}
    ${grp('Lubrication Passport', s.passports.length ? s.passports.map(p => `<a class="chip" href="#/passport/${p.assetId}">📘 ${esc(p.assetId)} · ${esc(eqp(p.equipment).name)}</a>`).join('') : '')}
    ${grp('Applications and industries', s.applications.length || s.industries.length || s.oems.length ? `<div>${s.focus ? `<span class="chip">${esc(s.focus.environment)}</span>` : ''}${s.industries.map(i => `<a class="chip" href="#/industries/${i.id}">${i.icon} ${i.name}</a>`).join('')}${s.applications.map(a => `<a class="chip" href="#/applications/${a.id}">${esc(a.name)}</a>`).join('')}${s.oems.map(o => `<a class="chip" href="#/oems/${o.id}">OEM: ${esc(o.name)}</a>`).join('')}</div>` : '')}
    ${grp('Specifications', s.specs.length ? s.specs.map(x => `<a class="chip" href="#/specifications/${x.id}">${esc(x.name)}</a>`).join('') : '')}
    ${grp('Problems', s.problems.length ? s.problems.map(x => `<a class="chip" href="#/problems/${x.id}">${x.icon} ${esc(x.name)}</a>`).join('') : '')}
    ${grp(`Technical knowledge: ${s.articles.length} relevant article${s.articles.length === 1 ? '' : 's'}`, s.articles.length ? `<div class="grid g3">${s.articles.slice(0, 6).map(articleCard).join('')}</div>` : '')}
    ${grp('Oil analysis: relevant parameters', s.params.length ? s.params.map(p => `<a class="chip" href="#/knowledge/${p.article}">${p.name}${s.focus && flaggedParams(s.focus.id).includes(p) ? ' · flagged' : ''}</a>`).join('') + (s.focus && reportsFor(s.focus.id).length ? ` <a class="chip" href="#/oil-analysis/${reportsFor(s.focus.id).pop().id}">Latest report</a>` : '') : '')}
    ${grp(`Products matching “${esc(q)}”`, s.products.length ? `<div class="grid g4">${s.products.slice(0, 8).map(productCard).join('')}</div>` : '')}`}
  </div></section>`;
}

/* ====================== DISTRIBUTOR / GARAGE FINDER ======================
   PRODUCTION: locations API with geo search; each location is a LocalBusiness page. */
function viewLocator(r) {
  const kind = r.seg[1] === 'garage' ? 'garage' : 'distributor', label = kind === 'garage' ? 'Gulf Garage' : 'Gulf Distributor', q = (r.q.q || '').trim();
  let res = [], note = '';
  if (q) { const all = D[kind === 'garage' ? 'garages' : 'distributors']; res = all.filter(l => /^\d{6}$/.test(q) ? l.pin.slice(0, 3) === q.slice(0, 3) : matches(l.city + ' ' + l.area, q)); if (!res.length) { res = all.slice(0, 3); note = 'No exact match in the demo data. Showing sample locations.'; }
    setLD({ '@context':'https://schema.org', '@type':'ItemList', itemListElement: res.map(l => ({ '@type':'LocalBusiness', name: l.name, address: { '@type':'PostalAddress', addressLocality: l.city, postalCode: l.pin } })) }); }
  return `${crumbs([kind === 'garage' ? 'Find a Gulf Garage' : 'Find a Distributor'])}${pageHead('Local ecosystem', `Find a ${label}`, 'Search by pincode, city or locality.')}
  <section class="band"><div class="wrap">
    <div style="margin-bottom:14px"><a class="chip ${kind === 'distributor' ? 'on' : ''}" href="#/locator/distributor${q ? '?q=' + encodeURIComponent(q) : ''}">Find a Gulf Distributor</a><a class="chip ${kind === 'garage' ? 'on' : ''}" href="#/locator/garage${q ? '?q=' + encodeURIComponent(q) : ''}">Find a Gulf Garage</a></div>
    <form class="askbar" data-form="loc" data-kind="${kind}" style="max-width:620px"><label class="sr" for="lq">Pincode, city or location</label><input id="lq" name="q" value="${esc(q)}" placeholder="Pincode, city or location, e.g. 400093 or Mumbai" list="cities"><datalist id="cities">${uniq(D.distributors.map(d => d.city)).map(c => `<option value="${c}">`).join('')}</datalist><button type="submit">Search</button></form>
    <p id="loc-err" role="alert" style="color:var(--bad);margin-top:8px"></p>
    ${q ? `<h2>${res.length} location${res.length > 1 ? 's' : ''} <span class="demo-badge">demo</span></h2>${note ? `<p class="muted">${note}</p>` : ''}<div class="grid g3">${res.map(l => `<article class="card"><h3>${esc(l.name)}</h3><p style="margin-bottom:4px">${esc(l.area)}, ${esc(l.city)} – ${l.pin}</p><p class="small muted" style="margin-bottom:4px"><strong>Services:</strong> ${esc(l.services)}</p><p class="small muted" style="margin-bottom:4px"><strong>Products:</strong> ${esc(l.categories)}</p><p class="small muted" style="margin-bottom:4px">${esc(l.phone)}</p><p class="small" style="color:var(--ok);font-weight:700">${esc(l.hours)}</p><div class="cta-row"><a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.area + ', ' + l.city)}">Directions</a><button class="btn sm sec" data-act="lead" data-arg="callback||${esc(l.name)}">Request Callback</button></div></article>`).join('')}</div>` : ''}
    <p class="disclaimer">Demo locations and contact details. On the live site each distributor and garage has its own indexable local page linked to the products it stocks.</p>
  </div></section>`;
}

/* ========================= PRODUCT AUTHENTICATION =========================
   PRODUCTION: verification service backed by ERP batch data.               */
function viewVerify(r) {
  const code = (r.q.code || '').trim().toUpperCase(), hit = D.authCodes[code], p = hit && prod(hit.product), first = passports()[0];
  return `${crumbs(['Verify Your Gulf Product'])}${pageHead('Product authentication', 'Verify Your Gulf Product', 'Enter the scratch code or QR code on the pack to confirm it is genuine.')}
  <section class="band"><div class="wrap">
    <form class="askbar" data-form="verify" style="max-width:560px"><label class="sr" for="vc">Scratch code or QR code</label><input id="vc" name="code" value="${esc(code)}" placeholder="e.g. GULF-2026-0417" autocomplete="off"><button type="submit">Verify</button></form>
    <p class="small muted" style="margin-top:8px">Demo codes: ${Object.keys(D.authCodes).map(c => `<a href="#/verify?code=${c}">${c}</a>`).join(' · ')}</p>
    ${code ? (hit ? `<div class="card hot fade" style="margin-top:20px;max-width:760px"><div class="bigstatus" style="color:var(--ok)" id="verified">✓ Product Verified</div><h2 style="margin-top:8px">${esc(p.name)} ${esc(p.grade)}</h2>
      <dl class="kv"><div><dt>Pack</dt><dd>${esc(hit.pack)}</dd></div><div><dt>Batch</dt><dd>${esc(hit.batch)}</dd></div><div><dt>Manufacturing</dt><dd>${esc(hit.mfg)}</dd></div><div><dt>Recommended application</dt><dd>${esc(p.applications[0])}</dd></div></dl>
      <div class="cta-row">${first ? `<button class="btn" data-act="vadd" data-arg="${code}">Add Product to My Lubrication Passport</button>` : `<a class="btn" href="#/passport?create=1">Create a Passport to Add This Product</a>`}<a class="btn sec" href="#/products/${p.id}">Product Details</a></div>
      <p class="small muted" style="margin-top:12px">Physical product → authentication → customer → equipment → Lubrication Passport.</p></div>`
      : `<div class="card" style="margin-top:20px;max-width:760px;border-top-color:var(--bad)"><h2 style="color:var(--bad)">Code not recognised</h2><p>We could not verify “${esc(code)}”. Check the code and try again. If it still fails, contact Gulf before using the product.</p><button class="btn sec" data-act="lead" data-arg="expert||Verification failed: ${esc(code)}">Report to Gulf</button></div>`) : ''}
    <p class="disclaimer">Demo codes and batch details only.</p></div></section>`;
}

/* ============================ ANALYTICS DASHBOARD ============================ */
function viewAnalytics() {
  const ev = Analytics.events(), S = D.analyticsSeed, count = (seed, pick) => { const o = { ...seed }; ev.forEach(e => { const k = pick(e); if (k) o[k] = (o[k] || 0) + 1; }); return Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 6); };
  const modOf = e => ({ advisor_question:'AI Advisor', recommendation_generated:'Product Finder', product_viewed:'Product Finder', equipment_viewed:'Equipment Database', oil_analysis_started:'Oil Analysis', oil_analysis_completed:'Oil Analysis', tco_started:'TCO Calculator', tco_completed:'TCO Calculator', passport_created:'Lubrication Passport', maintenance_added:'Lubrication Passport', knowledge_article_viewed:'Technical Knowledge' }[e.event]);
  const blocks = [['Most searched equipment', count(S.equipment, e => e.event === 'equipment_viewed' && e.equipment)], ['Most viewed products', count(S.products, e => e.event === 'product_viewed' && e.product)], ['Most common problems', count(S.problems, e => e.event === 'advisor_question' && (D.problems.find(p => matches(e.question, p.name)) || {}).name)], ['Most used modules', count(S.modules, modOf)]];
  const started = S.leads.started + ev.filter(e => e.event === 'expert_form_started').length, sub = S.leads.submitted + ev.filter(e => e.event === 'expert_form_submitted').length;
  return `${crumbs(['Prototype Analytics'])}${pageHead('Prototype analytics', 'First-party data this platform would generate', 'Seeded demonstration numbers plus the events from your own session in this browser.')}
  <section class="band"><div class="wrap"><div class="grid g2">${blocks.map(b => { const mx = Math.max(...b[1].map(x => x[1]), 1); return `<div class="card"><h3>${b[0]}</h3><div class="bars">${b[1].map(x => `<div class="line"><span class="small" style="width:190px;flex:none">${esc(x[0])}</span><div class="bar" style="width:${x[1] / mx * 50}%;background:var(--blue)"></div><span class="val">${x[1]}</span></div>`).join('')}</div></div>`; }).join('')}
    <div class="card hot"><h3>Lead conversions</h3><div class="bigfig">${sub} / ${started}</div><p class="muted">expert forms submitted / started (${Math.round(sub / started * 100)}%)</p></div>
    <div class="card"><h3>Session event log (${ev.length})</h3><div style="max-height:260px;overflow:auto" id="evlog">${ev.slice().reverse().map(e => { const { event, ts, ...rest } = e; return `<div class="evt"><strong>${esc(event)}</strong> ${esc(JSON.stringify(rest))} <span class="muted">${ts.slice(11, 19)}</span></div>`; }).join('') || '<p class="muted">No events yet.</p>'}</div></div></div>
    <p class="disclaimer">Demonstration data only. In production these events feed the analytics data layer and CRM, subject to consent.</p></div></section>`;
}

/* ================================= HOME ================================= */
const MODULES = [['advisor', 'AI Advisor', 'Ask in plain language; get answers from Gulf data'], ['finder', 'Product Finder', 'Eight ways to reach the right lubricant'], ['equipment', 'Equipment Database', 'Lubrication requirements by machine'], ['oil-analysis', 'Oil Analysis', 'Turn oil condition into maintenance decisions'], ['tco', 'TCO Calculator', 'What lubrication really costs your operation'], ['passport', 'Lubrication Passport', 'A permanent record for every asset'], ['knowledge', 'Technical Knowledge', 'Articles and the knowledge graph']];
function viewHome() {
  const j = eqp('jcb-3dx');
  return `<section class="hero"><div class="wrap"><div class="eyebrow">Gulf Oil Lubricants India</div><h1 id="view-title" tabindex="-1">Gulf Lubrication Intelligence</h1>
    <p class="sub">Know your machine. Choose the right lubricant. Monitor performance. Optimize cost.</p>
    <p class="lead">From identifying the right Gulf lubricant to monitoring oil condition and understanding total lubrication cost, Gulf Lubrication Intelligence connects your equipment, lubricant and technical information in one place.</p>
    <div class="cta-row"><a class="btn" href="#/equipment">Start with My Equipment</a><a class="btn ghost" href="#/advisor">Ask Gulf AI Advisor</a><button class="btn ghost" data-act="demo">▶ Run Full Demo</button></div></div></section>
  <section class="band"><div class="wrap"><div class="eyebrow">One platform, seven connected modules</div><h2>How should I lubricate, maintain and optimize my equipment?</h2>
    <div class="grid g4">${MODULES.map((m, i) => `<a class="opt" style="min-height:150px" href="#/${m[0]}"><span class="num">0${i + 1}</span><strong>${m[1]}</strong><span class="sub">${m[2]}</span></a>`).join('')}<a class="opt" style="min-height:150px;border-top-color:var(--orange)" href="#/graph"><span class="num">See it connected</span><strong>Knowledge Graph</strong><span class="sub">OEM → equipment → product → analysis → cost</span></a></div></div></section>
  <section class="band grey"><div class="wrap"><div class="grid g2">
    <div class="card"><div class="eyebrow">Today</div><h3>Strong assets, separate experiences</h3><p class="muted">Products, technical information, equipment knowledge, customers, distribution and lubrication expertise can sit in separate digital places.</p><div>${['Products', 'Technical information', 'Equipment knowledge', 'Customers', 'Distribution', 'Lubrication expertise'].map(t => `<span class="tag">${t}</span>`).join('')}</div></div>
    <div class="card hot"><div class="eyebrow">Future</div><h3>One connected decision platform</h3><p class="muted">Identify the machine. Understand the application. Recommend the lubricant. Monitor the lubricant. Optimize the cost. Build a permanent lubrication record.</p>
      ${chain([{ t:'Equipment', href:'equipment' }, { t:'Application', href:'finder/application' }, { t:'Lubricant', c:'p', href:'products' }, { t:'Oil condition', href:'oil-analysis' }, { t:'Maintenance', href:'passport' }, { t:'Cost', href:'tco' }, { t:'Knowledge', href:'knowledge' }, { t:'Expert', c:'e' }])}</div></div>
    <h2 style="margin-top:34px">Every entity becomes a searchable page</h2><p class="muted" style="max-width:780px">The same data model generates indexable pages for search engines and AI answer engines. Examples from this prototype:</p>
    <div>${[eqPath(j), 'products/superfleet-supreme', 'applications/construction', 'industries/construction', 'specifications/api-ck-4', 'problems/high-oil-temperature', 'knowledge/hydraulic-oil-overheating', 'oems/jcb'].map(u => `<a class="chip" style="font-family:Consolas,monospace" href="#/${u}">/${u}</a>`).join('')}</div>
    <div class="grid g3" style="margin-top:28px"><a class="opt" href="#/verify"><span class="ico" aria-hidden="true">✅</span><strong>Verify Your Gulf Product</strong><span class="sub">Scratch code or QR authentication</span></a><a class="opt" href="#/locator/distributor"><span class="ico" aria-hidden="true">📍</span><strong>Find a Gulf Distributor</strong><span class="sub">Pincode, city or location</span></a><a class="opt" href="#/locator/garage"><span class="ico" aria-hidden="true">🔧</span><strong>Find a Gulf Garage</strong><span class="sub">Service points near you</span></a></div>${DISC}</div></section>`;
}
const notFound = () => `${crumbs(['Not found'])}<section class="band"><div class="wrap"><div class="card"><h1 id="view-title" tabindex="-1" style="font-size:26px">We couldn't find an exact match.</h1><p>Try another equipment model, specification or application.</p><div class="cta-row"><a class="btn" href="#/">Home</a><a class="btn sec" href="#/equipment">Equipment Database</a></div></div></div></section>`;

/* ============================== UI RENDERING ============================== */
const ROUTES = { home: viewHome, advisor: viewAdvisor, finder: viewFinder, products: viewProducts, compare: viewCompare, equipment: viewEquipment, 'oil-analysis': viewOil, tco: viewTCO, passport: viewPassport, knowledge: viewKnowledge, graph: viewGraph, search: viewSearch, locator: viewLocator, verify: viewVerify, analytics: viewAnalytics, specifications: r => hub('specifications', r), problems: r => hub('problems', r), industries: r => hub('industries', r), applications: r => hub('applications', r), oems: r => hub('oems', r) };
let lastTracked = '';
function render(keepScroll) {
  R = parseRoute(); const key = R.seg[0] || 'home'; setLD({});
  let html; try { html = (ROUTES[key] || notFound)(R); } catch (err) { console.error(err); html = notFound(); }
  $('#app').innerHTML = html;
  $$('.modnav a').forEach(a => { const n = a.dataset.nav, on = n === (R.seg[0] || '') || (n === 'finder' && ['products', 'compare', 'specifications', 'problems', 'oems', 'industries', 'applications'].includes(key)) || (n === 'knowledge' && key === 'graph'); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  closeMenu(); renderTray();
  if (key === 'graph') graphSelect(state.gsel && GRAPH.nodes.find(n => n.id === state.gsel) ? state.gsel : 'eq');
  if (key === 'tco' && state.tcoShown) tcoRender();
  if (!keepScroll) { window.scrollTo(0, 0); const t = $('#view-title'); if (t) t.focus({ preventScroll: true }); }
  // page-view style events (once per distinct URL)
  if (location.hash !== lastTracked) { lastTracked = location.hash;
    if (key === 'equipment' && R.seg[2]) { const e = D.equipment.find(x => x.oem === R.seg[1] && x.slug === R.seg[2]); if (e) Analytics.track('equipment_viewed', { equipment: e.name }); }
    if (key === 'products' && R.seg[1] && prod(R.seg[1])) Analytics.track('product_viewed', { product: prod(R.seg[1]).name });
    if (key === 'knowledge' && R.seg[1] && art(R.seg[1])) Analytics.track('knowledge_article_viewed', { article: art(R.seg[1]).title });
    if (key === 'locator' && R.q.q) Analytics.track(R.seg[1] === 'garage' ? 'garage_search' : 'distributor_search', { query: R.q.q });
    if (key === 'finder' && $('.reco')) Analytics.track('recommendation_generated', { source:'finder', path: R.seg.slice(1).join('/') });
  }
}
function closeMenu() { $('#modnav').classList.remove('open'); $('.hamb').setAttribute('aria-expanded', 'false'); }
let toastT; function toast(m) { $('#toast').textContent = m; clearTimeout(toastT); toastT = setTimeout(() => ($('#toast').textContent = ''), 4000); }
let lastFocus = null;
function openModal(html, label) {
  lastFocus = document.activeElement;
  $('#modal-root').innerHTML = `<div class="modal-bg" data-bg><div class="modal fade" role="dialog" aria-modal="true" aria-label="${esc(label)}"><button class="x" data-act="close" aria-label="Close">×</button>${html}</div></div>`;
  $('#modal-root [data-bg]').addEventListener('mousedown', e => { if (e.target.dataset.bg !== undefined) closeModal(); });
  ($('#modal-root input:not([readonly]), #modal-root .modal .btn') || $('#modal-root .x')).focus();
}
function closeModal() { if (!$('#modal-root').innerHTML) return; $('#modal-root').innerHTML = ''; if (lastFocus && document.contains(lastFocus)) lastFocus.focus(); }
function openMgmt() {
  const rows = [['Discovery', 'Product Finder', 'finder'], ['Identification', 'Equipment Database', 'equipment'], ['Advice', 'AI Advisor', 'advisor'], ['Condition monitoring', 'Oil Analysis', 'oil-analysis'], ['Economics', 'TCO Calculator', 'tco'], ['Asset memory', 'Lubrication Passport', 'passport'], ['Knowledge', 'Technical Knowledge Graph', 'graph'], ['Commercial conversion', 'Gulf Technical Expert / Distributor', 'locator/distributor']];
  openModal(`<div class="eyebrow">Management demo</div><h2>What Gulf is building</h2><p>A connected lubrication intelligence ecosystem. Seven modules, one underlying data model.</p>
    <div class="tblwrap"><table class="tbl"><tbody>${rows.map(r => `<tr><th scope="row">${r[0]}</th><td>→ <a href="#/${r[2]}" data-act="mgo" data-arg="${r[2]}">${r[1]}</a></td></tr>`).join('')}</tbody></table></div>
    <p style="margin-top:14px"><strong>Today:</strong> products, technical information, equipment knowledge, customers, distribution and expertise can exist as separate digital experiences.<br><strong>Future:</strong> Equipment → Application → Lubricant → Oil condition → Maintenance → Cost → Knowledge → Expert → Customer.</p>
    <p class="muted">This turns the Gulf website from a product catalogue into an intelligent lubrication decision platform.</p>
    <div class="cta-row"><button class="btn" data-act="demo">▶ Run Full Demo</button><button class="btn sec" data-act="close">Close</button></div><p class="disclaimer">All data in the prototype is demo / illustrative.</p>`, 'Management demo');
}

/* ============================= LEAD GENERATION =============================
   One reusable form. Context (equipment, analysis ID, TCO scenario) travels
   with the lead. PRODUCTION: POST /api/leads → middleware → Salesforce Lead
   (plus optional WhatsApp Business confirmation to the customer).           */
const LEAD_TITLES = { expert:'Talk to a Gulf Technical Expert', recommendation:'Get Product Recommendation', profile:'Build Lubrication Profile', analysis:'Discuss Analysis With Expert', assessment:'Request Gulf Technical Assessment', service:'Connect With Gulf Service', callback:'Request a Callback' };
function openLead(type, equipment, context) {
  type = LEAD_TITLES[type] ? type : 'expert'; state.lead = { type, context: context || '', started: false };
  if (!equipment && R.seg[0] === 'equipment' && R.seg[2]) { const e = D.equipment.find(x => x.oem === R.seg[1] && x.slug === R.seg[2]); if (e) equipment = e.name; }
  const f = (id, label, attrs = '', req = true, val = '') => `<div class="field" data-f="${id}"><label for="l-${id}">${label}${req ? ' *' : ''}</label><input id="l-${id}" name="${id}" value="${esc(val)}" ${attrs}><span class="err" role="alert"></span></div>`;
  openModal(`<div class="eyebrow">Gulf technical support</div><h2>${LEAD_TITLES[type]}</h2>
  ${context ? `<p id="lead-context" class="urlstrip" style="font-family:inherit">Context carried from the platform: <b>${esc(context)}</b></p>` : ''}
  <form data-form="lead" novalidate><div class="formgrid">
    ${f('name', 'Name', 'autocomplete="name"')}${f('company', 'Company', 'autocomplete="organization"', false)}
    ${f('mobile', 'Mobile', 'type="tel" inputmode="numeric" maxlength="10" placeholder="10-digit mobile"')}${f('email', 'Email', 'type="email" autocomplete="email"')}
    ${f('city', 'City', 'autocomplete="address-level2"')}
    <div class="field" data-f="customerType"><label for="l-customerType">Customer type *</label><select id="l-customerType" name="customerType"><option value="">Select…</option>${['Individual', 'Mechanic / Garage', 'Retailer', 'Distributor', 'Fleet owner', 'Contractor', 'Industrial customer', 'OEM'].map(o => `<option>${o}</option>`).join('')}</select><span class="err" role="alert"></span></div>
    ${f('equipment', 'Equipment', '', false, equipment || '')}
    <div class="field"><label for="l-requirement">Requirement</label><select id="l-requirement" name="requirement">${Object.entries(LEAD_TITLES).map(([k, v]) => `<option value="${k}" ${k === type ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    ${f('currentLubricant', 'Current lubricant', '', false)}${f('annualHours', 'Annual operating hours', 'type="number" min="0"', false)}
  </div><div class="field"><label for="l-message">Message</label><textarea id="l-message" name="message" rows="3" placeholder="Tell us about your equipment, volumes or the problem you want to solve"></textarea></div>
  <div class="cta-row"><button class="btn" type="submit">Submit</button><button class="btn sec" type="button" data-act="close">Cancel</button></div>
  <p class="small muted" style="margin-top:12px">Prototype: nothing is sent or stored outside this browser.</p></form>`, LEAD_TITLES[type]);
}
function validateLead(d) {
  const e = {};
  if (d.name.trim().length < 2) e.name = 'Enter your name.';
  if (!/^[6-9]\d{9}$/.test(d.mobile.trim())) e.mobile = 'Enter a valid 10-digit mobile number.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email.trim())) e.email = 'Enter a valid email address.';
  if (d.city.trim().length < 2) e.city = 'Enter your city.';
  if (!d.customerType) e.customerType = 'Select a customer type.';
  return e;
}
function showErrors(form, errs) { $$('.field[data-f]', form).forEach(fl => { const k = fl.dataset.f, er = $('.err', fl); if (er) { er.textContent = errs[k] || ''; fl.classList.toggle('bad', !!errs[k]); } }); const first = Object.keys(errs)[0]; if (first) form.querySelector(`[name=${first}]`).focus(); return !first; }
const LeadService = {
  // PRODUCTION: return fetch('/api/leads', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
  submit(payload) { return new Promise(res => setTimeout(() => res({ ok: true, id: 'DEMO-' + String(Date.now()).slice(-6) }), 500)); }
};
async function submitLead(form) {
  const d = Object.fromEntries(new FormData(form)); if (!showErrors(form, validateLead(d))) return;
  // CRM-shaped payload (Salesforce Lead standard + custom fields)
  const payload = { LastName: d.name, Company: d.company || 'Individual', MobilePhone: d.mobile, Email: d.email, City: d.city, Customer_Type__c: d.customerType, Equipment__c: d.equipment, Requirement__c: d.requirement, Current_Lubricant__c: d.currentLubricant, Annual_Operating_Hours__c: d.annualHours, Description: d.message, LeadSource: 'Website – Lubrication Intelligence', Platform_Context__c: state.lead.context };
  form.querySelector('[type=submit]').disabled = true;
  const res = await LeadService.submit(payload);
  Analytics.track('expert_form_submitted', { cta: d.requirement, customerType: d.customerType, equipment: d.equipment, context: state.lead.context, ref: res.id });
  const m = $('#modal-root .modal'); if (!m) return;
  m.innerHTML = `<button class="x" data-act="close" aria-label="Close">×</button><div class="eyebrow" style="color:var(--ok)">Requirement captured</div><h2>Thank you, ${esc(d.name.split(' ')[0])}.</h2><p id="lead-ok">Your requirement has been captured. A Gulf representative will contact you.</p>
    <p class="small muted">Reference ${res.id} <span class="demo-badge">demo</span>${d.equipment ? ` · Equipment: ${esc(d.equipment)}` : ''}${state.lead.context ? ` · ${esc(state.lead.context)}` : ''}</p><div class="cta-row"><button class="btn" data-act="close">Continue</button><a class="btn sec" href="#/locator/distributor" data-act="mgo" data-arg="locator/distributor">Find a Distributor</a></div>`;
  $('.btn', m).focus();
}

/* ================================ FULL DEMO ================================
   Ten automated steps across all modules. Default 15 s per step (about 2.5
   minutes). Use Next / Pause in the controller to present at your own pace.  */
const DEMO_STEP_MS = () => window.GLI_DEMO_MS || 15000;
const spot = sel => { const el = typeof sel === 'string' ? $(sel) : sel; if (el) { el.scrollIntoView({ block:'center' }); el.classList.add('spot'); } return el; };
const navTo = async path => { go(path); await sleep(120); };
const DEMO = [
  { t:'Identify the machine', say:'Equipment Database: JCB 3DX with its lubrication requirements for every system.', run: async () => { await navTo('equipment/jcb/3dx'); await sleep(500); spot('table.tbl'); } },
  { t:'Understand the application', say:'Product Finder: Construction → Backhoe Loader → JCB → 3DX, then Heavy duty and High temperature.', run: async () => { await navTo('finder/equipment/construction/backhoe-loader/jcb/jcb-3dx'); for (const c of ['heavy', 'hot']) { await sleep(700); const b = $(`[data-act=multi][data-arg=${c}]`); if (b && !b.classList.contains('sel')) b.click(); } } },
  { t:'Recommend the lubricant', say:'The engine recommends a Gulf product for the engine, with tabs for hydraulic, transmission and grease.', run: async () => { await navTo('finder/equipment/construction/backhoe-loader/jcb/jcb-3dx/heavy,hot'); await sleep(400); spot('.reco'); } },
  { t:'Why this product?', say:'The reasoning is shown: grade, operating conditions and specification, not just a product name.', run: async () => { if (!$('#why')) await navTo('finder/equipment/construction/backhoe-loader/jcb/jcb-3dx/heavy,hot'); await sleep(300); spot('.logic'); } },
  { t:'Monitor the lubricant', say:'Oil Analysis: report OA-004 flags iron at 28 ppm. The trend shows it rising over four samples.', run: async () => { state.trend = 'fe'; await navTo('oil-analysis/OA-004'); await sleep(500); spot('#param-fe'); await sleep(2500); spot('#trend'); } },
  { t:'AI Advisor interprets it', say:'The advisor recognises the machine, the system and the issue, and answers from the same data.', run: async () => { await navTo('advisor'); const q = 'My JCB 3DX has high iron in the engine oil.', inp = $('#aq'); if (inp) { for (const ch of q) { inp.value += ch; await sleep(22); } } ask(q); } },
  { t:'Optimize the cost', say:'TCO Calculator: an illustrative annual cost comparison for the same machine. All inputs are editable assumptions.', run: async () => { await navTo('tco?eq=jcb-3dx'); await sleep(500); const f = $('#tcoform'); if (f) f.requestSubmit(); await sleep(300); spot('#tco-out'); } },
  { t:'Build the permanent record', say:'Lubrication Passport: JCB 3DX is registered as asset JCB-001 with its lubricants, timeline and QR.', run: async () => { let p = passportFor('jcb-3dx'); if (!p) p = createPassport('jcb-3dx', 'JCB-001', 'Mumbai', 5820); if (!p.qr) { p.qr = true; savePassport(p); } await navTo('passport/' + p.assetId); await sleep(500); spot('#timeline'); } },
  { t:'See how it all connects', say:'Knowledge Graph: OEM, equipment, conditions, systems, specifications, products, evidence, analysis, maintenance and cost.', run: async () => { state.gsel = 'eq'; await navTo('graph?focus=jcb-3dx'); await sleep(900); const n = GRAPH.nodes.find(x => x.type === 'product'); if (n) graphSelect(n.id); } },
  { t:'Convert to a qualified lead', say:'Every module ends in a commercial action. The form carries the equipment and scenario with it.', run: async () => { openLead('assessment', 'JCB 3DX', 'TCO Scenario: JCB 3DX · Analysis ID: OA-004'); } }
];
function demoUI() {
  const d = state.demo, box = $('#demo'); if (!d) { box.hidden = true; return; } box.hidden = false; const s = DEMO[d.i];
  box.innerHTML = `<div class="prog"><i style="width:${(d.i + 1) / DEMO.length * 100}%"></i></div><h4>Step ${d.i + 1} of ${DEMO.length} · ${s.t}</h4><p>${s.say}</p>
    <div class="ctl">${d.i < DEMO.length - 1 ? `<button class="hot" data-act="demonext">Next ▸</button><button data-act="demopause">${d.paused ? '▶ Resume' : '❚❚ Pause'}</button>` : ''}<button data-act="demostop">${d.i < DEMO.length - 1 ? 'Exit demo' : 'Finish'}</button></div>`;
}
async function demoStep(i) {
  const d = state.demo; if (!d) return; clearTimeout(d.timer); d.i = i; d.busy = true; demoUI(); closeModal();
  $$('.spot').forEach(el => el.classList.remove('spot'));
  try { await DEMO[i].run(); } catch (e) { console.error(e); }
  if (state.demo !== d) return; d.busy = false;
  if (i < DEMO.length - 1 && !d.paused) d.timer = setTimeout(() => demoStep(i + 1), DEMO_STEP_MS());
}
function runDemo() { if (state.demo) clearTimeout(state.demo.timer); closeModal(); state.chat = []; state.demo = { i: 0, paused: false }; demoStep(0); }

/* ============================ EVENTS (DELEGATED) ============================ */
const ACTIONS = {
  back: () => history.length > 1 ? history.back() : go(''),
  menu: () => { const o = $('#modnav').classList.toggle('open'); $('.hamb').setAttribute('aria-expanded', o); if (o) window.scrollTo(0, 0); },
  close: closeModal, mgmt: openMgmt, demo: runDemo,
  mgo: p => { closeModal(); go(p); },
  ask: q => ask(q),
  clearchat: () => { state.chat = []; state.advisorEq = null; render(); },
  multi: v => { const s = state.multi.sel; state.multi.sel = s.includes(v) ? s.filter(x => x !== v) : (v === 'normal' ? ['normal'] : s.filter(x => x !== 'normal').concat([v])); render(true); },
  cmp: toggleCompare, clearcmp: () => { state.compare = []; render(true); },
  tds: id => { const p = prod(id); openModal(`<div class="eyebrow">Technical Data Sheet <span class="demo-badge">demo</span></div><h2>${esc(p.name)}</h2><div class="tblwrap"><table class="tbl"><tbody>${[['Grade', p.grade], ['Performance level', p.specs.join(', ')], ['Base oil type', p.base], ['Applications', p.applications.join('; ')]].map(x => `<tr><th scope="row">${x[0]}</th><td>${esc(x[1])}</td></tr>`).join('')}</tbody></table></div><p class="small muted" style="margin-top:10px">Demo preview. In production this downloads the current TDS PDF; the same fields are on the page as HTML.</p><div class="cta-row"><button class="btn sec" data-act="close">Close</button></div>`, 'Technical Data Sheet'); },
  lead: a => { const [type, equipment, ...ctx] = a.split('|'); Analytics.track('expert_cta_clicked', { cta: type, from: R.seg[0] || 'home' }); openLead(type, equipment, ctx.join('|')); },
  trend: id => { state.trend = id; const rep = allReports().find(x => x.id === R.seg[1]); if (rep) $('#trend').innerHTML = trendHTML(rep); },
  oapass: id => { const rep = allReports().find(x => x.id === id), e = eqp(rep.equipment), p = passportFor(e.id); if (!p) return go('passport?new=' + e.id); if (!p.events.some(x => x.ref === id)) { p.events.push({ date: rep.date, type: reportStatus(rep) === 'good' ? 'analysis' : 'flag', system: rep.system, title: `Oil analysis ${id}: ${STATUS[reportStatus(rep)]}`, notes: `${sysOf(rep.system).name} oil sample at ${rep.hoursOnOil} h on oil.`, ref: id, hours: rep.equipmentHours, user: true }); savePassport(p); } toast(`Report ${id} added to passport ${p.assetId}.`); go('passport/' + p.assetId); },
  tcosave: () => { const { i, r } = tcoRender(), e = eqp(i.eq); let p = passportFor(e.id); if (!p) p = createPassport(e.id, nextAssetId(e), 'Mumbai', 5820); p.scenarios.push({ date: today(), product: prod(i.gulfProduct).name, cur: r.cur.total, gulf: r.gulf.total }); p.events.push({ date: today(), type:'tco', title:'TCO scenario saved', notes: `Illustrative: current ${inr(r.cur.total)} / Gulf scenario ${inr(r.gulf.total)} per year.`, hours: p.hours, user: true }); savePassport(p); toast(`Scenario saved to passport ${p.assetId}.`); go('passport/' + p.assetId); },
  ppsample: () => { const p = createPassport('jcb-3dx', 'JCB-001', 'Mumbai', 5820); go('passport/' + p.assetId); },
  qr: id => { const p = passports().find(x => x.assetId === id); p.qr = true; savePassport(p); render(true); toast('Equipment QR created (demo pattern).'); },
  vadd: code => { const hit = D.authCodes[code], p = passports()[0]; p.verified.push({ code, product: hit.product }); p.events.push({ date: today(), type:'verify', title:'Genuine product verified', notes: `${prod(hit.product).name} · ${code}`, hours: p.hours, user: true }); savePassport(p); toast(`Added to passport ${p.assetId}.`); go('passport/' + p.assetId); },
  gclear: () => { state.gsel = null; $$('.gnode,.gedge').forEach(el => el.classList.remove('dim', 'hi', 'sel')); $('#gpanel').innerHTML = '<p class="muted">Select an entity in the graph to see its relationships.</p>'; },
  resetdata: () => { Store.reset(); state.chat = []; state.compare = []; state.tcoShown = false; toast('Prototype data reset.'); go(''); },
  demonext: () => state.demo && !state.demo.busy && demoStep(Math.min(state.demo.i + 1, DEMO.length - 1)),
  demopause: () => { const d = state.demo; if (!d) return; d.paused = !d.paused; clearTimeout(d.timer); if (!d.paused && !d.busy) d.timer = setTimeout(() => demoStep(d.i + 1), 4000); demoUI(); },
  demostop: () => { if (state.demo) clearTimeout(state.demo.timer); state.demo = null; demoUI(); $$('.spot').forEach(el => el.classList.remove('spot')); }
};
document.addEventListener('click', e => {
  const n = e.target.closest('.gnode'); if (n) return graphSelect(n.dataset.node);
  const b = e.target.closest('[data-act]'); if (!b) return;
  const fn = ACTIONS[b.dataset.act]; if (fn) { e.preventDefault(); fn(b.dataset.arg || ''); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('gnode')) { e.preventDefault(); graphSelect(e.target.dataset.node); }
});
document.addEventListener('submit', e => {
  const f = e.target.dataset.form; if (!f) return; e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target));
  if (f === 'gsearch') { const q = fd.q.trim(); if (q) go('search?q=' + encodeURIComponent(q)); }
  if (f === 'ask') { ask(fd.q); }
  if (f === 'lead') submitLead(e.target);
  if (f === 'loc') { const q = fd.q.trim(); if (!q) { $('#loc-err').textContent = 'Enter a pincode, city or location.'; return; } if (/^\d+$/.test(q) && !/^\d{6}$/.test(q)) { $('#loc-err').textContent = 'Enter a valid 6-digit pincode.'; return; } go(`locator/${e.target.dataset.kind}?q=${encodeURIComponent(q)}`); }
  if (f === 'verify') { const c = fd.code.trim().toUpperCase(); if (!c) return; if (D.authCodes[c]) Analytics.track('product_authenticated', { product: prod(D.authCodes[c].product).name }); go('verify?code=' + encodeURIComponent(c)); }
  if (f === 'oil') {
    const errs = {}; if (!fd.sampleId.trim()) errs.sampleId = 'Enter a sample ID.'; if (!(+fd.hoursOnOil > 0)) errs.hoursOnOil = 'Enter hours on oil.'; if (!(+fd.equipmentHours > 0)) errs.equipmentHours = 'Enter equipment hours.'; if (!fd.date) errs.date = 'Enter the sampling date.';
    if (!showErrors(e.target, errs)) return;
    const btn = e.target.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Analyzing sample…'; Analytics.track('oil_analysis_started', { equipment: eqp(fd.eq).name, system: fd.sys });
    setTimeout(() => { const rep = generateReport(eqp(fd.eq), fd.sys, { sampleId: fd.sampleId.trim(), hoursOnOil: +fd.hoursOnOil, equipmentHours: +fd.equipmentHours, product: fd.product, date: fd.date }); Store.set('reports', Store.get('reports', []).concat([rep])); Analytics.track('oil_analysis_completed', { report: rep.id, status: reportStatus(rep) }); go('oil-analysis/' + rep.id); }, 900);
  }
  if (f === 'tco') { state.tcoShown = true; const { i, r } = tcoRender(); Analytics.track('tco_completed', { equipment: eqp(i.eq).name, difference: Math.round(r.diff) }); if (window.innerWidth < 1040) $('#tco-out').scrollIntoView(); }
  if (f === 'passport') {
    const errs = {}; if (!fd.assetId.trim()) errs.assetId = 'Enter an asset ID.'; else if (passports().some(p => p.assetId === fd.assetId.trim())) errs.assetId = 'This asset ID already exists.'; if (fd.location.trim().length < 2) errs.location = 'Enter a location.'; if (!(+fd.hours >= 0) || fd.hours === '') errs.hours = 'Enter operating hours.';
    if (!showErrors(e.target, errs)) return; const p = createPassport(fd.eq, fd.assetId.trim().replace(/[^A-Za-z0-9_-]/g, '-'), fd.location.trim(), fd.hours); go('passport/' + p.assetId);
  }
  if (f === 'maint') {
    const errs = {}; if (!fd.date) errs.date = 'Enter the date.'; if (!(+fd.qty > 0)) errs.qty = 'Enter the quantity.'; if (!(+fd.hours >= 0) || fd.hours === '') errs.hours = 'Enter operating hours.'; if (fd.tech.trim().length < 2) errs.tech = 'Enter the technician’s name.';
    if (!showErrors(e.target, errs)) return; const p = passports().find(x => x.assetId === e.target.dataset.asset), s = sysOf(fd.system);
    p.events.push({ date: fd.date, type:'change', system: fd.system, product: fd.product, title: `${s.fluid} changed`, notes: `${prod(fd.product).name}, ${fd.qty} ${fd.system === 'grease' ? 'kg' : 'L'} at ${(+fd.hours).toLocaleString('en-IN')} h. Technician: ${fd.tech.trim()}.${fd.notes ? ' ' + fd.notes.trim() : ''}`, hours: +fd.hours, user: true });
    p.hours = Math.max(p.hours, +fd.hours); savePassport(p); Analytics.track('maintenance_added', { assetId: p.assetId, system: fd.system, product: prod(fd.product).name }); toast('Maintenance event saved to the passport.'); render(true); spot('#timeline');
  }
});
document.addEventListener('input', e => {
  const t = e.target, filter = (sel, empty) => { const v = norm(t.value); let n = 0; $$(sel + ' [data-t]').forEach(c => { const on = !v || v.split(' ').every(k => c.dataset.t.includes(k)); c.hidden = !on; if (on) n++; }); $(empty).hidden = n > 0; };
  if (t.dataset.input === 'eqfilter') filter('#eqlist', '#eq-empty');
  if (t.dataset.input === 'kfilter') filter('#klist', '#k-empty');
  if (t.closest('#tcoform')) { if (!state.tcoStarted) { state.tcoStarted = true; Analytics.track('tco_started', {}); } if (state.tcoShown) tcoRender(); else $('#t-annual').value = (parseFloat($('#t-hoursDay').value) || 0) * (parseFloat($('#t-daysMonth').value) || 0) * 12; }
  if (t.closest('[data-form=lead]') && state.lead && !state.lead.started) { state.lead.started = true; Analytics.track('expert_form_started', { cta: state.lead.type }); }
});
document.addEventListener('change', e => {
  const t = e.target, c = t.dataset.change; if (!c) return;
  if (c === 'oaeq') go('oil-analysis?eq=' + t.value);
  if (c === 'oasys') go(`oil-analysis?eq=${$('#oa-eq').value}&sys=${t.value}`);
  if (c === 'tcoeq') { state.tcoShown = false; go('tco?eq=' + t.value); }
  if (c === 'graph') { state.gsel = 'eq'; go('graph?focus=' + t.value); }
  if (c === 'ppeq') go('passport?new=' + t.value);
  if (c === 'msys') { const p = passports().find(x => x.assetId === t.form.dataset.asset), l = eqp(p.equipment).lubrication.find(x => x.system === t.value); $('#m-p').innerHTML = l.products.map(id => `<option value="${id}">${esc(prod(id).name)}</option>`).join(''); $('#m-q').value = l.capacity; }
});
const tipShow = e => { const t = e.target.closest && e.target.closest('[data-tip]'), tip = $('#tip'); if (!t) { tip.hidden = true; return; } const b = t.getBoundingClientRect(); tip.textContent = t.dataset.tip; tip.hidden = false; tip.style.left = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, b.left + b.width / 2 - tip.offsetWidth / 2)) + 'px'; tip.style.top = (b.top - 38) + 'px'; };
document.addEventListener('mouseover', tipShow); document.addEventListener('focusin', tipShow); window.addEventListener('scroll', () => ($('#tip').hidden = true), { passive: true });

/* ================================== INIT ================================== */
Analytics.track('platform_opened', {});
render();
