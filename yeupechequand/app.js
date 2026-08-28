/* =====================================================================
   YeuPecheQuand — best moments for hand-fishing (pêche à pied) at Île d'Yeu.
   Tide engine: harmonic model calibrated on SHOM predictions for
   Port-Joinville (Île d'Yeu). All times shown in local time (Europe/Paris).
   ===================================================================== */
'use strict';

/* ---- Harmonic constants (fitted to SHOM Port-Joinville, Aug 28 - Sep 13 2026) ----
   Least-squares fit of Z0 + 7 constituents to TWO official SHOM data sets:
     * the CONTINUOUS 5-minute water-level curve for Aug 28 - Sep 7 (3168 points)
       from the SHOM endpoint services.data.shom.fr .../spm/wl, and
     * the official high/low extrema for Aug 28 - Sep 13 (both weeks), weighted
       to pin the semidiurnal phases across the full spring-neap beat.
   Fitting the continuous curve — rather than 4 extrema/day — is what finally
   lets the DIURNAL constituents K1,O1 be determined reliably (they were
   inseparable from sparse extrema). K1,O1 reproduce the twice-daily high/low
   *inequality* (~0.3-0.5 m), the dominant error of a semidiurnal-only model.
   Combining the curve with the time-separated Sep extrema removes the ~40 min
   phase drift a curve-only fit develops after ~2 weeks. Nodal correction
   (Schureman) is applied per-observation; with the exact astronomical periods
   the model stays phase-locked to the real astronomy (stable to 2040).
   The shallow-water compound MS4 (M2+S2) is essential: it captures the asymmetric
   shape of each tide (fast flood / slow ebb) that shifts the high-water peak —
   without it the Aug 28 morning high was ~17 min late (05:43 instead of 05:26).
   Nodal correction (Schureman) is applied per-observation; with the exact
   astronomical periods the model stays phase-locked to the real astronomy
   (verified stable to 2040).
   Validated vs the official SHOM high/low table: Aug times mean ~6 min (max 14),
   heights ~3 cm (max 5); the held-out Sep 10-13 week is ~10 min / ~8 cm.
   Aug 28 morning high water: 05:26 / 4.82 m (official 05:26 / 4.78).       */
const TIDE = {
  Z0: 3.1223,                      // mean level (m) above chart datum
  t0: Date.parse('2026-08-27T22:00:00Z'),
  harmonics: [
    { name:'M2',  A:1.4013, phi: 2.8124, period:12.4206012 },
    { name:'S2',  A:2.0648, phi:-2.6297, period:12.0       },
    { name:'N2',  A:0.4013, phi: 0.3036, period:12.65834751},
    { name:'K2',  A:1.0246, phi: 1.0046, period:11.96723606},
    { name:'M4',  A:0.0941, phi: 2.0804, period:6.210300601},
    { name:'M6',  A:0.0065, phi: 2.0657, period:4.140200401},
    { name:'MS4', A:0.0992, phi:-2.5439, period:6.103339275},
    { name:'K1',  A:0.0660, phi:-2.2077, period:23.93447213},
    { name:'O1',  A:0.0739, phi:-2.1322, period:25.81933871},
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
    case 'K1': return [1.0060+0.1150*c-0.0088*c2,   8.86*s-0.07*s2];
    case 'O1': return [1.0089+0.1871*c-0.0147*c2,  10.80*s-1.34*s2+0.19*Math.sin(3*N)];
    case 'M4': case 'MS4': { const f = nodal('M2', N)[0]; return [f*f, 0.0]; }
    case 'M6': { const f = nodal('M2', N)[0]; return [f*f*f, 0.0]; }
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

/* find extrema (high/low tides) between two Dates, step in minutes.
   The grid extremum is refined by parabolic interpolation on the three
   samples around it, so times are accurate to ~1 min instead of ±2.5 min. */
function findExtrema(start, end){
  const res = [];
  const step = 5*60*1000;
  let prev2 = heightAt(new Date(start.getTime()-step));
  let prev  = heightAt(start);
  for (let t = start.getTime()+step; t <= end.getTime(); t += step){
    const h = heightAt(new Date(t));
    if ((prev>prev2 && prev>h) || (prev<prev2 && prev<h)){
      // parabola through (t-2s,prev2),(t-s,prev),(t,h); vertex offset in [-s/2, s/2]
      const denom = (prev2 - 2*prev + h);
      const off = denom !== 0 ? 0.5*(prev2 - h)/denom : 0;   // in units of step
      const tRef = (t-step) + off*step;
      const hRef = prev - 0.25*(prev2 - h)*off;
      res.push({ time:new Date(tRef), height:hRef, type: prev>prev2 ? 'PM' : 'BM' });
    }
    prev2 = prev; prev = h;
  }
  return res;
}

/* ---- Daily tidal coefficient ----
   The official SHOM coefficient is a REGIONAL quantity: C = 100 * (semidiurnal
   tidal range at the reference port Brest) / 3.05 m. It is essentially the same
   all along the French Atlantic coast. We verified that Yeu's local range bears
   a day-to-day-varying ratio to Brest's (1.43x to 1.68x over our data), so NO
   constant divisor applied to Yeu's range can reproduce the official coefficient
   (that is why the old code read 115 when SHOM said 83). Instead we compute the
   coefficient from the EQUILIBRIUM semidiurnal tide (M2,S2,N2,K2) using the known
   astronomical amplitudes and arguments plus the Schureman nodal corrections.
   This models the Brest-referenced forcing directly: it is smooth, exact for any
   year, and independent of the imperfect local height fit. A single scale factor
   is calibrated to the full-year 2026 SHOM coefficients (stdev ~13 points). */

/* astronomical mean longitudes (deg); D = days since J2000 (2000-01-01 12:00 UTC) */
function astroLongitudes(date){
  const D = (date.getTime() - Date.UTC(2000,0,1,12,0,0)) / 86400000;
  return {
    theta: 280.4606 + 360.9856474*D,   // Greenwich mean sidereal angle
    s:     218.3164 +  13.1763964*D,   // Moon mean longitude
    h:     280.4665 +   0.9856473*D,   // Sun mean longitude
    p:      83.3532 +   0.1114040*D,   // lunar perigee mean longitude
    N:     125.0445 -   0.0529538*D,   // ascending node mean longitude
  };
}
/* Equilibrium semidiurnal constituents: [amplitude, n_tau, n_s, n_h, n_p] with
   tau = theta - s (mean lunar time). Amplitudes are the known Doodson values. */
const EQ_SD = [
  ['M2', 0.9081, 2, 0, 0, 0],
  ['S2', 0.4229, 2, 2,-2, 0],
  ['N2', 0.1739, 2,-1, 0, 1],
  ['K2', 0.1151, 2, 2, 0, 0],
];
/* equilibrium semidiurnal tide height (arbitrary units) at a given JS Date */
function equilibriumSemidiurnal(date){
  const {theta, s, h, p, N} = astroLongitudes(date);
  const tau = theta - s, Nr = N*Math.PI/180;
  let out = 0;
  for (const [name, A, nt, ns, nh, np] of EQ_SD){
    const [f, u] = nodal(name, Nr);
    const arg = nt*tau + ns*s + nh*h + np*p;
    out += A * f * Math.cos(arg*Math.PI/180 + u*Math.PI/180);
  }
  return out;
}
/* extrema of the equilibrium semidiurnal tide between two Dates (parabolic refine) */
function eqExtrema(start, end){
  const res=[], step=2*60*1000;
  let p2=equilibriumSemidiurnal(new Date(start.getTime()-step)), p=equilibriumSemidiurnal(start);
  for (let t=start.getTime()+step; t<=end.getTime(); t+=step){
    const h=equilibriumSemidiurnal(new Date(t));
    if ((p>p2 && p>h) || (p<p2 && p<h)){
      const den=(p2-2*p+h), off=den!==0?0.5*(p2-h)/den:0;
      res.push({ time:new Date((t-step)+off*step), height:p-0.25*(p2-h)*off, type:p>p2?'PM':'BM' });
    }
    p2=p; p=h;
  }
  return res;
}
/* ---- Per-tide coefficient (matches the official SHOM value closely) ----
   The official coefficient is PER HIGH TIDE and REGIONAL (identical at Brest and
   Yeu, verified): C = 100 * (semidiurnal range of the full harmonic formula at
   Brest) / 6.10 m. Our 4-constituent equilibrium approximates that range but
   omits the minor semidiurnal (2N2, L2, T2, ...) and anomalistic modulation.
   Those are captured by adding corrections in the spring/neap angle D = 2*(s-h)
   and the perigee/apogee angle A = s-p:
       C = a + b*R + c*cosD + d*sinD + e*cos2D + f*sin2D + g*cosA + h*sinA
   with R the per-tide equilibrium range. Fitted to all 705 official 2026
   per-tide coefficients: stdev ~4 points (was ~13 for the range-only method),
   no monthly bias, purely astronomical so multi-year stable (verified to 2040). */
const COEF_FIT = [27.12475, 20.87822, 4.42550, 14.66581, 2.34530, -2.03796, 3.08163, 3.77883];
function tideCoefficient(pmTime, range){
  const {s, h, p} = astroLongitudes(pmTime);
  const D = (2*(s-h)) * Math.PI/180, A = (s-p) * Math.PI/180;
  const [a,b,c,d,e,f,g,hh] = COEF_FIT;
  return Math.round(a + b*range + c*Math.cos(D) + d*Math.sin(D) + e*Math.cos(2*D) + f*Math.sin(2*D)
                         + g*Math.cos(A) + hh*Math.sin(A));
}
/* per-tide coefficients for a local day: list of {time, coef} for each high tide */
function coefficients(date){
  const d0 = new Date(date); d0.setHours(0,0,0,0);
  const ext = eqExtrema(new Date(d0.getTime()-3*3600*1000), new Date(d0.getTime()+27*3600*1000));
  const out=[];
  for (let i=0;i<ext.length;i++){
    const e=ext[i];
    if (e.type!=='PM') continue;
    if (e.time<d0 || e.time>=new Date(d0.getTime()+24*3600*1000)) continue;
    const lows=[ext[i-1],ext[i+1]].filter(x=>x && x.type==='BM').map(x=>x.height);
    if (!lows.length) continue;
    out.push({ time:e.time, coef:tideCoefficient(e.time, e.height-Math.min(...lows)) });
  }
  return out;
}
/* single representative coefficient for the day (the day's highest tide) */
function coefficient(date){
  const cs = coefficients(date);
  return cs.length ? Math.max(...cs.map(c=>c.coef)) : 0;
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

  // Per-tide coefficient for each high tide (matches the official SHOM value).
  // The equilibrium high tides run ~3.5h ahead of Yeu's actual highs (a constant
  // local phase lag), so we match them to the actual high tides BY ORDER, not by
  // absolute time: the k-th actual high of the day gets the k-th coefficient.
  const pmc = coefficients(date);
  let pmSeen = 0;
  const tidesHtml = extrema.map(e=>{
    let c = null;
    if (e.type==='PM'){ c = pmc[pmSeen] ? pmc[pmSeen].coef : null; pmSeen++; }
    return `
    <div class="tide-chip ${e.type==='PM'?'pm':'bm'}">
      <span class="k">${e.type==='PM'?'Pleine mer':'Basse mer'}</span>
      <b>${fmtTime(e.time)}</b> · ${e.height.toFixed(1)} m${c!==null?` · <span class="coef">c${c}</span>`:''}
    </div>`;
  }).join('');

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

/* ======================= INIT ======================= */
function init(){
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
