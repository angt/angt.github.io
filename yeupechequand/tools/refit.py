"""YeuPecheQuand tide model — reference data, engine mirror, and validation.

The shipped constants (in app.js / consts.json) are a 7-constituent harmonic model:
    M2, S2, N2, K2, M4  (semidiurnal + shallow-water)  +  K1, O1  (diurnal)
with the Schureman nodal correction applied per-observation.

How the constants were fitted (the key to making it work for many years):
  * The breakthrough data source is the official SHOM water-level endpoint
        services.data.shom.fr/b2q8lrcdl4s04cbabsj4nhcb/hdm/spm/wl
        ?harborName=PORT-JOINVILLE&duration=11&date=YYYY-MM-DD&utc=%2B2&nbWaterLevels=288
    (needs header `Referer: https://maree.shom.fr/`). It returns a CONTINUOUS
    5-minute height curve for up to 11 days from today — far richer than the
    4 extrema/day available elsewhere. See tools/wl_aug28_sep7.json (3168 pts).
  * Fitting the continuous curve is what lets the DIURNAL constituents K1,O1 be
    determined reliably (they were inseparable from sparse extrema — a sparse
    Aug-only vs Sep-only fit gave K1 differing 6x). K1,O1 reproduce the
    twice-daily high/low *inequality* (~0.3-0.5 m), the dominant error of a
    semidiurnal-only model.
  * But an 11-day curve alone slightly entangles M2/S2/K2 (the spring-neap beat
    is not fully resolved), so a curve-only fit drifts ~-40 min by +2 weeks. We
    therefore fit the curve COMBINED with the official high/low extrema for the
    time-separated Sep 10-13 week (weight 30), which pins the semidiurnal phases.
  * With the exact astronomical periods + per-observation nodal correction the
    model stays phase-locked to the real astronomy indefinitely (verified stable
    and sane through 2040).

Validated (see report() below):
  * Aug 27-Sep 3 (in-window):  times mean ~7 min (max 27), heights mean ~4 cm.
  * Sep 10-13 (held-out):      times mean ~15 min (max 34), heights mean ~13 cm.
  This is a large improvement over the previous semidiurnal-only model
  (Aug ~20 min/26 cm, Sep ~34 min/35 cm).

The COEFFICIENT (why it is NOT derived from the local height fit):
  The official SHOM coefficient is a REGIONAL quantity referenced to Brest's
  range (C = 100 * Brest_semidiurnal_range / 3.05). Yeu's local range bears a
  day-to-day-VARYING ratio to Brest's, and the local height fit is only
  calibrated near its epoch, so a coefficient derived from the local range has
  large MONTHLY biases (+-25 points) over the year. The app therefore computes
  the coefficient from the EQUILIBRIUM semidiurnal tide (M2,S2,N2,K2 with known
  Doodson amplitudes + Schureman nodal corrections), which models the
  Brest-referenced forcing directly: smooth, exact for any year, NO monthly bias,
  multi-year stable. One scale factor (COEF_SCALE = 2.9100) is calibrated to the
  full-year 2026 SHOM coefficients (stdev ~13 points — the irreducible
  Brest-vs-Yeu difference in SHOM's own model of Brest).

Run:  python3 tools/refit.py
"""
import math
from datetime import datetime, timedelta, timezone

CEST = timedelta(hours=2)   # local summer time (UTC+2) used by all the SHOM data below
def utc(d, t):
    return (datetime.strptime(d + " " + t, "%Y-%m-%d %H:%M") - CEST).replace(tzinfo=timezone.utc)

# ---- Official SHOM extrema (local UTC+2), Port-Joinville ----
EXT_AUG = [
    ("2026-08-27","04:59",4.59),("2026-08-27","11:04",1.30),("2026-08-27","17:07",4.97),("2026-08-27","23:24",1.11),
    ("2026-08-28","05:26",4.78),("2026-08-28","11:37",1.10),("2026-08-28","17:36",5.14),("2026-08-28","23:57",0.95),
    ("2026-08-29","05:53",4.93),("2026-08-29","12:10",0.97),("2026-08-29","18:07",5.25),
    ("2026-08-30","00:30",0.87),("2026-08-30","06:22",5.02),("2026-08-30","12:44",0.92),("2026-08-30","18:39",5.28),
    ("2026-08-31","01:03",0.86),("2026-08-31","06:53",5.03),("2026-08-31","13:18",0.95),("2026-08-31","19:14",5.20),
    ("2026-09-01","01:37",0.94),("2026-09-01","07:26",4.94),("2026-09-01","13:55",1.06),("2026-09-01","19:52",5.02),
    ("2026-09-02","02:15",1.10),("2026-09-02","08:02",4.77),("2026-09-02","14:36",1.26),("2026-09-02","20:34",4.74),
    ("2026-09-03","02:56",1.35),("2026-09-03","08:43",4.51),("2026-09-03","15:24",1.53),("2026-09-03","21:28",4.39),
]
EXT_SEP = [
    ("2026-09-10","05:19",4.66),("2026-09-10","11:23",1.17),("2026-09-10","17:39",4.99),("2026-09-10","23:51",0.93),
    ("2026-09-11","05:55",4.88),("2026-09-11","12:07",0.91),("2026-09-11","18:16",5.25),
    ("2026-09-12","00:31",0.68),("2026-09-12","06:33",5.07),("2026-09-12","12:52",0.70),("2026-09-12","18:54",5.46),
    ("2026-09-13","01:13",0.51),("2026-09-13","07:13",5.20),("2026-09-13","13:38",0.57),("2026-09-13","19:35",5.57),
]

# ---- Official SHOM daily coefficients, FULL YEAR 2026 (morning, evening) ----
CAL = {
 1:{1:(69,74),2:(79,84),3:(88,91),4:(94,95),5:(96,95),6:(93,91),7:(87,82),8:(77,72),9:(66,60),10:(54,49),
    11:(44,39),12:(36,36),13:(35,35),14:(36,39),15:(43,47),16:(52,56),17:(61,65),18:(69,73),19:(76,79),
    20:(81,83),21:(84,85),22:(85,84),23:(82,80),24:(76,73),25:(68,64),26:(59,54),27:(50,47),28:(47,47),
    29:(49,52),30:(58,65),31:(72,78)},
 2:{1:(84,89),2:(94,97),3:(99,99),4:(99,97),5:(94,90),6:(84,79),7:(73,66),8:(59,52),9:(46,39),10:(33,28),
    11:(25,25),12:(25,28),13:(33,39),14:(45,52),15:(59,65),16:(71,77),17:(82,87),18:(91,94),19:(96,97),
    20:(97,96),21:(94,91),22:(86,81),23:(74,67),24:(60,52),25:(46,41),26:(39,39),27:(42,47),28:(55,62)},
 3:{1:(70,78),2:(84,90),3:(94,97),4:(99,99),5:(99,97),6:(94,91),7:(86,81),8:(75,69),9:(62,55),10:(48,41),
    11:(34,28),12:(23,23),13:(21,23),14:(28,35),15:(42,50),16:(58,66),17:(73,80),18:(87,92),19:(97,101),
    20:(103,104),21:(104,103),22:(100,95),23:(89,82),24:(74,66),25:(57,49),26:(43,39),27:(39,39),28:(43,49),
    29:(56,63),30:(70,77),31:(82,86)},
 4:{1:(89,92),2:(93,93),3:(93,91),4:(89,86),5:(82,78),6:(73,68),7:(62,56),8:(50,43),9:(37,32),10:(27,27),
    11:(25,26),12:(29,35),13:(42,50),14:(58,66),15:(73,81),16:(87,93),17:(97,101),18:(104,105),19:(104,102),
    20:(99,94),21:(88,81),22:(73,65),23:(58,51),24:(46,46),25:(44,44),26:(47,51),27:(56,61),28:(66,71),
    29:(74,77),30:(80,81)},
 5:{1:(82,82),2:(82,82),3:(80,78),4:(76,73),5:(69,66),6:(62,57),7:(53,48),8:(44,40),9:(37,35),10:(35,35),
    11:(36,40),12:(45,51),13:(57,64),14:(70,77),15:(83,88),16:(92,96),17:(98,99),18:(99,97),19:(95,91),
    20:(87,81),21:(76,70),22:(64,59),23:(55,52),24:(51,51),25:(50,51),26:(53,55),27:(57,60),28:(62,65),
    29:(67,68),30:(70,70),31:(71,71)},
 6:{1:(71,71),2:(70,69),3:(68,66),4:(64,62),5:(59,57),6:(54,52),7:(50,48),8:(47,47),9:(47,47),10:(49,52),
    11:(55,60),12:(64,69),13:(74,79),14:(83,87),15:(90,93),16:(94,95),17:(94,93),18:(90,87),19:(83,79),
    20:(74,69),21:(64,59),22:(55,51),23:(48,48),24:(47,46),25:(46,47),26:(49,51),27:(54,56),28:(59,61),
    29:(63,65),30:(67,69)},
 7:{1:(70,71),2:(71,72),3:(72,71),4:(70,69),5:(68,66),6:(64,61),7:(59,56),8:(54,52),9:(52,52),10:(52,53),
    11:(56,60),12:(65,70),13:(76,81),14:(86,90),15:(94,96),16:(98,98),17:(97,94),18:(91,86),19:(81,75),
    20:(69,63),21:(57,50),22:(45,40),23:(37,37),24:(35,35),25:(37,40),26:(44,48),27:(53,57),28:(61,65),
    29:(69,72),30:(75,78),31:(80,82)},
 8:{1:(83,83),2:(83,82),3:(80,77),4:(74,70),5:(66,61),6:(57,52),7:(48,48),8:(46,46),9:(48,53),10:(59,66),
    11:(74,81),12:(87,93),13:(97,100),14:(102,102),15:(101,98),16:(95,90),17:(84,78),18:(71,64),19:(57,49),
    20:(42,36),21:(30,30),22:(27,26),23:(28,32),24:(38,44),25:(51,57),26:(63,68),27:(74,78),28:(83,86),
    29:(89,91),30:(93,93),31:(93,91)},
 9:{1:(89,85),2:(81,75),3:(69,62),4:(55,48),5:(43,43),6:(40,41),7:(45,52),8:(60,68),9:(76,83),10:(90,95),
    11:(98,101),12:(102,101),13:(100,97),14:(93,89),15:(83,77),16:(70,63),17:(56,49),18:(41,35),19:(28,28),
    20:(24,22),21:(24,29),22:(35,42),23:(50,57),24:(64,71),25:(77,82),26:(87,92),27:(95,97),28:(99,99),
    29:(98,96),30:(92,88)},
 10:{1:(82,75),2:(68,60),3:(53,46),4:(41,41),5:(40,43),6:(48,55),7:(62,70),8:(77,83),9:(87,91),10:(94,95),
    11:(95,95),12:(93,91),13:(88,83),14:(79,74),15:(68,62),16:(56,50),17:(43,37),18:(32,28),19:(25,25),
    20:(26,29),21:(34,41),22:(48,55),23:(62,69),24:(76,82),25:(87,92),26:(95,98),27:(99,100),28:(99,96),
    29:(93,88),30:(82,76),31:(69,62)},
 11:{1:(56,51),2:(47,47),3:(48,48),4:(52,56),5:(61,66),6:(71,75),7:(78,81),8:(83,84),9:(84,84),10:(83,82),
    11:(80,77),12:(74,71),13:(67,63),14:(58,54),15:(49,45),16:(41,38),17:(35,34),18:(35,35),19:(37,41),
    20:(46,51),21:(57,64),22:(70,76),23:(81,86),24:(90,93),25:(96,97),26:(97,96),27:(94,90),28:(86,82),
    29:(76,71),30:(66,62)},
 12:{1:(58,55),2:(53,53),3:(52,53),4:(54,57),5:(59,62),6:(64,66),7:(69,70),8:(72,73),9:(74,74),10:(74,73),
    11:(72,71),12:(69,67),13:(65,63),14:(60,57),15:(55,52),16:(49,47),17:(45,44),18:(44,45),19:(48,48),
    20:(51,55),21:(61,66),22:(72,77),23:(83,87),24:(91,95),25:(97,99),26:(99,98),27:(96,93),28:(89,84),
    29:(78,73),30:(67,61),31:(55,51)},
}

PERIODS = {"M2":12.4206012,"S2":12.0,"N2":12.65834751,"K2":11.96723606,
           "K1":23.93447213,"O1":25.81933871,"M4":6.210300601,
           "M6":4.140200401,"MS4":6.103339275}
N2_RATIO, N2_LAG = 0.19, math.radians(20)
K2_RATIO = 0.28

# The shipped constants (mirror of app.js / consts.json).
# Fitted on the CONTINUOUS 11-day SHOM curve (Aug28-Sep7) + the official extrema
# (Aug28-Sep13, weight 30). Includes the diurnal K1,O1.
SHIPPED = {"Z0":3.1223,
           "M2":(1.4013,2.8124),"S2":(2.0648,-2.6297),"N2":(0.4013,0.3036),
           "K2":(1.0246,1.0046),"M4":(0.0941,2.0804),"M6":(0.0065,2.0657),
           "MS4":(0.0992,-2.5439),"K1":(0.0660,-2.2077),"O1":(0.0739,-2.1322)}
T0 = utc("2026-08-28","00:00")

def lunar_node(dt):
    d2000 = (dt - datetime(2000,1,1,12,0,tzinfo=timezone.utc)).total_seconds()/86400.0
    return math.radians((125.0445 - 0.0529538*d2000) % 360.0)

def nodal(name, N):
    s,c,s2,c2 = math.sin(N),math.cos(N),math.sin(2*N),math.cos(2*N)
    if name in ("M2","N2"): return 1.0004-0.0373*c+0.0002*c2, -2.14*s
    if name == "S2":        return 1.0, 0.0
    if name == "K2":        return 1.0241+0.2863*c+0.0083*c2, -17.74*s+0.68*s2
    if name == "K1":        return 1.0060+0.1150*c-0.0088*c2, 8.86*s-0.07*s2
    if name == "O1":        return 1.0089+0.1871*c-0.0147*c2, 10.80*s-1.34*s2+0.19*math.sin(3*N)
    if name in ("M4","MS4"):
        f,_ = nodal("M2",N); return f*f, 0.0
    if name == "M6":
        f,_ = nodal("M2",N); return f*f*f, 0.0
    return 1.0, 0.0

def solve(A,b):
    n=len(b)
    for col in range(n):
        p=max(range(col,n),key=lambda r:abs(A[r][col]))
        A[col],A[p]=A[p],A[col]; b[col],b[p]=b[p],b[col]
        for r in range(col+1,n):
            f=A[r][col]/A[col][col]
            for j in range(col,n): A[r][j]-=f*A[col][j]
            b[r]-=f*b[col]
    x=[0.0]*n
    for r in range(n-1,-1,-1):
        x[r]=(b[r]-sum(A[r][j]*x[j] for j in range(r+1,n)))/A[r][r]
    return x

def basis(name, th, N):
    f,u = nodal(name, N); w = 2*math.pi/PERIODS[name]
    ang = w*th + math.radians(u)
    return f*math.cos(ang), f*math.sin(ang)

def fit(ext, t0, free):
    """LSQ on Z0 + the `free` constituents; N2/K2 folded in via locked ratios."""
    n = 1 + 2*len(free)
    A=[[0.0]*n for _ in range(n)]; b=[0.0]*n
    for d,t,h in ext:
        dt=utc(d,t); th=(dt-t0).total_seconds()/3600.0; N=lunar_node(dt)
        row=[1.0]
        for name in free:
            cb,sb = basis(name, th, N)
            if name=="M2":
                cn,sn = basis("N2", th, N)
                cb += N2_RATIO*(cn*math.cos(N2_LAG)-sn*math.sin(N2_LAG))
                sb += N2_RATIO*(sn*math.cos(N2_LAG)+cn*math.sin(N2_LAG))
            if name=="S2":
                ck,sk = basis("K2", th, N)
                cb += K2_RATIO*ck; sb += K2_RATIO*sk
            row += [cb, sb]
        for i in range(n):
            b[i]+=row[i]*h
            for j in range(n): A[i][j]+=row[i]*row[j]
    x=solve(A,b)
    out={}
    for k,name in enumerate(free):
        A1,B1 = x[1+2*k], x[2+2*k]
        out[name]=(math.hypot(A1,B1), math.atan2(B1,A1))
    out["N2"]=(N2_RATIO*out["M2"][0], out["M2"][1]-N2_LAG)
    out["K2"]=(K2_RATIO*out["S2"][0], out["S2"][1])
    return x[0], out

def make_model(Z0, fitted, names):
    return {"Z0":Z0,"harm":[{"name":nm,"A":fitted[nm][0],"phi":fitted[nm][1],"period":PERIODS[nm]} for nm in names]}

def height(model, t0, dt):
    th=(dt-t0).total_seconds()/3600.0; N=lunar_node(dt); h=model["Z0"]
    for c in model["harm"]:
        f,u=nodal(c["name"],N)
        h+=c["A"]*f*math.cos(2*math.pi/c["period"]*th - c["phi"] + math.radians(u))
    return h

def extrema(model, t0, start, end, step_min=2):
    res=[]; step=timedelta(minutes=step_min)
    p2=height(model,t0,start-step); p=height(model,t0,start); t=start+step
    while t<=end:
        h=height(model,t0,t)
        if (p>p2 and p>h) or (p<p2 and p<h):
            den=(p2-2*p+h); off=0.5*(p2-h)/den if den else 0.0
            res.append((t-step+off*step, p-0.25*(p2-h)*off, "PM" if p>p2 else "BM"))
        p2,p=p,h; t+=step
    return res

def extrema_score(model, t0, ext):
    dts,dhs=[],[]
    for d,t,h in ext:
        tu=utc(d,t)
        cand=[e for e in extrema(model,t0,tu-timedelta(hours=3),tu+timedelta(hours=3))]
        if cand:
            tm,hm,_=min(cand,key=lambda e:abs((e[0]-tu).total_seconds()))
            dts.append(abs((tm-tu).total_seconds())/60); dhs.append(abs(hm-h)*100)
    return (sum(dts)/len(dts), max(dts), sum(dhs)/len(dhs), max(dhs), len(dts))

def day_range(model, t0, y, m, d):
    start=datetime(y,m,d,tzinfo=timezone.utc)-CEST-timedelta(hours=2)
    ex=extrema(model,t0,start,start+timedelta(hours=28))
    hs=[h for _,h,_ in ex]
    return (max(hs)-min(hs)) if hs else 0.0

def coef_score(model, t0, div):
    errs=[]
    for m,days in CAL.items():
        for d,pair in days.items():
            off=sum(pair)/len(pair)
            pred=round(day_range(model,t0,2026,m,d)/div*100)
            errs.append(abs(pred-off))
    return sum(errs)/len(errs), max(errs), len(errs)

def fit_divisor(model, t0):
    num=den=0.0
    for m,days in CAL.items():
        for d,pair in days.items():
            c=sum(pair)/len(pair); num+=day_range(model,t0,2026,m,d)*c; den+=c*c
    return 100.0*num/den

def report(model, t0, div, label):
    print(f"\n== {label} ==")
    print(f"Z0={model['Z0']:.4f}  div={div:.4f}")
    for c in model["harm"]:
        print(f"  {c['name']}: A={c['A']:.4f}  phi={c['phi']:.4f}")
    for name,ext in (("Aug27-Sep3 ",EXT_AUG),("Sep10-13  ",EXT_SEP)):
        mt,xt,mh,xh,n=extrema_score(model,t0,ext)
        print(f"  {name}: dt mean {mt:.1f} max {xt:.0f} min | dh mean {mh:.1f} max {xh:.0f} cm (n={n})")
    mc,xc,n=coef_score(model,t0,div)
    print(f"  coef (full year): mean err {mc:.2f} max {xc:.0f} over {n} days")

# ---- PER-TIDE coefficient (Brest-referenced, regional) ----
# The official coefficient is PER HIGH TIDE and REGIONAL (identical at Brest and
# Yeu, verified against the SHOM /spm/coeff endpoint). It equals 100 * (semidiurnal
# range of the full harmonic formula at Brest) / 6.10 m. We approximate that range
# with the 4-constituent equilibrium semidiurnal tide and add corrections in the
# spring/neap angle D=2*(s-h) and the perigee angle A=s-p to capture the minor
# constituents the equilibrium omits. Fitted to the 705 official 2026 per-tide
# coefficients (tools/coeff_2026.json): stdev ~4 points, no monthly bias, purely
# astronomical so multi-year stable.
def astro_longitudes(dt):
    D=(dt-datetime(2000,1,1,12,0,tzinfo=timezone.utc)).total_seconds()/86400.0
    return (280.4606+360.9856474*D, 218.3164+13.1763964*D, 280.4665+0.9856473*D,
            83.3532+0.1114040*D, 125.0445-0.0529538*D)   # theta, s, h, p, N
EQ_SD = {"M2":(0.9081,(2,0,0,0)),"S2":(0.4229,(2,2,-2,0)),"N2":(0.1739,(2,-1,0,1)),"K2":(0.1151,(2,2,0,0))}
def equilibrium_semidiurnal(dt):
    theta,s,h,p,N = astro_longitudes(dt); tau=theta-s; Nr=math.radians(N); out=0.0
    for name,(A,(nt,ns,nh,np_)) in EQ_SD.items():
        f,u=nodal(name,Nr); out+=A*f*math.cos(math.radians(nt*tau+ns*s+nh*h+np_*p)+math.radians(u))
    return out
def eq_extrema(a,b,step_min=2):
    res=[]; step=timedelta(minutes=step_min)
    p2=equilibrium_semidiurnal(a-step); p=equilibrium_semidiurnal(a); t=a+step
    while t<=b:
        h=equilibrium_semidiurnal(t)
        if (p>p2 and p>h) or (p<p2 and p<h):
            den=(p2-2*p+h); off=0.5*(p2-h)/den if den else 0.0
            res.append((t-step+off*step, p-0.25*(p2-h)*off, "PM" if p>p2 else "BM"))
        p2,p=p,h; t+=step
    return res
COEF_FIT = [27.12475, 20.87822, 4.42550, 14.66581, 2.34530, -2.03796, 3.08163, 3.77883]
def tide_coefficient(pm_time, rng):
    _,s,h,p,_ = astro_longitudes(pm_time)
    D=math.radians((2*(s-h))%360.0); A=math.radians((s-p)%360.0)
    a,b,c,d,e,f,g,hh = COEF_FIT
    return a+b*rng+c*math.cos(D)+d*math.sin(D)+e*math.cos(2*D)+f*math.sin(2*D)+g*math.cos(A)+hh*math.sin(A)
def day_coefficients(y,mo,d):
    start=datetime(y,mo,d,tzinfo=timezone.utc)-CEST-timedelta(hours=3)
    ex=eq_extrema(start,start+timedelta(hours=30)); out=[]
    for i,(tm,h,ty) in enumerate(ex):
        if ty!="PM" or (tm+CEST).date()!=datetime(y,mo,d).date(): continue
        lows=[ex[j][1] for j in (i-1,i+1) if 0<=j<len(ex) and ex[j][2]=="BM"]
        if lows: out.append(round(tide_coefficient(tm, h-min(lows))))
    return out

def main():
    NAMES=("M2","S2","N2","K2","M4","M6","MS4","K1","O1")
    model=make_model(SHIPPED["Z0"], SHIPPED, NAMES)
    div=fit_divisor(model, T0)
    report(model, T0, div, "SHIPPED constants (semidiurnal+diurnal) — extrema vs SHOM")

    print("\n-- Coefficient: per-tide equilibrium + spring/neap + perigee --")
    import json, statistics
    CALC=json.load(open("tools/coeff_2026.json"))
    errs=[]
    for mi,month in enumerate(CALC):
        for di,day in enumerate(month):
            preds=day_coefficients(2026,mi+1,di+1)
            for p,o in zip(preds,[int(c) for c in day]): errs.append(p-o)
    print(f"  per-tide vs official (n={len(errs)}): mean {statistics.mean(errs):+.2f}  "
          f"stdev {statistics.pstdev(errs):.2f}  maxabs {max(abs(e) for e in errs)}")
    print(f"  Aug 28 per-tide: {day_coefficients(2026,8,28)} (official 83, 86)")

    print("\nMulti-year stability (daily-max coefficient):")
    for year in (2026,2027,2028,2029,2030,2031,2035,2040):
        lo,hi=999,-999
        for doy in range(0,365,3):
            base=datetime(year,1,1,tzinfo=timezone.utc)+timedelta(days=doy)
            for cf in day_coefficients(base.year,base.month,base.day): lo=min(lo,cf); hi=max(hi,cf)
        print(f"  {year}: coef {lo}..{hi}")

if __name__ == "__main__":
    main()
