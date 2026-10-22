// Validate the REAL app.js tide engine against official SHOM data.
// The engine is loaded straight from ../app.js, so this can never drift
// out of sync with the app.
// Run with: bun tools/validate.js   (or node/deno)
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
globalThis.document = { addEventListener(){}, getElementById(){ return null; } };
const { findExtrema, coefficients, coefficient } =
  new Function(src + '\n;return { heightAt, findExtrema, coefficients, coefficient };')();

// official SHOM high/low tables (maree.info) as [date, time, height, kind, utcOffset]
// Aug 27 - Sep 3 and Oct 22 - 28 2026. Oct 25+ is UTC+1 (DST change on Oct 25).
const SHOM = [
  ['2026-08-27','04:59',4.59,'PM',2],['2026-08-27','11:04',1.30,'BM',2],['2026-08-27','17:07',4.97,'PM',2],['2026-08-27','23:24',1.11,'BM',2],
  ['2026-08-28','05:26',4.78,'PM',2],['2026-08-28','11:37',1.10,'BM',2],['2026-08-28','17:36',5.14,'PM',2],['2026-08-28','23:57',0.95,'BM',2],
  ['2026-08-29','05:53',4.93,'PM',2],['2026-08-29','12:10',0.97,'BM',2],['2026-08-29','18:07',5.25,'PM',2],
  ['2026-08-30','00:30',0.87,'BM',2],['2026-08-30','06:22',5.02,'PM',2],['2026-08-30','12:44',0.92,'BM',2],['2026-08-30','18:39',5.28,'PM',2],
  ['2026-08-31','01:03',0.86,'BM',2],['2026-08-31','06:53',5.03,'PM',2],['2026-08-31','13:18',0.95,'BM',2],['2026-08-31','19:14',5.20,'PM',2],
  ['2026-09-01','01:37',0.94,'BM',2],['2026-09-01','07:26',4.94,'PM',2],['2026-09-01','13:55',1.06,'BM',2],['2026-09-01','19:52',5.02,'PM',2],
  ['2026-09-02','02:15',1.10,'BM',2],['2026-09-02','08:02',4.77,'PM',2],['2026-09-02','14:36',1.26,'BM',2],['2026-09-02','20:34',4.74,'PM',2],
  ['2026-09-03','02:56',1.35,'BM',2],['2026-09-03','08:43',4.51,'PM',2],['2026-09-03','15:24',1.53,'BM',2],['2026-09-03','21:28',4.39,'PM',2],
  ['2026-10-22','02:48',4.25,'PM',2],['2026-10-22','08:34',1.97,'BM',2],['2026-10-22','14:56',4.57,'PM',2],['2026-10-22','21:00',1.69,'BM',2],
  ['2026-10-23','03:22',4.52,'PM',2],['2026-10-23','09:17',1.62,'BM',2],['2026-10-23','15:32',4.84,'PM',2],['2026-10-23','21:38',1.38,'BM',2],
  ['2026-10-24','03:54',4.79,'PM',2],['2026-10-24','09:55',1.31,'BM',2],['2026-10-24','16:07',5.08,'PM',2],['2026-10-24','22:15',1.10,'BM',2],
  ['2026-10-25','03:25',5.02,'PM',1],['2026-10-25','09:34',1.04,'BM',1],['2026-10-25','15:41',5.27,'PM',1],['2026-10-25','21:51',0.89,'BM',1],
  ['2026-10-26','03:59',5.19,'PM',1],['2026-10-26','10:13',0.84,'BM',1],['2026-10-26','16:18',5.37,'PM',1],['2026-10-26','22:29',0.78,'BM',1],
  ['2026-10-27','04:34',5.29,'PM',1],['2026-10-27','10:54',0.75,'BM',1],['2026-10-27','16:57',5.36,'PM',1],['2026-10-27','23:10',0.78,'BM',1],
  ['2026-10-28','05:12',5.27,'PM',1],['2026-10-28','11:37',0.77,'BM',1],['2026-10-28','17:39',5.21,'PM',1],['2026-10-28','23:53',0.90,'BM',1],
];

const utc = (d, t, off) => new Date(Date.parse(d + 'T' + t + ':00Z') - off * 3600e3);
const loc = (d, off) => new Date(d.getTime() + off * 3600e3).toISOString().substr(11, 5);

let dts = [], dhs = [];
console.log('Predicted vs official SHOM extrema:');
for (const [d, t, h, k, off] of SHOM) {
  const tu = utc(d, t, off);
  const cand = findExtrema(new Date(tu.getTime() - 3 * 3600e3), new Date(tu.getTime() + 3 * 3600e3));
  if (!cand.length) { console.log(`  ${d} ${t} ${h} -> NO MATCH`); continue; }
  const e = cand.reduce((a, b) => Math.abs(a.time - tu) < Math.abs(b.time - tu) ? a : b);
  const dt = (e.time - tu) / 60000, dh = (e.height - h) * 100;
  dts.push(Math.abs(dt)); dhs.push(Math.abs(dh));
  console.log(`  ${d} ${t} ${h.toFixed(2)} -> ${loc(e.time, off)} ${e.height.toFixed(2)} ${e.type}  dt=${dt >= 0 ? '+' : ''}${dt.toFixed(0)}m dh=${dh >= 0 ? '+' : ''}${dh.toFixed(0)}cm`);
}
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`\nTimes: mean ${mean(dts).toFixed(1)} min, max ${Math.max(...dts).toFixed(0)} min`);
console.log(`Heights: mean ${mean(dhs).toFixed(1)} cm, max ${Math.max(...dhs).toFixed(0)} cm`);

// official per-tide coefficients (SHOM /spm/coeff + maree.info)
console.log('\nPer-tide coefficients (predicted vs official):');
const CAL = {
  '2026-08-27': [76, 76], '2026-08-28': [83, 86], '2026-08-29': [89, 91], '2026-08-30': [93, 93],
  '2026-08-31': [93, 91], '2026-09-01': [89, 85], '2026-09-02': [81, 75], '2026-09-03': [69, 62],
  '2026-10-22': [48, 55], '2026-10-23': [62, 69], '2026-10-24': [76, 82], '2026-10-25': [87, 92],
  '2026-10-26': [95, 98], '2026-10-27': [99, 100], '2026-10-28': [99, 96],
};
const cerrs = [];
for (const d in CAL) {
  const preds = coefficients(new Date(d + 'T12:00:00Z')).map(c => c && c.coef);
  CAL[d].forEach((o, i) => { if (preds[i] !== undefined && preds[i] !== null) cerrs.push(preds[i] - o); });
  console.log(`  ${d}: [${preds.join(',')}] vs [${CAL[d].join(',')}]`);
}
console.log(`Coefficient error: mean ${mean(cerrs).toFixed(1)}, max ${Math.max(...cerrs.map(Math.abs))} points`);
console.log(`Daily coefficient today (${new Date().toISOString().slice(0, 10)}): ${coefficient(new Date())}`);
