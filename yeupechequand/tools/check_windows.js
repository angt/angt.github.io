// Sanity-check the fishing-window logic for today & tomorrow.
const TIDE = {
  Z0: 2.991, t0: Date.parse('2026-08-05T01:23:00Z'),
  harmonics: [
    { name:'M2', A:1.0063, phi:-2.4078, period:12.4206012 },
    { name:'S2', A:0.4730, phi: 1.9582, period:12.0       },
    { name:'N2', A:0.1912, phi:-2.7569, period:12.65834751},
    { name:'K2', A:0.1324, phi: 1.9582, period:11.96723606},
  ],
};
function lunarNode(d){const x=(d.getTime()-Date.UTC(2000,0,1,12,0,0))/86400000;return((125.0445-0.0529538*x)%360)*Math.PI/180;}
function nodal(n,N){const s=Math.sin(N),c=Math.cos(N),s2=Math.sin(2*N),c2=Math.cos(2*N);
  switch(n){case 'M2':return[1.0004-0.0373*c+0.0002*c2,-2.14*s];case 'S2':return[1,0];
  case 'N2':return[1.0004-0.0373*c+0.0002*c2,-2.14*s];case 'K2':return[1.0241+0.2863*c+0.0083*c2,-17.74*s+0.68*s2];default:return[1,0];}}
function heightAt(d){const th=(d.getTime()-TIDE.t0)/3600000;const N=lunarNode(d);let h=TIDE.Z0;
  for(const c of TIDE.harmonics){const[f,u]=nodal(c.name,N);h+=c.A*f*Math.cos(2*Math.PI/c.period*th-c.phi+u*Math.PI/180);}return h;}
function findExtrema(s,e){const r=[];const st=300000;let p2=heightAt(new Date(s.getTime()-st)),p=heightAt(s);
  for(let t=s.getTime()+st;t<=e.getTime();t+=st){const h=heightAt(new Date(t));
    if((p>p2&&p>h)||(p<p2&&p<h))r.push({time:new Date(t-st),height:p,type:p>p2?'PM':'BM'});p2=p;p=h;}return r;}
function coefficient(d){const d0=new Date(d);d0.setHours(0,0,0,0);let mn=1/0,mx=-1/0;
  for(let m=0;m<1440;m+=30){const h=heightAt(new Date(d0.getTime()+m*60000));if(h<mn)mn=h;if(h>mx)mx=h;}
  return Math.round((mx-mn)/3.05*100);}
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
  const d=new Date(Date.UTC(2026,7,5+off,12,0));
  const{windows:ws,coef}=windows(d);
  console.log(`\n=== ${off===0?"Aujourd'hui (5 août)":"Demain (6 août)"} — coef ${coef} ===`);
  ws.forEach((w,i)=>console.log(`  ${i===0?'BEST':'    '} ${fmt(w.start)}–${fmt(w.end)}  (BM ${fmt(w.low.time)}, ${w.low.height.toFixed(1)}m) score=${w.score} ${w.daylight?'☀️':'🌙'}`));
}
