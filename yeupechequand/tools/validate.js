// Validate the app.js tide engine against SHOM data (Aug 5-6 2026).
const TIDE = {
  Z0: 2.991, t0: Date.parse('2026-08-05T01:23:00Z'),
  harmonics: [
    { name:'M2', A:1.0063, phi:-2.4078, period:12.4206012 },
    { name:'S2', A:0.4730, phi: 1.9582, period:12.0       },
    { name:'N2', A:0.1912, phi:-2.7569, period:12.65834751},
    { name:'K2', A:0.1324, phi: 1.9582, period:11.96723606},
  ],
};
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
    if((p>p2&&p>h)||(p<p2&&p<h)) res.push({time:new Date(t-step),height:p,type:p>p2?'PM':'BM'});
    p2=p;p=h;
  }
  return res;
}
// local = UTC+2 (CEST in August)
const loc = d => new Date(d.getTime()+2*3600*1000).toISOString().substr(11,5);
const day = d => new Date(d.getTime()+2*3600*1000).toISOString().substr(8,2);

const start=new Date(Date.UTC(2026,7,4,20,0));
const end=new Date(Date.UTC(2026,7,7,22,0));
const ext=findExtrema(start,end);
console.log('Predicted extrema (local UTC+2):');
for(const e of ext) console.log(`  day ${day(e.time)}  ${loc(e.time)}  ${e.height.toFixed(2)}m  ${e.type}`);

console.log('\nSHOM reference:');
console.log('  Aug 5: BM 03:23 1.40 | PM 09:13 4.41 | BM 15:48 1.59 | PM 21:54 4.46');
console.log('  Aug 6: BM 04:11 1.60 | PM 10:11 4.20 | BM 16:45 1.78 | PM 23:07 4.22');
