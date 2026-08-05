/* =====================================================================
   YeuPecheQuand — best moments for hand-fishing (pêche à pied) at Île d'Yeu.
   Tide engine: harmonic model calibrated on SHOM predictions for
   Port-Joinville (Île d'Yeu). All times shown in local time (Europe/Paris).
   ===================================================================== */
'use strict';

/* ---- Harmonic constants (fitted to SHOM Port-Joinville, Aug 2026) ---- */
const TIDE = {
  Z0: 2.991,                       // mean level (m) above chart datum
  t0: Date.parse('2026-08-05T01:23:00Z'),
  harmonics: [
    { name:'M2', A:1.0063, phi:-2.4078, period:12.4206012 },
    { name:'S2', A:0.4730, phi: 1.9582, period:12.0       },
    { name:'N2', A:0.1912, phi:-2.7569, period:12.65834751},
    { name:'K2', A:0.1324, phi: 1.9582, period:11.96723606},
  ],
};

/* ---- astronomy: lunar node N (rad) for nodal correction ---- */
function lunarNode(date){
  const d2000 = (date.getTime() - Date.UTC(2000,0,1,12,0,0)) / 86400000;
  const Ndeg = (125.0445 - 0.0529538 * d2000) % 360;
  return Ndeg * Math.PI / 180;
}
/* Schureman nodal amplitude factor f and phase u (deg) */
function nodal(name, N){
  const s=Math.sin(N), c=Math.cos(N), s2=Math.sin(2*N), c2=Math.cos(2*N);
  switch(name){
    case 'M2': return [1.0004-0.0373*c+0.0002*c2, -2.14*s];
    case 'S2': return [1.0, 0.0];
    case 'N2': return [1.0004-0.0373*c+0.0002*c2, -2.14*s];
    case 'K2': return [1.0241+0.2863*c+0.0083*c2, -17.74*s+0.68*s2];
    default:   return [1.0, 0.0];
  }
}

/* water height (m) at a given JS Date */
function heightAt(date){
  const th = (date.getTime() - TIDE.t0) / 3600000;   // hours since t0
  const N = lunarNode(date);
  let h = TIDE.Z0;
  for (const c of TIDE.harmonics){
    const [f,u] = nodal(c.name, N);
    const w = 2*Math.PI / c.period;
    h += c.A * f * Math.cos(w*th - c.phi + u*Math.PI/180);
  }
  return h;
}

/* find extrema (high/low tides) between two Dates, step in minutes */
function findExtrema(start, end){
  const res = [];
  const step = 5*60*1000;
  let prev2 = heightAt(new Date(start.getTime()-step));
  let prev  = heightAt(start);
  for (let t = start.getTime()+step; t <= end.getTime(); t += step){
    const h = heightAt(new Date(t));
    if ((prev>prev2 && prev>h) || (prev<prev2 && prev<h)){
      res.push({ time:new Date(t-step), height:prev, type: prev>prev2 ? 'PM' : 'BM' });
    }
    prev2 = prev; prev = h;
  }
  return res;
}

/* daily tidal coefficient ~ range / 3.05 * 100 (Brest reference) */
function coefficient(date){
  const d0 = new Date(date); d0.setHours(0,0,0,0);
  let mn=Infinity, mx=-Infinity;
  for (let m=0; m<24*60; m+=30){
    const h = heightAt(new Date(d0.getTime()+m*60000));
    if (h<mn) mn=h; if (h>mx) mx=h;
  }
  return Math.round((mx-mn)/3.05*100);
}

/* ---- best fishing windows for a given local day ----
   Window = from 2h before low tide to 1h after (falling tide + slack).
   Score each window by coefficient (higher = better) and daylight.      */
function fishingWindows(date){
  const d0 = new Date(date); d0.setHours(0,0,0,0);
  const d1 = new Date(d0.getTime()+24*3600*1000);
  // look a bit beyond the day so windows crossing midnight are caught
  const ext = findExtrema(new Date(d0.getTime()-6*3600*1000), new Date(d1.getTime()+6*3600*1000));
  const lows = ext.filter(e=>e.type==='BM');
  const coef = coefficient(date);
  const wins = lows.map(low=>{
    const start = new Date(low.time.getTime()-2*3600*1000);
    const end   = new Date(low.time.getTime()+1*3600*1000);
    // daylight bonus: 8h–20h local
    const hr = low.time.getHours()+low.time.getMinutes()/60;
    const daylight = (hr>=8 && hr<=20) ? 1 : 0.4;
    const score = Math.round(coef*daylight);
    return { low, start, end, score, daylight: daylight===1 };
  });
  // keep windows whose low tide falls within the requested day
  const inDay = wins.filter(w=>w.low.time>=d0 && w.low.time<d1);
  inDay.sort((a,b)=>b.score-a.score);
  return { windows: inDay, coef, extrema: ext.filter(e=>e.time>=d0 && e.time<d1) };
}

/* ---- formatting helpers (French) ---- */
const fmtTime = d => d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
const fmtDay  = d => d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});

function coefClass(c){ return c>=90?'gm':(c>=70?'ve':'ne'); }
function coefLabel(c){ return c>=90?'Grande marée':(c>=70?'Vive-eau':'Morte-eau'); }

/* verdict from best window score */
function verdict(score, coef){
  if (coef>=90) return {t:'Excellent', e:'🌟', cls:'st-good'};
  if (coef>=70) return {t:'Très bon', e:'👍', cls:'st-good'};
  if (coef>=55) return {t:'Correct',  e:'🙂', cls:'st-mid'};
  return {t:'Calme', e:'🐚', cls:'st-bad'};
}

/* ======================= RENDER ======================= */
const $ = id => document.getElementById(id);

function renderDay(date, label){
  const { windows, coef, extrema } = fishingWindows(date);
  const best = windows[0];
  const v = best ? verdict(best.score, coef) : {t:'—',e:'🌊',cls:'st-bad'};

  const tidesHtml = extrema.map(e=>`
    <div class="tide-chip ${e.type==='PM'?'pm':'bm'}">
      <span class="k">${e.type==='PM'?'Pleine mer':'Basse mer'}</span>
      <b>${fmtTime(e.time)}</b> · ${e.height.toFixed(1)} m
    </div>`).join('');

  const winHtml = windows.slice(0,2).map((w,i)=>`
    <div class="window ${i===0?'best':''}">
      <span class="ico">${i===0?'🎣':'🦀'}</span>
      <div>
        <div class="lbl">${i===0?'Meilleure fenêtre':'Aussi possible'}</div>
        <div class="t">${fmtTime(w.start)} – ${fmtTime(w.end)}</div>
        <div class="lbl">basse mer ${fmtTime(w.low.time)} · ${w.low.height.toFixed(1)} m ${w.daylight?'· ☀️':''}</div>
      </div>
    </div>`).join('');

  return `
  <article class="day-card">
    <div class="day-head">
      <div class="day-name">${label}</div>
      <span class="coef-pill ${coefClass(coef)}">coef ${coef} · ${coefLabel(coef)}</span>
    </div>
    <div class="verdict"><span class="emoji">${v.e}</span> ${v.t}</div>
    <div class="verdict-sub">${best
        ? `La mer se retire le plus vers <b>${fmtTime(best.low.time)}</b>.`
        : 'Pas de basse mer exploitable ce jour-là.'}</div>
    ${winHtml}
    <div class="tides">${tidesHtml}</div>
  </article>`;
}

function renderNow(){
  const now = new Date();
  const h = heightAt(now);
  // tide direction: compare with 10 min ahead
  const rising = heightAt(new Date(now.getTime()+10*60000)) > h;
  // next extremum
  const ext = findExtrema(now, new Date(now.getTime()+13*3600*1000))[0];
  const { windows, coef } = fishingWindows(now);
  const best = windows[0];

  $('nowHeight').textContent = h.toFixed(1)+' m';
  // ring: map height 0..5.5m to 0..100%
  const frac = Math.max(0, Math.min(1, h/5.5));
  $('ringFg').style.strokeDashoffset = (163.3*(1-frac)).toFixed(1);

  let badge='🌊', title, sub, cls='st-mid';
  const inWindow = best && now>=best.start && now<=best.end;
  if (inWindow){
    badge='🎣'; cls='st-good';
    title="C'est le moment de pêcher !";
    sub=`Fenêtre jusqu'à ${fmtTime(best.end)} · coefficient ${coef}`;
  } else if (best && now < best.start){
    badge = rising?'📈':'📉';
    title = rising ? 'Marée montante' : 'Marée descendante';
    sub = `Prochaine fenêtre ${fmtTime(best.start)} – ${fmtTime(best.end)} · coef ${coef}`;
  } else {
    badge = rising?'📈':'📉';
    title = rising ? 'Marée montante' : 'Marée descendante';
    sub = ext ? `Prochaine ${ext.type==='PM'?'pleine':'basse'} mer à ${fmtTime(ext.time)} (${ext.height.toFixed(1)} m)` : '';
  }
  $('nowBadge').textContent = badge;
  $('nowTitle').textContent = title;
  $('nowSub').textContent = sub;
  $('nowCard').className = 'now-card '+(inWindow?'st-good':(coef>=70?'st-mid':'st-bad'));
}

/* ---- tide curve canvas ---- */
function drawCurve(date){
  const cv = $('tideCurve');
  const ctx = cv.getContext('2d');
  const dpr = window.devicePixelRatio||1;
  const W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W*dpr; cv.height = H*dpr; ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,W,H);

  const d0 = new Date(date); d0.setHours(0,0,0,0);
  const N = 96;
  const pts = [];
  let mn=Infinity, mx=-Infinity;
  for (let i=0;i<=N;i++){
    const t = new Date(d0.getTime()+ i/N*24*3600*1000);
    const h = heightAt(t); pts.push({t,h});
    if(h<mn)mn=h; if(h>mx)mx=h;
  }
  const pad=8, y0=H-22, y1=pad;
  const Y = h => y0 - (h-mn)/(mx-mn||1)*(y0-y1);
  const X = i => i/N*W;

  // fishing windows shading
  const { windows } = fishingWindows(date);
  ctx.fillStyle='rgba(255,194,75,.22)';
  for(const w of windows){
    const a=(w.start-d0)/86400000*W, b=(w.end-d0)/86400000*W;
    ctx.fillRect(a,0,b-a,y0);
  }

  // curve
  ctx.beginPath();
  pts.forEach((p,i)=> i?ctx.lineTo(X(i),Y(p.h)):ctx.moveTo(X(i),Y(p.h)));
  ctx.strokeStyle='#12557a'; ctx.lineWidth=2.5; ctx.stroke();
  // fill under
  ctx.lineTo(W,y0); ctx.lineTo(0,y0); ctx.closePath();
  const g=ctx.createLinearGradient(0,0,0,y0);
  g.addColorStop(0,'rgba(27,127,166,.35)'); g.addColorStop(1,'rgba(27,127,166,.03)');
  ctx.fillStyle=g; ctx.fill();

  // extrema markers
  const ext = findExtrema(d0,new Date(d0.getTime()+24*3600*1000));
  for(const e of ext){
    const x=(e.time-d0)/86400000*W, y=Y(e.height);
    ctx.beginPath(); ctx.arc(x,y,4.5,0,7);
    ctx.fillStyle = e.type==='PM' ? '#12557a' : '#e1503f'; ctx.fill();
    ctx.fillStyle='#0b2239'; ctx.font='10px system-ui';
    ctx.textAlign='center';
    ctx.fillText(fmtTime(e.time), x, e.type==='PM'? y-8 : y+16);
  }

  // "now" line if today
  const now=new Date();
  if (now>=d0 && now<new Date(d0.getTime()+86400000)){
    const x=(now-d0)/86400000*W;
    ctx.strokeStyle='#ff6b5e'; ctx.setLineDash([4,4]); ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,y0); ctx.stroke();
    ctx.setLineDash([]);
  }

  // hour grid
  ctx.fillStyle='#9db6c7'; ctx.font='9px system-ui'; ctx.textAlign='center';
  for(let hh=0;hh<=24;hh+=6){ ctx.fillText(hh+'h', hh/24*W, H-8); }
}

/* ---- floating emoji background (hand-fishing theme) ---- */
function buildHeroArt(){
  const host = $('heroArt');
  if (!host) return;
  const EMOJI = ['🦐','🦀','🐚','🪨','☀️','🌊','🦪','🐟'];
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const count = window.innerWidth < 600 ? 12 : 18;
  const frag = document.createDocumentFragment();
  for (let i=0;i<count;i++){
    const s = document.createElement('span');
    s.className = 'f';
    s.textContent = EMOJI[(Math.random()*EMOJI.length)|0];
    s.style.left = (Math.random()*100).toFixed(1)+'%';
    s.style.fontSize = (18+Math.random()*30).toFixed(0)+'px';
    s.style.opacity = (0.35+Math.random()*0.5).toFixed(2);
    const dur = 9+Math.random()*14;
    s.style.animationDuration = dur.toFixed(1)+'s';
    s.style.animationDelay = (-Math.random()*dur).toFixed(1)+'s';
    if (reduce) s.style.animation = 'none';
    frag.appendChild(s);
  }
  host.appendChild(frag);
}

/* ======================= INIT ======================= */
function init(){
  buildHeroArt();
  const today = new Date();
  const tomorrow = new Date(today.getTime()+86400000);

  $('dayGrid').innerHTML =
    renderDay(today, "Aujourd'hui") +
    renderDay(tomorrow, 'Demain');

  $('curveDate').textContent = '· '+fmtDay(today);
  renderNow();
  drawCurve(today);
  $('year').textContent = today.getFullYear();

  // refresh every minute
  setInterval(()=>{ renderNow(); drawCurve(new Date()); }, 60000);
  window.addEventListener('resize', ()=>drawCurve(new Date()));
}
document.addEventListener('DOMContentLoaded', init);
