// Sanity-check the fishing-window logic for today & tomorrow.
// Run with: bun tools/check_windows.js
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
function astroLongitudes(d){const D=(d.getTime()-Date.UTC(2000,0,1,12,0,0))/86400000;
  return {theta:280.4606+360.9856474*D,s:218.3164+13.1763964*D,h:280.4665+0.9856473*D,p:83.3532+0.1114040*D,N:125.0445-0.0529538*D};}
const EQ_SD=[['M2',0.9081,2,0,0,0],['S2',0.4229,2,2,-2,0],['N2',0.1739,2,-1,0,1],['K2',0.1151,2,2,0,0]];
function equilibriumSemidiurnal(d){const{theta,s,h,p,N}=astroLongitudes(d);const tau=theta-s,Nr=N*Math.PI/180;let out=0;
  for(const[name,A,nt,ns,nh,np]of EQ_SD){const[f,u]=nodal(name,Nr);const arg=nt*tau+ns*s+nh*h+np*p;
    out+=A*f*Math.cos(arg*Math.PI/180+u*Math.PI/180);}return out;}
function eqExtrema(start,end){const res=[],step=120000;let p2=equilibriumSemidiurnal(new Date(start.getTime()-step)),p=equilibriumSemidiurnal(start);
  for(let t=start.getTime()+step;t<=end.getTime();t+=step){const h=equilibriumSemidiurnal(new Date(t));
    if((p>p2&&p>h)||(p<p2&&p<h)){const den=(p2-2*p+h),off=den!==0?0.5*(p2-h)/den:0;
      res.push({time:new Date((t-step)+off*step),height:p-0.25*(p2-h)*off,type:p>p2?'PM':'BM'});}p2=p;p=h;}return res;}
const COEF_FIT=[27.12475,20.87822,4.42550,14.66581,2.34530,-2.03796,3.08163,3.77883];
function tideCoefficient(pmTime,range){const{s,h,p}=astroLongitudes(pmTime);const D=(2*(s-h))*Math.PI/180,A=(s-p)*Math.PI/180;
  const[a,b,c,d,e,f,g,hh]=COEF_FIT;
  return Math.round(a+b*range+c*Math.cos(D)+d*Math.sin(D)+e*Math.cos(2*D)+f*Math.sin(2*D)+g*Math.cos(A)+hh*Math.sin(A));}
function coefficients(date){const d0=new Date(date);d0.setHours(0,0,0,0);
  const ext=eqExtrema(new Date(d0.getTime()-3*3600*1000),new Date(d0.getTime()+27*3600*1000));const out=[];
  for(let i=0;i<ext.length;i++){const e=ext[i];if(e.type!=='PM')continue;
    if(e.time<d0||e.time>=new Date(d0.getTime()+86400000))continue;
    const lows=[ext[i-1],ext[i+1]].filter(x=>x&&x.type==='BM').map(x=>x.height);if(!lows.length)continue;
    out.push({time:e.time,coef:tideCoefficient(e.time,e.height-Math.min(...lows))});}return out;}
function lunarNode(d){const x=(d.getTime()-Date.UTC(2000,0,1,12,0,0))/86400000;return((125.0445-0.0529538*x)%360)*Math.PI/180;}
function nodal(n,N){const s=Math.sin(N),c=Math.cos(N),s2=Math.sin(2*N),c2=Math.cos(2*N);
  switch(n){case 'M2':return[1.0004-0.0373*c+0.0002*c2,-2.14*s];case 'S2':return[1,0];
  case 'N2':return[1.0004-0.0373*c+0.0002*c2,-2.14*s];case 'K2':return[1.0241+0.2863*c+0.0083*c2,-17.74*s+0.68*s2];
  case 'K1':return[1.0060+0.1150*c-0.0088*c2,8.86*s-0.07*s2];case 'O1':return[1.0089+0.1871*c-0.0147*c2,10.80*s-1.34*s2+0.19*Math.sin(3*N)];
  case 'M4':case 'MS4':const f=nodal('M2',N)[0];return[f*f,0];
  case 'M6':const f6=nodal('M2',N)[0];return[f6*f6*f6,0];default:return[1,0];}}
function heightAt(d){const th=(d.getTime()-TIDE.t0)/3600000;const N=lunarNode(d);let h=TIDE.Z0;
  for(const c of TIDE.harmonics){const[f,u]=nodal(c.name,N);h+=c.A*f*Math.cos(2*Math.PI/c.period*th-c.phi+u*Math.PI/180);}return h;}
function findExtrema(s,e){const r=[];const st=300000;let p2=heightAt(new Date(s.getTime()-st)),p=heightAt(s);
  for(let t=s.getTime()+st;t<=e.getTime();t+=st){const h=heightAt(new Date(t));
    if((p>p2&&p>h)||(p<p2&&p<h)){const den=(p2-2*p+h);const off=den!==0?0.5*(p2-h)/den:0;
      r.push({time:new Date((t-st)+off*st),height:p-0.25*(p2-h)*off,type:p>p2?'PM':'BM'});}p2=p;p=h;}return r;}
function coefficient(d){const cs=coefficients(d);return cs.length?Math.max(...cs.map(c=>c.coef)):0;}
function windows(d){const d0=new Date(d);d0.setHours(0,0,0,0);const d1=new Date(d0.getTime()+86400000);
  const ext=findExtrema(new Date(d0.getTime()-21600000),new Date(d1.getTime()+21600000));
  const coef=coefficient(d);
  const wins=ext.filter(e=>e.type==='BM').map(low=>{
    const start=new Date(low.time.getTime()-7200000),end=new Date(low.time.getTime()+3600000);
    const hr=low.time.getHours()+low.time.getMinutes()/60;const dl=(hr>=8&&hr<=20)?1:0.4;
    return{low,start,end,score:Math.round(coef*dl),daylight:dl===1};});
  return{windows:wins.filter(w=>w.low.time>=d0&&w.low.time<d1).sort((a,b)=>b.score-a.score),coef};}
const fmt=d=>d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
for(const off of [0,1]){
  const d=new Date(Date.UTC(2026,7,27+off,12,0));
  const{windows:ws,coef}=windows(d);
  console.log(`\n=== ${off===0?"Aujourd'hui (27 août)":"Demain (28 août)"} — coef ${coef} ===`);
  ws.forEach((w,i)=>console.log(`  ${i===0?'BEST':'    '} ${fmt(w.start)}–${fmt(w.end)}  (BM ${fmt(w.low.time)}, ${w.low.height.toFixed(1)}m) score=${w.score} ${w.daylight?'☀️':'🌙'}`));
}
