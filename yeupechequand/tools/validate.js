// Validate the app.js tide engine against SHOM data (Aug 27 - Sep 13 2026).
// Run with: bun tools/validate.js   (or node/deno)
const TIDE = {
  Z0: 3.1223, t0: Date.parse('2026-08-27T22:00:00Z'),
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
function astroLongitudes(date){
  const D=(date.getTime()-Date.UTC(2000,0,1,12,0,0))/86400000;
  return { theta:280.4606+360.9856474*D, s:218.3164+13.1763964*D, h:280.4665+0.9856473*D,
           p:83.3532+0.1114040*D, N:125.0445-0.0529538*D };
}
const EQ_SD=[['M2',0.9081,2,0,0,0],['S2',0.4229,2,2,-2,0],['N2',0.1739,2,-1,0,1],['K2',0.1151,2,2,0,0]];
function equilibriumSemidiurnal(date){
  const {theta,s,h,p,N}=astroLongitudes(date); const tau=theta-s, Nr=N*Math.PI/180; let out=0;
  for(const [name,A,nt,ns,nh,np] of EQ_SD){
    const [f,u]=nodal(name,Nr); const arg=nt*tau+ns*s+nh*h+np*p;
    out+=A*f*Math.cos(arg*Math.PI/180+u*Math.PI/180);
  }
  return out;
}
function eqExtrema(start,end){
  const res=[],step=2*60*1000;
  let p2=equilibriumSemidiurnal(new Date(start.getTime()-step)),p=equilibriumSemidiurnal(start);
  for(let t=start.getTime()+step;t<=end.getTime();t+=step){
    const h=equilibriumSemidiurnal(new Date(t));
    if((p>p2&&p>h)||(p<p2&&p<h)){
      const den=(p2-2*p+h),off=den!==0?0.5*(p2-h)/den:0;
      res.push({time:new Date((t-step)+off*step),height:p-0.25*(p2-h)*off,type:p>p2?'PM':'BM'});
    }
    p2=p;p=h;
  }
  return res;
}
const COEF_FIT=[27.12475,20.87822,4.42550,14.66581,2.34530,-2.03796,3.08163,3.77883];
function tideCoefficient(pmTime,range){
  const {s,h,p}=astroLongitudes(pmTime);
  const D=(2*(s-h))*Math.PI/180,A=(s-p)*Math.PI/180;
  const [a,b,c,d,e,f,g,hh]=COEF_FIT;
  return Math.round(a+b*range+c*Math.cos(D)+d*Math.sin(D)+e*Math.cos(2*D)+f*Math.sin(2*D)+g*Math.cos(A)+hh*Math.sin(A));
}
function coefficients(date){
  const d0=new Date(date); d0.setHours(0,0,0,0);
  const ext=eqExtrema(new Date(d0.getTime()-3*3600*1000),new Date(d0.getTime()+27*3600*1000));
  const out=[];
  for(let i=0;i<ext.length;i++){
    const e=ext[i];
    if(e.type!=='PM') continue;
    if(e.time<d0||e.time>=new Date(d0.getTime()+24*3600*1000)) continue;
    const lows=[ext[i-1],ext[i+1]].filter(x=>x&&x.type==='BM').map(x=>x.height);
    if(!lows.length) continue;
    out.push({time:e.time,coef:tideCoefficient(e.time,e.height-Math.min(...lows))});
  }
  return out;
}
function coefficient(date){
  const cs=coefficients(date);
  return cs.length?Math.max(...cs.map(c=>c.coef)):0;
}
function lunarNode(date){
  const d2000=(date.getTime()-Date.UTC(2000,0,1,12,0,0))/86400000;
  return ((125.0445-0.0529538*d2000)%360)*Math.PI/180;
}
function nodal(name,N){
  const s=Math.sin(N),c=Math.cos(N),s2=Math.sin(2*N),c2=Math.cos(2*N);
  switch(name){
    case 'M2': return [1.0004-0.0373*c+0.0002*c2,-2.14*s];
    case 'S2': return [1.0,0.0];
    case 'N2': return [1.0004-0.0373*c+0.0002*c2,-2.14*s];
    case 'K2': return [1.0241+0.2863*c+0.0083*c2,-17.74*s+0.68*s2];
    case 'K1': return [1.0060+0.1150*c-0.0088*c2,8.86*s-0.07*s2];
    case 'O1': return [1.0089+0.1871*c-0.0147*c2,10.80*s-1.34*s2+0.19*Math.sin(3*N)];
    case 'M4': case 'MS4': { const f=nodal('M2',N)[0]; return [f*f,0.0]; }
    case 'M6': { const f=nodal('M2',N)[0]; return [f*f*f,0.0]; }
    default: return [1.0,0.0];
  }
}
function heightAt(date){
  const th=(date.getTime()-TIDE.t0)/3600000;
  const N=lunarNode(date); let h=TIDE.Z0;
  for(const c of TIDE.harmonics){
    const [f,u]=nodal(c.name,N);
    h+=c.A*f*Math.cos(2*Math.PI/c.period*th-c.phi+u*Math.PI/180);
  }
  return h;
}
function findExtrema(start,end){
  const res=[]; const step=5*60*1000;
  let p2=heightAt(new Date(start.getTime()-step)), p=heightAt(start);
  for(let t=start.getTime()+step;t<=end.getTime();t+=step){
    const h=heightAt(new Date(t));
    if((p>p2&&p>h)||(p<p2&&p<h)){
      const denom=(p2-2*p+h);
      const off=denom!==0?0.5*(p2-h)/denom:0;
      res.push({time:new Date((t-step)+off*step),height:p-0.25*(p2-h)*off,type:p>p2?'PM':'BM'});
    }
    p2=p;p=h;
  }
  return res;
}
const loc = d => new Date(d.getTime()+2*3600*1000).toISOString().substr(11,5);
function utc(d,t){ return new Date(Date.parse(d+'T'+t+':00Z') - 2*3600*1000); }  // local CEST -> UTC

const SHOM = [
  ['2026-08-27','04:59',4.59],['2026-08-27','11:04',1.30],['2026-08-27','17:07',4.97],['2026-08-27','23:24',1.11],
  ['2026-08-28','05:26',4.78],['2026-08-28','11:37',1.10],['2026-08-28','17:36',5.14],['2026-08-28','23:57',0.95],
  ['2026-08-29','05:53',4.93],['2026-08-29','12:10',0.97],['2026-08-29','18:07',5.25],
  ['2026-08-30','00:30',0.87],['2026-08-30','06:22',5.02],['2026-08-30','12:44',0.92],['2026-08-30','18:39',5.28],
  ['2026-08-31','01:03',0.86],['2026-08-31','06:53',5.03],['2026-08-31','13:18',0.95],['2026-08-31','19:14',5.20],
  ['2026-09-01','01:37',0.94],['2026-09-01','07:26',4.94],['2026-09-01','13:55',1.06],['2026-09-01','19:52',5.02],
  ['2026-09-02','02:15',1.10],['2026-09-02','08:02',4.77],['2026-09-02','14:36',1.26],['2026-09-02','20:34',4.74],
  ['2026-09-03','02:56',1.35],['2026-09-03','08:43',4.51],['2026-09-03','15:24',1.53],['2026-09-03','21:28',4.39],
  ['2026-09-10','05:19',4.66],['2026-09-10','11:23',1.17],['2026-09-10','17:39',4.99],['2026-09-10','23:51',0.93],
  ['2026-09-11','05:55',4.88],['2026-09-11','12:07',0.91],['2026-09-11','18:16',5.25],
  ['2026-09-12','00:31',0.68],['2026-09-12','06:33',5.07],['2026-09-12','12:52',0.70],['2026-09-12','18:54',5.46],
  ['2026-09-13','01:13',0.51],['2026-09-13','07:13',5.20],['2026-09-13','13:38',0.57],['2026-09-13','19:35',5.57],
];

let dts=[],dhs=[];
console.log('Predicted vs SHOM extrema (local UTC+2):');
for(const [d,t,h] of SHOM){
  const tu=utc(d,t);
  const cand=findExtrema(new Date(tu.getTime()-3*3600*1000),new Date(tu.getTime()+3*3600*1000));
  if(!cand.length){ console.log(`  ${d} ${t} ${h} -> NO MATCH`); continue; }
  const e=cand.reduce((a,b)=>Math.abs(a.time-tu)<Math.abs(b.time-tu)?a:b);
  const dt=(e.time-tu)/60000, dh=(e.height-h)*100;
  dts.push(Math.abs(dt)); dhs.push(Math.abs(dh));
  console.log(`  ${d} ${t} ${h.toFixed(2)} -> ${loc(e.time)} ${e.height.toFixed(2)} ${e.type}  dt=${dt>=0?'+':''}${dt.toFixed(0)}m dh=${dh>=0?'+':''}${dh.toFixed(0)}cm`);
}
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
console.log(`\nTimes: mean ${mean(dts).toFixed(1)} min, max ${Math.max(...dts).toFixed(0)} min`);
console.log(`Heights: mean ${mean(dhs).toFixed(1)} cm, max ${Math.max(...dhs).toFixed(0)} cm`);

console.log('\nPer-tide coefficients (predicted morning/evening vs official):');
const CAL={ '2026-08-27':[76,76],'2026-08-28':[83,86],'2026-08-29':[89,91],'2026-08-30':[93,93],'2026-08-31':[93,91],
  '2026-09-01':[89,85],'2026-09-02':[81,75],'2026-09-03':[69,62],'2026-09-10':[90,95],'2026-09-11':[98,101],'2026-09-12':[102,101],'2026-09-13':[100,97] };
for(const d in CAL){
  const preds=coefficients(new Date(d+'T12:00:00Z')).map(c=>c.coef);
  console.log(`  ${d}: [${preds.join(',')}] vs [${CAL[d].join(',')}]`);
}
