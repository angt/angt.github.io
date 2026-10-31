'use strict';
// Volume renderer for the orbital viewer — a WebGL2 fragment shader that
// raymarches the analytic wavefunction psi(n,l,m) directly.
//
// Why not a raymarched distance field? A distance field is a workaround
// for "all we have is geometry". Here the field itself is an analytic
// function (spherical harmonic x hydrogenic radial), so every sample on
// every ray evaluates the real thing — no mesh, no voxels, no distance
// field. The shader accumulates |phi|^2 along the ray: literally the
// chance of finding the electron on that line. Nodes are transparent
// gaps, the nested shells of an s orbital show as rings. Two looks live
// on top of that: `body` amplifies the wave above a chosen `level` (and
// thins it below) until the integral reads as a body — but the ray still
// walks the whole atom, so the far side and the node windows survive;
// `light` shades every sample by the gradient of psi, fog included.
// body = 0, light = 0 is exactly the pure glow.
//
// Hue always carries the sign of psi (blue +, rose -), and depth fog
// matches the dot renderer, so both drawing modes frame identically.
// Precomputed per state: q90 (the scale that puts 90% of the radial
// probability inside the unit sphere, same framing as makeCloud),
// vmax (so |psi| <= 1 after normalization, like the clouds' val),
// kGlow, the unit-mass scale for the |phi|^2 glow, and the mass
// histogram of |psi| that picks the level per state ("the wave's
// strongest fraction") — one fixed height can't fit both the smooth
// p/d/f lobes and the s states' needle peak + weak shells.
(function (root) {
    const D = 3.4, FOG0 = 0.14, CORE = 0.35, SIGMA = 4.0, HARDK = 2.2, GLO = 0.02, RBOUND = 2.6;

    // ---------- per-state CPU parameters (cached) ----------

    const PARAMS = new Map();
    function stateParams (n, l, m) {
        const key = n + ',' + l + ',' + m;
        const hit = PARAMS.get(key);
        if (hit) return hit;
        const R = root.Orbital;
        const rmaxPhys = 2.4 * n * n + 3 * l + 14;

        // Radial weight r^2 R^2 -> CDF -> q90 (matches makeCloud framing).
        const ng = 800;
        const xs = new Float64Array(ng), cdf = new Float64Array(ng);
        let tot = 0;
        for (let i = 0; i < ng; i++) {
            xs[i] = rmaxPhys * i / (ng - 1);
            if (i > 0) {
                const w0 = xs[i - 1] * R.radialR(n, l, xs[i - 1]);
                const w1 = xs[i] * R.radialR(n, l, xs[i]);
                tot += 0.5 * (w1 * w1 + w0 * w0) * (xs[i] - xs[i - 1]);
            }
            cdf[i] = tot;
        }
        const quant = (q) => {
            const target = q * tot;
            let lo = 1, hi = ng - 1;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (cdf[mid] < target) lo = mid + 1; else hi = mid;
            }
            const c0 = cdf[lo - 1], c1 = cdf[lo];
            const t = c1 === c0 ? 0 : (target - c0) / (c1 - c0);
            return xs[lo - 1] + t * (xs[lo] - xs[lo - 1]);
        };
        const q90 = quant(0.9), rTail = quant(0.999);

        // psi factorizes, so max|psi| = max|R| * max|Y| exactly.
        let maxR = 0;
        for (let i = 0; i < 1200; i++) {
            const v = Math.abs(R.radialR(n, l, rmaxPhys * (i + 0.5) / 1200));
            if (v > maxR) maxR = v;
        }
        let maxY = 0;
        for (let i = 0; i <= 128; i++) {
            const x = -1 + 2 * i / 128;
            for (let k = 0; k < 64; k++) {
                const v = Math.abs(R.ylm(l, m, x, 2 * Math.PI * k / 64));
                if (v > maxY) maxY = v;
            }
        }
        // Unit-mass scale for the glow: int psiRaw^2 dV_scaled is
        // tot / (maxR^2 maxY^2 q90^3), so k = maxR·maxY·q90^1.5 / sqrt(tot)
        // gives int |k·psi|^2 dV = 1 — every state carries the same total
        // glow, just as every state gets NPTS dots.
        const kGlow = maxR * maxY * Math.pow(q90, 1.5) / Math.sqrt(tot);

        // Mass histogram of |psi| over bins of its peak-normalized height:
        // lets the body/isosurface level be chosen per state as "the wave's
        // strongest fraction". A fixed height would fail on s states —
        // their peak is a needle at the nucleus while the visible shells
        // live at 5-15% of it (2s outer hump = 0.146 of peak!).
        const NB = 64;
        const hist = new Float64Array(NB);
        const nR = 72, nT = 36, nP = 18;
        const invVv = 1 / (maxR * maxY);
        const rmaxS = 2.5 * q90;            // scaled units -> the visible frame
        for (let i = 0; i < nR; i++) {
            const t = (i + 0.5) / nR;
            const r = rmaxS * t * t;        // quadratic grid: dense near r = 0
            const dr = rmaxS * 4 * t / nR;
            const rad = R.radialR(n, l, r);
            for (let j = 0; j < nT; j++) {
                const x = -1 + 2 * (j + 0.5) / nT;
                for (let k = 0; k < nP; k++) {
                    const v = Math.abs(rad * R.ylm(l, m, x, 2 * Math.PI * (k + 0.5) / nP)) * invVv;
                    hist[Math.min(NB - 1, (v * NB) | 0)] += v * v * r * r * dr;
                }
            }
        }
        // levelFor(frac): the height L such that the strongest `frac` of
        // the probability mass sits above L (linear inside the bin).
        const levelFor = (frac) => {
            let total = 0;
            for (let i = 0; i < NB; i++) total += hist[i];
            const target = frac * total;
            let acc = 0;
            for (let i = NB - 1; i >= 0; i--) {
                if (hist[i] > 0 && acc + hist[i] >= target) {
                    return (i + 1 - (target - acc) / hist[i]) / NB;
                }
                acc += hist[i];
            }
            return 0;
        };

        const p = { q90, invV: invVv, kGlow, rad: rTail / q90, levelFor };
        PARAMS.set(key, p);
        return p;
    }

    // ---------- shaders ----------

    const VERT = `#version 300 es
void main () {
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

    const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2 uCenter;
uniform float uFS;
uniform mat3 uInvRot;
uniform ivec3 uStA, uStB;
uniform vec4 uQA, uQB;        // (q90, 1/vmax, unit-mass k, level) per state
uniform float uMix, uRad, uRadB;
uniform float uBody;          // 0 = pure glow, 1 = hardened body
uniform float uLight;         // gradient lighting amount

const float D = 3.4;
const float FOG0 = 0.14;
const float CORE = 0.35;
const float SIGMA = 4.0;
const float HARDK = 2.2;      // optical depth of the hardened shell at x = level
const float GLO = 0.02;       // amplification below the level (nearly transparent)
const vec3 LDIR = vec3(0.410368, 0.729540, 0.547152);  // normalize(0.45, 0.8, 0.6)
const vec3 POS = vec3(125.0, 185.0, 255.0) / 255.0;
const vec3 NEG = vec3(255.0, 120.0, 170.0) / 255.0;
const int STEPS = 96;

float hash (vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// Associated Laguerre L_k^alpha by recurrence (same as orbital.js).
float lag (int k, float alpha, float x) {
    if (k <= 0) return 1.0;
    float p = 1.0, q = 1.0 + alpha - x;
    for (int i = 1; i < k; i++) {
        float t = ((2.0 * float(i) + 1.0 + alpha - x) * q - (float(i) + alpha) * p) / (float(i) + 1.0);
        p = q; q = t;
    }
    return q;
}

// Associated Legendre P_l^m, Condon-Shortley phase (same as orbital.js).
float plmf (int l, int m, float x) {
    float p = 1.0;
    if (m > 0) {
        float s = sqrt(max(0.0, 1.0 - x * x));
        float f = 1.0;
        for (int i = 0; i < m; i++) { p *= -f * s; f += 2.0; }
    }
    if (l == m) return p;
    float q = x * float(2 * m + 1) * p;
    for (int n = m + 2; n <= l; n++) {
        float t = ((2.0 * float(n) - 1.0) * x * q - float(n + m - 1) * p) / float(n - m);
        p = q; q = t;
    }
    return q;
}

// psi(n,l,m) at orbital-frame point q (scaled units), normalized by vmax.
float psiRaw (vec3 q, ivec3 st, float q90, float invV) {
    int n = st.x, l = st.y, m = st.z;
    float r = max(length(q), 1e-6);
    float x = clamp(q.z / r, -1.0, 1.0);
    float phi = atan(q.y, q.x);
    float rho = 2.0 * r * q90 / float(n);
    float rad = pow(rho, float(l)) * exp(-rho * 0.5) * lag(n - l - 1, float(2 * l + 1), rho);
    int am = m < 0 ? -m : m;
    float d = 1.0;
    for (int k = l - am + 1; k <= l + am; k++) d *= float(k);
    float y = plmf(l, am, x) * sqrt((2.0 * float(l) + 1.0) / (12.566370614 * d));
    if (m != 0) y *= 1.414213562 * (m > 0 ? cos(float(am) * phi) : sin(float(am) * phi));
    return rad * y * invV;
}

// Signed morph: the interpolated wavefunction between the two states.
// Where the phases disagree the mix passes through zero — the nodes
// pinch and flip exactly as in the dot renderer. Each state is scaled
// by its unit-mass k (uQA.z/uQB.z) before mixing, so every state
// carries the same total glow.
float psiMix (vec3 p) {
    vec3 q = uInvRot * p;
    float va = psiRaw(q, uStA, uQA.x, uQA.y) * uQA.z;
    if (uMix < 0.001) return va;
    return mix(va, psiRaw(q, uStB, uQB.x, uQB.y) * uQB.z, uMix);
}

vec4 shadeGlow (vec3 ro, vec3 rd, float l0, float l1) {
    float dl = (l1 - l0) / float(STEPS);
    float ds = dl * length(rd);        // true arc length, not ray parameter
    float lam = l0 + dl * hash(gl_FragCoord.xy);
    float kMix = mix(uQA.z, uQB.z, uMix);   // blend of the unit-mass scales
    float lMix = mix(uQA.w, uQB.w, uMix);   // the level, per state
    float w = mix(0.9, 0.35, uBody);        // band narrows as the body hardens
    float hl0 = lMix * (1.0 - w), hl1 = lMix * (1.0 + w);
    float K = HARDK / max(lMix * lMix, 1e-5);   // shell opacity, level-independent
    vec3 col = vec3(0.0);
    float T = 1.0;
    for (int i = 0; i < STEPS; i++) {
        vec3 p = ro + rd * lam;
        float psi = psiMix(p);
        float den = psi * psi;         // |phi|^2: probability density
        float x2 = den;
        float tau = den;
        if (uBody > 0.001) {
            // Hardened transfer: x is |psi| as a fraction of its peak (so
            // the level means the same thing for every state), and
            // kMix cancels — every state hardens at the same relative
            // level with the same opacity. Below the band the medium is
            // nearly clear, above it the ray saturates into a body.
            float x = abs(psi) / kMix;
            x2 = x * x;
            float s = smoothstep(hl0, hl1, x);
            tau = mix(den, K * x2 * mix(GLO, 1.0, s), uBody);
        }
        float al = 1.0 - exp(-SIGMA * tau * ds);
        float wgt = al * T;
        float yw = (p.y + uRad) / (2.0 * uRad);
        float f = FOG0 + (1.0 - FOG0) * yw * yw;
        float t = CORE * min(1.0, mix(den, x2, uBody) * 2.0);
        vec3 c = mix(psi > 0.0 ? POS : NEG, vec3(1.0), t) * f;
        if (uLight > 0.004 && wgt > 0.0015) {
            // Gradient lighting — the outward normal of the |psi| hill,
            // wrapped Lambert + rim.
            float e = 0.006;
            vec3 g = vec3(
                psiMix(p + vec3(e, 0.0, 0.0)) - psi,
                psiMix(p + vec3(0.0, e, 0.0)) - psi,
                psiMix(p + vec3(0.0, 0.0, e)) - psi);
            g *= (psi > 0.0 ? -1.0 : 1.0);  // outward = away from dense
            float gn = length(g);
            if (gn > 1e-8) {
                vec3 n = g / gn;
                float dif = 0.5 + 0.5 * dot(n, LDIR);
                float rim = pow(1.0 - abs(n.y), 3.0);
                c *= mix(1.0, 0.35 + 0.75 * dif + 0.25 * rim, uLight);
            }
        }
        col += T * al * c;
        T *= 1.0 - al;
        if (T < 0.004) break;
        lam += dl;
    }
    return vec4(col, 1.0 - T);
}

void main () {
    vec2 uv = (gl_FragCoord.xy - uCenter) / uFS;
    vec3 ro = vec3(0.0, D, 0.0);
    vec3 rd = vec3(uv.x / D, -1.0, uv.y / D);
    float a = dot(rd, rd);
    float b = 2.0 * dot(ro, rd);
    float c = dot(ro, ro) - uRadB * uRadB;
    float disc = b * b - 4.0 * a * c;
    if (disc <= 0.0) { fragColor = vec4(0.0); return; }
    float s = sqrt(disc);
    float l0 = max(0.0, (-b - s) / (2.0 * a));
    float l1 = (-b + s) / (2.0 * a);
    if (l1 <= l0) { fragColor = vec4(0.0); return; }
    fragColor = shadeGlow(ro, rd, l0, l1);
}`;

    // ---------- renderer ----------

    function compile (gl, type, src) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            console.warn('orbital volume shader:', gl.getShaderInfoLog(sh));
            gl.deleteShader(sh);
            return null;
        }
        return sh;
    }

    // Rotation comes in as a ready matrix (orbital.js makeRotation):
    // row-major, uploaded as-is — a rotation matrix's transpose is its
    // inverse, so uInvRot gets world -> orbital for free.

    function createRenderer (canvas) {
        const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true });
        if (!gl) return null;
        const vs = compile(gl, gl.VERTEX_SHADER, VERT);
        const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
        if (!vs || !fs) return null;
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.warn('orbital volume link:', gl.getProgramInfoLog(prog));
            return null;
        }
        const uni = {};
        for (const name of ['uCenter', 'uFS', 'uInvRot', 'uStA', 'uStB', 'uQA', 'uQB', 'uMix', 'uRad', 'uRadB', 'uBody', 'uLight']) {
            uni[name] = gl.getUniformLocation(prog, name);
        }
        gl.useProgram(prog);
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        let Wp = 0, Hp = 0, FS = 1;

        function resize () {
            // The screen's real pixel ratio (capped only for fill rate) —
            // the glow must land on the display's actual pixel grid, not be
            // resampled onto it. Framing comes from the buffer itself.
            const DPR = Math.min(3, window.devicePixelRatio || 1);
            const W = canvas.clientWidth, H = canvas.clientHeight;
            if (!W || !H) return;
            Wp = Math.round(W * DPR); Hp = Math.round(H * DPR);
            canvas.width = Wp; canvas.height = Hp;
            FS = 0.32 * Math.min(Wp, Hp);
            gl.viewport(0, 0, Wp, Hp);
        }

        function draw (a, b, e, rot, look) {
            if (!Wp) return;
            const pa = stateParams(a.n, a.l, a.m), pb = stateParams(b.n, b.l, b.m);
            gl.useProgram(prog);
            gl.uniform2f(uni.uCenter, Wp / 2, Hp / 2);
            gl.uniform1f(uni.uFS, FS);
            gl.uniformMatrix3fv(uni.uInvRot, false, rot);
            gl.uniform3i(uni.uStA, a.n, a.l, a.m);
            gl.uniform3i(uni.uStB, b.n, b.l, b.m);
            const lv = look ? look.level : 0.15;
            gl.uniform4f(uni.uQA, pa.q90, pa.invV, pa.kGlow, pa.levelFor(lv));
            gl.uniform4f(uni.uQB, pb.q90, pb.invV, pb.kGlow, pb.levelFor(lv));
            gl.uniform1f(uni.uMix, e);
            gl.uniform1f(uni.uRad, Math.max(pa.rad, pb.rad));
            gl.uniform1f(uni.uRadB, RBOUND);
            gl.uniform1f(uni.uBody, look ? look.body : 0);
            gl.uniform1f(uni.uLight, look ? look.light : 0);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }

        return { resize, draw, volume: true };
    }

    root.OrbitalVolume = { createRenderer };
})(typeof window !== 'undefined' ? window : this);
