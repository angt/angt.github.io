/* =====================================================================
   YeuPecheQuand — best moments for hand-fishing (pêche à pied) at Île d'Yeu.
   Tide engine: harmonic model calibrated on SHOM predictions for
   Port-Joinville (Île d'Yeu). All times shown in local time (Europe/Paris).
   ===================================================================== */
'use strict';

/* ---- Harmonic constants (fitted to SHOM Port-Joinville, Jul 20 - Oct 27 2026) ----
   Least-squares fit of Z0 + 27 constituents to the CONTINUOUS 5-minute SHOM
   water-level curves for Jul 20 - Oct 27 2026 (8 overlapping 11-day windows,
   28 800 points, services.data.shom.fr .../spm/wl). The 100-day baseline is
   the key: it resolves the beat periods that make near-degenerate semidiurnal
   constituents separable (M2-S2 14.8 d, M2-N2 27.5 d, M2-K2 29.6 d). The
   previous 17-day fit could not, so its constituent amplitudes traded off
   against each other: superb on its fit window but anti-phased two months
   later (~100 min / 1.8 m off on Oct 22-28). The full-baseline fit stays
   phase-locked. Nodal correction (Schureman) is applied per-observation and
   all periods are the exact astronomical values, so the model is multi-year
   stable (verified bounded and sane to 2040).
   Validated against the official SHOM high/low tables (maree.info), which are
   independent of the fitting curve:
     Aug 27 - Sep 3:  times mean 5 min (max 17), heights mean 3 cm (max 9)
     Oct 22 - 28:     times mean 5 min (max 13), heights mean 2 cm (max 7)
   Extrapolation check (fit ending Sep 28, tested on Oct 22-28): 6 min / 7 cm.
   The shallow-water compounds (M4, MS4, M6, M3, 2MS6, 2SM6) carry the tide
   shape asymmetry (fast flood / slow ebb) that shifts the high-water peak;
   K1, O1 (with Q1, P1, J1, OO1) reproduce the diurnal high/low inequality.
   Model, fitting method and data: tools/refit.py (python3 tools/refit.py).  */
const TIDE = {
  Z0: 3.0203,                      // mean level (m) above chart datum
  t0: Date.parse('2026-08-27T22:00:00Z'),
  harmonics: [
    { name:'M2',   A:1.5394, phi: 2.6847, period:12.4206012 },
    { name:'S2',   A:0.4802, phi: 3.0026, period:12.0       },
    { name:'N2',   A:0.3200, phi: 0.3898, period:12.65834751},
    { name:'K2',   A:0.1419, phi:-2.3135, period:11.96723606},
    { name:'M4',   A:0.1196, phi: 2.1643, period:6.210300601},
    { name:'M6',   A:0.0066, phi:-2.5204, period:4.140200401},
    { name:'MS4',  A:0.0519, phi:-2.4516, period:6.103339275},
    { name:'K1',   A:0.0653, phi:-2.6027, period:23.93447213},
    { name:'O1',   A:0.0681, phi:-2.0521, period:25.81933871},
    { name:'L2',   A:0.0644, phi: 1.7830, period:12.19162089},
    { name:'T2',   A:0.1295, phi:-2.0277, period:11.99287564},
    { name:'2N2',  A:0.0438, phi:-1.8160, period:12.90537297},
    { name:'NU2',  A:0.0556, phi:-1.8512, period:12.62600509},
    { name:'P1',   A:0.0178, phi:-0.7342, period:24.06588766},
    { name:'Q1',   A:0.0163, phi: 1.5489, period:26.868350 },
    { name:'MF',   A:0.0047, phi: 0.6115, period:327.859 },
    { name:'MM',   A:0.0072, phi:-1.0418, period:661.310 },
    { name:'SA',   A:0.2137, phi: 0.7731, period:8765.821089591562},
    { name:'SSA',  A:0.0687, phi:-2.2722, period:4382.905208717599},
    { name:'MSF',  A:0.0226, phi: 2.9885, period:354.3670522114571},
    { name:'2SM2', A:0.0061, phi: 0.9158, period:11.60695148062142},
    { name:'MU2',  A:0.0464, phi: 2.0188, period:12.871757818734757},
    { name:'OO1',  A:0.0004, phi: 1.4133, period:22.306075164905405},
    { name:'J1',   A:0.0037, phi:-0.1472, period:23.09847721364096 },
    { name:'M3',   A:0.0232, phi: 1.0479, period:8.280400870766956 },
    { name:'2MS6', A:0.0061, phi:-1.5661, period:4.09238755892356  },
    { name:'2SM6', A:0.0018, phi:-0.2423, period:4.045666403518543 },
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
  const s=Math.sin(N), c=Math.cos(N), s2=Math.sin(2*N), c2=Math.cos(2*N), s3=Math.sin(3*N);
  switch(name){
    // lunar semidiurnal family (same nodal behaviour as M2)
    case 'M2': case 'N2': case 'L2': case '2N2': case 'NU2': case 'MU2':
      return [1.0004-0.0373*c+0.0002*c2, -2.14*s];
    // shallow-water compounds: f/u stack from their parents
    case 'M4': case 'MS4': case '2SM2': { const f = nodal('M2', N)[0]; return [f*f, 0.0]; }
    case 'M6': case '2MS6': case '2SM6': { const f = nodal('M2', N)[0]; return [f*f*f, 0.0]; }
    case 'M3': { const f = nodal('M2', N)[0]; return [Math.pow(f,1.5), -1.07*s]; }
    case 'K2': return [1.0241+0.2863*c+0.0083*c2, -17.74*s+0.68*s2];
    case 'K1': return [1.0060+0.1150*c-0.0088*c2,   8.86*s-0.07*s2];
    // lunar diurnal family (same nodal behaviour as O1)
    case 'O1': case 'Q1': case 'J1': case 'OO1':
      return [1.0089+0.1871*c-0.0147*c2,  10.80*s-1.34*s2+0.19*s3];
    case 'MF': return [1.0430+0.4140*c, -23.7*s+2.7*s2-0.4*s3];
    default:   return [1.0, 0.0];   // S2, T2, P1, SA, SSA, MSF, MM
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
   The official SHOM coefficient is PER HIGH TIDE and REGIONAL (identical at
   Brest and Yeu, verified against the SHOM /spm/coeff endpoint):
   C = 100 * (semidiurnal tidal range of the full harmonic formula at the
   reference port Brest) / 6.10 m. Yeu's local range bears a day-to-day-varying
   ratio to Brest's, so no constant divisor on the local range reproduces it.
   We compute it from the EQUILIBRIUM semidiurnal tide (M2,S2,N2,K2 with the
   known Doodson amplitudes + astronomical arguments + Schureman nodal
   corrections), which models the Brest-referenced forcing directly, then add
   corrections in the spring/neap angle D = 2*(s-h) and the perigee angle
   A = s-p to capture the minor semidiurnal constituents the equilibrium omits:
       C = a + b*R + c*cosD + d*sinD + e*cos2D + f*sin2D + g*cosA + h*sinA
   (R = per-tide equilibrium range). Fitted to all 705 official 2026 per-tide
   coefficients under the same phase-paired convention the app displays:
   stdev ~3.8 points, no monthly bias, purely astronomical so multi-year
   stable (verified to 2040). */

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
const COEF_FIT = [26.11817, 21.57937, 3.83064, 13.73961, 1.43416, -1.92386, 2.93501, 3.47901];
function tideCoefficient(pmTime, range){
  const {s, h, p} = astroLongitudes(pmTime);
  const D = (2*(s-h)) * Math.PI/180, A = (s-p) * Math.PI/180;
  const [a,b,c,d,e,f,g,hh] = COEF_FIT;
  return Math.round(a + b*range + c*Math.cos(D) + d*Math.sin(D) + e*Math.cos(2*D) + f*Math.sin(2*D)
                         + g*Math.cos(A) + hh*Math.sin(A));
}

/* ---- local day boundaries (calendar-based: a DST day has 23 or 25 h) ---- */
const dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayEnd   = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()+1);

/* per-tide coefficients for a local day: one {time, coef} per high tide, in the
   order of the day's actual high tides (null where no equilibrium match).
   The equilibrium high tides lead Yeu's actual highs by a near-constant ~3.35 h
   local phase lag, so each actual high gets the coefficient of the nearest
   equilibrium high — never by raw order, which misassigns on days where an
   equilibrium high straddles midnight. */
function coefficients(date){
  const d0 = dayStart(date), d1 = dayEnd(d0);
  const ext = eqExtrema(new Date(d0.getTime()-12*3600*1000), new Date(d1.getTime()+12*3600*1000));
  const highs = findExtrema(d0, d1).filter(e=>e.type==='PM');
  const LAG = 3.35*3600*1000;
  const used = new Set();
  const out = [];
  for (const a of highs){
    let best=null, bestD=Infinity;
    for (let i=0;i<ext.length;i++){
      if (ext[i].type!=='PM' || used.has(i)) continue;
      const d = Math.abs(ext[i].time.getTime()+LAG - a.time.getTime());
      if (d<bestD){ bestD=d; best=i; }
    }
    if (best===null){ out.push(null); continue; }
    used.add(best);
    const lows=[ext[best-1],ext[best+1]].filter(x=>x && x.type==='BM').map(x=>x.height);
    out.push(lows.length
      ? { time:ext[best].time, coef:tideCoefficient(ext[best].time, ext[best].height-Math.min(...lows)) }
      : null);
  }
  return out;
}
/* single representative coefficient for the day (the day's highest tide) */
function coefficient(date){
  const cs = coefficients(date).filter(Boolean);
  return cs.length ? Math.max(...cs.map(c=>c.coef)) : 0;
}

/* ---- best fishing windows for a given local day ----
   Window = from 2h before low tide to 1h after (falling tide + slack).
   Score each window by coefficient (higher = better) and daylight.      */
function fishingWindows(date){
  const d0 = dayStart(date), d1 = dayEnd(d0);
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

/* verdict from the day's coefficient */
function verdict(coef){
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
  const v = best ? verdict(coef) : {t:'—',e:'🌊',cls:'st-bad'};

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
  // any window we are inside of counts, not just the top-scored one
  const active = windows.find(w => now>=w.start && now<=w.end);
  // next upcoming window in chronological order (windows are sorted by score)
  const next = windows.filter(w => now < w.start).sort((a,b)=>a.start-b.start)[0];

  $('nowHeight').textContent = h.toFixed(1)+' m';
  // ring: map height 0..5.5m to 0..100%
  const frac = Math.max(0, Math.min(1, h/5.5));
  $('ringFg').style.strokeDashoffset = (163.3*(1-frac)).toFixed(1);

  let badge='🌊', title, sub;
  if (active){
    badge='🎣';
    title="C'est le moment de pêcher !";
    sub=`Fenêtre jusqu'à ${fmtTime(active.end)} · coefficient ${coef}`;
  } else if (next){
    badge = rising?'📈':'📉';
    title = rising ? 'Marée montante' : 'Marée descendante';
    sub = `Prochaine fenêtre ${fmtTime(next.start)} – ${fmtTime(next.end)} · coef ${coef}`;
  } else {
    badge = rising?'📈':'📉';
    title = rising ? 'Marée montante' : 'Marée descendante';
    sub = ext ? `Prochaine ${ext.type==='PM'?'pleine':'basse'} mer à ${fmtTime(ext.time)} (${ext.height.toFixed(1)} m)` : '';
  }
  $('nowBadge').textContent = badge;
  $('nowTitle').textContent = title;
  $('nowSub').textContent = sub;
  $('nowCard').className = 'now-card '+(active?'st-good':(coef>=70?'st-mid':'st-bad'));
}

/* ---- tide curve canvas ---- */
function drawCurve(date){
  const cv = $('tideCurve');
  const ctx = cv.getContext('2d');
  const dpr = window.devicePixelRatio||1;
  const W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W*dpr; cv.height = H*dpr; ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,W,H);

  const d0 = dayStart(date), d1 = dayEnd(d0);
  const dayMs = d1 - d0;                  // 23h/25h on DST change days
  const N = 96;
  const pts = [];
  let mn=Infinity, mx=-Infinity;
  for (let i=0;i<=N;i++){
    const t = new Date(d0.getTime()+ i/N*dayMs);
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
    const a=(w.start-d0)/dayMs*W, b=(w.end-d0)/dayMs*W;
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
  const ext = findExtrema(d0,d1);
  for(const e of ext){
    const x=(e.time-d0)/dayMs*W, y=Y(e.height);
    ctx.beginPath(); ctx.arc(x,y,4.5,0,7);
    ctx.fillStyle = e.type==='PM' ? '#12557a' : '#e1503f'; ctx.fill();
    ctx.fillStyle='#0b2239'; ctx.font='10px system-ui';
    ctx.textAlign='center';
    ctx.fillText(fmtTime(e.time), x, e.type==='PM'? y-8 : y+16);
  }

  // "now" line if today
  const now=new Date();
  if (now>=d0 && now<d1){
    const x=(now-d0)/dayMs*W;
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
  const tomorrow = dayEnd(dayStart(today));

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
