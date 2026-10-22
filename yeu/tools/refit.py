"""YeuPecheQuand tide model — refit, mirror of app.js, and validation.

Run:  python3 tools/refit.py          (needs numpy; run from yeupechequand/)

The shipped model (app.js / consts.json) is Z0 + 27 harmonic constituents:
    semidiurnal   M2 S2 N2 K2 L2 T2 2N2 NU2 MU2 2SM2
    shallow-water M4 MS4 M6 M3 2MS6 2SM6
    diurnal       K1 O1 P1 Q1 J1 OO1
    long-period   MF MM SA SSA MSF
with the Schureman nodal correction applied per-observation and the exact
astronomical periods.

HOW THE CONSTANTS ARE FITTED (and why this one holds):
  * Data: the official SHOM water-level endpoint
        services.data.shom.fr/b2q8lrcdl4s04cbabsj4nhcb/hdm/spm/wl
        ?harborName=PORT-JOINVILLE&duration=11&date=YYYY-MM-DD&utc=%2B2&nbWaterLevels=288
    (header `Referer: https://maree.shom.fr/`). It serves a CONTINUOUS 5-minute
    height curve for any 11-day window, past or present. Eight overlapping
    windows (tools/wl_*.json) cover Jul 20 - Oct 27 2026 continuously
    (28 800 points).
  * Fit: plain least-squares of Z0 + the 27 constituents on the full curve
    (this script rebuilds the shipped constants from the data).
  * The 100-day BASELINE is the whole point. Near-degenerate semidiurnal
    constituents only separate across their beat periods (M2-S2 14.8 d,
    M2-N2 27.5 d, M2-K2 29.6 d). The previous fit used 17 days, could not
    separate them, and while it was superb on its own window it drifted to
    ANTI-PHASE about two months later (~100 min / 1.8 m off on Oct 22-28).
    With 100 days the amplitudes are pinned and the model stays phase-locked.
    (Rolling check: a fit ending Sep 28 still predicts the Oct 22-28 official
    table at 6 min / 7 cm, 25-31 days out.)
  * Long-period terms (SA, SSA, MF, MM, MSF) need the long baseline too: with
    <40 days of data they are wildly determined (SA can blow up); with 100 days
    SA settles at a physical ~21 cm and removes the seasonal mean-level bias.

VALIDATED against the official SHOM high/low tables (maree.info), which are
independent of the fitting curve:
    Aug 27 - Sep 3:  times mean 5 min (max 17), heights mean 3 cm (max 9)
    Oct 22 - 28:     times mean 5 min (max 13), heights mean 2 cm (max 7)
Multi-year sanity: heights bounded and physical through 2040.

THE COEFFICIENT is a separate, per-tide model (see tide_coefficient below):
purely astronomical (equilibrium semidiurnal range + spring/neap and perigee
angles), fitted to all 705 official 2026 per-tide coefficients under the same
phase-paired convention the app displays (each actual high tide gets the
nearest equilibrium high by the ~3.35h local lag), stdev ~3.8 points, no
monthly bias, multi-year stable. It is deliberately NOT derived from the local
height fit (the local range vs Brest's varies day to day, so no constant
divisor reproduces the official coefficient).
"""
import glob, json, math
from datetime import datetime, timedelta, timezone
import numpy as np

CEST = timedelta(hours=2)
T0 = datetime(2026, 8, 27, 22, 0, tzinfo=timezone.utc)   # app.js t0

# ---- Official SHOM extrema (maree.info), civil local time -> UTC ----
def ext(rows, off):
    return [(datetime.strptime(d + ' ' + t, '%Y-%m-%d %H:%M').replace(tzinfo=timezone.utc)
             - timedelta(hours=off), h) for d, t, h in rows]

EXT_AUG = ext([
    ("2026-08-27","04:59",4.59),("2026-08-27","11:04",1.30),("2026-08-27","17:07",4.97),("2026-08-27","23:24",1.11),
    ("2026-08-28","05:26",4.78),("2026-08-28","11:37",1.10),("2026-08-28","17:36",5.14),("2026-08-28","23:57",0.95),
    ("2026-08-29","05:53",4.93),("2026-08-29","12:10",0.97),("2026-08-29","18:07",5.25),
    ("2026-08-30","00:30",0.87),("2026-08-30","06:22",5.02),("2026-08-30","12:44",0.92),("2026-08-30","18:39",5.28),
    ("2026-08-31","01:03",0.86),("2026-08-31","06:53",5.03),("2026-08-31","13:18",0.95),("2026-08-31","19:14",5.20),
    ("2026-09-01","01:37",0.94),("2026-09-01","07:26",4.94),("2026-09-01","13:55",1.06),("2026-09-01","19:52",5.02),
    ("2026-09-02","02:15",1.10),("2026-09-02","08:02",4.77),("2026-09-02","14:36",1.26),("2026-09-02","20:34",4.74),
    ("2026-09-03","02:56",1.35),("2026-09-03","08:43",4.51),("2026-09-03","15:24",1.53),("2026-09-03","21:28",4.39),
], 2)
# Oct 22-24 UTC+2, Oct 25-28 UTC+1 (DST change on Oct 25)
EXT_OCT = ext([
    ("2026-10-22","02:48",4.25),("2026-10-22","08:34",1.97),("2026-10-22","14:56",4.57),("2026-10-22","21:00",1.69),
    ("2026-10-23","03:22",4.52),("2026-10-23","09:17",1.62),("2026-10-23","15:32",4.84),("2026-10-23","21:38",1.38),
    ("2026-10-24","03:54",4.79),("2026-10-24","09:55",1.31),("2026-10-24","16:07",5.08),("2026-10-24","22:15",1.10),
], 2) + ext([
    ("2026-10-25","03:25",5.02),("2026-10-25","09:34",1.04),("2026-10-25","15:41",5.27),("2026-10-25","21:51",0.89),
    ("2026-10-26","03:59",5.19),("2026-10-26","10:13",0.84),("2026-10-26","16:18",5.37),("2026-10-26","22:29",0.78),
    ("2026-10-27","04:34",5.29),("2026-10-27","10:54",0.75),("2026-10-27","16:57",5.36),("2026-10-27","23:10",0.78),
    ("2026-10-28","05:12",5.27),("2026-10-28","11:37",0.77),("2026-10-28","17:39",5.21),("2026-10-28","23:53",0.90),
], 1)

# ---- engine mirror (must match app.js exactly) ----
PERIODS = {"M2":12.4206012,"S2":12.0,"N2":12.65834751,"K2":11.96723606,"M4":6.210300601,
           "M6":4.140200401,"MS4":6.103339275,"K1":23.93447213,"O1":25.81933871,
           "L2":12.19162089,"T2":11.99287564,"2N2":12.90537297,"NU2":12.62600509,
           "P1":24.06588766,"Q1":26.868350,"MF":327.859,"MM":661.310,
           "SA":8765.821089591562,"SSA":4382.905208717599,"MSF":354.3670522114571,
           "2SM2":11.60695148062142,"MU2":12.871757818734757,"OO1":22.306075164905405,
           "J1":23.09847721364096,"M3":8.280400870766956,"2MS6":4.09238755892356,
           "2SM6":4.045666403518543}
NAMES = ("M2","S2","N2","K2","M4","M6","MS4","K1","O1","L2","T2","2N2","NU2","P1","Q1",
         "MF","MM","SA","SSA","MSF","2SM2","MU2","OO1","J1","M3","2MS6","2SM6")

def nodal(name, N):
    s, c, s2, c2, s3 = math.sin(N), math.cos(N), math.sin(2*N), math.cos(2*N), math.sin(3*N)
    if name in ("M2","N2","L2","2N2","NU2","MU2"):
        return 1.0004-0.0373*c+0.0002*c2, -2.14*s
    if name in ("M4","MS4","2SM2"):
        f, _ = nodal("M2", N); return f*f, 0.0
    if name in ("M6","2MS6","2SM6"):
        f, _ = nodal("M2", N); return f*f*f, 0.0
    if name == "M3":
        f, _ = nodal("M2", N); return f**1.5, -1.07*s
    if name == "K2": return 1.0241+0.2863*c+0.0083*c2, -17.74*s+0.68*s2
    if name == "K1": return 1.0060+0.1150*c-0.0088*c2, 8.86*s-0.07*s2
    if name in ("O1","Q1","J1","OO1"):
        return 1.0089+0.1871*c-0.0147*c2, 10.80*s-1.34*s2+0.19*s3
    if name == "MF": return 1.0430+0.4140*c, -23.7*s+2.7*s2-0.4*s3
    return 1.0, 0.0   # S2, T2, P1, SA, SSA, MSF, MM

# the shipped constants (mirror of app.js / consts.json)
SHIPPED = {"Z0": 3.0203, "harm": {
    "M2":(1.5394,2.6847),"S2":(0.4802,3.0026),"N2":(0.3200,0.3898),"K2":(0.1419,-2.3135),
    "M4":(0.1196,2.1643),"M6":(0.0066,-2.5204),"MS4":(0.0519,-2.4516),"K1":(0.0653,-2.6027),
    "O1":(0.0681,-2.0521),"L2":(0.0644,1.7830),"T2":(0.1295,-2.0277),"2N2":(0.0438,-1.8160),
    "NU2":(0.0556,-1.8512),"P1":(0.0178,-0.7342),"Q1":(0.0163,1.5489),"MF":(0.0047,0.6115),
    "MM":(0.0072,-1.0418),"SA":(0.2137,0.7731),"SSA":(0.0687,-2.2722),"MSF":(0.0226,2.9885),
    "2SM2":(0.0061,0.9158),"MU2":(0.0464,2.0188),"OO1":(0.0004,1.4133),"J1":(0.0037,-0.1472),
    "M3":(0.0232,1.0479),"2MS6":(0.0061,-1.5661),"2SM6":(0.0018,-0.2423)}}

def load_curve():
    merged = {}
    for f in sorted(glob.glob('tools/wl_*.json')):
        for day, pts in json.load(open(f)).items():
            for t, h in pts:
                merged.setdefault(day + ' ' + t, []).append(h)
    keys = sorted(merged)
    ts = [(datetime.strptime(k, '%Y-%m-%d %H:%M:%S') - CEST).replace(tzinfo=timezone.utc) for k in keys]
    return ts, np.array([float(np.mean(merged[k])) for k in keys])

def node_rad(t):
    D = (t - datetime(2000, 1, 1, 12, 0, tzinfo=timezone.utc)).total_seconds() / 86400.0
    return math.radians((125.0445 - 0.0529538 * D) % 360.0)

def fit_curve(ts, hs):
    th = np.array([(t - T0).total_seconds() / 3600.0 for t in ts])
    Nr = [node_rad(t) for t in ts]
    cols = [np.ones(len(th))]
    for nm in NAMES:
        w = 2*math.pi/PERIODS[nm]
        cf = np.empty(len(th)); sf = np.empty(len(th))
        for i in range(len(th)):
            f, u = nodal(nm, Nr[i])          # u in degrees (as in app.js)
            ang = w*th[i] + math.radians(u)
            cf[i] = f*math.cos(ang); sf[i] = f*math.sin(ang)
        cols.append(cf); cols.append(sf)
    x, *_ = np.linalg.lstsq(np.stack(cols, 1), hs, rcond=None)
    out = {"Z0": float(x[0]), "harm": {}}
    for k, nm in enumerate(NAMES):
        A1, B1 = x[1+2*k], x[2+2*k]
        out["harm"][nm] = (float(np.hypot(A1, B1)), float(np.arctan2(B1, A1)))
    return out

def height_many(model, ts):
    th = np.array([(t - T0).total_seconds() / 3600.0 for t in ts])
    Nr = [node_rad(t) for t in ts]
    out = np.full(len(th), model["Z0"])
    for nm, (A, phi) in model["harm"].items():
        w = 2*math.pi/PERIODS[nm]
        for i in range(len(th)):
            f, u = nodal(nm, Nr[i])          # u in degrees (as in app.js)
            out[i] += A*f*math.cos(w*th[i] - phi + math.radians(u))
    return out

def height1(model, t):
    return float(height_many(model, [t])[0])

def extremum_near(model, t):
    s = [t - timedelta(hours=3) + timedelta(minutes=m) for m in range(361)]
    sh = [height1(model, x) for x in s]
    loc = []
    for i in range(1, 360):
        if (sh[i] > sh[i-1] and sh[i] > sh[i+1]) or (sh[i] < sh[i-1] and sh[i] < sh[i+1]):
            den = sh[i-1] - 2*sh[i] + sh[i+1]
            off = 0.5*(sh[i-1]-sh[i+1])/den if den else 0
            loc.append((s[i] + timedelta(minutes=off), sh[i] - 0.25*(sh[i-1]-sh[i+1])*off))
    return min(loc, key=lambda e: abs((e[0]-t).total_seconds())) if loc else None

def extrema_score(model, ext):
    dts, dhs = [], []
    for t, h in ext:
        m = extremum_near(model, t)
        if not m: continue
        dts.append(abs((m[0]-t).total_seconds())/60); dhs.append(abs(m[1]-h)*100)
    return (sum(dts)/len(dts), max(dts), sum(dhs)/len(dhs), max(dhs), len(dts))

# ---- per-tide coefficient (Brest-referenced, regional) ----
def astro_longitudes(dt):
    D = (dt-datetime(2000,1,1,12,0,tzinfo=timezone.utc)).total_seconds()/86400.0
    return (280.4606+360.9856474*D, 218.3164+13.1763964*D, 280.4665+0.9856473*D,
            83.3532+0.1114040*D, 125.0445-0.0529538*D)   # theta, s, h, p, N
EQ_SD = {"M2":(0.9081,(2,0,0,0)),"S2":(0.4229,(2,2,-2,0)),"N2":(0.1739,(2,-1,0,1)),"K2":(0.1151,(2,2,0,0))}
def equilibrium_semidiurnal(dt):
    theta, s, h, p, N = astro_longitudes(dt); tau = theta-s; Nr = math.radians(N); out = 0.0
    for name, (A, (nt, ns, nh, np_)) in EQ_SD.items():
        f, u = nodal(name, Nr)               # u in degrees (as in app.js)
        out += A*f*math.cos(math.radians(nt*tau+ns*s+nh*h+np_*p) + math.radians(u))
    return out
def eq_extrema(a, b, step_min=2):
    res = []; step = timedelta(minutes=step_min)
    p2 = equilibrium_semidiurnal(a-step); p = equilibrium_semidiurnal(a); t = a+step
    while t <= b:
        h = equilibrium_semidiurnal(t)
        if (p > p2 and p > h) or (p < p2 and p < h):
            den = (p2-2*p+h); off = 0.5*(p2-h)/den if den else 0.0
            res.append((t-step+off*step, p-0.25*(p2-h)*off, "PM" if p > p2 else "BM"))
        p2, p = p, h; t += step
    return res
COEF_FIT = [26.11817, 21.57937, 3.83064, 13.73961, 1.43416, -1.92386, 2.93501, 3.47901]
def tide_coefficient(pm_time, rng):
    _, s, h, p, _ = astro_longitudes(pm_time)
    D = math.radians((2*(s-h)) % 360.0); A = math.radians((s-p) % 360.0)
    a, b, c, d, e, f, g, hh = COEF_FIT
    return a + b*rng + c*math.cos(D) + d*math.sin(D) + e*math.cos(2*D) + f*math.sin(2*D) + g*math.cos(A) + hh*math.sin(A)

LAG = 3.35*3600   # equilibrium highs lead Yeu's actual highs by ~3.35h (seconds)
def model_pms(model, a, b):
    """PM extrema of the height model in [a,b]"""
    step = timedelta(minutes=5); res = []
    p2 = height1(model, a-step); p = height1(model, a); t = a+step
    while t <= b:
        h = height1(model, t)
        if p > p2 and p > h: res.append(t-step)
        p2, p = p, h; t += step
    return res
def day_coefficients(model, y, mo, d):
    """per-tide coefficients for a local day, paired to the day's ACTUAL high
    tides — the app's convention (each high gets the nearest equilibrium high
    by the ~3.35h local phase lag; never raw order, which misassigns on days
    where an equilibrium high straddles midnight)."""
    d0 = datetime(y, mo, d, tzinfo=timezone.utc) - CEST
    ex = eq_extrema(d0-timedelta(hours=12), d0+timedelta(hours=36))
    eqpm = [(j, tm, h) for j, (tm, h, ty) in enumerate(ex) if ty == "PM"]
    used, out = set(), []
    for a in model_pms(model, d0, d0+timedelta(days=1)):
        best, bestD = None, 1e18
        for j, tm, h in eqpm:
            if j in used: continue
            dd = abs((tm - a).total_seconds() + LAG)
            if dd < bestD: bestD, best = dd, (j, tm, h)
        if best is None: continue
        j, tm, h = best; used.add(j)
        lows = [ex[k][1] for k in (j-1, j+1) if 0 <= k < len(ex) and ex[k][2] == "BM"]
        if not lows: continue
        out.append(round(tide_coefficient(tm, h-min(lows))))
    return out

def main():
    ts, hs = load_curve()
    print(f"curve data: {len(hs)} samples, {(ts[0]+CEST).date()} -> {(ts[-1]+CEST).date()}")

    model = fit_curve(ts, hs)
    print(f"\n-- refit from curve --\nZ0 = {model['Z0']:.4f}  (shipped {SHIPPED['Z0']:.4f})")
    worst = 0.0
    for nm in NAMES:
        A, phi = model["harm"][nm]; sA, sphi = SHIPPED["harm"][nm]
        worst = max(worst, abs(A-sA), abs(phi-sphi))
        print(f"  {nm:<5} A={A:.4f} (shipped {sA:.4f})  phi={phi:+.4f} (shipped {sphi:+.4f})")
    print(f"max |delta| vs shipped: {worst:.4f} -> {'MATCH' if worst < 0.002 else 'DRIFTED (update app.js)'}")

    e = height_many(model, ts) - hs
    print(f"\ncurve fit: rmse {np.sqrt((e**2).mean())*100:.1f}cm  mae {np.abs(e).mean()*100:.1f}cm  max {np.abs(e).max()*100:.1f}cm")
    for tag, extab in (("Aug27-Sep3", EXT_AUG), ("Oct22-28 ", EXT_OCT)):
        mt, xt, mh, xh, n = extrema_score(model, extab)
        print(f"official {tag}: dt mean {mt:.1f} max {xt:.0f} min | dh mean {mh:.1f} max {xh:.0f} cm (n={n})")

    print("\n-- per-tide coefficient vs official (tools/coeff_2026.json) --")
    calc = json.load(open("tools/coeff_2026.json"))
    errs = []
    for mi, month in enumerate(calc):
        for di, day in enumerate(month):
            for p, o in zip(day_coefficients(model, 2026, mi+1, di+1), [int(c) for c in day]):
                errs.append(p-o)
    import statistics
    print(f"  n={len(errs)}: mean {statistics.mean(errs):+.2f}  stdev {statistics.pstdev(errs):.2f}  maxabs {max(abs(e) for e in errs)}")
    print(f"  Oct 22 per-tide: {day_coefficients(model, 2026, 10, 22)} (official 48, 55)")

    print("\n-- multi-year sanity (height range m) --")
    for year in (2027, 2030, 2035, 2040):
        lo, hi = 99.0, -99.0
        for doy in range(0, 365, 7):
            base = datetime(year, 1, 1, tzinfo=timezone.utc) + timedelta(days=doy)
            for hh in range(0, 24, 6):
                h = height1(model, base + timedelta(hours=hh))
                lo, hi = min(lo, h), max(hi, h)
        print(f"  {year}: {lo:.2f} .. {hi:.2f}")

if __name__ == "__main__":
    main()
