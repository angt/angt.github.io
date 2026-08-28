// Validate the app.js coefficient implementation against the authoritative
// SHOM per-tide coefficients (tools/coeff_2026.json, 705 values for 2026).
// We import the REAL functions from app.js so we test what ships.
// Run with: bun tools/validate_coef.js
import { readFileSync } from 'fs';

// --- extract the needed functions/consts from app.js by evaluating it ---
const src = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
// app.js ends with DOM init; strip the DOM-dependent tail so it evaluates bare.
const cut = src.indexOf('/* ======================= RENDER');
const core = src.slice(0, cut)
  .replace(/^'use strict';/, '')
  .replace(/const /g, 'var ');   // allow redeclare in eval scope
const api = new Function(core + `
  return { coefficient, coefficients, tideCoefficient, eqExtrema, equilibriumSemidiurnal, astroLongitudes };
`)();
const { coefficients } = api;

const CAL = JSON.parse(readFileSync(new URL('./coeff_2026.json', import.meta.url), 'utf8'));

let errs = [], maxabs = 0, byMonth = {};
for (let mi = 0; mi < 12; mi++){
  for (let di = 0; di < CAL[mi].length; di++){
    const off = CAL[mi][di].map(Number);
    const date = new Date(Date.UTC(2026, mi, di + 1, 12, 0)); // midday local-ish
    const preds = coefficients(date).map(c => c.coef);
    for (let k = 0; k < Math.min(off.length, preds.length); k++){
      const e = preds[k] - off[k];
      errs.push(e); maxabs = Math.max(maxabs, Math.abs(e));
      (byMonth[mi+1] = byMonth[mi+1] || []).push(e);
    }
  }
}
const mean = a => a.reduce((x,y)=>x+y,0)/a.length;
const sd = a => Math.sqrt(mean(a.map(x=>x*x)) - mean(a)**2);
console.log(`app.js per-tide coefficient vs official SHOM (n=${errs.length}):`);
console.log(`  mean ${mean(errs).toFixed(2)}  stdev ${sd(errs).toFixed(2)}  maxabs ${maxabs}`);
console.log('  monthly bias:', Object.keys(byMonth).map(m=>`${m}:${mean(byMonth[m])>=0?'+':''}${mean(byMonth[m]).toFixed(1)}`).join(' '));

// Today (Aug 28) detail
const t = coefficients(new Date(Date.UTC(2026,7,28,12,0)));
console.log('\nAug 28 per-tide coefficients from app.js:', t.map(c=>`${c.time.toISOString().substr(11,5)}Z -> ${c.coef}`).join('  '), ' (official 83, 86)');
