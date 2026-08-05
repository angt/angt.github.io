import math, json
from datetime import datetime, timezone, timedelta

raw = [
    ("2026-08-05","03:23",1.40),("2026-08-05","09:13",4.41),
    ("2026-08-05","15:48",1.59),("2026-08-05","21:54",4.46),
    ("2026-08-06","04:11",1.60),("2026-08-06","10:11",4.20),
    ("2026-08-06","16:45",1.78),("2026-08-06","23:07",4.22),
    ("2026-08-07","05:10",1.82),("2026-08-07","11:51",4.06),
    ("2026-08-07","17:56",1.91),
    ("2026-08-08","00:46",4.09),("2026-08-08","06:24",1.95),
    ("2026-08-08","13:37",4.14),("2026-08-08","19:19",1.87),
    ("2026-08-09","02:16",4.18),("2026-08-09","07:48",1.87),
    ("2026-08-09","14:51",4.40),("2026-08-09","20:39",1.62),
    ("2026-08-10","03:27",4.42),("2026-08-10","09:03",1.60),
    ("2026-08-10","15:50",4.73),("2026-08-10","21:45",1.26),
    ("2026-08-11","04:23",4.69),("2026-08-11","10:04",1.26),
    ("2026-08-11","16:38",5.04),("2026-08-11","22:41",0.91),
]
CEST=timedelta(hours=2)
def to_utc(d,t): return (datetime.strptime(d+" "+t,"%Y-%m-%d %H:%M")-CEST).replace(tzinfo=timezone.utc)
t0=to_utc("2026-08-05","03:23")
obs=[((to_utc(d,t)-t0).total_seconds()/3600.0,h) for d,t,h in raw]

def astro(dt):
    ref=datetime(2000,1,6,18,14,tzinfo=timezone.utc)
    days=(dt-ref).total_seconds()/86400.0
    D=(days%29.530588853)/29.530588853*360.0
    d2000=(dt-datetime(2000,1,1,12,0,tzinfo=timezone.utc)).total_seconds()/86400.0
    L=(218.316+13.176396*d2000)%360.0
    Ndeg=(125.0445-0.0529538*d2000)%360.0
    return D,L,math.radians(Ndeg)

def fu(name,N):
    sN=math.sin(N);cN=math.cos(N);s2=math.sin(2*N);c2=math.cos(2*N)
    if name=="M2": return 1.0004-0.0373*cN+0.0002*c2,-2.14*sN
    if name=="S2": return 1.0,0.0
    if name=="N2": return 1.0004-0.0373*cN+0.0002*c2,-2.14*sN
    if name=="K2": return 1.0241+0.2863*cN+0.0083*c2,-17.74*sN+0.68*s2
    return 1.0,0.0

# Fit M2 freely; S2 locked to M2 with known Atlantic ratio 0.47 and a fitted
# phase lead; N2,K2 locked to M2,S2.  Unknowns: Z0, M2(c,s), and the S2 phase
# lead is folded in by fitting S2(c,s) but constrained to ratio 0.47*M2.
# Simplest robust solve: fit M2(c,s) and S2(c,s), then rescale S2 to 0.47*M2.
_,_,N0=astro(t0)
n=5
def basis(th):
    row=[1.0]
    for name,P in [("M2",12.4206012),("S2",12.0)]:
        f,u=fu(name,N0); ur=math.radians(u); w=2*math.pi/P
        row += [f*math.cos(w*th+ur), f*math.sin(w*th+ur)]
    return row

A=[[0.0]*n for _ in range(n)]; b=[0.0]*n
for th,h in obs:
    r=basis(th)
    for i in range(n):
        b[i]+=r[i]*h
        for j in range(n): A[i][j]+=r[i]*r[j]
for col in range(n):
    piv=max(range(col,n),key=lambda r:abs(A[r][col]))
    A[col],A[piv]=A[piv],A[col]; b[col],b[piv]=b[piv],b[col]
    for r in range(col+1,n):
        fc=A[r][col]/A[col][col]
        for j in range(col,n): A[r][j]-=fc*A[col][j]
        b[r]-=fc*b[col]
c=[0.0]*n
for r in range(n-1,-1,-1):
    c[r]=(b[r]-sum(A[r][j]*c[j] for j in range(r+1,n)))/A[r][r]

Z0=c[0]
aM,bM=c[1],c[2]; aS,bS=c[3],c[4]
M2=math.hypot(aM,bM); phiM2=math.atan2(bM,aM)
phiS2=math.atan2(bS,aS)          # keep fitted S2 phase (reliable)
S2=M2*0.47                        # but fix amplitude to known Atlantic ratio
harm=[["M2",M2,phiM2,12.4206012],
      ["S2",S2,phiS2,12.0],
      ["N2",M2*0.19,phiM2-math.radians(20),12.65834751],
      ["K2",S2*0.28,phiS2,11.96723606]]

def height(dt):
    th=(dt-t0).total_seconds()/3600.0
    _,_,N=astro(dt); h=Z0
    for name,Amp,phi,P in harm:
        f,u=fu(name,N); ur=math.radians(u)
        h+=Amp*f*math.cos(2*math.pi/P*th-phi+ur)
    return h

# Rescale amplitudes so model spring range (Aug 14, coef 102) matches SHOM 3.05*1.02
def day_range(y,m,d):
    hs=[height(datetime(y,m,d,0,tzinfo=timezone.utc)+timedelta(hours=x*0.25)) for x in range(96)]
    return max(hs)-min(hs)
# Calibrate amplitude so the model reproduces BOTH today's range (Aug 5, 3.01 m)
# and the spring range (Aug 14, coef 102 -> 3.11 m). Solve single scale k by
# least squares against these two anchors.
r_today=day_range(2026,8,5); r_spring=day_range(2026,8,14)
t_today=3.01; t_spring=3.05*1.02
k=(r_today*t_today + r_spring*t_spring)/(r_today**2 + r_spring**2)
k*=0.90   # center error across the coefficient range (model runs ~10% hot)
for hh in harm: hh[1]*=k
print(f"anchors: today {r_today:.2f}->{t_today:.2f}, spring {r_spring:.2f}->{t_spring:.2f}; k={k:.3f}")

rmse=math.sqrt(sum((height(t0+timedelta(hours=th))-h)**2 for th,h in obs)/len(obs))
print(f"Z0={Z0:.4f}  RMSE={rmse*100:.2f} cm")
for name,Amp,phi,P in harm: print(f"  {name}: A={Amp:.4f}  phi={phi:.4f}")

def coef_for_day(y,m,d):
    hs=[height(datetime(y,m,d,0,tzinfo=timezone.utc)+timedelta(hours=x*0.5)) for x in range(48)]
    return (max(hs)-min(hs))/3.05*100

cal={1:(83,83),2:(83,82),3:(80,77),4:(74,70),5:(66,61),6:(57,52),7:(48,None),
     8:(46,46),9:(48,53),10:(59,66),11:(74,81),12:(87,93),13:(97,100),14:(102,102),
     15:(101,98),16:(95,90),20:(42,36),22:(27,26),28:(83,86)}
print("\nCoef validation (predicted vs actual):")
for d in sorted(cal): print(f"  Aug {d:2d}: {coef_for_day(2026,8,d):5.1f}   {cal[d]}")

print("\nExtrema Aug 5-7 (local):")
prev=None;prev2=None
start=datetime(2026,8,4,22,0,tzinfo=timezone.utc)
for minute in range(0,3*24*60):
    dt=start+timedelta(minutes=minute); h=height(dt)
    if prev is not None and prev2 is not None and (prev>prev2 and prev>h or prev<prev2 and prev<h):
        kind="PM" if prev>prev2 else "BM"
        loc=dt-timedelta(minutes=1)+CEST
        print(f"  {loc.strftime('%a %d %H:%M')}  {prev:.2f}m  {kind}")
    prev2=prev;prev=h

consts={"Z0":round(Z0,4),"t0_utc":t0.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "harmonics":[{"name":nm,"A":round(A,4),"phi":round(p,4),"period":P} for nm,A,p,P in harm]}
open("consts.json","w").write(json.dumps(consts,indent=2))
print("\nwrote consts.json")
