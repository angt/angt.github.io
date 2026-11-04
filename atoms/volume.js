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
    const MOBILE = root.matchMedia && root.matchMedia('(pointer: coarse)').matches;

    // Expand L_(n-l-1)^(2l+1)(2*a*r) once, in ascending powers of r.
    function radialPolynomial (n, l, a) {
        const k = n - l - 1, alpha = 2 * l + 1;
        let p = [1], q = k ? [1 + alpha, -1] : [1];
        for (let i = 1; i < k; i++) {
            const next = new Array(q.length + 1).fill(0);
            for (let j = 0; j < q.length; j++) {
                next[j] += (2 * i + 1 + alpha) * q[j];
                next[j + 1] -= q[j];
            }
            for (let j = 0; j < p.length; j++) next[j] -= (i + alpha) * p[j];
            for (let j = 0; j < next.length; j++) next[j] /= i + 1;
            p = q; q = next;
        }
        const out = [0, 0, 0, 0];
        for (let i = 0; i < q.length; i++) out[i] = q[i] * Math.pow(2 * a, i);
        return out;
    }

    // r^l*Y_lm is a polynomial in x,y,z (a real solid harmonic). Build it
    // from the same associated-Legendre recurrence used by Orbital.ylm.
    // The gallery stops at 4f, hence degree <= 3 and at most three terms.
    function solidHarmonic (l, m) {
        const a = Math.abs(m), degree = l - a;
        let first = 1;
        for (let i = 0; i < a; i++) first *= -(2 * i + 1);
        let p = [first], q = degree ? [0, (2 * a + 1) * first] : p;
        for (let n = a + 2; n <= l; n++) {
            const next = new Array(q.length + 1).fill(0);
            for (let j = 0; j < q.length; j++) next[j + 1] += (2 * n - 1) * q[j];
            for (let j = 0; j < p.length; j++) next[j] -= (n + a - 1) * p[j];
            for (let j = 0; j < next.length; j++) next[j] /= n - a;
            p = q; q = next;
        }
        const poly = degree ? q : p;
        const add = (map, x, y, z, v) => {
            const key = x + ',' + y + ',' + z;
            const value = (map.get(key) || 0) + v;
            if (value) map.set(key, value); else map.delete(key);
        };
        const angular = new Map();
        for (let j = 0; j < poly.length; j++) {
            if (!poly[j]) continue;
            let terms = new Map([['0,0,' + j, poly[j]]]);
            for (let k = 0; k < (degree - j) / 2; k++) {
                const next = new Map();
                for (const [key, v] of terms) {
                    const [x, y, z] = key.split(',').map(Number);
                    add(next, x + 2, y, z, v);
                    add(next, x, y + 2, z, v);
                    add(next, x, y, z + 2, v);
                }
                terms = next;
            }
            for (const [key, v] of terms) {
                const [x, y, z] = key.split(',').map(Number);
                add(angular, x, y, z, v);
            }
        }
        let factorial = 1;
        for (let k = l - a + 1; k <= l + a; k++) factorial *= k;
        let norm = Math.sqrt((2 * l + 1) / (4 * Math.PI * factorial));
        if (m) norm *= Math.SQRT2;
        const fact = [1, 1, 2, 6, 24], out = new Map();
        for (const [key, v] of angular) {
            const [x, y, z] = key.split(',').map(Number);
            for (let j = 0; j <= a; j++) {
                if (m > 0 ? j % 2 : m < 0 ? !(j % 2) : j) continue;
                const phase = m >= 0 ? (j % 4 === 0 ? 1 : -1) : (j % 4 === 1 ? 1 : -1);
                const choose = fact[a] / fact[j] / fact[a - j];
                add(out, x + a - j, y + j, z, v * norm * choose * phase);
            }
        }
        const terms = Array.from(out, ([key, coefficient]) => {
            const powers = key.split(',').map(Number);
            return [coefficient, ...powers];
        });
        while (terms.length < 3) terms.push([0, 0, 0, 0]);
        if (terms.length > 3) throw new Error('solid harmonic exceeds shader budget');
        return terms.flat();
    }

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
        const decay = q90 / n;
        const radial = radialPolynomial(n, l, decay);
        const scale = kGlow * invVv * Math.pow(2 * decay, l);
        const rp = radial.map((v) => v * scale);
        const dp = [rp[1], 2 * rp[2], 3 * rp[3], 0];
        const rmaxS = RBOUND;               // shader-space radius
        const rmaxPhysH = rmaxS * q90;
        for (let i = 0; i < nR; i++) {
            const t = (i + 0.5) / nR;
            const r = rmaxPhysH * t * t;    // Bohr units for radialR
            const dr = rmaxPhysH * 2 * t / nR;
            const rad = R.radialR(n, l, r);
            for (let j = 0; j < nT; j++) {
                const x = -1 + 2 * (j + 0.5) / nT;
                for (let k = 0; k < nP; k++) {
                    const v = Math.abs(rad * R.ylm(l, m, x, 2 * Math.PI * (k + 0.5) / nP)) * invVv;
                    hist[Math.min(NB - 1, (v * NB) | 0)] += v * v * r * r * dr / (q90 * q90 * q90);
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

        const p = {
            q90, invV: invVv, kGlow, rad: rTail / q90, levelFor,
            decay, scale, rp, dp, hp: solidHarmonic(l, m),
        };
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
precision highp int;
out vec4 fragColor;

uniform vec2 uCenter;
uniform float uFS;
uniform mat3 uInvRot;
uniform vec4 uQA, uQB;        // (decay, normalization already in radial coeffs, k, level)
uniform vec4 uRA, uRB;        // normalized radial polynomial coefficients
uniform vec4 uDA, uDB;        // radial derivative coefficients
uniform vec4 uHA[3], uHB[3];  // coefficient, x exponent, y exponent, z exponent
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
const int STEPS = ${MOBILE ? 64 : 96};

float hash (vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// One monomial c*x^t.y*y^t.z*z^t.w and its analytic gradient.
// Displayed orbitals have degree <= 3, so no pow() calls are needed.
vec4 harmonicTerm (vec3 p, vec4 t) {
    vec3 p2 = p * p;
    float vx = t.y < 0.5 ? 1.0 : t.y < 1.5 ? p.x : t.y < 2.5 ? p2.x : p2.x * p.x;
    float vy = t.z < 0.5 ? 1.0 : t.z < 1.5 ? p.y : t.z < 2.5 ? p2.y : p2.y * p.y;
    float vz = t.w < 0.5 ? 1.0 : t.w < 1.5 ? p.z : t.w < 2.5 ? p2.z : p2.z * p.z;
    float dx = t.y < 0.5 ? 0.0 : t.y < 1.5 ? 1.0 : t.y < 2.5 ? 2.0 * p.x : 3.0 * p2.x;
    float dy = t.z < 0.5 ? 0.0 : t.z < 1.5 ? 1.0 : t.z < 2.5 ? 2.0 * p.y : 3.0 * p2.y;
    float dz = t.w < 0.5 ? 0.0 : t.w < 1.5 ? 1.0 : t.w < 2.5 ? 2.0 * p.z : 3.0 * p2.z;
    return t.x * vec4(dx * vy * vz, vx * dy * vz, vx * vy * dz, vx * vy * vz);
}

// Unit-mass wavefunction and gradient. stateParams expands both the radial
// recurrence and r^l*Y_lm into polynomials on the CPU. This is algebraically
// the same psi as orbital.js, but the GPU evaluates only short dot products
// and at most three harmonic monomials per state.
vec4 fieldState (vec3 q, vec4 par, vec4 rad, vec4 dif, vec4 h[3]) {
    float r = max(length(q), 1e-5);
    float r2 = r * r;
    vec4 powers = vec4(1.0, r, r2, r2 * r);
    float rp = dot(rad, powers), dp = dot(dif, powers);
    vec4 hp = vec4(0.0);
    for (int i = 0; i < 3; i++) hp += harmonicTerm(q, h[i]);
    float e = exp(-par.x * r);
    vec3 g = e * (rp * hp.xyz + hp.w * (dp - par.x * rp) * q / r);
    return vec4(g, e * rp * hp.w);
}

// Value in w, gradient in xyz. Linear morphing also mixes the gradients.
vec4 psiMix (vec3 p) {
    vec3 q = uInvRot * p;
    vec4 a = fieldState(q, uQA, uRA, uDA, uHA);
    if (uMix >= 0.001) a = mix(a, fieldState(q, uQB, uRB, uDB, uHB), uMix);
    a.xyz = a.xyz * uInvRot; // transpose: orbital-frame -> world-frame
    return a;
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
        vec4 field = psiMix(p);
        float psi = field.w;
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
            // Exact gradient: no three extra wavefunction evaluations.
            vec3 g = field.xyz * (psi > 0.0 ? -1.0 : 1.0);
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
        for (const name of ['uCenter', 'uFS', 'uInvRot', 'uQA', 'uQB', 'uRA', 'uRB', 'uDA', 'uDB', 'uHA[0]', 'uHB[0]', 'uMix', 'uRad', 'uRadB', 'uBody', 'uLight']) {
            uni[name] = gl.getUniformLocation(prog, name);
        }
        gl.useProgram(prog);
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        let Wp = 0, Hp = 0, FS = 1;

        function resize () {
            // The glow is fill-rate bound: high-DPI phones otherwise shade
            // almost a million pixels, 64–96 samples deep, on every frame.
            // Keep crisp CSS-sized framing with a modest mobile DPR cap.
            const DPR = Math.min(2, window.devicePixelRatio || 1);
            const W = canvas.clientWidth, H = canvas.clientHeight;
            if (!W || !H) return;
            const wp = Math.round(W * DPR), hp = Math.round(H * DPR);
            if (wp === Wp && hp === Hp) return;
            Wp = wp; Hp = hp;
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
            const lv = look ? look.level : 0.15;
            gl.uniform4f(uni.uQA, pa.decay, pa.scale, pa.kGlow, pa.levelFor(lv));
            gl.uniform4f(uni.uQB, pb.decay, pb.scale, pb.kGlow, pb.levelFor(lv));
            gl.uniform4fv(uni.uRA, pa.rp);
            gl.uniform4fv(uni.uRB, pb.rp);
            gl.uniform4fv(uni.uDA, pa.dp);
            gl.uniform4fv(uni.uDB, pb.dp);
            gl.uniform4fv(uni['uHA[0]'], pa.hp);
            gl.uniform4fv(uni['uHB[0]'], pb.hp);
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
